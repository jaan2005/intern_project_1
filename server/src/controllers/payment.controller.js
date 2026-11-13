const crypto = require('crypto');
const { z } = require('zod');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const { stripe: cfg, clientUrl } = require('../config/env');
const { asyncHandler, AppError } = require('../middleware/error');
const { findOr404 } = require('../utils');
const { splitPayment } = require('../services/grading');

// Payment provider: real Stripe, or a built-in simulated gateway (no account needed) with the same flow.
const useMock = () => cfg.provider === 'mock';
const requireMock = () => { if (!useMock()) throw new AppError('Not found', 404); };

// Test cards accepted by the simulated gateway (same idea as Stripe's test cards)
const OK_CARD = '4242424242424242';
const DECLINED_CARD = '4000000000000002';

let client;
const stripe = () => {
  if (!cfg.secretKey) throw new AppError('Payments are not configured (missing STRIPE_SECRET_KEY)', 503);
  return (client ||= require('stripe')(cfg.secretKey));
};

// Marks a payment as paid and enrolls the student. Safe to call many times (webhook AND confirm both call it).
async function fulfillSession(session) {
  const payment = await Payment.findOne({ stripeSessionId: session.id });
  if (!payment) return null;
  if (session.payment_status === 'paid') {
    // atomic: only the first caller flips pending -> paid
    await Payment.findOneAndUpdate(
      { _id: payment._id, status: 'pending' },
      { status: 'paid', paidAt: new Date(), stripePaymentIntent: session.payment_intent }
    );
    await Enrollment.updateOne(
      { user: payment.user, course: payment.course },
      { $setOnInsert: { user: payment.user, course: payment.course, payment: payment._id } },
      { upsert: true }
    );
  }
  return Payment.findById(payment._id);
}

exports.fulfillSession = fulfillSession;

// POST /api/payments/checkout { courseId } -> returns a Stripe-hosted checkout URL
exports.checkout = asyncHandler(async (req, res) => {
  const { courseId } = z.object({ courseId: z.string() }).parse(req.body);
  const course = await findOr404(Course, courseId);
  if (!course.published) throw new AppError('Course is not available', 404);
  if (course.priceCents <= 0) throw new AppError('This course is free. Enroll directly.', 400);
  if (String(course.instructor) === String(req.user._id)) throw new AppError('You cannot buy your own course', 400);
  if (await Enrollment.exists({ user: req.user._id, course: course._id })) throw new AppError('You are already enrolled', 409);

  const split = splitPayment(course.priceCents, cfg.platformFeePercent);
  const payment = await Payment.create({
    user: req.user._id, course: course._id, instructor: course.instructor,
    amountCents: course.priceCents, currency: 'usd', ...split,
  });

  if (useMock()) {
    payment.stripeSessionId = `mock_${crypto.randomBytes(12).toString('hex')}`;
    await payment.save();
    return res.json({ url: `${clientUrl}/mock-checkout?session_id=${payment.stripeSessionId}`, provider: 'mock' });
  }

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: req.user.email,
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: course.priceCents, product_data: { name: course.title } } }],
    metadata: { paymentId: String(payment._id) },
    success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl}/courses/${course._id}`,
  });
  payment.stripeSessionId = session.id;
  await payment.save();
  res.json({ url: session.url });
});

// POST /api/payments/confirm { sessionId }
// Called by the success page. Works even without a webhook (handy in local development).
exports.confirm = asyncHandler(async (req, res) => {
  const { sessionId } = z.object({ sessionId: z.string() }).parse(req.body);
  const payment = await Payment.findOne({ stripeSessionId: sessionId });
  if (!payment || String(payment.user) !== String(req.user._id)) throw new AppError('Payment not found', 404);
  if (sessionId.startsWith('mock_')) {
    requireMock();
    return res.json({ status: payment.status, courseId: payment.course });
  }
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  const result = await fulfillSession(session);
  res.json({ status: result.status, courseId: result.course });
});

// GET /api/payments/mock/:sessionId -> what the fake checkout page shows (course and amount)
exports.mockSession = asyncHandler(async (req, res) => {
  requireMock();
  const payment = await Payment.findOne({ stripeSessionId: req.params.sessionId }).populate('course', 'title');
  if (!payment || String(payment.user) !== String(req.user._id)) throw new AppError('Checkout session not found', 404);
  res.json({ status: payment.status, courseTitle: payment.course?.title, amountCents: payment.amountCents, courseId: payment.course?._id });
});

// POST /api/payments/mock/pay { sessionId, cardNumber } -> the "pay" button of the fake checkout page
exports.mockPay = asyncHandler(async (req, res) => {
  requireMock();
  const { sessionId, cardNumber } = z.object({ sessionId: z.string(), cardNumber: z.string() }).parse(req.body);
  const payment = await Payment.findOne({ stripeSessionId: sessionId });
  if (!payment || String(payment.user) !== String(req.user._id)) throw new AppError('Checkout session not found', 404);
  if (payment.status === 'paid') return res.json({ status: 'paid', courseId: payment.course });

  const digits = cardNumber.replace(/\D/g, '');
  if (digits === DECLINED_CARD) throw new AppError('Your card was declined (test card 4000 0000 0000 0002).', 402);
  if (digits !== OK_CARD) throw new AppError('This is a test checkout. Use the test card 4242 4242 4242 4242.', 400);

  const paid = await fulfillSession({ id: sessionId, payment_status: 'paid', payment_intent: `mock_pi_${crypto.randomBytes(8).toString('hex')}` });
  res.json({ status: paid.status, courseId: paid.course });
});

// POST /api/payments/webhook  (Stripe calls this; req.rawBody holds the RAW bytes needed for signature verification)
exports.webhook = asyncHandler(async (req, res) => {
  if (!cfg.webhookSecret) throw new AppError('Webhook secret not configured', 503);
  let event;
  try {
    event = stripe().webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], cfg.webhookSecret);
  } catch (err) {
    throw new AppError(`Webhook signature verification failed: ${err.message}`, 400);
  }
  if (event.type === 'checkout.session.completed') await fulfillSession(event.data.object);
  res.json({ received: true });
});

// GET /api/payments/me
exports.mine = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ user: req.user._id, status: 'paid' }).sort('-paidAt').populate('course', 'title');
  res.json({ payments: payments.map((p) => ({ id: p._id, course: p.course?.title, amountCents: p.amountCents, paidAt: p.paidAt })) });
});

// GET /api/instructor/earnings   (admin sees the whole platform)
exports.earnings = asyncHandler(async (req, res) => {
  const match = { status: 'paid' };
  if (req.user.role !== 'admin') match.instructor = req.user._id;

  const [totals, byCourse, byMonth, recent] = await Promise.all([
    Payment.aggregate([{ $match: match }, { $group: { _id: null, gross: { $sum: '$amountCents' }, fees: { $sum: '$platformFeeCents' }, net: { $sum: '$instructorEarningCents' }, sales: { $sum: 1 } } }]),
    Payment.aggregate([
      { $match: match },
      { $group: { _id: '$course', sales: { $sum: 1 }, gross: { $sum: '$amountCents' }, net: { $sum: '$instructorEarningCents' } } },
      { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
      { $project: { _id: 0, courseId: '$_id', title: { $ifNull: [{ $arrayElemAt: ['$course.title', 0] }, '(deleted course)'] }, sales: 1, gross: 1, net: 1 } },
      { $sort: { net: -1 } },
    ]),
    Payment.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } }, net: { $sum: '$instructorEarningCents' }, sales: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, month: '$_id', net: 1, sales: 1 } },
    ]),
    Payment.find(match).sort('-paidAt').limit(10).populate('course', 'title').populate('user', 'name'),
  ]);
  const t = totals[0] || { gross: 0, fees: 0, net: 0, sales: 0 };
  res.json({
    totals: { grossCents: t.gross, platformFeeCents: t.fees, netCents: t.net, sales: t.sales },
    byCourse, byMonth,
    recent: recent.map((p) => ({ id: p._id, course: p.course?.title, student: p.user?.name, netCents: p.instructorEarningCents, paidAt: p.paidAt })),
  });
});
