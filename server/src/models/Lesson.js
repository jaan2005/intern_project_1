const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
    isPreview: { type: Boolean, default: false }, // free preview: watchable without enrolling
    video: {
      // none -> queued -> processing -> ready (or failed)
      status: { type: String, enum: ['none', 'queued', 'processing', 'ready', 'failed'], default: 'none' },
      prefix: String, // storage folder holding the HLS files
      playlistKey: String, // path of master.m3u8 inside storage
      duration: { type: Number, default: 0 }, // seconds
      originalName: String,
      error: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lesson', lessonSchema);
