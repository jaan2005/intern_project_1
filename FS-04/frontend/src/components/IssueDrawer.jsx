import { useState } from 'react';
import { api, download, list, useLoad } from '../api';
import { useAuth } from '../auth.jsx';
import { useWorkspace } from '../workspace.jsx';
import { Avatar, ErrorBox, Modal, TypeIcon } from './ui.jsx';

// Everything about one issue: edit fields, comments, attachments.
export default function IssueDrawer({ issueId, onClose, onChanged, members, sprints, statuses }) {
  const { slug, can, role } = useWorkspace();
  const { user } = useAuth();
  const base = `/w/${slug}`;
  const { data: issue, reload } = useLoad(() => api(`${base}/issues/${issueId}/`), [issueId]);
  const { data: comments, reload: reloadComments } = useLoad(() => list(`${base}/comments/?issue=${issueId}`), [issueId]);
  const { data: files, reload: reloadFiles } = useLoad(() => list(`${base}/attachments/?issue=${issueId}`), [issueId]);
  const [draft, setDraft] = useState({});
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const editable = can('member');

  if (!issue) return <Modal title="Issue" onClose={onClose} side><p className="muted">Loading…</p></Modal>;
  const v = (field) => (field in draft ? draft[field] : issue[field]) ?? '';
  const set = (field, value) => { setDraft({ ...draft, [field]: value }); setSaved(false); };
  const run = async (fn) => { setError(null); try { await fn(); } catch (err) { setError(err); } };

  const save = () => run(async () => {
    const body = { ...draft };
    for (const k of ['assignee', 'sprint', 'story_points', 'due_date']) if (k in body && body[k] === '') body[k] = null;
    if (Object.keys(body).length === 0) return;
    await api(`${base}/issues/${issueId}/`, { method: 'PATCH', body });
    setDraft({}); setSaved(true); reload(); onChanged();
  });
  const addComment = (e) => { e.preventDefault(); run(async () => { await api(`${base}/comments/`, { method: 'POST', body: { issue: issueId, body: text } }); setText(''); reloadComments(); }); };
  const upload = (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    run(async () => { const form = new FormData(); form.append('issue', issueId); form.append('file', file); await api(`${base}/attachments/`, { method: 'POST', form }); reloadFiles(); });
  };

  return (
    <Modal title={issue.key} onClose={onClose} side>
      <ErrorBox error={error} slug={slug} role={role} />
      <div className="drawer">
        <div className="stack">
          <div className="field"><label htmlFor="title">Title</label><input id="title" disabled={!editable} value={v('title')} onChange={(e) => set('title', e.target.value)} /></div>
          <div className="field"><label htmlFor="desc">Description</label><textarea id="desc" disabled={!editable} value={v('description')} onChange={(e) => set('description', e.target.value)} /></div>

          <section>
            <h3>Attachments</h3>
            {files?.length === 0 && <p className="muted small">No files yet.</p>}
            {files?.map((f) => (
              <div className="row between small" key={f.id} style={{ padding: '.25rem 0' }}>
                <button className="btn ghost sm" onClick={() => run(() => download(`${base}/attachments/${f.id}/download/`, f.filename))}>{f.filename}</button>
                <span className="muted">{(f.size / 1024).toFixed(1)} KB</span>
                {editable && <button className="btn danger sm" onClick={() => run(async () => { await api(`${base}/attachments/${f.id}/`, { method: 'DELETE' }); reloadFiles(); })}>Delete</button>}
              </div>
            ))}
            {editable && <div className="field" style={{ marginTop: '.5rem' }}><label htmlFor="file">Add a file (max 5 MB)</label><input id="file" type="file" onChange={upload} /></div>}
          </section>

          <section>
            <h3>Comments</h3>
            {comments?.length === 0 && <p className="muted small">No comments yet.</p>}
            {comments?.map((c) => (
              <div className="comment" key={c.id}>
                <div className="row between"><span className="row"><Avatar name={c.author_name} size={22} /><span className="who">{c.author_name}</span><span className="muted small">{new Date(c.created_at).toLocaleString()}</span></span>
                  {(c.author === user.id || can('admin')) && <button className="btn ghost sm" onClick={() => run(async () => { await api(`${base}/comments/${c.id}/`, { method: 'DELETE' }); reloadComments(); })}>Delete</button>}</div>
                <p style={{ whiteSpace: 'pre-wrap', margin: '.3rem 0 0' }}>{c.body}</p>
              </div>
            ))}
            {editable && <form onSubmit={addComment} style={{ marginTop: '.6rem' }}><label htmlFor="comment" className="small">Add a comment</label><textarea id="comment" required value={text} onChange={(e) => setText(e.target.value)} /><button className="btn brand sm" style={{ marginTop: '.4rem' }}>Comment</button></form>}
          </section>
        </div>

        <div>
          <div className="panel stack">
            <div className="row"><TypeIcon type={issue.type} /><span className="muted small">Reported by {issue.reporter_name || 'unknown'}</span></div>
            <div className="field"><label htmlFor="status">Status</label>
              <select id="status" disabled={!editable} value={v('status')} onChange={(e) => set('status', Number(e.target.value))}>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="field"><label htmlFor="assignee">Assignee</label>
              <select id="assignee" disabled={!editable} value={v('assignee')} onChange={(e) => set('assignee', e.target.value ? Number(e.target.value) : '')}><option value="">Unassigned</option>{members.map((m) => <option key={m.user} value={m.user}>{m.name}</option>)}</select></div>
            <div className="field"><label htmlFor="sprint">Sprint</label>
              <select id="sprint" disabled={!editable} value={v('sprint')} onChange={(e) => set('sprint', e.target.value ? Number(e.target.value) : '')}><option value="">Backlog (no sprint)</option>{sprints.filter((s) => s.status !== 'completed').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="grid2">
              <div className="field"><label htmlFor="type">Type</label><select id="type" disabled={!editable} value={v('type')} onChange={(e) => set('type', e.target.value)}>{['task', 'bug', 'story'].map((t) => <option key={t}>{t}</option>)}</select></div>
              <div className="field"><label htmlFor="priority">Priority</label><select id="priority" disabled={!editable} value={v('priority')} onChange={(e) => set('priority', e.target.value)}>{['low', 'medium', 'high', 'urgent'].map((t) => <option key={t}>{t}</option>)}</select></div>
              <div className="field"><label htmlFor="points">Story points</label><input id="points" type="number" min="0" disabled={!editable} value={v('story_points')} onChange={(e) => set('story_points', e.target.value === '' ? '' : Number(e.target.value))} /></div>
              <div className="field"><label htmlFor="due">Due date</label><input id="due" type="date" disabled={!editable} value={v('due_date')} onChange={(e) => set('due_date', e.target.value)} /></div>
            </div>
            {editable && <div className="row"><button className="btn brand" onClick={save} disabled={Object.keys(draft).length === 0}>Save changes</button>{saved && <span className="tag ok">Saved</span>}</div>}
            {can('admin') && <button className="btn danger sm" onClick={() => window.confirm('Delete this issue?') && run(async () => { await api(`${base}/issues/${issueId}/`, { method: 'DELETE' }); onChanged(); onClose(); })}>Delete issue</button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
