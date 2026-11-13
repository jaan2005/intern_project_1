const { Queue } = require('bullmq');
const { makeConnection } = require('./connection');

const QUEUE_NAME = 'video-processing';
let queue;
const getQueue = () => (queue ||= new Queue(QUEUE_NAME, { connection: makeConnection() })); // created lazily so the API can start without Redis

// If Redis is down BullMQ would wait forever, so we give up after a few seconds with a clear error.
async function enqueueTranscode(data) {
  const add = getQueue().add('transcode', data, {
    attempts: 2, // retry once if FFmpeg fails
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Video queue unavailable. Is Redis running?')), 5000));
  return Promise.race([add, timeout]);
}

module.exports = { QUEUE_NAME, enqueueTranscode, getQueue };

// Close the queue's Redis connection (used by tests and graceful shutdown)
async function closeQueue() {
  if (!queue) return;
  const connection = queue.opts.connection;
  await queue.close();
  connection?.disconnect?.();
  queue = undefined;
}
module.exports.closeQueue = closeQueue;
