# FS-04: Trackwise, a Multi-Tenant SaaS Project Management Platform

A Jira-like product where **each company gets its own isolated workspace** with boards, sprints, an audit trail, webhooks and billing.

**Stack:** Django REST Framework, PostgreSQL, Celery + Redis, React (Vite, dnd-kit), Docker, GitHub Actions. Billing: Stripe Billing (test mode) when a key is set, otherwise a built-in simulated checkout.

## What it does

| Area | Details |
|---|---|
| **Multi-tenancy** | Shared schema: every tenant table has a `workspace` column. Outsiders get 404; every query is filtered by workspace; cross-tenant references are rejected. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). |
| **Roles** | Owner, admin, member, viewer, enforced on every endpoint (matrix in the architecture doc). |
| **Kanban board** | Drag and drop between columns and reorder within a column, saved on the server. |
| **Custom workflows** | Each project defines its own columns and which moves between them are allowed (the server enforces the rules). |
| **Sprints and backlog** | Plan, start, complete (unfinished issues return to the backlog), one active sprint per project. |
| **Comments, attachments** | Comments by author; attachments with a size limit, served only through permission-checked downloads. |
| **Audit log** | Every create / update / delete is recorded with old and new values (admins can read it). |
| **Webhooks** | Signed (HMAC-SHA256), filtered by event, delivered by Celery with retries, delivery log and a test button. Private addresses are blocked in production. |
| **Background jobs** | Celery: webhook delivery, assignment notification emails, CSV sprint/project reports. |
| **Billing and limits** | Free / Pro / Business plans limit projects, members and webhooks; going over returns HTTP 402 and an upgrade prompt. |
| **DevOps** | Docker Compose runs the whole stack; GitHub Actions tests, builds the images and publishes them. |

## Run everything with Docker (recommended)

**You need:** Docker Desktop. Nothing else (no Python or Node install).

```bash
cd FS-04
cp .env.example .env          # Windows PowerShell: copy .env.example .env
# open .env and set DJANGO_SECRET_KEY to any long random text
docker compose up --build     # first build takes a few minutes
```

In a second terminal, once it is running:

```bash
cd FS-04
docker compose exec backend python manage.py seed_demo
```

Open **http://localhost:8080**.

| Demo accounts (password `Demo@12345`) | Company | Role |
|---|---|---|
| `priya@acme.test` | Acme Corp (Pro plan) | owner |
| `arjun@acme.test` | Acme Corp | admin |
| `meera@acme.test` | Acme Corp | member |
| `vik@acme.test` | Acme Corp | viewer |
| `sam@globex.test` | Globex Ltd (Free plan) | owner |
| `gina@globex.test` | Globex Ltd | member |

Things to try: log in as Priya and drag cards on the Website Redesign board; log in as Vik and see that nothing can be edited; log in as Sam and try `http://localhost:8080/w/acme-corp` (you are told it does not exist); as Sam create projects until the Free plan stops you.

## Development without Docker for the app itself

```bash
# databases only
docker compose up -d db redis
# backend (needs Python 3.12)
cd backend && python -m venv .venv && .venv/Scripts/activate   # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then export these values or use your IDE; defaults match the compose db
python manage.py migrate && python manage.py seed_demo
python manage.py runserver 8000
celery -A config worker -l info        # second terminal: webhooks, emails, reports
# frontend (Node 20)
cd frontend && npm install && npm run dev      # http://localhost:5173
```

## Tests

| Suite | Command | What it proves |
|---|---|---|
| Backend (94 tests) | `cd backend && python manage.py test --noinput` | tenant isolation, roles, Kanban moves, workflows, sprints, audit, webhooks, billing limits, reports |
| Background jobs, real worker | `cd backend && python scripts/e2e_celery.py` | a real Celery process delivers a signed webhook, an email and a report |
| Frontend (18 tests) | `cd frontend && npm run test:ui` | drag-and-drop logic, and the real UI against the real API (needs the API on :8000) |

Details and numbers: [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

## Honest notes

- **Billing is simulated by default.** A Stripe account was not available. The real Stripe Checkout and webhook code is implemented, but it has **not been run against Stripe**. Set `STRIPE_SECRET_KEY` to switch it on. Everything after "payment succeeded" (plans, limits, audit) is shared and fully tested.
- **Docker Compose and the GitHub Actions workflow were written carefully but could not be executed in the environment where the code was developed.** They are validated in structure; the first real run is your push to GitHub.
- Isolation is enforced in application code (and proven by tests), not by PostgreSQL row-level security. See "Next steps".

## Next steps

PostgreSQL row-level security as a second line of defence; email via a real SMTP provider; real Stripe in production; presigned direct uploads; burndown charts.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [API reference](docs/API.md) · [Test results](docs/TEST_RESULTS.md) · [Presentation and reflection notes](docs/PRESENTATION_AND_REFLECTION.md)
