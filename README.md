# Full-Stack Development Internship: Nexvia Technologies

Two full-stack projects, built and documented in one repository.

| Folder | Project | Stack |
|---|---|---|
| [`FS-03/`](FS-03/) | **Learning Management System with Live Classes** | MERN, BullMQ + Redis, FFmpeg (HLS), LiveKit (WebRTC), PDFKit, Redux Toolkit |
| [`FS-04/`](FS-04/) | **Multi-Tenant SaaS Project Management Platform** | Django REST, PostgreSQL, Celery + Redis, React (dnd-kit), Docker, GitHub Actions |

Each folder is self-contained: its own README (architecture, installation and run steps, feature breakdown), `docs/` (architecture diagrams, API reference, test results), tests, and `screenshots/`. The CI pipeline for FS-04 is in [`.github/workflows/`](.github/workflows/fs04-ci.yml) because GitHub only reads workflows from the repository root.

## FS-03: Learning Management System with Live Classes

A full online school. Instructors publish video courses, students learn, take quizzes and earn PDF certificates, classes run live with chat, and instructors see their earnings.

- **Video pipeline:** upload, BullMQ job, FFmpeg converts to HLS (720p + 360p) in a separate worker, storage (local, or S3 + CloudFront), playback with hls.js.
- **Quizzes and progress** graded on the server; **certificates** issued on completion with a public verification page; **live classes** with LiveKit (video, audio, chat); **payments and an earnings dashboard**.
- 71 automated tests (unit, end-to-end API on real MongoDB, full video pipeline, React UI flows).

Run: [`FS-03/README.md`](FS-03/README.md) · Architecture: [`FS-03/docs/ARCHITECTURE.md`](FS-03/docs/ARCHITECTURE.md) · Tests: [`FS-03/docs/TEST_RESULTS.md`](FS-03/docs/TEST_RESULTS.md)

## FS-04: Multi-Tenant SaaS Project Management Platform

A Jira-like product where each company gets its own isolated workspace.

- **Tenant isolation** (shared schema with a workspace column) enforced in layers and proven by tests: outsiders get 404, every query is workspace-scoped, cross-tenant references are rejected.
- **Roles** (owner, admin, member, viewer), a **Kanban board** with drag and drop, **custom workflows** with enforced transition rules, sprints and backlog, comments, attachments, an **audit log**.
- **Webhooks** (HMAC-signed, retried) and **Celery** background jobs (emails, reports); **billing plans and limits** (HTTP 402 and an upgrade flow).
- **Docker Compose** for the whole stack and a **GitHub Actions** pipeline that tests, builds and publishes images.
- 112 automated tests plus a real-worker check.

Run: [`FS-04/README.md`](FS-04/README.md) · Architecture: [`FS-04/docs/ARCHITECTURE.md`](FS-04/docs/ARCHITECTURE.md) · Tests: [`FS-04/docs/TEST_RESULTS.md`](FS-04/docs/TEST_RESULTS.md)

## Honest notes on what is and is not integrated

- **FS-03, CloudFront / S3:** implemented and configurable (`STORAGE_DRIVER=s3`), but **not deployed or tested against real AWS** because an AWS account could not be created. Videos stream from local storage by default.
- **FS-03, payments:** a **simulated checkout** with test cards, because a Stripe account was not available. The Stripe path is implemented and takes over when `STRIPE_SECRET_KEY` is set.
- **FS-04, billing:** the same approach. A simulated Stripe-style checkout is the default; the real Stripe Checkout and webhook code is implemented but **has not been run against Stripe**. Plans, limits and everything after "payment succeeded" are shared and tested.
- **FS-04, Docker Compose and the GitHub Actions workflow** were validated for structure but were written in an environment without Docker or GitHub runners; their first full run is on GitHub.

## Demo videos

(Link to the Google Drive folder with the screen recordings: add before submitting.)

## Repository layout

```
FS-03/    Learning Management System (server/, client/, docs/, screenshots/)
FS-04/    Project management platform (backend/, frontend/, docs/, screenshots/, docker-compose.yml)
.github/  CI workflows (GitHub Actions)
```
