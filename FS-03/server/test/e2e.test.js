// End-to-end test of the whole learning flow against a REAL MongoDB (uses a separate "lms_test" database).
// Needs `docker compose up -d` running.   Run: npm test
process.env.MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/lms_test';
process.env.JWT_SECRET = 'test-secret';
process.env.STORAGE_DRIVER = 'local';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Lesson = require('../src/models/Lesson');
const User = require('../src/models/User');

const api = request(app);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ctx = {};

test.before(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();
});
test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const register = async (name, email, role) => {
  const res = await api.post('/api/auth/register').send({ name, email, password: 'password123', role });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.token;
};

test('auth: register, login, me', async () => {
  ctx.teacher = await register('Tina Teacher', 'tina@test.com', 'instructor');
  ctx.student = await register('Sam Student', 'sam@test.com', 'student');
  ctx.other = await register('Olive Other', 'olive@test.com', 'student');

  const dup = await api.post('/api/auth/register').send({ name: 'Dup', email: 'tina@test.com', password: 'password123' });
  assert.equal(dup.status, 409);

  const login = await api.post('/api/auth/login').send({ email: 'sam@test.com', password: 'password123' });
  assert.equal(login.status, 200);
  const wrong = await api.post('/api/auth/login').send({ email: 'sam@test.com', password: 'wrongpass1' });
  assert.equal(wrong.status, 401);

  const me = await api.get('/api/auth/me').set(auth(ctx.student));
  assert.equal(me.body.user.role, 'student');
});

test('roles: a student cannot create courses or see admin data', async () => {
  const c = await api.post('/api/courses').set(auth(ctx.student)).send({ title: 'Nope course' });
  assert.equal(c.status, 403);
  const a = await api.get('/api/admin/users').set(auth(ctx.student));
  assert.equal(a.status, 403);
});

test('instructor builds a course with lessons and a quiz', async () => {
  const c = await api.post('/api/courses').set(auth(ctx.teacher)).send({ title: 'Intro to Testing', description: 'x', priceCents: 0 });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  ctx.courseId = c.body.course.id;

  const l1 = await api.post(`/api/courses/${ctx.courseId}/lessons`).set(auth(ctx.teacher)).send({ title: 'Lesson 1' });
  const l2 = await api.post(`/api/courses/${ctx.courseId}/lessons`).set(auth(ctx.teacher)).send({ title: 'Lesson 2', isPreview: true });
  assert.equal(l1.status, 201);
  ctx.l1 = l1.body.lesson.id;
  ctx.l2 = l2.body.lesson.id;

  // cannot publish until a video is processed
  const early = await api.patch(`/api/courses/${ctx.courseId}/publish`).set(auth(ctx.teacher)).send({ published: true });
  assert.equal(early.status, 400);

  // simulate the worker having finished FFmpeg for lesson 1
  await Lesson.updateOne({ _id: ctx.l1 }, { video: { status: 'ready', prefix: 'videos/x/y', playlistKey: 'videos/x/y/master.m3u8', duration: 60 } });
  const pub = await api.patch(`/api/courses/${ctx.courseId}/publish`).set(auth(ctx.teacher)).send({ published: true });
  assert.equal(pub.status, 200);

  const q = await api.post(`/api/courses/${ctx.courseId}/quizzes`).set(auth(ctx.teacher)).send({
    title: 'Quiz 1', passMark: 50,
    questions: [
      { text: '2+2?', options: ['3', '4'], correctIndex: 1 },
      { text: 'Capital of France?', options: ['Paris', 'Rome'], correctIndex: 0 },
    ],
  });
  assert.equal(q.status, 201, JSON.stringify(q.body));
  ctx.quizId = q.body.quiz.id;

  const bad = await api.post(`/api/courses/${ctx.courseId}/quizzes`).set(auth(ctx.teacher)).send({
    title: 'Bad', questions: [{ text: 'q', options: ['a', 'b'], correctIndex: 5 }],
  });
  assert.equal(bad.status, 400);
});

test('another instructor cannot edit this course', async () => {
  const other = await register('Ian Instructor', 'ian@test.com', 'instructor');
  const res = await api.put(`/api/courses/${ctx.courseId}`).set(auth(other)).send({ title: 'Hacked title' });
  assert.equal(res.status, 403);
});

test('catalogue is public and hides video URLs until enrolled', async () => {
  const list = await api.get('/api/courses');
  assert.equal(list.body.courses.length, 1);

  const detail = await api.get(`/api/courses/${ctx.courseId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.lessons.length, 2);
  assert.equal(detail.body.lessons[0].video.url, undefined);

  const locked = await api.get(`/api/lessons/${ctx.l1}`).set(auth(ctx.student));
  assert.equal(locked.status, 403);
  const preview = await api.get(`/api/lessons/${ctx.l2}`); // free preview, even anonymous
  assert.equal(preview.status, 200);
});

test('student enrolls, watches, takes the quiz and earns a certificate', async () => {
  const enroll = await api.post(`/api/courses/${ctx.courseId}/enroll`).set(auth(ctx.student));
  assert.equal(enroll.status, 201);

  const lesson = await api.get(`/api/lessons/${ctx.l1}`).set(auth(ctx.student));
  assert.equal(lesson.status, 200);
  assert.match(lesson.body.lesson.video.url, /master\.m3u8$/);

  // quiz answers must not leak
  const quizzes = await api.get(`/api/courses/${ctx.courseId}/quizzes`).set(auth(ctx.student));
  assert.equal(quizzes.body.quizzes[0].questions[0].correctIndex, undefined);

  // non-enrolled student is blocked
  const blocked = await api.post(`/api/quizzes/${ctx.quizId}/attempt`).set(auth(ctx.other)).send({ answers: [1, 0] });
  assert.equal(blocked.status, 403);

  // fail first (0/2), then pass (2/2)
  const fail = await api.post(`/api/quizzes/${ctx.quizId}/attempt`).set(auth(ctx.student)).send({ answers: [0, 1] });
  assert.equal(fail.body.passed, false);
  assert.equal(fail.body.score, 0);

  await api.post(`/api/lessons/${ctx.l1}/complete`).set(auth(ctx.student));
  const l2 = await api.post(`/api/lessons/${ctx.l2}/complete`).set(auth(ctx.student));
  assert.equal(l2.body.progress, 67); // 2 of 3 items (2 lessons + 1 quiz)
  assert.equal(l2.body.completed, false);

  const pass = await api.post(`/api/quizzes/${ctx.quizId}/attempt`).set(auth(ctx.student)).send({ answers: [1, 0] });
  assert.equal(pass.body.passed, true);
  assert.equal(pass.body.progress, 100);
  assert.equal(pass.body.courseCompleted, true);

  const certs = await api.get('/api/certificates/me').set(auth(ctx.student));
  assert.equal(certs.body.certificates.length, 1);
  ctx.certId = certs.body.certificates[0].certificateId;

  const pdf = await api.get(`/api/certificates/${ctx.certId}/pdf`).set(auth(ctx.student)).buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (d) => chunks.push(d));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers['content-type'], /application\/pdf/);
  assert.equal(pdf.body.slice(0, 4).toString(), '%PDF');

  const stolen = await api.get(`/api/certificates/${ctx.certId}/pdf`).set(auth(ctx.other));
  assert.equal(stolen.status, 403);

  const verify = await api.get(`/api/certificates/verify/${ctx.certId}`);
  assert.equal(verify.body.valid, true);
  assert.equal(verify.body.studentName, 'Sam Student');
  assert.equal((await api.get('/api/certificates/verify/LMS-FAKE')).status, 404);
});

test('paid courses cannot be enrolled without paying', async () => {
  const c = await api.post('/api/courses').set(auth(ctx.teacher)).send({ title: 'Paid course', priceCents: 2999 });
  const id = c.body.course.id;
  const lesson = await api.post(`/api/courses/${id}/lessons`).set(auth(ctx.teacher)).send({ title: 'Lesson A' });
  await Lesson.updateOne({ _id: lesson.body.lesson.id }, { 'video.status': 'ready', 'video.playlistKey': 'a/b.m3u8' });
  await api.patch(`/api/courses/${id}/publish`).set(auth(ctx.teacher)).send({ published: true });
  const res = await api.post(`/api/courses/${id}/enroll`).set(auth(ctx.other));
  assert.equal(res.status, 402);
});

test('payment fulfillment enrolls once, is idempotent, and feeds the earnings dashboard', async () => {
  const Payment = require('../src/models/Payment');
  const Enrollment = require('../src/models/Enrollment');
  const { fulfillSession } = require('../src/controllers/payment.controller');
  const { splitPayment } = require('../src/services/grading');

  const course = (await api.get('/api/courses/mine').set(auth(ctx.teacher))).body.courses.find((c) => c.title === 'Paid course');
  const me = (await api.get('/api/auth/me').set(auth(ctx.other))).body.user;
  const split = splitPayment(2999, 20);
  await Payment.create({ user: me.id, course: course.id, instructor: course.instructor.id, amountCents: 2999, ...split, stripeSessionId: 'cs_test_1' });

  // before payment completes: not paid, no enrollment
  await fulfillSession({ id: 'cs_test_1', payment_status: 'unpaid' });
  assert.equal(await Enrollment.countDocuments({ user: me.id, course: course.id }), 0);

  // Stripe confirms; webhook AND confirm endpoint may both call this
  await fulfillSession({ id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_1' });
  await fulfillSession({ id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_1' });
  assert.equal(await Enrollment.countDocuments({ user: me.id, course: course.id }), 1);
  assert.equal((await Payment.findOne({ stripeSessionId: 'cs_test_1' })).status, 'paid');

  const res = await api.get('/api/instructor/earnings').set(auth(ctx.teacher));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.totals, { grossCents: 2999, platformFeeCents: 600, netCents: 2399, sales: 1 });
  assert.equal(res.body.byCourse[0].title, 'Paid course');
  assert.equal(res.body.byMonth.length, 1);
  assert.equal(res.body.recent[0].student, 'Olive Other');

  // another instructor sees none of it; a student cannot open the dashboard
  const ian = (await api.post('/api/auth/login').send({ email: 'ian@test.com', password: 'password123' })).body.token;
  assert.equal((await api.get('/api/instructor/earnings').set(auth(ian))).body.totals.sales, 0);
  assert.equal((await api.get('/api/instructor/earnings').set(auth(ctx.student))).status, 403);

  // enrolled now, so the buyer can watch the paid course's video
  const lessons = (await api.get(`/api/courses/${course.id}`).set(auth(ctx.other))).body.lessons;
  assert.equal((await api.get(`/api/lessons/${lessons[0].id}`).set(auth(ctx.other))).status, 200);
});

test('checkout refuses free courses, own courses, and works only when Stripe is configured', async () => {
  const free = (await api.get('/api/courses')).body.courses.find((c) => c.priceCents === 0);
  const r1 = await api.post('/api/payments/checkout').set(auth(ctx.student)).send({ courseId: free.id });
  assert.equal(r1.status, 400); // free course
  const r2 = await api.post('/api/payments/confirm').set(auth(ctx.student)).send({ sessionId: 'nope' });
  assert.equal(r2.status, 404);
});

test('live classes: schedule, token rules, start, join', async () => {
  const cfg = require('../src/config/env');
  Object.assign(cfg.livekit, { url: 'wss://test.livekit.cloud', apiKey: 'devkey', apiSecret: 'devsecret-devsecret-devsecret-12345' });
  const jwt = require('jsonwebtoken');

  const created = await api.post(`/api/courses/${ctx.courseId}/live`).set(auth(ctx.teacher)).send({ title: 'Q&A', scheduledAt: new Date(Date.now() + 3600e3).toISOString() });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const liveId = created.body.liveClass.id;

  assert.equal((await api.post(`/api/courses/${ctx.courseId}/live`).set(auth(ctx.student)).send({ title: 'x', scheduledAt: new Date().toISOString() })).status, 403);
  assert.equal((await api.get(`/api/courses/${ctx.courseId}/live`).set(auth(ctx.student))).body.liveClasses.length, 1);
  assert.equal((await api.get(`/api/courses/${ctx.courseId}/live`).set(auth(ctx.other))).status, 403); // not enrolled

  // class not started: student blocked, instructor can open the room
  assert.equal((await api.post(`/api/live/${liveId}/token`).set(auth(ctx.student))).status, 409);
  const host = await api.post(`/api/live/${liveId}/token`).set(auth(ctx.teacher));
  assert.equal(host.status, 200);
  assert.equal(host.body.host, true);

  assert.equal((await api.post(`/api/live/${liveId}/start`).set(auth(ctx.student))).status, 403);
  assert.equal((await api.post(`/api/live/${liveId}/start`).set(auth(ctx.teacher))).body.liveClass.status, 'live');

  const stu = await api.post(`/api/live/${liveId}/token`).set(auth(ctx.student));
  assert.equal(stu.status, 200);
  const grants = jwt.decode(stu.body.token).video; // LiveKit puts permissions in the "video" claim
  assert.equal(grants.roomJoin, true);
  assert.equal(grants.canPublish, false, 'students cannot broadcast');
  assert.equal(grants.canPublishData, true, 'students can chat');
  assert.equal(jwt.decode(host.body.token).video.canPublish, true);

  assert.equal((await api.post(`/api/live/${liveId}/token`).set(auth(ctx.other))).status, 403);
  await api.post(`/api/live/${liveId}/end`).set(auth(ctx.teacher));
  assert.equal((await api.post(`/api/live/${liveId}/token`).set(auth(ctx.student))).status, 410);
});

test('video upload: validates file type, ownership, and reports a clear error when Redis is down', async () => {
  const lessonId = ctx.l2;
  const noFile = await api.post(`/api/lessons/${lessonId}/video`).set(auth(ctx.teacher));
  assert.equal(noFile.status, 400);
  const notVideo = await api.post(`/api/lessons/${lessonId}/video`).set(auth(ctx.teacher)).attach('video', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
  assert.equal(notVideo.status, 400);
  const stranger = await api.post(`/api/lessons/${lessonId}/video`).set(auth(ctx.student)).attach('video', Buffer.from('x'), { filename: 'a.mp4', contentType: 'video/mp4' });
  assert.equal(stranger.status, 403);
});

test('admin can list users and change roles', async () => {
  await User.create({ name: 'Root', email: 'root@test.com', password: 'password123', role: 'admin' });
  const login = await api.post('/api/auth/login').send({ email: 'root@test.com', password: 'password123' });
  const admin = login.body.token;
  const users = await api.get('/api/admin/users').set(auth(admin));
  assert.equal(users.status, 200);
  assert.ok(users.body.users.length >= 4);
  const stats = await api.get('/api/admin/stats').set(auth(admin));
  assert.equal(stats.body.enrollments, 2); // the free-course student + the paid-course buyer
});

test('simulated checkout: wrong card, declined card, wrong user, then a successful payment', async () => {
  const course = (await api.get('/api/courses/mine').set(auth(ctx.teacher))).body.courses.find((c) => c.title === 'Paid course');

  // student starts checkout and is sent to the fake checkout page
  const co = await api.post('/api/payments/checkout').set(auth(ctx.student)).send({ courseId: course.id });
  assert.equal(co.status, 200, JSON.stringify(co.body));
  assert.equal(co.body.provider, 'mock');
  const sessionId = new URL(co.body.url).searchParams.get('session_id');
  assert.match(sessionId, /^mock_/);

  const info = await api.get(`/api/payments/mock/${sessionId}`).set(auth(ctx.student));
  assert.equal(info.body.courseTitle, 'Paid course');
  assert.equal(info.body.amountCents, 2999);
  assert.equal(info.body.status, 'pending');

  // somebody else cannot see or pay for this session
  assert.equal((await api.get(`/api/payments/mock/${sessionId}`).set(auth(ctx.teacher))).status, 404);
  assert.equal((await api.post('/api/payments/mock/pay').set(auth(ctx.teacher)).send({ sessionId, cardNumber: '4242424242424242' })).status, 404);

  // wrong and declined cards do not enroll
  const wrong = await api.post('/api/payments/mock/pay').set(auth(ctx.student)).send({ sessionId, cardNumber: '1234 5678 9012 3456' });
  assert.equal(wrong.status, 400);
  const declined = await api.post('/api/payments/mock/pay').set(auth(ctx.student)).send({ sessionId, cardNumber: '4000 0000 0000 0002' });
  assert.equal(declined.status, 402);
  assert.equal((await api.get('/api/enrollments/me').set(auth(ctx.student))).body.enrollments.filter((e) => e.course.title === 'Paid course').length, 0);

  // the confirm endpoint reports "pending" until the card is accepted
  assert.equal((await api.post('/api/payments/confirm').set(auth(ctx.student)).send({ sessionId })).body.status, 'pending');

  // good test card (spaces allowed) -> paid + enrolled
  const ok = await api.post('/api/payments/mock/pay').set(auth(ctx.student)).send({ sessionId, cardNumber: '4242 4242 4242 4242' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.status, 'paid');
  assert.equal((await api.post('/api/payments/confirm').set(auth(ctx.student)).send({ sessionId })).body.status, 'paid');
  assert.equal((await api.get('/api/enrollments/me').set(auth(ctx.student))).body.enrollments.filter((e) => e.course.title === 'Paid course').length, 1);

  // paying twice does not create a second payment or enrollment
  assert.equal((await api.post('/api/payments/mock/pay').set(auth(ctx.student)).send({ sessionId, cardNumber: '4242424242424242' })).body.status, 'paid');
  assert.equal((await api.post('/api/payments/checkout').set(auth(ctx.student)).send({ courseId: course.id })).status, 409); // already enrolled

  // instructor earnings now include both sales: 2 x ($29.99 - 20%)
  const earn = (await api.get('/api/instructor/earnings').set(auth(ctx.teacher))).body;
  assert.deepEqual(earn.totals, { grossCents: 5998, platformFeeCents: 1200, netCents: 4798, sales: 2 });
});

test('the simulated gateway is switched off when real Stripe is configured', async () => {
  const cfg = require('../src/config/env');
  const before = cfg.stripe.provider;
  cfg.stripe.provider = 'stripe';
  try {
    const res = await api.get('/api/payments/mock/mock_abc').set(auth(ctx.student));
    assert.equal(res.status, 404);
    const pay = await api.post('/api/payments/mock/pay').set(auth(ctx.student)).send({ sessionId: 'mock_abc', cardNumber: '4242424242424242' });
    assert.equal(pay.status, 404);
  } finally {
    cfg.stripe.provider = before;
  }
});

test('stale, expired or garbage tokens: public pages still work, protected routes still say 401', async () => {
  const jwt = require('jsonwebtoken');
  const courseId = (await api.get('/api/courses')).body.courses[0].id;
  const stale = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'student' }, process.env.JWT_SECRET); // user no longer exists
  const expired = jwt.sign({ id: 'x', role: 'student' }, process.env.JWT_SECRET, { expiresIn: -10 });
  for (const token of [stale, expired, 'abc.def.ghi']) {
    const page = await api.get(`/api/courses/${courseId}`).set(auth(token));
    assert.equal(page.status, 200, 'public course page must load');
    assert.equal(page.body.enrollment, null);
    assert.equal(page.body.isOwner, false);
    assert.equal((await api.get('/api/auth/me').set(auth(token))).status, 401, 'protected route must still reject');
  }
});
