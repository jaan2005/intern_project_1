const crypto = require('crypto');
const { z } = require('zod');
const Course = require('../models/Course');
const LiveClass = require('../models/LiveClass');
const { livekit: cfg } = require('../config/env');
const { asyncHandler, AppError } = require('../middleware/error');
const { findOr404 } = require('../utils');
const { requireOwner, canAccessCourse, isOwnerOrAdmin } = require('../services/access');

const view = (l) => ({ id: l._id, course: l.course, title: l.title, scheduledAt: l.scheduledAt, status: l.status });

exports.create = asyncHandler(async (req, res) => {
  const course = await findOr404(Course, req.params.courseId);
  requireOwner(course, req.user);
  const data = z.object({ title: z.string().min(2).max(150), scheduledAt: z.coerce.date() }).parse(req.body);
  const live = await LiveClass.create({
    ...data, course: course._id, instructor: course.instructor,
    roomName: `course-${course._id}-${crypto.randomBytes(4).toString('hex')}`,
  });
  res.status(201).json({ liveClass: view(live) });
});

exports.listForCourse = asyncHandler(async (req, res) => {
  const course = await findOr404(Course, req.params.courseId);
  if (!(await canAccessCourse(course, req.user))) throw new AppError('Enroll in this course to see live classes', 403);
  const classes = await LiveClass.find({ course: course._id, status: { $ne: 'ended' } }).sort('scheduledAt');
  res.json({ liveClasses: classes.map(view) });
});

const setStatus = (status) =>
  asyncHandler(async (req, res) => {
    const live = await findOr404(LiveClass, req.params.id);
    requireOwner(await findOr404(Course, live.course), req.user);
    live.status = status;
    await live.save();
    res.json({ liveClass: view(live) });
  });
exports.start = setStatus('live');
exports.end = setStatus('ended');

// POST /api/live/:id/token -> a short-lived LiveKit access token. Chat runs through LiveKit's data channel.
exports.token = asyncHandler(async (req, res) => {
  if (!cfg.url || !cfg.apiKey || !cfg.apiSecret) throw new AppError('Live classes are not configured (missing LIVEKIT_* variables)', 503);
  const live = await findOr404(LiveClass, req.params.id);
  const course = await findOr404(Course, live.course);
  if (!(await canAccessCourse(course, req.user))) throw new AppError('Enroll in this course to join', 403);

  const host = isOwnerOrAdmin(course, req.user);
  if (live.status === 'ended') throw new AppError('This class has ended', 410);
  if (live.status !== 'live' && !host) throw new AppError('This class has not started yet', 409);

  const { AccessToken } = require('livekit-server-sdk');
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, { identity: String(req.user._id), name: req.user.name, ttl: '2h' });
  at.addGrant({
    room: live.roomName, roomJoin: true,
    canPublish: host, // only the instructor sends camera/mic
    canSubscribe: true,
    canPublishData: true, // everyone can chat
  });
  res.json({ token: await at.toJwt(), url: cfg.url, host });
});
