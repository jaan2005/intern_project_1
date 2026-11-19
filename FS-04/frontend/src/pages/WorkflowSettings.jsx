import { useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { api } from '../api';
import { ErrorBox } from '../components/ui.jsx';
import { useWorkspace } from '../workspace.jsx';

const CATEGORIES = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

// Admins design each project's own workflow: the columns, and which moves between them are allowed.
export default function WorkflowSettings() {
  const { slug, can, role } = useWorkspace();
  const { pid, statuses, reloadMeta } = useOutletContext();
  const [error, setError] = useState(null);
  const [f, setF] = useState({ name: '', category: 'in_progress' });
  if (!can('admin')) return <Navigate to={`/w/${slug}/projects/${pid}`} replace />;
  const base = `/w/${slug}/statuses/`;
  const run = async (fn) => { setError(null); try { await fn(); reloadMeta(); } catch (err) { setError(err); } };
  const toggleNext = (s, otherId) => {
    const next = s.next_statuses.includes(otherId) ? s.next_statuses.filter((x) => x !== otherId) : [...s.next_statuses, otherId];
    run(() => api(`${base}${s.id}/`, { method: 'PATCH', body: { next_statuses: next } }));
  };
  return (
    <>
      <p className="muted">Each column is a status. If you tick "can move to" for a status, issues in it may <b>only</b> move to the ticked ones. Leave all unticked to allow any move.</p>
      <ErrorBox error={error} slug={slug} role={role} />
      <div className="stack">
        {statuses.map((s) => (
          <div className="panel" key={s.id}>
            <div className="row between">
              <div className="row">
                <input aria-label={`Name of ${s.name}`} style={{ width: 180 }} defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && run(() => api(`${base}${s.id}/`, { method: 'PATCH', body: { name: e.target.value } }))} />
                <select aria-label={`Category of ${s.name}`} style={{ width: 'auto' }} value={s.category} onChange={(e) => run(() => api(`${base}${s.id}/`, { method: 'PATCH', body: { category: e.target.value } }))}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <label className="row small" style={{ margin: 0 }}>Order <input type="number" aria-label={`Order of ${s.name}`} style={{ width: 70 }} defaultValue={s.order} onBlur={(e) => Number(e.target.value) !== s.order && run(() => api(`${base}${s.id}/`, { method: 'PATCH', body: { order: Number(e.target.value) } }))} /></label>
              </div>
              <button className="btn danger sm" onClick={() => window.confirm(`Delete "${s.name}"?`) && run(() => api(`${base}${s.id}/`, { method: 'DELETE' }))}>Delete</button>
            </div>
            <div className="row small" style={{ marginTop: '.6rem' }}><span className="muted">Can move to:</span>
              {statuses.filter((o) => o.id !== s.id).map((o) => <label key={o.id} className="row" style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" checked={s.next_statuses.includes(o.id)} onChange={() => toggleNext(s, o.id)} /> {o.name}</label>)}
              {s.next_statuses.length === 0 && <span className="tag">any column</span>}</div>
          </div>
        ))}
        <form className="panel row" onSubmit={(e) => { e.preventDefault(); run(async () => { await api(base, { method: 'POST', body: { project: Number(pid), ...f } }); setF({ ...f, name: '' }); }); }}>
          <input className="grow" required placeholder="New column, e.g. In Review" aria-label="New status name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select style={{ width: 'auto' }} aria-label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="btn brand">Add column</button>
        </form>
      </div>
    </>
  );
}
