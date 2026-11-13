const mongoose = require('mongoose');

const liveClassSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    scheduledAt: { type: Date, required: true },
    roomName: { type: String, required: true, unique: true }, // LiveKit room
    status: { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LiveClass', liveClassSchema);
