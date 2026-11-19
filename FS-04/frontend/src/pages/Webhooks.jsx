import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, list, useLoad } from '../api';
import { ErrorBox, Notice } from '../components/ui.jsx';
import { useWorkspace } from '../workspace.jsx';

const EVENTS = ['issue.created', 'issue.updated', 'issue.status_changed', 'issue.deleted', 'comment.created', 'comment.updated', 'comment.deleted',
  'attachment.created', 'attachment.deleted', 'project.created', 'project.updated', 'project.deleted', 'status.created', 'status.updated', 'status.deleted',
  'sprint.created', 'sprint.updated', 'sprint.deleted', 'sprint.started', 'sprint.completed', 'member.added', 'member.role_changed', 'member.removed',
  'billing.plan_changed', 'report.ready'];

function Deliveries({ slug, id }) {
  const { data } = useLoad(() => api(`/w/${slug}/webhooks/${id}/deliveries/`), [slug, id]);
  if (!data) return <p className="muted small">Loading…</p>;
  if (data.length === 0) return <p className="muted small">No deliveries yet.</p>;
  return (
    <table style={{ marginTop: '.5rem' }}>
      <thead><tr><th>Event</th><th>Result</th><th>Attempts</th><th>When</th></tr></thead>
      <tbody>{data.map((d) => <tr key={d.id}><td>{d.event}</td><td><span className={`tag ${d.status === 'success' ? 'ok' : d.status === 'failed' ? 'bad' : 'warn'}`}>{d.status}{d.response_status ? ` (${d.response_status})` : ''}</span></td><td>{d.attempts}</td><td className="small">{new Date(d.created_at).toLocaleString()}</td></tr>)}</tbody>
    </table>
  );
}

export default function Webhooks() {
  const { slug, can, role } = useWorkspace();
  const { data: hooks, reload } = useLoad(() => list(`/w/${slug}/webhooks/`), [slug]);
  const [f, setF] = useState({ url: '', description: '', all: true, events: [] });
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [show, setShow] = useState({});
  const [open, setOpen] = useState(null);
  if (!can('admin')) return <Navigate to={`/w/${slug}`} replace />;
  const run = async (fn, msg) => { setError(null); setInfo(null); try { await fn(); if (msg) setInfo(msg); reload(); } catch (err) { setError(err); } };
  const base = `/w/${slug}/webhooks/`;

  return (
    <>
      <div className="page-head"><div><h1>Webhooks</h1><p className="muted">Send events from this workspace to your own systems. Each request is signed with the secret (header <span className="code">X-PM-Signature</span>, HMAC-SHA256 of the body).</p></div></div>
      <ErrorBox error={error} slug={slug} role={role} /><Notice kind="info">{info}</Notice>
      <div className="stack">
        {hooks?.map((h) => (
          <div className="panel" key={h.id}>
            <div className="row between"><div><b className="code">{h.url}</b><div className="muted small">{h.events.includes('*') ? 'All events' : h.events.join(', ')}</div></div>
              <div className="row">
                <label className="row small" style={{ margin: 0 }}><input type="checkbox" checked={h.active} onChange={(e) => run(() => api(`${base}${h.id}/`, { method: 'PATCH', body: { active: e.target.checked } }))} /> Active</label>
                <button className="btn ghost sm" onClick={() => run(() => api(`${base}${h.id}/test/`, { method: 'POST' }), 'Test event queued. Open "Deliveries" in a moment to see the result.')}>Send test</button>
                <button className="btn ghost sm" onClick={() => setOpen(open === h.id ? null : h.id)}>Deliveries</button>
                <button className="btn danger sm" onClick={() => window.confirm('Delete this webhook?') && run(() => api(`${base}${h.id}/`, { method: 'DELETE' }))}>Delete</button></div></div>
            <div className="row small" style={{ marginTop: '.5rem' }}>Secret: <span className="code">{show[h.id] ? h.secret : '••••••••••••••••'}</span>
              <button className="btn ghost sm" onClick={() => setShow({ ...show, [h.id]: !show[h.id] })}>{show[h.id] ? 'Hide' : 'Show'}</button>
              <button className="btn ghost sm" onClick={() => window.confirm('Create a new secret? The old one stops working.') && run(() => api(`${base}${h.id}/rotate_secret/`, { method: 'POST' }))}>Rotate</button></div>
            {open === h.id && <Deliveries slug={slug} id={h.id} />}
          </div>
        ))}
        {hooks?.length === 0 && <p className="muted">No webhooks yet.</p>}
        <form className="panel" onSubmit={(e) => { e.preventDefault(); run(async () => { await api(base, { method: 'POST', body: { url: f.url, description: f.description, events: f.all ? ['*'] : f.events } }); setF({ ...f, url: '' }); }); }}>
          <h3>Add a webhook</h3>
          <div className="field"><label htmlFor="wh-url">Endpoint URL</label><input id="wh-url" type="url" required placeholder="https://example.com/hooks/trackwise" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></div>
          <label className="row" style={{ fontWeight: 500 }}><input type="checkbox" checked={f.all} onChange={(e) => setF({ ...f, all: e.target.checked })} /> Send every event</label>
          {!f.all && <div className="event-grid" style={{ marginBottom: '.8rem' }}>{EVENTS.map((ev) => <label key={ev}><input type="checkbox" checked={f.events.includes(ev)} onChange={() => setF({ ...f, events: f.events.includes(ev) ? f.events.filter((x) => x !== ev) : [...f.events, ev] })} /> {ev}</label>)}</div>}
          <button className="btn brand" disabled={!f.all && f.events.length === 0}>Add webhook</button>
        </form>
      </div>
    </>
  );
}
