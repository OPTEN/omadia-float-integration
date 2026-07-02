<div align="center">

# omadia Float integration

### `@opten/float-integration` — an [omadia](https://omadia.ai) integration plugin for [Float](https://www.float.com), the resource-planning tool.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)
[![Built for omadia](https://img.shields.io/badge/built%20for-omadia-2496ED.svg)](https://github.com/byte5ai/omadia)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

Read-only access to your Float resource plan from omadia agents, via the
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
`X-Pagination-*` headers). The plugin never creates, changes or deletes
anything in your Float account.

## Setup

The install form asks for a **Float API token** (created in Float under
*Team Settings → Integrations → API*; requires an Admin/Account Owner role).
The token is stored in the omadia vault and read via `ctx.secrets`. An
optional contact email is sent in the `User-Agent` header, as Float requests.

Network access is limited to `api.float.com`
(`permissions.network.outbound`); all traffic goes through `ctx.http`.

## Build & install

```bash
# Node 22 is pinned via .nvmrc
nvm use            # or: install Node >= 20

npm install
npm run typecheck
npm run build      # → out/opten-float-integration-<version>.zip
```

Upload the ZIP in the omadia **admin UI → Store → Upload**, paste your Float
API token into the setup form, and prompt an agent — e.g.
*"Who is allocated to the website relaunch project next week?"*

## Repository layout

```
omadia-float-integration/
├── manifest.yaml             ← identity, setup form, capabilities, permissions
├── src/plugin.ts             ← activate(ctx); Float API client + the 7 tools
├── skills/system-prompt.md   ← prompt-partial shaping how agents use the tools
├── assets/icon.svg           ← store icon
├── scripts/build-zip.mjs     ← esbuild → ZIP build
└── types/                    ← local @omadia/plugin-api type stub (compile offline)
```

`@omadia/plugin-api` is provided by the omadia host at runtime — it is not
published to npm. The type stub in [`types/`](./types) lets the plugin
typecheck offline; the build marks the real package as `external`.

## License

[MIT](./LICENSE)
