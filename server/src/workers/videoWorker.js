// Run as a SEPARATE process:  npm run worker
// It takes jobs from the BullMQ queue (Redis), runs FFmpeg, uploads the result, and updates the lesson.
// Keeping it separate means heavy video processing never slows down the API.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const env = require('../config/env');
const Lesson = require('../models/Lesson');
const storage = require('../services/storage');
const { convertToHls } = require('../services/ffmpeg');
const { makeConnection } = require('../queues/connection');
const { QUEUE_NAME } = require('../queues/videoQueue');

const rm = (p) => fs.rmSync(p, { recursive: true, force: true });

async function processor(job) {
  const { lessonId, inputPath, originalName, oldPrefix } = job.data;
  if (!fs.existsSync(inputPath)) throw new Error('Uploaded file is missing from disk');

  await Lesson.findByIdAndUpdate(lessonId, { 'video.status': 'processing', 'video.error': null });
  const workDir = path.join(env.storage.tmpDir, 'hls', `${lessonId}-${job.id}`);
  rm(workDir);

  try {
    const { duration } = await convertToHls(inputPath, workDir);
    await job.updateProgress(70);

    // random folder name -> the playlist URL cannot be guessed from the lesson id
    const prefix = `videos/${lessonId}/${crypto.randomBytes(6).toString('hex')}`;
    await storage.putDir(workDir, prefix);

    await Lesson.findByIdAndUpdate(lessonId, {
      video: { status: 'ready', prefix, playlistKey: `${prefix}/master.m3u8`, duration, originalName, error: null },
    });
    if (oldPrefix) await storage.removePrefix(oldPrefix).catch(() => {}); // replaced video: delete the old files
    await job.updateProgress(100);
  } finally {
    rm(workDir);
  }
}

(async () => {
  await mongoose.connect(env.mongoUri);
  console.log('Worker: MongoDB connected');

  const worker = new Worker(QUEUE_NAME, processor, { connection: makeConnection(), concurrency: 1 });

  worker.on('completed', (job) => {
    rm(job.data.inputPath);
    console.log(`Job ${job.id} done (lesson ${job.data.lessonId})`);
  });
  worker.on('failed', async (job, err) => {
    console.error(`Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      // out of retries: mark the lesson failed so the instructor sees it, and delete the upload
      await Lesson.findByIdAndUpdate(job.data.lessonId, { 'video.status': 'failed', 'video.error': err.message.slice(0, 300) });
      rm(job.data.inputPath);
    }
  });
  worker.on('error', (err) => console.error('Worker error:', err.message));
  console.log('Worker: waiting for video jobs...');
})().catch((e) => {
  console.error('Worker failed to start:', e.message);
  process.exit(1);
});
