const Enrollment = require('../models/Enrollment');
const { AppError } = require('../middleware/error');

const isOwnerOrAdmin = (course, user) => !!user && (user.role === 'admin' || String(course.instructor?._id || course.instructor) === String(user._id));

const getEnrollment = (userId, courseId) => Enrollment.findOne({ user: userId, course: courseId });

// Owner, admin, or enrolled student
async function canAccessCourse(course, user) {
  if (!user) return false;
  if (isOwnerOrAdmin(course, user)) return true;
  return !!(await getEnrollment(user._id, course._id));
}

function requireOwner(course, user) {
  if (!isOwnerOrAdmin(course, user)) throw new AppError('You do not own this course', 403);
}

module.exports = { isOwnerOrAdmin, getEnrollment, canAccessCourse, requireOwner };
