const router = require('express').Router();
const { protect } = require('../middleware/auth');
const certificate = require('../controllers/certificate.controller');

router.get('/certificates/me', protect, certificate.mine);
router.get('/certificates/verify/:certificateId', certificate.verify); // public
router.get('/certificates/:certificateId/pdf', protect, certificate.pdf);

module.exports = router;
