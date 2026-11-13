const { port } = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');

(async () => {
  await connectDB();
  app.listen(port, () => console.log(`API running on http://localhost:${port}`));
})().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
