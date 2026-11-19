import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, useLoad } from '../api';
import { computeMove } from '../board.js';
import { useAuth } from '../auth.jsx';
import IssueDrawer from '../components/IssueDrawer.jsx';
import { Avatar, ErrorBox, Modal, TypeIcon } from '../components/ui.jsx';
import { useWorkspace } from '../workspace.jsx';

const cardId = (issue) => `i-${issue.id}`;

function CardBody({ issue }) {
  return (
    <>
      <div className="card-meta"><TypeIcon type={issue.type} /><span className="key">{issue.key}</span><span className="spacer" />{issue.story_points != null && <span className="points">{issue.story_points}</span>}</div>
      <div className="card-title">{issue.title}</div>
      <div className="card-meta"><span>{issue.priority}</span><span className="spacer" /><Avatar name={issue.assignee_name} size={22} /></div>
    </>
  );
}

function SortableCard({ issue, onOpen, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardId(issue), disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`card p-${issue.priority} ${isDragging ? 'dragging' : ''}`}
      {...attributes} {...listeners} onClick={() => onOpen(issue)} aria-label={`${issue.key} ${issue.title}`} data-testid={`card-${issue.key}`}>
      <CardBody issue={issue} />
    </div>
  );
}

function Column({ col, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${col.status.id}` });
  return (
    <section ref={setNodeRef} className={`column ${isOver ? 'over' : ''}`} aria-label={col.status.name} data-testid={`col-${col.status.name}`}>
      <div className="column-head"><span>{col.status.name}</span><span className="count">{col.issues.length}</span></div>
      <div className="column-body">{children}</div>
    </section>
  );
}

export default function Board() {
  const { slug, can, role } = useWorkspace();
  const { user } = useAuth();
  const { pid, sprints, members, statuses } = useOutletContext();
  const [sprint, setSprint] = useState('all');
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');
  const { data, error: loadError, reload } = useLoad(() => api(`/w/${slug}/projects/${pid}/board/?sprint=${sprint}`), [slug, pid, sprint]);
  const [columns, setColumns] = useState([]);
  const [active, setActive] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  useEffect(() => { if (data) setColumns(data.columns); }, [data]);

  const visible = (issue) => (!mine || issue.assignee === user.id) && (!search || issue.title.toLowerCase().includes(search.toLowerCase()) || issue.key.toLowerCase().includes(search.toLowerCase()));
  const find = (id) => columns.flatMap((c) => c.issues).find((i) => cardId(i) === id);

  const onDragEnd = async ({ active: a, over }) => {
    setActive(null);
    if (!over) return;
    const issue = find(a.id);
    const move = computeMove(columns, issue.id, over.id);
    if (!move) return;
    // update the screen immediately, then tell the server; if the server refuses (workflow rule), put everything back
    setColumns(move.columns);
    setError(null);
    try { await api(`/w/${slug}/issues/${issue.id}/move/`, { method: 'POST', body: { status: move.statusId, index: move.index } }); reload(); }
    catch (err) { setError(err); reload(); }
  };

  return (
    <>
      <div className="filter-bar">
        <select aria-label="Sprint" value={sprint} onChange={(e) => setSprint(e.target.value)}>
          <option value="all">All issues</option><option value="active">Active sprint</option><option value="backlog">Backlog only</option>
          {sprints.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
        </select>
        <input placeholder="Search issues" aria-label="Search issues" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="row" style={{ margin: 0, fontWeight: 500 }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only mine</label>
        <span className="grow" />
        {can('member') && <button className="btn brand" onClick={() => setCreating(true)}>Create issue</button>}
      </div>
      <ErrorBox error={error || loadError} slug={slug} role={role} />
      {!can('member') && <p className="muted small">You have read-only access, so cards cannot be moved.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active: a }) => setActive(find(a.id))} onDragCancel={() => setActive(null)} onDragEnd={onDragEnd}>
        <div className="board">
          {columns.map((col) => {
            const issues = col.issues.filter(visible);
            return (
              <Column key={col.status.id} col={{ ...col, issues }}>
                <SortableContext items={issues.map(cardId)} strategy={verticalListSortingStrategy}>
                  {issues.map((i) => <SortableCard key={i.id} issue={i} onOpen={(x) => setOpenId(x.id)} disabled={!can('member')} />)}
                </SortableContext>
              </Column>
            );
          })}
        </div>
        <DragOverlay>{active && <div className={`card overlay p-${active.priority}`}><CardBody issue={active} /></div>}</DragOverlay>
      </DndContext>
      {openId && <IssueDrawer issueId={openId} onClose={() => setOpenId(null)} onChanged={reload} members={members} sprints={sprints} statuses={statuses} />}
      {creating && <NewIssue pid={pid} slug={slug} role={role} members={members} sprints={sprints} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />}
    </>
  );
}

export function NewIssue({ pid, slug, role, members, sprints, onClose, onCreated }) {
  const [f, setF] = useState({ title: '', type: 'task', priority: 'medium', assignee: '', sprint: '' });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setError(null);
    const body = { project: Number(pid), title: f.title, type: f.type, priority: f.priority };
    if (f.assignee) body.assignee = Number(f.assignee);
    if (f.sprint) body.sprint = Number(f.sprint);
    try { await api(`/w/${slug}/issues/`, { method: 'POST', body }); onCreated(); } catch (err) { setError(err); }
  };
  return (
    <Modal title="Create issue" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox error={error} slug={slug} role={role} />
        <div className="field"><label htmlFor="ni-title">Title</label><input id="ni-title" required autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="ni-type">Type</label><select id="ni-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['task', 'bug', 'story'].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="field"><label htmlFor="ni-prio">Priority</label><select id="ni-prio" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{['low', 'medium', 'high', 'urgent'].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="field"><label htmlFor="ni-assignee">Assignee</label><select id="ni-assignee" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}><option value="">Unassigned</option>{members.map((m) => <option key={m.user} value={m.user}>{m.name}</option>)}</select></div>
          <div className="field"><label htmlFor="ni-sprint">Sprint</label><select id="ni-sprint" value={f.sprint} onChange={(e) => setF({ ...f, sprint: e.target.value })}><option value="">Backlog</option>{sprints.filter((s) => s.status !== 'completed').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        </div>
        <button className="btn brand">Create issue</button>
      </form>
    </Modal>
  );
}
