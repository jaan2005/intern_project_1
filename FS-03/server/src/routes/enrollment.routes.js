const router = require('express').Router();
const { protect } = require('../middleware/auth');
const enrollment = require('../controllers/enrollment.controller');

router.post('/courses/:id/enroll', protect, enrollment.enrollFree);
router.get('/enrollments/me', protect, enrollment.mine);

module.exports = router;
