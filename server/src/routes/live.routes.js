const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const live = require('../controllers/live.controller');

const teacher = [protect, authorize('instructor', 'admin')];

router.get('/courses/:courseId/live', protect, live.listForCourse);
router.post('/courses/:courseId/live', ...teacher, live.create);
router.post('/live/:id/start', ...teacher, live.start);
router.post('/live/:id/end', ...teacher, live.end);
router.post('/live/:id/token', protect, live.token);

module.exports = router;
