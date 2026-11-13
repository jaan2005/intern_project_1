const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const { AppError, asyncHandler } = require('../middleware/error');

const signToken = (user) => jwt.sign({ id: user._id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  // Anyone can sign up as student or instructor. Admin is NEVER self-assignable.
  role: z.enum(['student', 'instructor']).default('student'),
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

exports.register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const user = await User.create(data);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email }).select('+password');
  // Same message for both failures so attackers can't tell which emails exist.
  if (!user || !(await user.comparePassword(password))) throw new AppError('Invalid email or password', 401);
  res.json({ token: signToken(user), user: publicUser(user) });
});

exports.me = (req, res) => res.json({ user: publicUser(req.user) });
