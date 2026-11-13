// Unit tests for the pure business logic (no database needed).  Run: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeQuiz, computeProgress, splitPayment } = require('../src/services/grading');

const questions = [
  { _id: 'q1', correctIndex: 1 },
  { _id: 'q2', correctIndex: 0 },
  { _id: 'q3', correctIndex: 2 },
  { _id: 'q4', correctIndex: 3 },
];

test('gradeQuiz: all correct = 100% and passed', () => {
  const r = gradeQuiz(questions, [1, 0, 2, 3], 60);
  assert.equal(r.score, 100);
  assert.equal(r.correctCount, 4);
  assert.equal(r.passed, true);
});

test('gradeQuiz: partial score below pass mark fails', () => {
  const r = gradeQuiz(questions, [1, 1, 1, 1], 60); // only q1 right = 25%
  assert.equal(r.score, 25);
  assert.equal(r.passed, false);
  assert.equal(r.results[0].correct, true);
  assert.equal(r.results[1].correct, false);
});

test('gradeQuiz: exactly at the pass mark passes', () => {
  const r = gradeQuiz(questions, [1, 0, 0, 0], 50); // 2/4 = 50%
  assert.equal(r.score, 50);
  assert.equal(r.passed, true);
});

test('gradeQuiz: skipped / missing answers count as wrong', () => {
  const r = gradeQuiz(questions, [1, null], 60);
  assert.equal(r.correctCount, 1);
  assert.equal(r.results[3].chosen, null);
});

test('computeProgress: nothing in the course = 0%, never "completed"', () => {
  assert.deepEqual(computeProgress({ totalLessons: 0, completedLessons: 0, totalQuizzes: 0, passedQuizzes: 0 }), { percent: 0, completed: false });
});

test('computeProgress: lessons and quizzes both count', () => {
  const r = computeProgress({ totalLessons: 3, completedLessons: 3, totalQuizzes: 1, passedQuizzes: 0 });
  assert.equal(r.percent, 75);
  assert.equal(r.completed, false); // quiz still not passed
});

test('computeProgress: completed only when everything is done', () => {
  const r = computeProgress({ totalLessons: 3, completedLessons: 3, totalQuizzes: 2, passedQuizzes: 2 });
  assert.deepEqual(r, { percent: 100, completed: true });
});

test('computeProgress: stale ids never push progress above 100%', () => {
  const r = computeProgress({ totalLessons: 2, completedLessons: 5, totalQuizzes: 0, passedQuizzes: 0 });
  assert.equal(r.percent, 100);
});

test('splitPayment: 20% platform fee on $49.99', () => {
  const r = splitPayment(4999, 20);
  assert.equal(r.platformFeeCents, 1000); // 999.8 rounds to 1000
  assert.equal(r.instructorEarningCents, 3999);
  assert.equal(r.platformFeeCents + r.instructorEarningCents, 4999); // no cent lost
});

test('splitPayment: 0% fee gives the instructor everything', () => {
  assert.deepEqual(splitPayment(1000, 0), { platformFeeCents: 0, instructorEarningCents: 1000 });
});
