const crypto = require('crypto');
const Lesson = require('../models/Lesson');
const Quiz = require('../models/Quiz');
const Course = require('../models/Course');
const Certificate = require('../models/Certificate');
const { computeProgress } = require('./grading');

// Recalculates an enrollment's progress. When a student finishes everything, issues the certificate.
async function refreshEnrollment(enrollment) {
  const courseId = enrollment.course;
  const [totalLessons, totalQuizzes, completedLessons, passedQuizzes] = await Promise.all([
    Lesson.countDocuments({ course: courseId }),
    Quiz.countDocuments({ course: courseId }),
    // count only lessons/quizzes that still exist (the instructor may have deleted some)
    Lesson.countDocuments({ course: courseId, _id: { $in: enrollment.completedLessons } }),
    Quiz.countDocuments({ course: courseId, _id: { $in: enrollment.passedQuizzes } }),
  ]);

  const { percent, completed } = computeProgress({ totalLessons, completedLessons, totalQuizzes, passedQuizzes });
  enrollment.progress = percent;
  if (completed && !enrollment.completedAt) {
    enrollment.completedAt = new Date();
    await issueCertificate(enrollment);
  }
  await enrollment.save();
  return enrollment;
}

async function issueCertificate(enrollment) {
  const User = require('../models/User');
  const [user, course] = await Promise.all([User.findById(enrollment.user), Course.findById(enrollment.course).populate('instructor', 'name')]);
  if (!user || !course) return null;
  // upsert = safe if two requests complete the course at the same moment
  return Certificate.findOneAndUpdate(
    { user: user._id, course: course._id },
    {
      $setOnInsert: {
        certificateId: `LMS-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
        studentName: user.name,
        courseTitle: course.title,
        instructorName: course.instructor?.name || 'Instructor',
        issuedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
}

module.exports = { refreshEnrollment, issueCertificate };
