import { useState } from 'react';
import { api, list, useLoad } from '../api';
import { useAuth } from '../auth.jsx';
import { Avatar, ErrorBox } from '../components/ui.jsx';
import { useWorkspace } from '../workspace.jsx';

const ROLE_HELP = { owner: 'Everything, including billing', admin: 'Manage projects, members, webhooks', member: 'Create and edit issues, comment', viewer: 'Read only' };

export default function Members() {
  const { slug, can, role } = useWorkspace();
  const { user } = useAuth();
  const { data: members, reload } = useLoad(() => list(`/w/${slug}/members/`), [slug]);
  const [f, setF] = useState({ email: '', role: 'member' });
  const [error, setError] = useState(null);
  const run = async (fn) => { setError(null); try { await fn(); reload(); } catch (err) { setError(err); } };
  const roles = role === 'owner' ? ['owner', 'admin', 'member', 'viewer'] : ['admin', 'member', 'viewer'];

  return (
    <>
      <div className="page-head"><div><h1>Members</h1><p className="muted">Who can see and change this workspace</p></div></div>
      <ErrorBox error={error} slug={slug} role={role} />
      <table>
        <thead><tr><th>Person</th><th>Role</th><th /></tr></thead>
        <tbody>
          {members?.map((m) => (
            <tr key={m.id}>
              <td><span className="row"><Avatar name={m.name} size={28} /><span><b>{m.name}</b><br /><span className="muted small">{m.email}</span></span></span></td>
              <td>{can('admin') && m.user !== user.id ? (
                <select aria-label={`Role of ${m.name}`} style={{ width: 'auto' }} value={m.role} onChange={(e) => run(() => api(`/w/${slug}/members/${m.id}/`, { method: 'PATCH', body: { role: e.target.value } }))}>
                  {['owner', 'admin', 'member', 'viewer'].map((r) => <option key={r} value={r} disabled={!roles.includes(r)}>{r}</option>)}
                </select>) : <span className="tag">{m.role}</span>}</td>
              <td style={{ textAlign: 'right' }}>
                {m.user === user.id ? <button className="btn ghost sm" onClick={() => window.confirm('Leave this workspace?') && run(() => api(`/w/${slug}/members/${m.id}/`, { method: 'DELETE' }))}>Leave</button>
                  : can('admin') && <button className="btn danger sm" onClick={() => window.confirm(`Remove ${m.name}?`) && run(() => api(`/w/${slug}/members/${m.id}/`, { method: 'DELETE' }))}>Remove</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {can('admin') && (
        <form className="panel" style={{ marginTop: '1.2rem', maxWidth: 620 }} onSubmit={(e) => { e.preventDefault(); run(async () => { await api(`/w/${slug}/members/`, { method: 'POST', body: f }); setF({ ...f, email: '' }); }); }}>
          <h3>Add a person</h3>
          <p className="muted small">They need to have an account already (they can sign up first).</p>
          <div className="row">
            <input className="grow" type="email" required placeholder="email@company.com" aria-label="Email of the new member" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <select style={{ width: 'auto' }} aria-label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r}>{r}</option>)}</select>
            <button className="btn brand">Add</button>
          </div>
          <p className="muted small" style={{ marginTop: '.6rem' }}>{ROLE_HELP[f.role]}</p>
        </form>
      )}
    </>
  );
}
