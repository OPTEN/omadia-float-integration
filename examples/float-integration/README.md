# Example: `@acme/integration-float`

An omadia **integration** plugin for [Float](https://www.float.com), the
resource-planning tool. It exposes read-only tools over the
[Float REST API v3](https://developer.float.com): people, projects,
allocations (scheduled tasks), time off and clients.

## Tools

| Tool | Float endpoint | Purpose |
| --- | --- | --- |
| `float_list_people` | `GET /people` | List team members (filter by status/department). |
| `float_get_person` | `GET /people/{id}` | Fetch one person. |
| `float_list_projects` | `GET /projects` | List projects (filter by status/client). |
| `float_get_project` | `GET /projects/{id}` | Fetch one project. |
| `float_list_allocations` | `GET /tasks` | Who works on what, when, for how many hours. |
| `float_list_timeoffs` | `GET /timeoffs` | Vacation, sick leave and other time off. |
| `float_list_clients` | `GET /clients` | List clients. |

All tools are read-only (`side_effects: "read"`, idempotent) and support
pagination (`page`, `per_page`; metadata is returned from Float's
`X-Pagination-*` headers).

## What's here

| File | Purpose |
| --- | --- |
| `manifest.yaml` | Identity, install form (secret API token), declared tools (`capabilities`), network permission for `api.float.com`. |
| `src/plugin.ts` | Exports `activate(ctx)`; shared `floatFetch` client + the seven tools. |
| `skills/system-prompt.md` | Prompt-partial that shapes how the agent uses the tools. |
| `assets/icon.svg` | Store icon. |

## Setup

The install form asks for a **Float API token** (created in Float under
*Team Settings → Integrations → API*; requires an Admin/Account Owner role).
The token is stored in the vault and read via `ctx.secrets`. An optional
contact email is sent in the `User-Agent` header, as Float requests.

## Build a ZIP

```bash
npm install                 # once, from the repo root
npm run build -w examples/float-integration
# → examples/float-integration/out/acme-integration-float-0.1.0.zip
```

Upload that ZIP in the omadia admin UI (**Store → Upload**).

## Make it yours

1. Rename `@acme/integration-float` → your reverse-DNS id in `package.json`
   **and** `manifest.yaml` (`identity.id`), and update the `authors` block.
2. Add write tools (create/update allocations or time off) by registering more
   tools in `src/plugin.ts` and mirroring them under `capabilities` — mark them
   `side_effects: "write"`.
3. Network access is limited to `permissions.network.outbound:
   ["api.float.com"]`; all traffic goes through `ctx.http`.

See [`docs/en/02-build-an-agent-plugin.md`](../../docs/en/02-build-an-agent-plugin.md)
([DE](../../docs/de/02-agent-plugin-bauen.md)) for the general plugin
walkthrough — integrations share the same `activate(ctx)` shape.
