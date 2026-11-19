import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { AuthProvider } from '../src/auth.jsx';
import { TOKEN_KEY, api } from '../src/api.js';

configure({ asyncUtilTimeout: 15000 });
const BASE = process.env.API_URL || 'http://localhost:8000';
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => realFetch(typeof input === 'string' && input.startsWith('/') ? BASE + input : input, init);

const PASSWORD = 'S3cure-passw0rd!';
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const as = (token) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY));
const post = (path, body) => api(path, { method: 'POST', body });

async function signup(name) {
  const email = `${name.toLowerCase()}.${unique()}@ui.test`;
  const r = await post('/auth/register/', { email, name, password: PASSWORD });
  return { token: r.token, email, id: r.user.id, name };
}
// act as `user` for API calls
async function setup(user, fn) { as(user.token); return fn(); }

async function company(owner, name = 'UI Co') {
  as(owner.token);
  const ws = await post('/workspaces/', { name: `${name} ${unique()}` });
  return ws.slug;
}
async function upgrade(slug) {
  const r = await post(`/w/${slug}/billing/checkout/`, { plan: 'pro' });
  await post('/billing/mock/pay/', { session_id: r.url.split('session_id=')[1], card_number: '4242424242424242' });
}
async function seedProject(slug) {
  const project = await post(`/w/${slug}/projects/`, { name: 'Website', key: 'WEB' });
  const issue = (title, extra = {}) => post(`/w/${slug}/issues/`, { project: project.id, title, ...extra });
  const a = await issue('Design landing page', { type: 'story', priority: 'high', story_points: 5 });
  const b = await issue('Fix login bug', { type: 'bug', priority: 'urgent' });
  const c = await issue('Write docs');
  const statuses = (await api(`/w/${slug}/statuses/?project=${project.id}`)).results;
  const st = Object.fromEntries(statuses.map((s) => [s.name, s]));
  await post(`/w/${slug}/issues/${c.id}/move/`, { status: st.Done.id, index: 0 });
  return { project, st, a, b, c };
}
function open(path, user) {
  cleanup();
  as(user?.token);
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}
// waits for the board to load, then returns queries scoped to one column
const column = async (name) => within(await screen.findByTestId(`col-${name}`));

test('board: cards are grouped into the workflow columns', async () => {
  const owner = await signup('Olivia');
  const slug = await company(owner);
  const { project } = await seedProject(slug);
  open(`/w/${slug}/projects/${project.id}`, owner);
  expect(await screen.findByRole('heading', { name: 'Website' })).toBeTruthy();
  expect(await (await column('To Do')).findByText('Design landing page')).toBeTruthy();
  expect((await column('To Do')).getByText('Fix login bug')).toBeTruthy();
  expect((await column('Done')).getByText('Write docs')).toBeTruthy();
  expect((await column('In Progress')).queryByText('Write docs')).toBeNull();
});

test('create an issue, open it, comment and edit it', async () => {
  const user = userEvent.setup();
  const owner = await signup('Olivia');
  const slug = await company(owner);
  const { project } = await seedProject(slug);
  open(`/w/${slug}/projects/${project.id}`, owner);

  await user.click(await screen.findByRole('button', { name: 'Create issue' }));
  await user.type(await screen.findByLabelText('Title'), 'Brand new issue');
  await user.selectOptions(screen.getByLabelText('Priority'), 'urgent');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create issue' }));
  const card = await (await column('To Do')).findByText('Brand new issue');
  expect(card).toBeTruthy();

  await user.click(card);
  const drawer = await screen.findByRole('dialog', { name: /WEB-4/ });
  await user.type(within(drawer).getByLabelText('Add a comment'), 'Looks good to me');
  await user.click(within(drawer).getByRole('button', { name: 'Comment' }));
  expect(await within(drawer).findByText('Looks good to me')).toBeTruthy();

  await user.selectOptions(within(drawer).getByLabelText('Priority'), 'low');
  await user.click(within(drawer).getByRole('button', { name: 'Save changes' }));
  expect(await within(drawer).findByText('Saved')).toBeTruthy();
});

test('workflow rule: the drawer shows the server error when a move is not allowed', async () => {
  const user = userEvent.setup();
  const owner = await signup('Olivia');
  const slug = await company(owner);
  const { project, st, a } = await seedProject(slug);
  await api(`/w/${slug}/statuses/${st['To Do'].id}/`, { method: 'PATCH', body: { next_statuses: [st['In Progress'].id] } });
  open(`/w/${slug}/projects/${project.id}`, owner);
  await user.click(await (await column('To Do')).findByText(a.title));
  const drawer = await screen.findByRole('dialog', { name: /WEB-1/ });
  await user.selectOptions(within(drawer).getByLabelText('Status'), String(st.Done.id));
  await user.click(within(drawer).getByRole('button', { name: 'Save changes' }));
  expect((await within(drawer).findByRole('alert')).textContent).toMatch(/does not allow "To Do" -> "Done"/);
});

test('viewer: read-only board, no admin menus', async () => {
  const owner = await signup('Olivia');
  const viewer = await signup('Vera');
  const slug = await company(owner);
  const { project } = await seedProject(slug);
  as(owner.token);
  await post(`/w/${slug}/members/`, { email: viewer.email, role: 'viewer' });
  open(`/w/${slug}/projects/${project.id}`, viewer);
  expect(await (await column('To Do')).findByText('Design landing page')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Create issue' })).toBeNull();
  expect(screen.getByText(/read-only access/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Webhooks/ })).toBeNull();
  expect(screen.queryByRole('link', { name: /Activity log/ })).toBeNull();
  expect(screen.queryByRole('link', { name: /Plan and billing/ })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Workflow' })).toBeNull();
});

test('isolation: another company cannot open my workspace', async () => {
  const owner = await signup('Olivia');
  const outsider = await signup('Mallory');
  const slug = await company(owner);
  const { project } = await seedProject(slug);
  open(`/w/${slug}/projects/${project.id}`, outsider);
  expect(await screen.findByText(/does not exist, or you are not a member/)).toBeTruthy();
  expect(screen.queryByText('Design landing page')).toBeNull();
});

test('plan limit: the Free plan blocks a third project and offers an upgrade', async () => {
  const user = userEvent.setup();
  const owner = await signup('Olivia');
  const slug = await company(owner);
  await post(`/w/${slug}/projects/`, { name: 'One', key: 'ONE' });
  await post(`/w/${slug}/projects/`, { name: 'Two', key: 'TWO' });
  open(`/w/${slug}`, owner);
  await user.click(await screen.findByRole('button', { name: 'New project' }));
  await user.type(await screen.findByLabelText('Name'), 'Three');
  await user.type(screen.getByLabelText(/Key/), 'THR');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create project' }));
  const alert = await within(screen.getByRole('dialog')).findByRole('alert');
  expect(alert.textContent).toMatch(/Free plan allows 2 projects/);
  expect(within(alert).getByRole('link', { name: 'Upgrade your plan' })).toBeTruthy();
});

test('simulated checkout: a declined card shows an error, the test card upgrades the plan', async () => {
  const user = userEvent.setup();
  const owner = await signup('Olivia');
  const slug = await company(owner);
  as(owner.token);
  const r = await post(`/w/${slug}/billing/checkout/`, { plan: 'pro' });
  const sessionId = r.url.split('session_id=')[1];
  open(`/mock-billing?session_id=${sessionId}`, owner);
  expect(await screen.findByText(/Simulated checkout/)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Pro plan' })).toBeTruthy();
  const card = screen.getByLabelText('Card number');
  await user.clear(card);
  await user.type(card, '4000 0000 0000 0002');
  await user.click(screen.getByRole('button', { name: /^Pay/ }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/declined/);
  await user.clear(card);
  await user.type(card, '4242 4242 4242 4242');
  await user.click(screen.getByRole('button', { name: /^Pay/ }));
  expect(await screen.findByText(/Payment received/)).toBeTruthy();
  expect(await screen.findByRole('heading', { name: 'Current plan: Pro' })).toBeTruthy();
});

test('webhooks need a paid plan, then can be created', async () => {
  const user = userEvent.setup();
  const owner = await signup('Olivia');
  const slug = await company(owner);
  open(`/w/${slug}/webhooks`, owner);
  await user.type(await screen.findByLabelText('Endpoint URL'), 'https://example.test/hook');
  await user.click(screen.getByRole('button', { name: 'Add webhook' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/not included in the Free plan/);
  await upgrade(slug);
  open(`/w/${slug}/webhooks`, owner);
  await user.type(await screen.findByLabelText('Endpoint URL'), 'https://example.test/hook');
  await user.click(screen.getByRole('button', { name: 'Add webhook' }));
  expect(await screen.findByText('https://example.test/hook')).toBeTruthy();
});

test('reports are generated in the background and become downloadable', async () => {
  const user = userEvent.setup();
  const owner = await signup('Olivia');
  const slug = await company(owner);
  const { project } = await seedProject(slug);
  open(`/w/${slug}/reports`, owner);
  await user.selectOptions(await screen.findByLabelText('Report type'), 'project');
  await waitFor(() => expect(screen.getByRole('option', { name: 'Website' })).toBeTruthy());
  await user.selectOptions(screen.getByLabelText('What to report on'), String(project.id));
  await user.click(screen.getByRole('button', { name: 'Generate report' }));
  expect(await screen.findByRole('button', { name: 'Download CSV' }, { timeout: 25000 })).toBeTruthy();
  expect(screen.getByText(/1\/3 done/)).toBeTruthy();
});

test('a stale login is logged out automatically', async () => {
  open('/', { token: 'stale-token-value' });
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
});
