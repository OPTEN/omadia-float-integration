import type { HttpAccessor, PluginContext } from '@omadia/plugin-api';

/**
 * Reverse-DNS identity — MUST equal `identity.id` in manifest.yaml and the
 * `name` field of package.json.
 */
export const AGENT_ID = '@opten/float-integration' as const;

const FLOAT_API_BASE = 'https://api.float.com/v3';
const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;

export interface IntegrationHandle {
  close(): Promise<void>;
}

interface PaginationMeta {
  page: number;
  per_page: number;
  total_count?: number;
  page_count?: number;
}

interface FloatResult {
  data: unknown;
  pagination?: PaginationMeta;
}

type QueryValue = string | number | boolean | undefined;

function clampPage(value: unknown, fallback: number, max?: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return max !== undefined ? Math.min(n, max) : n;
}

/** Builds the shared, allow-listed HTTP client for the Float REST API v3. */
function createFloatClient(opts: {
  http: HttpAccessor;
  token: string;
  userAgent: string;
  log: (...args: unknown[]) => void;
}) {
  return async function floatFetch(
    path: string,
    query: Record<string, QueryValue> = {},
  ): Promise<FloatResult> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '') continue;
      params.set(key, String(value));
    }
    const qs = params.toString();
    const url = `${FLOAT_API_BASE}${path}${qs ? `?${qs}` : ''}`;

    const res = await opts.http.fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: 'application/json',
        // Float requires an identifying User-Agent on every request.
        'User-Agent': opts.userAgent,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      opts.log('float api error', { url, status: res.status });
      throw new Error(
        `Float API request failed (${res.status}) for ${path}: ${body.slice(0, 500)}`,
      );
    }

    const data = await res.json();

    // Float reports list pagination via X-Pagination-* response headers.
    const header = (name: string): number | undefined => {
      const raw = res.headers[name] ?? res.headers[name.toLowerCase()];
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };
    const currentPage = header('X-Pagination-Current-Page');
    const pagination: PaginationMeta | undefined =
      currentPage !== undefined
        ? {
            page: currentPage,
            per_page: header('X-Pagination-Per-Page') ?? DEFAULT_PER_PAGE,
            total_count: header('X-Pagination-Total-Count'),
            page_count: header('X-Pagination-Page-Count'),
          }
        : undefined;

    return { data, pagination };
  };
}

/** Canned responses used while the kernel smoke-tests the plugin. */
const SMOKE_DATA: Record<string, unknown> = {
  '/people': [{ people_id: 1, name: 'Ada Lovelace', email: 'ada@example.com', active: 1 }],
  '/projects': [{ project_id: 1, name: 'Analytical Engine', client_id: 1, active: 1 }],
  '/tasks': [
    {
      task_id: 1,
      project_id: 1,
      people_id: 1,
      start_date: '2026-01-05',
      end_date: '2026-01-09',
      hours: 8,
      name: 'Design',
    },
  ],
  '/timeoffs': [
    { timeoff_id: 1, timeoff_type_id: 1, people_ids: [1], start_date: '2026-01-12', end_date: '2026-01-16' },
  ],
  '/clients': [{ client_id: 1, name: 'Acme Corp' }],
};

/**
 * Integration plugins export `activate(ctx)`. The host calls it once, scoped
 * to this plugin's identity, and keeps the returned handle until shutdown.
 */
export async function activate(ctx: PluginContext): Promise<IntegrationHandle> {
  ctx.log('activating', { agentId: AGENT_ID });

  const contact = ctx.config.get<string>('user_agent_contact');
  const userAgent = `omadia-float-integration/0.1.0${contact ? ` (${contact})` : ''}`;

  // Lazily resolved so activation succeeds even before the token exists; in
  // smoke mode we never touch the vault or the network at all.
  let floatFetch: ((path: string, query?: Record<string, QueryValue>) => Promise<FloatResult>) | null =
    null;

  const call = async (
    path: string,
    query: Record<string, QueryValue> = {},
  ): Promise<string> => {
    if (ctx.smokeMode) {
      const base = path.replace(/\/\d+$/, '');
      const rows = SMOKE_DATA[base] ?? [];
      const data = /\/\d+$/.test(path) ? (rows as unknown[])[0] ?? null : rows;
      return JSON.stringify({ data, smoke: true });
    }
    if (!floatFetch) {
      if (!ctx.http) {
        throw new Error('ctx.http is unavailable — check permissions.network.outbound.');
      }
      const token = await ctx.secrets.require('api_token');
      floatFetch = createFloatClient({ http: ctx.http, token, userAgent, log: ctx.log.bind(ctx) });
    }
    const { data, pagination } = await floatFetch(path, query);
    return JSON.stringify(pagination ? { data, pagination } : { data });
  };

  const paging = (input: Record<string, unknown>) => ({
    page: clampPage(input.page, 1),
    'per-page': clampPage(input.per_page, DEFAULT_PER_PAGE, MAX_PER_PAGE),
  });

  const pagingProperties = {
    page: { type: 'integer', description: 'Page number, starting at 1.' },
    per_page: { type: 'integer', description: `Results per page (max ${MAX_PER_PAGE}).` },
  } as const;

  ctx.tools.register(
    {
      name: 'float_list_people',
      description: 'Lists people (team members) in Float, with optional filters.',
      input_schema: {
        type: 'object',
        properties: {
          active: {
            type: 'integer',
            description: 'Filter by status: 1 = active, 0 = archived. Omit for all.',
          },
          department_id: { type: 'integer', description: 'Filter by department id.' },
          ...pagingProperties,
        },
      },
    },
    async (input) => {
      const args = (input ?? {}) as Record<string, unknown>;
      return call('/people', {
        ...paging(args),
        active: args.active as number | undefined,
        department_id: args.department_id as number | undefined,
      });
    },
  );

  ctx.tools.register(
    {
      name: 'float_get_person',
      description: 'Fetches a single Float person by id.',
      input_schema: {
        type: 'object',
        properties: {
          people_id: { type: 'integer', description: 'The Float person id.' },
        },
        required: ['people_id'],
      },
    },
    async (input) => {
      const { people_id } = (input ?? {}) as { people_id?: number };
      if (!people_id) throw new Error('people_id is required.');
      return call(`/people/${Math.floor(people_id)}`);
    },
  );

  ctx.tools.register(
    {
      name: 'float_list_projects',
      description: 'Lists projects in Float, with optional filters.',
      input_schema: {
        type: 'object',
        properties: {
          active: {
            type: 'integer',
            description: 'Filter by status: 1 = active, 0 = archived. Omit for all.',
          },
          client_id: { type: 'integer', description: 'Filter by client id.' },
          ...pagingProperties,
        },
      },
    },
    async (input) => {
      const args = (input ?? {}) as Record<string, unknown>;
      return call('/projects', {
        ...paging(args),
        active: args.active as number | undefined,
        client_id: args.client_id as number | undefined,
      });
    },
  );

  ctx.tools.register(
    {
      name: 'float_get_project',
      description: 'Fetches a single Float project by id.',
      input_schema: {
        type: 'object',
        properties: {
          project_id: { type: 'integer', description: 'The Float project id.' },
        },
        required: ['project_id'],
      },
    },
    async (input) => {
      const { project_id } = (input ?? {}) as { project_id?: number };
      if (!project_id) throw new Error('project_id is required.');
      return call(`/projects/${Math.floor(project_id)}`);
    },
  );

  ctx.tools.register(
    {
      name: 'float_list_allocations',
      description:
        'Lists scheduled allocations (Float tasks): who works on which project, when, and for how many hours.',
      input_schema: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Only allocations on/after this date (YYYY-MM-DD).' },
          end_date: { type: 'string', description: 'Only allocations on/before this date (YYYY-MM-DD).' },
          people_id: { type: 'integer', description: 'Filter by person id.' },
          project_id: { type: 'integer', description: 'Filter by project id.' },
          ...pagingProperties,
        },
      },
    },
    async (input) => {
      const args = (input ?? {}) as Record<string, unknown>;
      return call('/tasks', {
        ...paging(args),
        start_date: args.start_date as string | undefined,
        end_date: args.end_date as string | undefined,
        people_id: args.people_id as number | undefined,
        project_id: args.project_id as number | undefined,
      });
    },
  );

  ctx.tools.register(
    {
      name: 'float_list_timeoffs',
      description: 'Lists time-off entries (vacation, sick leave, …) in Float.',
      input_schema: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Only time off on/after this date (YYYY-MM-DD).' },
          end_date: { type: 'string', description: 'Only time off on/before this date (YYYY-MM-DD).' },
          people_id: { type: 'integer', description: 'Filter by person id.' },
          ...pagingProperties,
        },
      },
    },
    async (input) => {
      const args = (input ?? {}) as Record<string, unknown>;
      return call('/timeoffs', {
        ...paging(args),
        start_date: args.start_date as string | undefined,
        end_date: args.end_date as string | undefined,
        people_id: args.people_id as number | undefined,
      });
    },
  );

  ctx.tools.register(
    {
      name: 'float_list_clients',
      description: 'Lists clients in Float.',
      input_schema: {
        type: 'object',
        properties: { ...pagingProperties },
      },
    },
    async (input) => {
      const args = (input ?? {}) as Record<string, unknown>;
      return call('/clients', paging(args));
    },
  );

  ctx.log('activated', {
    tools: [
      'float_list_people',
      'float_get_person',
      'float_list_projects',
      'float_get_project',
      'float_list_allocations',
      'float_list_timeoffs',
      'float_list_clients',
    ],
  });

  return {
    async close() {
      ctx.log('deactivating');
    },
  };
}

export default { AGENT_ID, activate };
