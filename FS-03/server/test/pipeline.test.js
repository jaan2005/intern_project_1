// FULL video pipeline: upload through the real API -> BullMQ (Redis) -> a real worker process -> FFmpeg -> storage -> playback.
// Needs MongoDB + Redis running and FFmpeg available. Skipped automatically if Redis or FFmpeg is missing.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-pipe-'));
process.env.MONGO_URI = process.env.MONGO_URI_PIPELINE || 'mongodb://localhost:27017/lms_pipeline_test';
process.env.JWT_SECRET = 'test-secret';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = path.join(tmp, 'storage');
process.env.TMP_DIR = path.join(tmp, 'tmp');

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const IORedis = require('ioredis');

const ffmpegBin = process.env.FFMPEG_PATH || (() => { try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; } })();
const hasFfmpeg = spawnSync(ffmpegBin, ['-version']).status === 0;
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let worker;

async function redisUp() {
  const r = new IORedis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
  r.on('error', () => {});
  try { await r.connect(); await r.ping(); return true; } catch { return false; } finally { r.disconnect(); }
}

test('upload -> queue -> worker -> HLS files -> playback', async (t) => {
  if (!hasFfmpeg) return t.skip('FFmpeg not available');
  if (!(await redisUp())) return t.skip('Redis not running');

  const app = require('../src/app');
  const { closeQueue } = require('../src/queues/videoQueue');
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.dropDatabase();
  worker = spawn(process.execPath, [path.join(__dirname, '../src/workers/videoWorker.js')], { env: process.env, stdio: 'ignore' });

  t.after(async () => {
    worker.kill();
    await closeQueue();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const sample = path.join(tmp, 'sample.mp4');
  const made = spawnSync(ffmpegBin, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '6', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', sample]);
  assert.equal(made.status, 0, 'could not create the sample video');

  const api = request(app);
  const auth = (tk) => ({ Authorization: `Bearer ${tk}` });
  const teacher = (await api.post('/api/auth/register').send({ name: 'Pipe Teacher', email: 'pt@test.com', password: 'password123', role: 'instructor' })).body.token;
  const student = (await api.post('/api/auth/register').send({ name: 'Pipe Student', email: 'ps@test.com', password: 'password123' })).body.token;
  const courseId = (await api.post('/api/courses').set(auth(teacher)).send({ title: 'Pipeline course' })).body.course.id;
  const lessonId = (await api.post(`/api/courses/${courseId}/lessons`).set(auth(teacher)).send({ title: 'Video lesson' })).body.lesson.id;

  const up = await api.post(`/api/lessons/${lessonId}/video`).set(auth(teacher)).attach('video', sample);
  assert.equal(up.status, 202, JSON.stringify(up.body));
  assert.equal(up.body.lesson.video.status, 'queued');

  // wait for the worker to finish (poll the same endpoint the React editor polls)
  let lesson;
  for (let i = 0; i < 60; i++) {
    lesson = (await api.get(`/api/courses/${courseId}`).set(auth(teacher))).body.lessons[0];
    if (['ready', 'failed'].includes(lesson.video.status)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(lesson.video.status, 'ready', `worker did not finish: ${JSON.stringify(lesson.video)}`);
  assert.ok(lesson.video.duration >= 5);

  assert.equal((await api.patch(`/api/courses/${courseId}/publish`).set(auth(teacher)).send({ published: true })).status, 200);
  assert.equal((await api.post(`/api/courses/${courseId}/enroll`).set(auth(student))).status, 201);

  const watch = await api.get(`/api/lessons/${lessonId}`).set(auth(student));
  assert.equal(watch.status, 200);
  const url = new URL(watch.body.lesson.video.url);

  const master = await api.get(url.pathname);
  assert.equal(master.status, 200);
  assert.match(master.text, /^#EXTM3U/);
  assert.match(master.text, /v0\/index\.m3u8/);
  assert.match(master.text, /v1\/index\.m3u8/);
  const variant = await api.get(url.pathname.replace('master.m3u8', 'v0/index.m3u8'));
  assert.equal(variant.status, 200);
  const seg = await api.get(url.pathname.replace('master.m3u8', 'v0/seg_000.ts'));
  assert.equal(seg.status, 200);

  // the uploaded original is deleted from the temp folder after processing
  const leftovers = fs.readdirSync(path.join(process.env.TMP_DIR, 'uploads'));
  assert.equal(leftovers.length, 0, 'uploaded source file should be cleaned up');
});
