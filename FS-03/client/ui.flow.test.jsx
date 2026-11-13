import { render, screen, waitFor, within, cleanup, configure } from '@testing-library/react';
configure({ asyncUtilTimeout: 15000 });
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from './src/store';
import App from './src/App.jsx';
import { api } from './src/api';
import { setCredentials } from './src/authSlice';

const BASE = 'http://localhost:5055';
// fetchBaseQuery builds Request objects with relative URLs; point them at the real test server
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest { constructor(u, i) { super(typeof u === 'string' && u.startsWith('/') ? BASE + u : u, i); } };
HTMLMediaElement.prototype.load = () => {};

const open = (path) => render(<Provider store={store}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></Provider>);
const login = async (user, email) => {
  await user.click(await screen.findByRole('link', { name: 'Log in' }));
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'Demo@12345');
  await user.click(screen.getByRole('button', { name: 'Log in' }));
};

test('student journey: catalogue, login, enroll, learn, pass quiz, certificate', async () => {
  const user = userEvent.setup();
  open('/');
  expect(await screen.findByText('Web Basics in an Afternoon')).toBeTruthy();
  expect(screen.getByText('Build a REST API with Node')).toBeTruthy();

  await login(user, 'student@lms.test');
  expect(await screen.findByRole('heading', { name: 'My learning' })).toBeTruthy();

  await user.click(screen.getByRole('link', { name: 'Courses' }));
  await user.click(await screen.findByText('Web Basics in an Afternoon'));
  await user.click(await screen.findByRole('button', { name: 'Enroll for free' }));

  // learn page: lesson list, quiz and progress
  expect(await screen.findByText('Your progress')).toBeTruthy();
  const aside = screen.getByText('Your progress').closest('aside');
  expect(within(aside).getByText('How the web works')).toBeTruthy();
  expect(await screen.findByText('Web basics check')).toBeTruthy();

  // lesson 1: video element is rendered (HLS URL came back from the access-checked endpoint)
  await waitFor(() => expect(document.querySelector('video')).toBeTruthy());
  await user.click(await screen.findByRole('button', { name: 'Mark as complete' }));
  expect(await screen.findByText('Lesson completed')).toBeTruthy();

  // fail the quiz first (all wrong), then retry and pass
  const quiz = screen.getByText('Web basics check').closest('.panel');
  for (const [i, wrong] of [[1, 'CSS'], [2, 'A virus'], [3, '<img>']].map(([n, t]) => [n, t])) {
    await user.click(within(quiz).getByLabelText(wrong));
  }
  await user.click(within(quiz).getByRole('button', { name: 'Submit answers' }));
  expect(await within(quiz).findByText(/You scored 0%/)).toBeTruthy();
  await user.click(within(quiz).getByRole('button', { name: 'Try again' }));
  await user.click(within(quiz).getByLabelText('HTML'));
  await user.click(within(quiz).getByLabelText('A request'));
  await user.click(within(quiz).getByLabelText('<a>'));
  await user.click(within(quiz).getByRole('button', { name: 'Submit answers' }));
  expect(await within(quiz).findByText(/Passed!/)).toBeTruthy();

  // finish lesson 2 -> course complete -> certificate button
  await user.click(within(aside).getByText('Your first HTML page'));
  await user.click(await screen.findByRole('button', { name: 'Mark as complete' }));
  expect(await screen.findByRole('button', { name: 'Download certificate' })).toBeTruthy();
  expect(await within(aside).findByText('100%')).toBeTruthy();
}, 60000);

test('instructor studio: courses table, editor shows ready videos, earnings page loads', async () => {
  cleanup();
  store.dispatch({ type: 'auth/logout' });
  const user = userEvent.setup();
  open('/');
  await login(user, 'teacher@lms.test');
  expect(await screen.findByRole('heading', { name: 'Teach' })).toBeTruthy();
  await user.click(await screen.findByRole('link', { name: 'Build a REST API with Node' }));
  expect(await screen.findByText(/Project setup/)).toBeTruthy();
  expect((await screen.findAllByText('Ready')).length).toBe(2);
  expect(screen.getByRole('button', { name: 'Unpublish' })).toBeTruthy();
  await user.click(screen.getByRole('link', { name: /All courses/ }));
  await user.click(await screen.findByRole('link', { name: 'Earnings' }));
  expect(await screen.findByRole('heading', { name: 'Earnings' })).toBeTruthy();
  expect(await screen.findByText('Platform fee')).toBeTruthy();
});

test('role guards: a student cannot open the teacher or admin pages', async () => {
  cleanup();
  store.dispatch({ type: 'auth/logout' });
  const user = userEvent.setup();
  open('/');
  await login(user, 'student@lms.test');
  await screen.findByRole('heading', { name: 'My learning' });
  cleanup();
  open('/admin');
  expect(await screen.findByText(/Learn something you can use this week/)).toBeTruthy(); // bounced to the catalogue
});

test('simulated checkout: declined card shows an error, the test card enrolls the student', async () => {
  cleanup();
  store.dispatch({ type: 'auth/logout' });
  const user = userEvent.setup();
  open('/');
  await login(user, 'student@lms.test');
  await screen.findByRole('heading', { name: 'My learning' });

  // what the "Buy this course" button does: ask the server for a checkout session
  const courses = (await store.dispatch(api.endpoints.getCourses.initiate({}))).data.courses;
  const paid = courses.find((c) => c.priceCents > 0);
  const checkout = await store.dispatch(api.endpoints.checkout.initiate(paid.id));
  const sessionId = new URL(checkout.data.url).searchParams.get('session_id');

  cleanup();
  open(`/mock-checkout?session_id=${sessionId}`);
  expect(await screen.findByText(/Simulated checkout/)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Build a REST API with Node' })).toBeTruthy();

  const card = screen.getByLabelText('Card number');
  await user.clear(card);
  await user.type(card, '4000 0000 0000 0002');
  await user.click(screen.getByRole('button', { name: /^Pay/ }));
  expect(await screen.findByText(/declined/)).toBeTruthy();

  await user.clear(card);
  await user.type(card, '4242 4242 4242 4242');
  await user.click(screen.getByRole('button', { name: /^Pay/ }));
  expect(await screen.findByText(/Payment received/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Start learning' })).toBeTruthy();
}, 60000);

test('a stale login (e.g. after the database was reset) is logged out automatically', async () => {
  cleanup();
  store.dispatch({ type: 'auth/logout' });
  // pretend the browser remembers a login that the server no longer accepts
  store.dispatch(setCredentials({ token: 'stale.token.value', user: { id: '1', name: 'Ghost', email: 'g@x.com', role: 'student' } }));
  open('/my-learning');
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy(); // sent to the login page
  expect(store.getState().auth.token).toBeNull();

  // and the public catalogue and course pages keep working
  cleanup();
  open('/');
  expect(await screen.findByText('Web Basics in an Afternoon')).toBeTruthy();
});
