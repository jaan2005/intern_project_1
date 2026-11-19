# Test results

All numbers are from real runs on 16 Nov 2026 (Python 3.12, Django 5.2, PostgreSQL 16, Redis 7, Node 22).

## Summary

| Suite | Command | Tests | Result |
|---|---|---:|---|
| Backend: tenant isolation | `python manage.py test` | 12 | pass |
| Backend: authentication, roles, member management | | 16 | pass |
| Backend: issues, Kanban moves, custom workflows, sprints, comments, attachments | | 30 | pass |
| Backend: webhooks, assignment emails, reports | | 18 | pass |
| Backend: billing, plan limits, simulated checkout | | 18 | pass |
| Background jobs with a **real Celery worker** | `python scripts/e2e_celery.py` | 5 checks | pass |
| Frontend: drag-and-drop move logic | `npm run test:ui` | 8 | pass |
| Frontend: real UI against the real API | `npm run test:ui` | 10 | pass (3 consecutive runs) |
| **Total** | | **112 tests + 5 checks** | **all pass, 0 failures** |

Backend run time: about 52 seconds on PostgreSQL.

## What the tests prove

**Tenant isolation (12 tests).** A user from another company gets **404 on every one of 15 endpoints** (read, create, delete), an unknown workspace looks the same as a forbidden one, and anonymous requests get 401. Inside their *own* workspace, using another company's object ids returns 404. Creating an issue that references another company's project, status, assignee or issue is rejected (400). Moving a card into another company's column is rejected. Attachment downloads, the audit log and the workspace list never leak. One person can belong to two workspaces with different roles. Deleting a workspace removes only that tenant's data.

**Roles and members (16).** The full permission matrix per role (viewer / member / admin / owner), clear error messages, and member rules: admins cannot create or touch owners, roles cannot exceed your own, the last owner cannot be demoted or removed, anyone can leave.

**Kanban, workflows, sprints (30).** Issue keys count up per project (`WEB-1`, `MOB-1`), cards group into columns in order, dragging between columns and reordering work, **45 repeated drops between the same two cards keep the order correct** (the server renumbers when float positions run out), moves are audited as status changes, custom columns append at the end, **transition rules are enforced** on both drag-and-drop and normal edits, rules cannot reference another project, columns with issues or the last column cannot be deleted, only one sprint can be active, completing a sprint returns unfinished work to the backlog, comments belong to their author, attachments have a size limit and sanitised names.

**Webhooks and jobs (18).** Deliveries carry a **valid HMAC signature** that the test recomputes; only subscribed events are sent; inactive hooks and other companies' events never arrive; a failing endpoint is **retried then marked failed**; an unreachable endpoint never breaks the user's request; private/loopback/metadata addresses are blocked in production mode; assignment emails go to the new assignee only; reports are accepted instantly (202), built in the background, correct, downloadable, formula-injection-safe, and a failing report is reported as failed.

**Billing (18).** Free-plan limits return **402** for projects, members and webhooks with the plan and limit as numbers; limits are per workspace; Business is unlimited; the full simulated checkout (nothing changes until the card is accepted, declined and invalid cards do nothing, retry works, paying twice is harmless, only the owner can buy or pay, other companies cannot pay for my session); downgrades are refused while usage is too high and allowed afterwards; features switch off after a downgrade; simulated endpoints are off when Stripe is the provider; the Stripe webhook rejects unsigned requests.

**Real worker check (5).** With a separate Celery process and Redis: the worker delivered a webhook whose signature verified, produced the assignment email, generated the CSV report, delivered the `report.ready` event, and the delivery log showed every delivery as successful.

**UI tests (18).** Drag-and-drop: moving within a column, between columns, onto empty space, no-op drops, and that the input is not mutated. Against the real API: the board shows cards in the right columns; creating an issue, commenting and editing; a workflow rule error shown to the user; a **viewer** sees a read-only board with no admin menus; an **outsider** sees "not a member"; the Free plan blocks a third project with an upgrade link; the simulated checkout declines then upgrades; webhooks are refused on Free and work after upgrading; a report is generated in the background and becomes downloadable; a stale login is logged out automatically.

## Bugs the tests found (all fixed)

1. Deleting a workspace failed because an issue's status used `PROTECT`, which also blocked the deletion cascade. Changed to `RESTRICT`.
2. The 402 response returned the plan `limit` as the text `"2"`, because the framework turns dictionary values into strings. It is now a number.
3. A new custom workflow column landed *after* "Done" when no position was given. New columns are now appended, and the order can be changed.

## Not tested (needs your accounts or environment)

- **Docker Compose and the Dockerfiles** were validated for structure only; no Docker engine was available while developing.
- **The GitHub Actions workflow** was validated as YAML only; its first real run is your first push. The `docker` job builds and smoke-tests the stack and, on `main`, publishes images to ghcr.io.
- **Real Stripe**: Checkout creation and the Stripe webhook are implemented but have not been run against Stripe (the project uses the simulated gateway unless a key is set).
- **Real browser**: the UI tests use a simulated browser, so pointer-based dragging, CSS and layout were not visually verified.
- **Real email delivery**: emails are printed to the worker log (console backend); SMTP is not configured.

## To measure on your machine for the presentation
- Screenshot the green CI run on GitHub and the local `python manage.py test` output.
- Time a board load with a few hundred issues (browser Network tab: `/board/` is one request).
