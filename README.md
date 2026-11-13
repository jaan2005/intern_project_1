# Full-Stack Development Internship: Nexvia Technologies

Two full-stack projects, built and documented in one repository.

| Folder | Project | Stack | Status |
|---|---|---|---|
| [`FS-03/`](FS-03/) | **Learning Management System with Live Classes** | MERN, BullMQ + Redis, FFmpeg (HLS), LiveKit (WebRTC), PDFKit, Redux Toolkit | Complete |
| [`FS-04/`](FS-04/) | **Multi-Tenant SaaS Project Management Platform** | Django REST, PostgreSQL, Celery, React, Docker, GitHub Actions | See `FS-04/README.md` (added with Project 2) |

Each folder is self-contained, with its own README (architecture, run steps, feature breakdown), `docs/` (architecture diagrams, API reference, test results), tests and `screenshots/`.

## FS-03: Learning Management System

A full online school: instructors publish video courses, students learn, take quizzes and earn PDF certificates, classes can run live with chat, and instructors see their earnings.

- **Roles and auth:** student, instructor, admin; JWT; admin cannot be self-assigned.
- **Video pipeline:** upload, then BullMQ job, then FFmpeg converts to HLS (720p + 360p) in a separate worker process, then storage (local, or S3 + CloudFront), then playback with hls.js.
- **Quizzes and progress:** auto-graded on the server, answers hidden until submitted, progress per student per course.
- **Certificates:** issued automatically on completion, PDF download and a public verification page.
- **Live classes:** LiveKit rooms with video, audio and chat.
- **Payments and earnings:** checkout, platform-fee split and an instructor earnings dashboard.
- **Quality:** 71 automated tests (unit, end-to-end API on real MongoDB, full video pipeline, React UI flows). See `FS-03/docs/TEST_RESULTS.md`.

Run it: see [`FS-03/README.md`](FS-03/README.md). Architecture: [`FS-03/docs/ARCHITECTURE.md`](FS-03/docs/ARCHITECTURE.md).

## Honest notes on what is and is not integrated

- **CloudFront / S3:** implemented and configurable (`STORAGE_DRIVER=s3`), but **not deployed or tested against real AWS** because an AWS account could not be created. Videos stream from local storage by default.
- **Payments:** a **simulated checkout** (test cards) is used because a Stripe account was not available. The Stripe code path is implemented and takes over when `STRIPE_SECRET_KEY` is set.

## Demo videos

(Link to the Google Drive folder with the screen recordings: add before submitting.)

## Repository layout

```
FS-03/   Learning Management System (server/, client/, docs/, screenshots/)
FS-04/   Multi-Tenant SaaS Project Management Platform
.github/ CI workflows (GitHub Actions)
```
