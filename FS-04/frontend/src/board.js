// Pure logic for drag and drop (kept separate so it can be unit-tested without a browser).
// columns: [{ status: {id, name}, issues: [...] }]   activeId: issue id   overId: "col-<statusId>" or "i-<issueId>"
// Returns { statusId, index, columns } (the screen after the move) or null when nothing changes.
export function computeMove(columns, activeId, overId) {
  const from = columns.find((c) => c.issues.some((i) => i.id === activeId));
  if (!from) return null;
  const issue = from.issues.find((i) => i.id === activeId);
  let to;
  let index;
  if (String(overId).startsWith('col-')) {
    to = columns.find((c) => `col-${c.status.id}` === overId);                        // dropped on a column's empty space
    if (!to) return null;
    index = to.issues.filter((i) => i.id !== activeId).length;                         // goes to the end
  } else {
    to = columns.find((c) => c.issues.some((i) => `i-${i.id}` === overId));            // dropped on a card
    if (!to) return null;
    index = to.issues.findIndex((i) => `i-${i.id}` === overId);                        // takes that card's place
  }
  if (from.status.id === to.status.id && from.issues.findIndex((i) => i.id === activeId) === index) return null;

  const moved = { ...issue, status: to.status.id, status_name: to.status.name };
  const next = columns.map((c) => {
    const rest = c.issues.filter((i) => i.id !== activeId);
    return c.status.id !== to.status.id ? { ...c, issues: rest } : { ...c, issues: [...rest.slice(0, index), moved, ...rest.slice(index)] };
  });
  return { statusId: to.status.id, index, columns: next };
}
