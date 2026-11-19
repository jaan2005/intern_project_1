import { computeMove } from '../src/board.js';

const issue = (id, status) => ({ id, status, status_name: `S${status}` });
const cols = () => [
  { status: { id: 1, name: 'To Do' }, issues: [issue(1, 1), issue(2, 1), issue(3, 1)] },
  { status: { id: 2, name: 'Doing' }, issues: [issue(4, 2)] },
  { status: { id: 3, name: 'Done' }, issues: [] },
];
const ids = (columns) => columns.map((c) => c.issues.map((i) => i.id));

test('dropping on a card inside the same column reorders (move 1 to where 3 is)', () => {
  const m = computeMove(cols(), 1, 'i-3');
  expect(m.statusId).toBe(1);
  expect(m.index).toBe(2);
  expect(ids(m.columns)).toEqual([[2, 3, 1], [4], []]);
});

test('moving a card upwards in its column', () => {
  const m = computeMove(cols(), 3, 'i-1');
  expect(m.index).toBe(0);
  expect(ids(m.columns)[0]).toEqual([3, 1, 2]);
});

test('dropping on a card of another column puts it before that card and changes status', () => {
  const m = computeMove(cols(), 2, 'i-4');
  expect(m.statusId).toBe(2);
  expect(m.index).toBe(0);
  expect(ids(m.columns)).toEqual([[1, 3], [2, 4], []]);
  expect(m.columns[1].issues[0]).toMatchObject({ status: 2, status_name: 'Doing' });
});

test('dropping on an empty column adds it there', () => {
  const m = computeMove(cols(), 1, 'col-3');
  expect(m.statusId).toBe(3);
  expect(m.index).toBe(0);
  expect(ids(m.columns)).toEqual([[2, 3], [4], [1]]);
});

test('dropping on the empty space of a non-empty column puts it last', () => {
  const m = computeMove(cols(), 1, 'col-2');
  expect(m.index).toBe(1);
  expect(ids(m.columns)).toEqual([[2, 3], [4, 1], []]);
});

test('dropping on the empty space of its own column sends it to the bottom', () => {
  const m = computeMove(cols(), 1, 'col-1');
  expect(m.index).toBe(2);
  expect(ids(m.columns)[0]).toEqual([2, 3, 1]);
});

test('dropping a card where it already is changes nothing', () => {
  expect(computeMove(cols(), 2, 'i-2')).toBeNull();
});

test('unknown targets are ignored and the input is not modified', () => {
  const c = cols();
  expect(computeMove(c, 1, 'col-99')).toBeNull();
  expect(computeMove(c, 99, 'i-1')).toBeNull();
  computeMove(c, 1, 'col-3');
  expect(ids(c)).toEqual([[1, 2, 3], [4], []]);
});
