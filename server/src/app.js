const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// cross-origin resource policy relaxed so the React app (another origin) can load videos from /media
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientUrl }));

// Stripe's webhook signature is computed over the exact raw bytes, so we keep a copy of them for that one URL.
app.use(express.json({ verify: (req, res, buf) => { if (req.originalUrl === '/api/payments/webhook') req.rawBody = buf; } }));

// Local video files (only used when STORAGE_DRIVER=local; with S3 the videos come from CloudFront)
if (env.storage.driver === 'local') app.use('/media', express.static(env.storage.dir, { maxAge: '1h' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', storage: env.storage.driver }));

// ---- One line per feature module. Each router defines its own full paths (e.g. /courses/:id/lessons). ----
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false }), require('./routes/auth.routes')); // module 1: auth
app.use('/api', require('./routes/course.routes')); // module 2: courses
app.use('/api', require('./routes/lesson.routes')); // module 2: lessons + module 3: video upload
app.use('/api', require('./routes/enrollment.routes')); // module 4: enrollment
app.use('/api', require('./routes/quiz.routes')); // module 4: quizzes

app.use(notFound);
app.use(errorHandler);

module.exports = app;
