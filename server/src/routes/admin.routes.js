const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const admin = require('../controllers/admin.controller');

router.use('/admin', protect, authorize('admin'));
router.get('/admin/stats', admin.stats);
router.get('/admin/users', admin.users);
router.patch('/admin/users/:id/role', admin.setRole);
router.get('/admin/courses', admin.courses);

module.exports = router;
