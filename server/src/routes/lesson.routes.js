const router = require('express').Router();
const { protect, optionalAuth, authorize } = require('../middleware/auth');
const lesson = require('../controllers/lesson.controller');
const upload = require('../middleware/upload');

const teacher = [protect, authorize('instructor', 'admin')];

router.post('/courses/:courseId/lessons', ...teacher, lesson.create);
router.get('/lessons/:id', optionalAuth, lesson.get);
router.put('/lessons/:id', ...teacher, lesson.update);
router.delete('/lessons/:id', ...teacher, lesson.remove);
router.post('/lessons/:id/video', ...teacher, upload.single('video'), lesson.uploadVideo);
router.post('/lessons/:id/complete', protect, lesson.complete);

module.exports = router;
