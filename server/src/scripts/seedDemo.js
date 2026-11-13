// npm run seed:demo  -> fills the database with demo users, courses, quizzes and REAL processed videos,
// so you can try the app (or record your demo) without uploading anything first.
// It makes small sample videos with FFmpeg and runs them through the same HLS conversion the worker uses.
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Quiz = require('../models/Quiz');
const storage = require('../services/storage');
const { convertToHls, binary } = require('../services/ffmpeg');

const PASSWORD = 'Demo@12345';

async function makeVideo(dir, name, seconds, pattern) {
  const file = path.join(dir, `${name}.mp4`);
  const r = spawnSync(binary(), ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `${pattern}=size=1280x720:rate=24`, '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', String(seconds), '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', file]);
  if (r.status !== 0) throw new Error(`FFmpeg could not create a sample video: ${r.stderr}`);
  return file;
}

async function addLesson(course, order, title, description, videoFile, work, opts = {}) {
  const lesson = await Lesson.create({ course: course._id, title, description, order, isPreview: !!opts.isPreview });
  const out = path.join(work, `hls-${lesson._id}`);
  const { duration } = await convertToHls(videoFile, out);
  const prefix = `videos/${lesson._id}/${crypto.randomBytes(6).toString('hex')}`;
  await storage.putDir(out, prefix);
  lesson.video = { status: 'ready', prefix, playlistKey: `${prefix}/master.m3u8`, duration, originalName: path.basename(videoFile) };
  await lesson.save();
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  if (await User.findOne({ email: 'teacher@lms.test' })) {
    console.log('Demo data already exists (teacher@lms.test). Nothing to do.');
    return mongoose.disconnect();
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-seed-'));

  const teacher = await User.create({ name: 'Priya Instructor', email: 'teacher@lms.test', password: PASSWORD, role: 'instructor' });
  await User.create({ name: 'Sam Student', email: 'student@lms.test', password: PASSWORD, role: 'student' });

  console.log('Creating the free course and processing its videos...');
  const free = await Course.create({ title: 'Web Basics in an Afternoon', description: 'HTML, CSS and JavaScript fundamentals, taught with small hands-on examples.\n\nBy the end you will have built and published a tiny website.', category: 'Web Development', level: 'beginner', priceCents: 0, instructor: teacher._id, published: true });
  await addLesson(free, 0, 'How the web works', 'Browsers, servers and what happens when you type a URL.', await makeVideo(work, 'a', 8, 'testsrc'), work, { isPreview: true });
  await addLesson(free, 1, 'Your first HTML page', 'Headings, paragraphs, links and images.', await makeVideo(work, 'b', 8, 'smptebars'), work);
  await Quiz.create({
    course: free._id, title: 'Web basics check', passMark: 60,
    questions: [
      { text: 'Which language describes the structure of a web page?', options: ['HTML', 'CSS', 'SQL', 'Python'], correctIndex: 0 },
      { text: 'What does a browser send to a server to get a page?', options: ['A request', 'A virus', 'A certificate', 'A cookie only'], correctIndex: 0 },
      { text: 'Which tag creates a link?', options: ['<img>', '<a>', '<p>', '<h1>'], correctIndex: 1 },
    ],
  });

  console.log('Creating the paid course...');
  const paid = await Course.create({ title: 'Build a REST API with Node', description: 'Design, build and test a REST API with Express and MongoDB.', category: 'Backend', level: 'intermediate', priceCents: 1999, instructor: teacher._id, published: true });
  await addLesson(paid, 0, 'Project setup', 'Folders, dependencies and environment variables.', await makeVideo(work, 'c', 8, 'testsrc2'), work, { isPreview: true });
  await addLesson(paid, 1, 'Routes and controllers', 'Structuring an Express app so it stays readable.', await makeVideo(work, 'd', 8, 'testsrc'), work);

  fs.rmSync(work, { recursive: true, force: true });
  console.log('\nDone. Log in with (password for both: ' + PASSWORD + '):');
  console.log('  instructor: teacher@lms.test');
  console.log('  student:    student@lms.test');
  await mongoose.disconnect();
})().catch((e) => { console.error('Seeding failed:', e.message); process.exit(1); });
