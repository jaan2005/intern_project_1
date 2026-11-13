// Pure functions (no database) so they are easy to unit test.

// answers[i] is the option index the student chose for question i (or null/undefined if skipped).
function gradeQuiz(questions, answers, passMark = 60) {
  const results = questions.map((q, i) => ({
    questionId: q._id,
    chosen: answers[i] ?? null,
    correctIndex: q.correctIndex,
    correct: answers[i] === q.correctIndex,
  }));
  const correctCount = results.filter((r) => r.correct).length;
  const total = questions.length;
  const score = total === 0 ? 0 : Math.round((correctCount / total) * 100);
  return { results, correctCount, total, score, passed: score >= passMark };
}

// A course is "done" when every lesson is completed AND every quiz is passed.
function computeProgress({ totalLessons, completedLessons, totalQuizzes, passedQuizzes }) {
  const total = totalLessons + totalQuizzes;
  const done = Math.min(completedLessons, totalLessons) + Math.min(passedQuizzes, totalQuizzes);
  return { percent: total === 0 ? 0 : Math.round((done / total) * 100), completed: total > 0 && done === total };
}

// Instructor earnings split. Rounds the platform fee; the instructor gets the remainder (no cent is lost).
function splitPayment(amountCents, feePercent) {
  const platformFeeCents = Math.round((amountCents * feePercent) / 100);
  return { platformFeeCents, instructorEarningCents: amountCents - platformFeeCents };
}

module.exports = { gradeQuiz, computeProgress, splitPayment };
