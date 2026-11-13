// Checks every route is wired up and protected correctly. Needs NO database:
// protected routes must answer 401 before touching MongoDB, and bad input must answer 400.
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/lms_smoke';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');

test('health check', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('unknown route returns JSON 404', async () => {
  const res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
  assert.ok(res.body.message);
});

test('register validates input before touching the database', async () => {
  const bad = await request(app).post('/api/auth/register').send({ name: 'A', email: 'not-an-email', password: '123' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors.length >= 2);
  const admin = await request(app).post('/api/auth/register').send({ name: 'Eve', email: 'eve@x.com', password: 'password123', role: 'admin' });
  assert.equal(admin.status, 400, 'nobody can self-register as admin');
});

const protectedRoutes = [
  ['get', '/api/auth/me'],
  ['get', '/api/courses/mine'],
  ['post', '/api/courses'],
  ['put', '/api/courses/abc'],
  ['patch', '/api/courses/abc/publish'],
  ['delete', '/api/courses/abc'],
  ['post', '/api/courses/abc/lessons'],
  ['post', '/api/courses/abc/enroll'],
  ['get', '/api/courses/abc/quizzes'],
  ['post', '/api/courses/abc/quizzes'],
  ['get', '/api/courses/abc/live'],
  ['post', '/api/courses/abc/live'],
  ['put', '/api/lessons/abc'],
  ['delete', '/api/lessons/abc'],
  ['post', '/api/lessons/abc/video'],
  ['post', '/api/lessons/abc/complete'],
  ['put', '/api/quizzes/abc'],
  ['delete', '/api/quizzes/abc'],
  ['post', '/api/quizzes/abc/attempt'],
  ['post', '/api/payments/checkout'],
  ['post', '/api/payments/confirm'],
  ['get', '/api/payments/me'],
  ['get', '/api/payments/mock/mock_x'],
  ['post', '/api/payments/mock/pay'],
  ['get', '/api/enrollments/me'],
  ['get', '/api/certificates/me'],
  ['get', '/api/certificates/LMS-X/pdf'],
  ['post', '/api/live/abc/start'],
  ['post', '/api/live/abc/end'],
  ['post', '/api/live/abc/token'],
  ['get', '/api/instructor/earnings'],
  ['get', '/api/admin/stats'],
  ['get', '/api/admin/users'],
  ['patch', '/api/admin/users/abc/role'],
  ['get', '/api/admin/courses'],
];

for (const [method, url] of protectedRoutes) {
  test(`${method.toUpperCase()} ${url} requires login`, async () => {
    const res = await request(app)[method](url).send({});
    assert.equal(res.status, 401, `expected 401 got ${res.status}`);
  });
}

test('a forged token is rejected', async () => {
  const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.real.token');
  assert.equal(res.status, 401);
});

test('webhook rejects calls with no Stripe signature', async () => {
  const res = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').send('{}');
  assert.ok([400, 503].includes(res.status));
});
