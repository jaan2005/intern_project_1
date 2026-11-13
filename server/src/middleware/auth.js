const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { jwtSecret } = require('../config/env');
const { AppError, asyncHandler } = require('./error');

async function userFromHeader(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch {
    throw new AppError('Invalid or expired token', 401);
  }
  const user = await User.findById(payload.id);
  if (!user) throw new AppError('User no longer exists', 401);
  return user;
}

// protect: user must be logged in. Reads "Authorization: Bearer <token>".
const protect = asyncHandler(async (req, res, next) => {
  const user = await userFromHeader(req);
  if (!user) throw new AppError('Not logged in', 401);
  req.user = user;
  next();
});

// optionalAuth: attaches req.user if a valid token is sent, but allows anonymous visitors too.
// A missing, expired or stale token on a PUBLIC page just means "not logged in": the page still works.
// (Protected routes use `protect`, which still answers 401.)
const optionalAuth = asyncHandler(async (req, res, next) => {
  try {
    req.user = await userFromHeader(req);
  } catch (err) {
    if (err.status !== 401) throw err; // real errors (e.g. database down) still surface
    req.user = null;
  }
  next();
});

// authorize('admin', 'instructor'): only these roles may continue.
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return next(new AppError('You do not have permission', 403));
  next();
};

module.exports = { protect, optionalAuth, authorize };
