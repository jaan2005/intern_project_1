require('dotenv').config();

// Fail fast: if a required variable is missing, stop at startup instead of crashing later.
for (const key of ['MONGO_URI', 'JWT_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing env variable: ${key}`);
}
const e = process.env;

module.exports = {
  port: e.PORT || 5000,
  mongoUri: e.MONGO_URI,
  jwtSecret: e.JWT_SECRET,
  jwtExpiresIn: e.JWT_EXPIRES_IN || '1d',
  clientUrl: e.CLIENT_URL || 'http://localhost:5173',
  publicApiUrl: (e.PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, ''),
  redisUrl: e.REDIS_URL || 'redis://localhost:6379',
  storage: {
    driver: e.STORAGE_DRIVER || 'local',
    dir: e.STORAGE_DIR || require('path').join(__dirname, '../../storage'),
    tmpDir: e.TMP_DIR || require('path').join(__dirname, '../../tmp'),
    maxVideoMb: Number(e.MAX_VIDEO_MB || 500),
  },
  aws: {
    region: e.AWS_REGION || 'ap-south-1',
    bucket: e.S3_BUCKET,
    cdnUrl: (e.CLOUDFRONT_URL || '').replace(/\/$/, ''),
  },
  stripe: {
    secretKey: e.STRIPE_SECRET_KEY,
    webhookSecret: e.STRIPE_WEBHOOK_SECRET,
    platformFeePercent: Number(e.PLATFORM_FEE_PERCENT || 20),
    // 'stripe' | 'mock'. Default: Stripe if a key is set, otherwise the built-in simulated gateway.
    provider: e.PAYMENT_PROVIDER || (e.STRIPE_SECRET_KEY ? 'stripe' : 'mock'),
  },
  livekit: { url: e.LIVEKIT_URL, apiKey: e.LIVEKIT_API_KEY, apiSecret: e.LIVEKIT_API_SECRET },
};
