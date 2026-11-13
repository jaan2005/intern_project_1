# Lumen Academy: Learning Management System with Live Classes

A full online school: instructors publish video courses, students learn and take quizzes, classes can run live,
students earn PDF certificates, and instructors see their earnings.

**Stack:** MongoDB, Express, React, Node (MERN), Redux Toolkit (RTK Query), BullMQ + Redis, FFmpeg (HLS),
AWS S3 + CloudFront, Stripe test mode (or the built-in simulated gateway), LiveKit (WebRTC), PDFKit.

## Features

| Area | What it does |
|---|---|
| Roles | Student, instructor, admin. JWT login, role guards on every route, admin can only be created by a script. |
| Courses | Instructors create, edit, price, publish courses and lessons. Free-preview lessons. |
| Video pipeline | Upload, then BullMQ job, then FFmpeg converts to HLS (720p + 360p), then S3, then CloudFront. A separate worker process does the conversion. |
| Quizzes | Multiple choice, graded on the server, pass mark per quiz, answers hidden until submitted. |
| Progress | Lessons completed plus quizzes passed give a percentage per student per course. |
| Certificates | Issued automatically on completion. PDF download and a public verification page. |
| Live classes | LiveKit room per class with video, audio and chat. Instructor publishes, students watch and chat. |
| Payments | Stripe Checkout (test mode) when a key is set, otherwise a built-in simulated checkout with test cards. Webhook plus confirm endpoint, enrollment on payment. |
| Earnings | Instructor dashboard: totals, platform fee split, by course, by month, recent sales. |

Architecture diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). API reference: [docs/API.md](docs/API.md).

## Run it locally

**Needs:** Node 18+, Docker, Git.

```bash
# 1. databases (MongoDB + Redis)
docker compose up -d

# 2. backend
cd server
cp .env.example .env        # Windows: copy .env.example .env   then set JWT_SECRET to any long random text
npm install
npm run seed:admin          # creates admin@lms.test / Admin@12345
npm run seed:demo           # optional: demo users, 2 courses, a quiz and real processed videos
npm run dev                 # API on http://localhost:5000

# 3. video worker (a SECOND terminal, same folder)
npm run worker

# 4. frontend (a THIRD terminal)
cd client
npm install
npm run dev                 # app on http://localhost:5173
```

With the default `STORAGE_DRIVER=local` you do **not** need AWS: videos are stored in `server/storage` and
served by Express. Switch to S3 + CloudFront with [docs/AWS_SETUP.md](docs/AWS_SETUP.md).
Payments work out of the box with the simulated checkout (test card `4242 4242 4242 4242`). Stripe and LiveKit setup: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

**Demo logins** (after `npm run seed:demo`, password `Demo@12345`): `teacher@lms.test` and `student@lms.test`.
Run everything in containers instead: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Try the whole flow (5 minutes)

1. Sign up as an **instructor**. Open **Teach**, create a course, add a lesson, upload any short `.mp4`.
   Watch the status go Queued, Processing, Ready (the worker terminal logs each step).
2. Add a quiz, then **Publish** the course.
3. In a private window, sign up as a **student**. Enroll, watch the lesson, mark it complete, pass the quiz.
4. Download the **certificate**, then open its verify link (`/verify/<id>`).
5. As admin (`admin@lms.test`), open **Admin** to see users and stats.

Free test videos: Big Buck Bunny and Sintel (Blender open movies) or Pexels stock clips.

## Tests

Start MongoDB and Redis first (`docker compose up -d`).

```bash
cd server
npm run test:unit   # 48 tests, no database needed: grading, progress, earnings split, route protection
npm test            # 66 tests: the above + 15 end-to-end API tests + the full upload->worker->playback pipeline

cd ../client
npm run test:ui     # 5 tests: drives the real React app against a throwaway API with demo data
```

Results and what each suite proves: [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

## Project layout

```
docker-compose.yml          MongoDB + Redis
server/src/
  config/                   env + database
  models/                   User, Course, Lesson, Quiz, QuizAttempt, Enrollment, Payment, Certificate, LiveClass
  controllers/ routes/      one pair per feature
  services/                 storage (local/S3), ffmpeg, grading, progress, certificate PDF
  queues/ workers/          BullMQ queue and the FFmpeg worker (runs as its own process)
  middleware/               auth (protect/authorize), errors, upload
server/test/                unit, smoke, end-to-end and pipeline tests
server/Dockerfile, client/Dockerfile, docker-compose.prod.yml   run the whole stack in containers
client/src/                 React app (api.js = all server calls; pages/ components/)
docs/                       architecture, API, setup guides, test results, presentation notes
```

## Known limitations / next steps

- CloudFront URLs are public (unguessable folder names, but not signed). Next step: CloudFront signed cookies.
- Quizzes are multiple-choice only; no refunds or coupons; one rendition ladder (720p/360p).
- Video upload goes through the API server. For very large files, upload directly to S3 with presigned URLs.
- Live-class chat is not stored after the class ends.
