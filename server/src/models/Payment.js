const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true },
    currency: { type: String, default: 'usd' },
    // Split is calculated when the payment is created and frozen, so later fee changes don't rewrite history
    platformFeeCents: { type: Number, required: true },
    instructorEarningCents: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending', index: true },
    stripeSessionId: { type: String, index: true },
    stripePaymentIntent: String,
    paidAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
