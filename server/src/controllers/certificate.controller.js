const Certificate = require('../models/Certificate');
const { clientUrl } = require('../config/env');
const { asyncHandler, AppError } = require('../middleware/error');
const { streamCertificate } = require('../services/certificatePdf');

// GET /api/certificates/me
exports.mine = asyncHandler(async (req, res) => {
  const certs = await Certificate.find({ user: req.user._id }).sort('-issuedAt');
  res.json({ certificates: certs.map((c) => ({ id: c._id, certificateId: c.certificateId, course: c.course, courseTitle: c.courseTitle, issuedAt: c.issuedAt })) });
});

// GET /api/certificates/:certificateId/pdf  (the owner or an admin)
exports.pdf = asyncHandler(async (req, res) => {
  const cert = await Certificate.findOne({ certificateId: req.params.certificateId });
  if (!cert) throw new AppError('Certificate not found', 404);
  if (req.user.role !== 'admin' && String(cert.user) !== String(req.user._id)) throw new AppError('Not your certificate', 403);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate-${cert.certificateId}.pdf"`);
  streamCertificate(res, { ...cert.toObject(), verifyUrl: `${clientUrl}/verify/${cert.certificateId}` });
});

// GET /api/certificates/verify/:certificateId  (public: anyone, e.g. an employer, can check a certificate)
exports.verify = asyncHandler(async (req, res) => {
  const cert = await Certificate.findOne({ certificateId: req.params.certificateId });
  if (!cert) return res.status(404).json({ valid: false });
  res.json({ valid: true, studentName: cert.studentName, courseTitle: cert.courseTitle, instructorName: cert.instructorName, issuedAt: cert.issuedAt });
});
