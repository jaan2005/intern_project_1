# Commit guide: build the history one module at a time

The finished project is in this folder. To get a clean history, commit it in the order below.
Each step lists the files to add and a suggested message. Before each commit, read the files you are adding
(and the explanation in the chat), so the commit is something you can explain.

## The one trick: `server/src/app.js`
`app.js` has one `app.use('/api', ...)` line per feature, each ending in a comment like `// module 4: quizzes`.
Before you start, **comment out every one of those lines except the auth line**. After each backend commit,
**uncomment the line(s) for that module** and include `app.js` in the commit. That way the app runs after every commit.

```bash
git init
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
```

## Backend

**1. Project setup**  `chore: project setup, Docker services and config`
```bash
git add .gitignore docker-compose.yml README.md server/package.json server/.env.example \
  server/src/config server/src/middleware/error.js server/src/utils.js server/src/server.js
```

**2. Auth and roles**  `feat(auth): registration, login, JWT and role guards`
```bash
git add server/src/models/User.js server/src/middleware/auth.js server/src/controllers/auth.controller.js \
  server/src/routes/auth.routes.js server/src/scripts server/src/app.js
```

**3. Data models and business logic**  `feat(models): course, lesson, quiz, enrollment, payment, certificate models and grading logic`
```bash
git add server/src/models server/src/services/grading.js server/test/unit.test.js
```
Run `npm run test:unit` first. (This commit will also contain the User model if you skipped it in step 2; that's fine.)

**4. Courses and lessons**  `feat(courses): course and lesson CRUD with publish rules`
Uncomment `module 2` lines in app.js.
```bash
git add server/src/controllers/course.controller.js server/src/controllers/lesson.controller.js \
  server/src/routes/course.routes.js server/src/routes/lesson.routes.js server/src/services/access.js \
  server/src/services/progress.js server/src/services/storage.js server/src/queues server/src/middleware/upload.js server/src/app.js
```
(`lesson.controller` imports storage, the queue and progress, so they come in this commit. The next one makes the queue do something.)

**5. Video processing worker**  `feat(video): FFmpeg HLS transcoding worker with BullMQ, S3 and CloudFront support`
```bash
git add server/src/services/ffmpeg.js server/src/workers docs/AWS_SETUP.md
# ffmpeg.js includes the fix that falls back to the FFmpeg installed on the computer
```

**6. Enrollment, quizzes and progress**  `feat(learning): enrollment, auto-graded quizzes and progress tracking`
Uncomment `module 4` lines.
```bash
git add server/src/controllers/enrollment.controller.js server/src/controllers/quiz.controller.js \
  server/src/routes/enrollment.routes.js server/src/routes/quiz.routes.js server/src/app.js
```

**7. Payments and earnings**  `feat(payments): checkout (Stripe or simulated gateway), webhook and instructor earnings`
Uncomment `module 5`.
```bash
git add server/src/controllers/payment.controller.js server/src/routes/payment.routes.js docs/INTEGRATIONS.md server/src/app.js
```

**8. Certificates**  `feat(certificates): PDF certificates and public verification`
Uncomment `module 6`.
```bash
git add server/src/services/certificatePdf.js server/src/controllers/certificate.controller.js \
  server/src/routes/certificate.routes.js server/src/app.js
```

**9. Live classes**  `feat(live): LiveKit live classes with token endpoint`
Uncomment `module 7`.
```bash
git add server/src/controllers/live.controller.js server/src/routes/live.routes.js server/src/app.js
```

**10. Admin and tests**  `feat(admin): admin dashboard API; test: route smoke tests and end-to-end flow`
Uncomment `module 8`.
```bash
git add server/src/controllers/admin.controller.js server/src/routes/admin.routes.js server/test server/src/app.js
# optional but useful: demo data and package scripts
git add server/src/scripts/seedDemo.js server/package.json
```

## Frontend

**11. Client setup**  `feat(client): Vite + React + Redux Toolkit setup, API layer and shared components`
```bash
git add client/package.json client/vite.config.js client/index.html client/.gitignore \
  client/src/main.jsx client/src/store.js client/src/authSlice.js client/src/api.js \
  client/src/styles.css client/src/components
```

**12. Learner pages**  `feat(client): catalogue, auth, course page, player with quizzes, my learning`
```bash
git add client/src/pages/Catalog.jsx client/src/pages/Auth.jsx client/src/pages/CourseDetail.jsx \
  client/src/pages/Learn.jsx client/src/pages/MyLearning.jsx client/src/pages/Misc.jsx
```

**13. Instructor, admin and live pages**  `feat(client): instructor studio, earnings, admin and live room`
```bash
git add client/src/pages/Teach.jsx client/src/pages/CourseEditor.jsx client/src/pages/Earnings.jsx \
  client/src/pages/Admin.jsx client/src/pages/LiveRoom.jsx
```

**14. Routing**  `feat(client): app routes and route guards`
```bash
git add client/src/App.jsx
```

**15. Docker and deployment**  `chore(docker): Dockerfiles and compose file to run the whole stack`
```bash
git add server/Dockerfile server/.dockerignore client/Dockerfile client/.dockerignore client/nginx.conf docker-compose.prod.yml docs/DEPLOYMENT.md
```

**16. UI tests**  `test(client): UI flow tests against a real API`
```bash
git add client/ui.flow.test.jsx client/vitest.ui.config.js client/scripts client/package.json client/package-lock.json
```

**17. Docs**  `docs: architecture diagrams, API reference, test results, presentation notes`
```bash
git add docs
git add server/package-lock.json
```
(Run `git status` at the end. Nothing should be left uncommitted except `.env`, which is ignored on purpose.)

Push after each commit (`git push -u origin main` the first time). Later fixes get their own small commits, e.g. `fix: ...`.
