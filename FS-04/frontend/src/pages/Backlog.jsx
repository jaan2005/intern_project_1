import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, list, useLoad } from '../api';
import IssueDrawer from '../components/IssueDrawer.jsx';
import { Avatar, ErrorBox, Priority, TypeIcon } from '../components/ui.jsx';
import { useWorkspace } from '../workspace.jsx';
import { NewIssue } from './Board.jsx';

export default function Backlog() {
  const { slug, can, role } = useWorkspace();
  const { pid, sprints, members, statuses, reloadMeta } = useOutletContext();
  const { data: issues, reload } = useLoad(() => list(`/w/${slug}/issues/?project=${pid}`), [slug, pid]);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const run = async (fn) => { setError(null); try { await fn(); reload(); reloadMeta(); } catch (err) { setError(err); } };
  const base = `/w/${slug}`;

  const Section = ({ title, sub, tag, items, actions, sprintId }) => (
    <div className="panel" style={{ marginBottom: '1rem' }}>
      <div className="row between"><div><h3>{title} {tag}</h3>{sub && <p className="muted small">{sub}</p>}</div><div className="row">{actions}</div></div>
      {items.length === 0 ? <p className="muted small">No issues here.</p> : (
        <table style={{ marginTop: '.4rem' }}>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td style={{ width: 26 }}><TypeIcon type={i.type} /></td>
                <td style={{ width: 80 }}><span className="key">{i.key}</span></td>
                <td><button className="btn ghost sm" style={{ border: 0, padding: 0, fontWeight: 500 }} onClick={() => setOpenId(i.id)}>{i.title}</button></td>
                <td><Priority value={i.priority} /></td>
                <td><span className="tag">{i.status_name}</span></td>
                <td><Avatar name={i.assignee_name} size={22} /></td>
                <td style={{ width: 170 }}>{can('member') && (
                  <select aria-label={`Sprint for ${i.key}`} value={i.sprint || ''} onChange={(e) => run(() => api(`${base}/issues/${i.id}/`, { method: 'PATCH', body: { sprint: e.target.value ? Number(e.target.value) : null } }))}>
                    <option value="">Backlog</option>{sprints.filter((s) => s.status !== 'completed').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const open = sprints.filter((s) => s.status !== 'completed');
  const done = sprints.filter((s) => s.status === 'completed');
  return (
    <>
      <div className="row between" style={{ marginBottom: '1rem' }}>
        {can('admin') ? (
          <form className="row" onSubmit={(e) => { e.preventDefault(); run(async () => { await api(`${base}/sprints/`, { method: 'POST', body: { project: Number(pid), name } }); setName(''); }); }}>
            <input placeholder="New sprint name" aria-label="New sprint name" required value={name} onChange={(e) => setName(e.target.value)} /><button className="btn">Add sprint</button>
          </form>) : <span />}
        {can('member') && <button className="btn brand" onClick={() => setCreating(true)}>Create issue</button>}
      </div>
      <ErrorBox error={error} slug={slug} role={role} />
      {open.map((s) => (
        <Section key={s.id} title={s.name} sprintId={s.id}
          tag={<span className={`tag ${s.status === 'active' ? 'ok' : ''}`}>{s.status}</span>}
          sub={[s.goal, s.start_date && `${s.start_date} to ${s.end_date || '?'}`].filter(Boolean).join(' · ')}
          items={(issues || []).filter((i) => i.sprint === s.id)}
          actions={can('admin') && (s.status === 'planned'
            ? <button className="btn sm" onClick={() => run(() => api(`${base}/sprints/${s.id}/start/`, { method: 'POST' }))}>Start sprint</button>
            : <button className="btn sm" onClick={() => window.confirm('Complete this sprint? Unfinished issues return to the backlog.') && run(() => api(`${base}/sprints/${s.id}/complete/`, { method: 'POST' }))}>Complete sprint</button>)} />
      ))}
      <Section title="Backlog" sub="Issues not in any sprint" items={(issues || []).filter((i) => !i.sprint)} />
      {done.length > 0 && <p className="muted small">Completed sprints: {done.map((s) => s.name).join(', ')}</p>}
      {openId && <IssueDrawer issueId={openId} onClose={() => setOpenId(null)} onChanged={reload} members={members} sprints={sprints} statuses={statuses} />}
      {creating && <NewIssue pid={pid} slug={slug} role={role} members={members} sprints={sprints} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); reloadMeta(); }} />}
    </>
  );
}
