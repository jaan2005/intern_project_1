# API reference

Base URL `http://localhost:5000/api`. Authenticated routes need `Authorization: Bearer <token>`.
Errors always look like `{ "message": "...", "errors": [ { "field", "message" } ] }`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | /health | public | health check |
| POST | /auth/register | public | sign up as student or instructor |
| POST | /auth/login | public | returns `{ token, user }` |
| GET | /auth/me | logged in | current user |
| GET | /courses?search=&page=&limit= | public | published course catalogue |
| GET | /courses/mine | instructor, admin | my courses incl. drafts, with student counts |
| GET | /courses/:id | public* | course, lessons (no video URLs), enrollment state. *Drafts: owner/admin only |
| POST | /courses | instructor, admin | create course (`priceCents` in cents) |
| PUT | /courses/:id | owner, admin | edit course |
| PATCH | /courses/:id/publish | owner, admin | publish / unpublish (needs one ready video) |
| DELETE | /courses/:id | owner, admin | delete (409 if students are enrolled) |
| POST | /courses/:courseId/lessons | owner, admin | add lesson |
| GET | /lessons/:id | enrolled / owner / free preview | lesson **with video URL** |
| PUT, DELETE | /lessons/:id | owner, admin | edit / delete lesson |
| POST | /lessons/:id/video | owner, admin | multipart `video`; queues FFmpeg job (202) |
| POST | /lessons/:id/complete | enrolled student | mark lesson done, updates progress |
| POST | /courses/:id/enroll | student | enroll in a **free** course (paid: 402) |
| GET | /enrollments/me | logged in | my courses with progress |
| GET | /courses/:courseId/quizzes | enrolled / owner | quizzes (answers hidden for students) |
| POST | /courses/:courseId/quizzes | owner, admin | create quiz |
| PUT, DELETE | /quizzes/:id | owner, admin | edit / delete quiz |
| POST | /quizzes/:id/attempt | enrolled student | `{ answers: [1,0,2] }` returns score, per-question result |
| POST | /payments/checkout | logged in | `{ courseId }` returns Stripe checkout `url` |
| POST | /payments/confirm | logged in | `{ sessionId }` verifies payment, enrolls |
| POST | /payments/webhook | Stripe | `checkout.session.completed` (signature checked) |
| GET | /payments/me | logged in | my purchases |
| GET | /instructor/earnings | instructor, admin | totals, byCourse, byMonth, recent |
| GET | /certificates/me | logged in | my certificates |
| GET | /certificates/:certificateId/pdf | owner, admin | certificate PDF |
| GET | /certificates/verify/:certificateId | public | check a certificate |
| GET, POST | /courses/:courseId/live | enrolled / owner (GET), owner (POST) | list / schedule live classes |
| POST | /live/:id/start, /live/:id/end | owner, admin | change class status |
| POST | /live/:id/token | enrolled / owner | LiveKit token + server URL |
| GET | /admin/stats, /admin/users, /admin/courses | admin | platform overview |
| PATCH | /admin/users/:id/role | admin | change a user's role |

## Example: quiz attempt
```http
POST /api/quizzes/66f.../attempt
{ "answers": [1, 0] }

200 { "score": 100, "correctCount": 2, "total": 2, "passed": true, "passMark": 50,
      "progress": 100, "courseCompleted": true,
      "results": [ { "questionId": "...", "chosen": 1, "correctIndex": 1, "correct": true }, ... ] }
```
