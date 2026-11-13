const router = require('express').Router();
const { protect, optionalAuth, authorize } = require('../middleware/auth');
const course = require('../controllers/course.controller');

const teacher = [protect, authorize('instructor', 'admin')];

router.get('/courses', course.list);
router.get('/courses/mine', ...teacher, course.mine); // must be before '/courses/:id'
router.post('/courses', ...teacher, course.create);
router.get('/courses/:id', optionalAuth, course.get);
router.put('/courses/:id', ...teacher, course.update);
router.patch('/courses/:id/publish', ...teacher, course.publish);
router.delete('/courses/:id', ...teacher, course.remove);

module.exports = router;
