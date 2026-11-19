import { useState } from 'react';
import { list, useLoad } from '../api';
import { Avatar } from '../components/ui.jsx';
import { useWorkspace } from '../workspace.jsx';

const describe = (e) => {
  const verb = e.action.split('.').slice(1).join(' ').replace('_', ' ');
  return `${verb} ${e.target_type}`;
};
const changeText = (changes) => Object.entries(changes || {}).filter(([k]) => !k.startsWith('returned')).map(([k, v]) => (Array.isArray(v) ? `${k.replace('_id', '')}: ${v[0] ?? '–'} → ${v[1] ?? '–'}` : `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)).slice(0, 4).join(' · ');

export default function Activity() {
  const { slug } = useWorkspace();
  const [type, setType] = useState('');
  const { data: entries, loading } = useLoad(() => list(`/w/${slug}/audit/${type ? `?target_type=${type}` : ''}`), [slug, type]);
  return (
    <>
      <div className="page-head"><div><h1>Activity log</h1><p className="muted">Every change in this workspace: who did what, and when. Visible to admins and owners.</p></div>
        <select style={{ width: 'auto' }} aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Everything</option>{['issue', 'comment', 'project', 'sprint', 'status', 'member', 'webhook', 'subscription'].map((t) => <option key={t}>{t}</option>)}
        </select></div>
      {loading && <p className="muted">Loading…</p>}
      <ul className="timeline">
        {entries?.map((e) => (
          <li key={e.id}>
            <div className="row"><Avatar name={e.actor_name || 'System'} size={22} /><b>{e.actor_name || 'System'}</b><span>{describe(e)}</span><b>{e.target_label}</b></div>
            {changeText(e.changes) && <div className="muted small">{changeText(e.changes)}</div>}
            <div className="muted small">{new Date(e.created_at).toLocaleString()}</div>
          </li>
        ))}
      </ul>
      {entries?.length === 0 && <p className="muted">Nothing here yet.</p>}
    </>
  );
}
