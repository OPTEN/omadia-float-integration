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

// ---------------------------------------------------------------------------
// Float API v3 — response type definitions
// ---------------------------------------------------------------------------

export interface FloatDepartment {
  /** The ID of this department (read-only). */
  department_id?: number;
  /** Parent department ID, or null if top-level. */
  parent_id?: number | null;
  name: string;
}

export interface FloatPeopleTag {
  name: string;
}

export interface FloatContract {
  /** Date the contract starts (defaults to person's start_date). */
  effective_date: string;
  /** Role ID for the contract, or null if no role. */
  role_id?: number | null;
  role_name?: string | null;
  cost_rate?: string | null;
  /** Entity from which the cost rate is derived: "role" | "person" | null. */
  cost_rate_from?: string | null;
}

/** Linked account as returned by `expand=account` on /people. */
export interface FloatAccount {
  /** Account ID (read-only). */
  account_id?: number;
  name: string;
  email: string;
  timezone?: string;
  avatar?: string;
  /**
   * High-level permissions: 1 = Account Owner, 2 = Admin, 4 = Member,
   * 5 = Billing, 7 = Manager.
   */
  account_type?: number;
  /**
   * Granular permissions (used together with account_type).
   * Member: 1 = View all, 2 = Self-edit.
   * Manager: 0 = No schedule mgmt, 1 = Manage Projects, 2 = Manage People,
   * 3 = Manage Projects & People. +4 = Create & edit People, +8 = View rates.
   */
  access?: number;
  department_filter_id?: number;
  active?: number;
  /** Last sign-in date (read-only). */
  last_login?: string;
  created?: string;
  modified?: string;
}

/**
 * /people endpoint — a person (team member, contractor, or placeholder).
 * active: 1 = Active, 0 = Archived.
 * people_type_id: 1 = Employee, 2 = Contractor, 3 = Placeholder, 4 = Role placeholder.
 * employee_type: 1 = Full-time, 0 = Part-time.
 */
export interface FloatPerson {
  /** Unique identifier (read-only). */
  people_id?: number;
  name: string;
  email?: string;
  /** Role name derived from role_id. */
  job_title?: string;
  role_id?: number;
  department?: FloatDepartment;
  notes?: string;
  /** Thumbnail filename (read-only). */
  avatar_file?: string;
  /** Weekly email: 1 = Yes, 0 = No. */
  auto_email?: number;
  /** 1 = Full-time, 0 = Part-time. */
  employee_type?: number;
  /**
   * Working hours per day indexed Sun–Sat, keyed by effective-date string
   * (YYYY-MM-DD).
   */
  work_days_hours?: Record<string, number[]>;
  /** 1 = Active, 0 = Archived. */
  active?: number;
  /** 1 = Employee, 2 = Contractor, 3 = Placeholder, 4 = Role placeholder. */
  people_type_id?: number;
  tags?: FloatPeopleTag[];
  start_date?: string;
  end_date?: string | null;
  /** Default hourly rate (string to preserve decimal precision). */
  default_hourly_rate?: string;
  region_id?: number;
  /** Date created (read-only). */
  created?: string;
  /** Date last modified (read-only). */
  modified?: string;
  // ---- expand fields ----
  /** Expand: contracts (effective cost rates & roles). */
  contracts?: FloatContract[];
  /** Expand: linked account, or null if no account. */
  account?: FloatAccount | null;
  /** Expand: list of account_ids that manage this person. */
  managers?: number[] | null;
}

/**
 * /clients endpoint.
 */
export interface FloatClient {
  /** The ID of this client (read-only). */
  client_id?: number;
  name: string;
}

/**
 * /projects endpoint.
 * status: 0 = Draft, 1 = Tentative, 2 = Confirmed, 3 = Completed, 4 = Canceled.
 * budget_type: 1 = Total hours, 2 = Total fee, 3 = Hourly fee.
 * budget_priority: 0 = Project, 1 = Phase, 2 = Task.
 * active: 1 = Active, 0 = Archived.
 */
export interface FloatProject {
  /** Project ID (read-only). */
  project_id?: number;
  name: string;
  project_code?: string;
  client_id?: number;
  color?: string;
  notes?: string;
  tags?: string[];
  /** 1 = Total hours, 2 = Total fee, 3 = Hourly fee. */
  budget_type?: number;
  budget_total?: number | null;
  /** @deprecated Use budget_priority. */
  budget_per_phase?: number;
  /** 0 = Project, 1 = Phase, 2 = Task. */
  budget_priority?: number;
  default_hourly_rate?: string;
  /** 0 = Billable, 1 = Non-billable. */
  non_billable?: number;
  /** 0 = Draft, 1 = Tentative, 2 = Confirmed, 3 = Completed, 4 = Canceled. */
  status?: number;
  stage_id?: number;
  /** @deprecated Use status. */
  tentative?: number;
  locked_task_list?: number;
  /** 1 = Active, 0 = Archived. */
  active?: number;
  project_manager?: number;
  all_pms_schedule?: number;
  created?: string;
  modified?: string;
  start_date?: string;
  end_date?: string | null;
}

/**
 * /tasks endpoint — an allocation (Float internally calls it a task).
 * status: 0 = Draft, 1 = Tentative, 2 = Confirmed, 3 = Complete.
 * repeat_state: 0–9 (0 = No repeat, 1 = Weekly, …, 9 = Yearly).
 */
export interface FloatAllocation {
  /** Allocation ID (read-only). */
  task_id?: number;
  root_task_id?: number;
  parent_task_id?: number;
  project_id: number;
  phase_id?: number;
  start_date: string;
  end_date: string;
  start_time?: string;
  hours: number;
  /** Assigned person; omit when using people_ids. */
  people_id?: number;
  /** One or more people assigned (ignored if people_id is set). */
  people_ids?: number[];
  /** 0 = Draft, 1 = Tentative, 2 = Confirmed, 3 = Complete. */
  status?: number;
  task_meta_id?: number;
  name?: string;
  notes?: string;
  /** 0 = No repeat, 1 = Weekly, 2 = Monthly, 3–9 other frequencies. */
  repeat_state?: number;
  repeat_end_date?: string | null;
  created_by?: number;
  created?: string;
  modified_by?: number;
  modified?: string;
}

/**
 * /timeoffs endpoint.
 * repeat_state: same codes as FloatAllocation.repeat_state.
 * status: 1 = Tentative, 2 = Confirmed.
 */
export interface FloatTimeoff {
  /** Time-off ID (read-only). */
  timeoff_id?: number;
  timeoff_type_id: number;
  start_date: string;
  end_date: string;
  start_time?: string;
  hours: number;
  timeoff_notes?: string;
  /** 0 = No repeat, 1 = Weekly, 2 = Monthly, 3–9 other frequencies. */
  repeat_state?: number;
  repeat_end_date?: string | null;
  /** 1 = Tentative, 2 = Confirmed. */
  status?: number;
  /** People assigned to this time-off. */
  people_ids: number[];
}

// ---------------------------------------------------------------------------

interface PaginationMeta {
  page: number;
  per_page: number;
  total_count?: number;
  page_count?: number;
}

interface FloatResult<T = unknown> {
  data: T;
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
  return async function floatFetch<T = unknown>(
    path: string,
    query: Record<string, QueryValue> = {},
  ): Promise<FloatResult<T>> {
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

    const data = await res.json<T>();

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
const SMOKE_DATA: Record<string, FloatPerson[] | FloatProject[] | FloatAllocation[] | FloatTimeoff[] | FloatClient[]> = {
  '/people': [{ people_id: 1, name: 'Ada Lovelace', email: 'ada@example.com', active: 1, people_type_id: 1 }],
  '/projects': [{ project_id: 1, name: 'Analytical Engine', client_id: 1, active: 1 }],
  '/tasks': [
    {
      task_id: 1,
      project_id: 1,
      people_id: 1,
      start_date: '2026-01-05',
      end_date: '2026-01-09',
      hours: 8,
    } as FloatAllocation,
  ],
  '/timeoffs': [
    { timeoff_id: 1, timeoff_type_id: 1, people_ids: [1], start_date: '2026-01-12', end_date: '2026-01-16', hours: 8 },
  ],
  '/clients': [{ client_id: 1, name: 'Example Client' }],
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
  let floatFetch: (<T = unknown>(path: string, query?: Record<string, QueryValue>) => Promise<FloatResult<T>>) | null =
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
      name: 'float_get_person_by_name',
      description: 'Finds Float people whose name matches the given string. Returns all matching people (case-insensitive, partial match supported by the Float API).',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Full or partial name of the person to search for.' },
          active: {
            type: 'integer',
            description: 'Optionally filter by status: 1 = active, 0 = archived. Omit for all.',
          },
          ...pagingProperties,
        },
        required: ['name'],
      },
    },
    async (input) => {
      const args = (input ?? {}) as Record<string, unknown>;
      const name = args.name as string;
      if (!name || !name.trim()) throw new Error('name is required.');
      return call('/people', {
        ...paging(args),
        name: name.trim(),
        active: args.active as number | undefined,
      });
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
      'float_get_person_by_name',
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
