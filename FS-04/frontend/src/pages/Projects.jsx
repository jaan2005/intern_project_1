import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, list, useLoad } from '../api';
import { ErrorBox, Modal } from '../components/ui.jsx';
import { useWorkspace } from '../workspace.jsx';

export default function Projects() {
  const { ws, slug, can, role } = useWorkspace();
  const { data: projects, loading, reload } = useLoad(() => list(`/w/${slug}/projects/`), [slug]);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: '', key: '', description: '' });
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault(); setError(null);
    try { await api(`/w/${slug}/projects/`, { method: 'POST', body: f }); setCreating(false); setF({ name: '', key: '', description: '' }); reload(); } catch (err) { setError(err); }
  };
  return (
    <>
      <div className="page-head"><div><h1>{ws.name}</h1><p className="muted">Projects in this workspace</p></div>
        {can('admin') && <button className="btn brand" onClick={() => setCreating(true)}>New project</button>}</div>
      {loading && <p className="muted">Loading…</p>}
      {projects?.length === 0 && <div className="panel"><p>No projects yet.{can('admin') ? ' Create the first one.' : ' An admin can create one.'}</p></div>}
      <div className="cards">
        {projects?.map((p) => (
          <Link key={p.id} to={`/w/${slug}/projects/${p.id}`} className="project-card">
            <span className="key">{p.key}</span><h3>{p.name}</h3><p className="muted small">{p.description || 'No description'}</p><span className="muted small">{p.issue_counter} issues created</span>
          </Link>
        ))}
      </div>
      {creating && (
        <Modal title="New project" onClose={() => setCreating(false)}>
          <form onSubmit={submit}>
            <ErrorBox error={error} slug={slug} role={role} />
            <div className="field"><label htmlFor="pn">Name</label><input id="pn" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="pk">Key (2-10 capital letters, used in issue numbers like WEB-12)</label><input id="pk" required value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toUpperCase() })} /></div>
            <div className="field"><label htmlFor="pd">Description</label><textarea id="pd" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
            <button className="btn brand">Create project</button>
          </form>
        </Modal>
      )}
    </>
  );
}
