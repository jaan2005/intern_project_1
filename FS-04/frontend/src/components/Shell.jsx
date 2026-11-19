import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, useLoad } from '../api';
import { useAuth } from '../auth.jsx';
import { useWorkspace } from '../workspace.jsx';
import { Avatar } from './ui.jsx';

export default function Shell() {
  const { ws, slug, can } = useWorkspace();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: workspaces } = useLoad(() => api('/workspaces/'), []);
  const link = ({ isActive }) => `nav ${isActive ? 'active' : ''}`;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-mark"><i /> Trackwise</div>
        <select aria-label="Switch workspace" value={slug} onChange={(e) => (e.target.value === '__new' ? navigate('/') : navigate(`/w/${e.target.value}`))}>
          {(workspaces || [{ slug, name: ws.name }]).map((w) => <option key={w.slug} value={w.slug}>{w.name}</option>)}
          <option value="__new">+ New or all workspaces…</option>
        </select>
        <NavLink to={`/w/${slug}`} end className={link}>Projects</NavLink>
        <NavLink to={`/w/${slug}/members`} className={link}>Members</NavLink>
        <NavLink to={`/w/${slug}/reports`} className={link}>Reports</NavLink>
        {can('admin') && <NavLink to={`/w/${slug}/activity`} className={link}>Activity log</NavLink>}
        {can('admin') && <NavLink to={`/w/${slug}/webhooks`} className={link}>Webhooks</NavLink>}
        {can('admin') && <NavLink to={`/w/${slug}/billing`} className={link}>Plan and billing <span className="tag brand" style={{ marginLeft: 4 }}>{ws.plan}</span></NavLink>}
        <div className="me">
          <Avatar name={user.name} size={30} />
          <div className="grow"><div>{user.name}</div><div className="small" style={{ color: 'var(--side-text)' }}>{ws.role}</div></div>
          <button className="btn ghost sm" style={{ color: '#fff', borderColor: '#3b5a53' }} onClick={() => { logout(); navigate('/login'); }}>Log out</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
