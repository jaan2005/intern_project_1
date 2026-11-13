# Test results

All numbers below come from real runs on 29 Oct 2026 (Node 22, MongoDB 8, Redis 7, FFmpeg 6.1).

## Automated tests

| Suite | Command | Tests | Result |
|---|---|---|---|
| Unit: quiz grading, progress, earnings split | `cd server && npm run test:unit` | 10 | all pass |
| Smoke: every route exists and is protected, validation, admin can't be self-registered | `cd server && npm run test:unit` | 40 | all pass |
| End-to-end API flow against real MongoDB (incl. simulated checkout) | `cd server && npm test` | 15 | all pass |
| Full video pipeline: upload, BullMQ, worker process, FFmpeg, storage, playback | `cd server && npm test` | 1 | all pass |
| React UI flows against a real API (incl. simulated checkout page) | `cd client && npm run test:ui` | 5 | all pass (repeated runs, no flakes) |
| **Total** | | **71** | **71 pass, 0 fail, 0 skipped** |

### What the end-to-end tests prove
- Register, login, wrong password, duplicate email, role guards (student cannot create courses or open admin APIs).
- An instructor builds a course with lessons and a quiz. A course cannot be published until a video is processed. Other instructors cannot edit it.
- The catalogue is public, drafts are hidden, and **video URLs are never in the course response**. They only come from the access-checked lesson endpoint (enrolled student, owner, admin, or free preview).
- A student enrolls, fails a quiz (0%), then passes it. Progress goes 67% then 100%. The certificate is issued automatically, the PDF is a real PDF, another student gets 403, and the public verify endpoint confirms it.
- Simulated checkout: wrong card rejected (400), declined card (402), another user's session hidden (404), the test card enrolls the student, paying twice changes nothing, earnings show both sales with the correct 20% split, and the simulated endpoints are switched off when Stripe is the provider.
- Payments: pending payment does not enroll; a paid payment enrolls **exactly once even when fulfilled twice** (webhook + confirm). The earnings aggregation returns the right gross, platform fee (20%), net, per-course and per-month figures; other instructors see nothing.
- Live classes: only the owner schedules; students are blocked until the class is live; the student's token can chat but not broadcast; ended classes return 410.
- Video upload: wrong file types, missing files and non-owners are rejected.
- **Pipeline:** a real upload goes through the API, Redis and a separate worker process. FFmpeg produces 720p and 360p HLS. The master playlist, variant playlist and a segment all download, and the uploaded source file is deleted afterwards.

### What the UI tests prove
The student journey (catalogue, login, enroll, lesson loads with a video player, mark complete, failed then passed quiz, 100% progress, certificate button), the instructor studio (courses table, editor shows both videos Ready, earnings page), and that a student is bounced away from the admin page.

## Bugs found (and fixed)
0. An expired or stale login token made **public** course pages return 401 (found while running the app on a real PC after a database reset). Public pages now treat a bad token as logged-out, and the app logs the user out automatically when the server rejects their token.

## Bugs the tests found (and that are fixed)
1. After enrolling, the student was bounced back to the course page instead of the player (stale cached enrollment). Found by the UI test.
2. An ended live class told students "not started yet" (409) instead of "ended" (410). Found by the end-to-end test.

## Video pipeline measurements (FFmpeg 6.1)

| Case | Result |
|---|---|
| 10 s 1280x720 video with audio | 720p + 360p renditions, 3 segments each, duration read as 10 s |
| 4 s 320x240 silent video | converted without an audio track; **not upscaled** |
| Missing input file | retried once (2 attempts), then the lesson is marked `failed` with the error message |
| Certificate PDF | valid 1-page A4 landscape PDF, about 2 KB |

## NOT tested yet (needs your accounts or a real browser/Docker)
- **AWS S3 + CloudFront** (the S3 code path and CloudFront CORS setup). Follow `docs/AWS_SETUP.md`.
- **Real Stripe**: creating a real Checkout session and receiving a real webhook (the project runs on the simulated gateway unless a Stripe key is set). The payment fulfillment and earnings logic shared by both is tested.
- **LiveKit media**: tokens and permissions are tested; actual camera/mic streaming needs your LiveKit keys.
- **Docker deployment files** (`docker-compose.prod.yml`): written, not run (no Docker in my environment).
- **Real-browser look and playback**: the UI tests use a simulated browser, so CSS and hls.js playback are not visually verified.

## To measure on your machine for the presentation
- Time to process your real demo video (the worker logs when a job finishes) and its size.
- Playback start time from CloudFront vs local (browser Network tab).
- One screen recording of the full flow.
