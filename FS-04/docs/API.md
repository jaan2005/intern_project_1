# API reference

Base URL `http://localhost:8000/api` (through nginx: `http://localhost:8080/api`). JSON everywhere.
Authenticated routes need `Authorization: Token <token>`. Lists are paginated: `{count, next, previous, results}` (100 per page).

**Errors** are `{"detail": "..."}` or field errors `{"title": ["..."]}`.
Status codes: `400` validation, `401` not logged in, `402` plan limit, `403` role too low, `404` not found **or not a member of that workspace**, `409` conflict.

## Auth and workspaces (not workspace-scoped)

| Method | Path | Purpose |
|---|---|---|
| GET | /health/ | health check (also tests the database) |
| POST | /auth/register/ | `{email, name, password}` returns `{token, user}` |
| POST | /auth/login/ | `{email, password}` returns `{token, user}` |
| GET | /auth/me/ | current user |
| GET | /workspaces/ | the workspaces I belong to, with my role and plan |
| POST | /workspaces/ | `{name}` creates a workspace; I become its owner (Free plan) |

## Workspace-scoped: everything under `/w/<slug>/`

Every route below needs membership of `<slug>` (else 404) and the minimum role shown.

| Method | Path | Min role | Purpose |
|---|---|---|---|
| GET | `/` | viewer | workspace, my role, plan |
| PATCH | `/` | admin | rename `{name}` |
| DELETE | `/` | owner | delete the workspace and all its data; body `{"confirm": "<slug>"}` |
| GET | members/ | viewer | list members |
| POST | members/ | admin | `{email, role}` add an existing user (**plan limit**) |
| PATCH | members/&lt;id&gt;/ | admin | `{role}` (owners only change owners; last owner protected) |
| DELETE | members/&lt;id&gt;/ | any (self) / admin | remove or leave |
| GET, POST | projects/ | viewer / admin | list / create `{name, key, description}` (**plan limit**; creates To Do, In Progress, Done) |
| GET, PUT, PATCH, DELETE | projects/&lt;id&gt;/ | viewer / admin | |
| GET | projects/&lt;id&gt;/board/?sprint=all\|active\|backlog\|&lt;id&gt; | viewer | columns with their cards, in order, in one request |
| GET, POST | statuses/?project=&lt;id&gt; | viewer / admin | workflow columns `{project, name, category, order, next_statuses[]}` |
| PATCH, DELETE | statuses/&lt;id&gt;/ | admin | rename, reorder, set allowed moves; refused while it has issues or is the last one |
| GET, POST | sprints/?project=&lt;id&gt; | viewer / admin | `{project, name, goal, start_date, end_date}` |
| POST | sprints/&lt;id&gt;/start/ | admin | one active sprint per project |
| POST | sprints/&lt;id&gt;/complete/ | admin | unfinished issues return to the backlog |
| GET | issues/?project=&status=&assignee=me\|id&sprint=backlog\|id&type=&priority=&search= | viewer | filtered list |
| POST | issues/ | member | `{project, title, type, priority, status?, assignee?, sprint?, story_points?, due_date?}`; gets key `WEB-n` |
| GET, PATCH | issues/&lt;id&gt;/ | viewer / member | edits are audited with old/new values; status changes obey the workflow rules |
| DELETE | issues/&lt;id&gt;/ | admin | |
| POST | issues/&lt;id&gt;/move/ | member | drag and drop: `{status, index}`; enforces workflow rules |
| GET, POST | comments/?issue=&lt;id&gt; | viewer / member | `{issue, body}` |
| PATCH, DELETE | comments/&lt;id&gt;/ | author or admin | |
| GET, POST | attachments/?issue=&lt;id&gt; | viewer / member | POST is multipart: `issue`, `file` (max 5 MB) |
| GET | attachments/&lt;id&gt;/download/ | viewer | permission-checked download |
| DELETE | attachments/&lt;id&gt;/ | member | |
| GET | audit/?action=&target_type=&actor= | admin | the audit trail |
| GET, POST | webhooks/ | admin | `{url, events[] or ["*"], description}` (**Free plan: 402**) |
| PATCH, DELETE | webhooks/&lt;id&gt;/ | admin | |
| GET | webhooks/&lt;id&gt;/deliveries/ | admin | last 50 deliveries |
| POST | webhooks/&lt;id&gt;/test/ | admin | queue a `webhook.test` event |
| POST | webhooks/&lt;id&gt;/rotate_secret/ | admin | |
| GET, POST | reports/ | viewer / member | POST `{kind: sprint\|project, sprint\|project}` returns **202**; poll until `status: done` |
| GET | reports/&lt;id&gt;/download/ | viewer | CSV |
| GET | billing/ | admin | plan, usage, limits, plans, mode |
| POST | billing/checkout/ | owner | `{plan: pro\|business}` returns `{url}` (Stripe Checkout or the simulated page) |
| POST | billing/cancel/ | owner | back to Free (refused while usage exceeds Free limits) |

## Billing helpers (not workspace-scoped)

| Method | Path | Purpose |
|---|---|---|
| GET | /billing/mock/&lt;session&gt;/ | the simulated checkout page's data (owner only; 404 when Stripe is the provider) |
| POST | /billing/mock/pay/ | `{session_id, card_number}`; `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` declines |
| POST | /billing/stripe/webhook/ | Stripe's webhook (signature verified; 404 unless Stripe is configured) |

## Plan limit response (HTTP 402)
```json
{ "detail": "Your Free plan allows 2 projects. Upgrade to add more.", "code": "plan_limit", "plan": "free", "limit": 2 }
```

## Webhook delivery
`POST <your url>` with `Content-Type: application/json` and headers `X-PM-Event`, `X-PM-Delivery`, `X-PM-Signature: sha256=<hex>`.
Verify with `hmac.new(secret, raw_body, sha256).hexdigest()`. Body:
```json
{ "id": 42, "event": "issue.status_changed", "workspace": "acme-corp",
  "actor": {"id": 3, "name": "Meera Member"},
  "target": {"type": "issue", "id": 7, "label": "WEB-2: Fix login redirect loop"},
  "changes": {"status_id": [1, 2]}, "timestamp": "2026-11-16T10:00:00+00:00" }
```
Events: issue.created/updated/status_changed/deleted, comment.*, attachment.*, project.*, status.*, sprint.* (+started, completed), member.added/role_changed/removed, billing.plan_changed, report.ready.
