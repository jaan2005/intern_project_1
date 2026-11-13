const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const quiz = require('../controllers/quiz.controller');

const teacher = [protect, authorize('instructor', 'admin')];

router.get('/courses/:courseId/quizzes', protect, quiz.listForCourse);
router.post('/courses/:courseId/quizzes', ...teacher, quiz.create);
router.put('/quizzes/:id', ...teacher, quiz.update);
router.delete('/quizzes/:id', ...teacher, quiz.remove);
router.post('/quizzes/:id/attempt', protect, quiz.attempt);

module.exports = router;
