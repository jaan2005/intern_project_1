const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { storage, } = require('../config/env');
const { AppError } = require('./error');

const dir = path.join(storage.tmpDir, 'uploads');
fs.mkdirSync(dir, { recursive: true });

// Uploaded videos are written to disk first (not kept in memory - videos are big),
// then the FFmpeg worker picks them up from there.
module.exports = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: storage.maxVideoMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => (file.mimetype.startsWith('video/') ? cb(null, true) : cb(new AppError('Only video files are allowed', 400))),
});
