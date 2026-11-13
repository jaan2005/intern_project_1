// A small error class so controllers can throw errors with an HTTP status code.
class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Wraps async route handlers so thrown errors reach the error middleware.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const notFound = (req, res) => res.status(404).json({ message: `Route not found: ${req.originalUrl}` });

// Central error handler: every error ends up here and gets a consistent JSON shape.
const errorHandler = (err, req, res, next) => {
  if (err.name === 'ZodError') {
    return res.status(400).json({ message: 'Validation failed', errors: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })) });
  }
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message }); // mongoose
  if (err.code === 11000) return res.status(409).json({ message: 'Already exists (duplicate value)' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'File is too large' });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? 'Internal server error' : err.message });
};

module.exports = { AppError, asyncHandler, notFound, errorHandler };
