const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const payment = require('../controllers/payment.controller');

router.post('/payments/checkout', protect, payment.checkout);
router.post('/payments/confirm', protect, payment.confirm);
router.get('/payments/me', protect, payment.mine);
// simulated gateway (only active when no Stripe key is configured)
router.get('/payments/mock/:sessionId', protect, payment.mockSession);
router.post('/payments/mock/pay', protect, payment.mockPay);
// Stripe calls this itself. It has no login; it is protected by Stripe's signature. See rawBody in app.js.
router.post('/payments/webhook', payment.webhook);
router.get('/instructor/earnings', protect, authorize('instructor', 'admin'), payment.earnings);

module.exports = router;
