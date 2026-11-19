import { useEffect, useState } from 'react';
import { api, download, list, useLoad } from '../api';
import { ErrorBox } from '../components/ui.jsx';
import { useWorkspace } from '../workspace.jsx';

export default function Reports() {
  const { slug, can, role } = useWorkspace();
  const base = `/w/${slug}`;
  const { data: reports, reload } = useLoad(() => list(`${base}/reports/`), [slug]);
  const { data: lookups } = useLoad(async () => ({ projects: await list(`${base}/projects/`), sprints: await list(`${base}/sprints/`) }), [slug]);
  const [f, setF] = useState({ kind: 'sprint', target: '' });
  const [error, setError] = useState(null);

  // reports are built by a background worker: keep checking while any is still running
  const busy = reports?.some((r) => ['pending', 'running'].includes(r.status));
  useEffect(() => { if (!busy) return undefined; const t = setInterval(reload, 1500); return () => clearInterval(t); }, [busy, reload]);

  const create = async (e) => {
    e.preventDefault(); setError(null);
    try { await api(`${base}/reports/`, { method: 'POST', body: f.kind === 'sprint' ? { kind: 'sprint', sprint: Number(f.target) } : { kind: 'project', project: Number(f.target) } }); reload(); } catch (err) { setError(err); }
  };
  const options = f.kind === 'sprint' ? lookups?.sprints : lookups?.projects;
  const name = (r) => (r.kind === 'sprint' ? lookups?.sprints.find((s) => s.id === r.sprint)?.name : lookups?.projects.find((p) => p.id === r.project)?.name) || `#${r.id}`;

  return (
    <>
      <div className="page-head"><div><h1>Reports</h1><p className="muted">Generated in the background, then ready to download as CSV.</p></div></div>
      <ErrorBox error={error} slug={slug} role={role} />
      {can('member') && (
        <form className="panel row" style={{ marginBottom: '1.2rem' }} onSubmit={create}>
          <select style={{ width: 'auto' }} aria-label="Report type" value={f.kind} onChange={(e) => setF({ kind: e.target.value, target: '' })}><option value="sprint">Sprint report</option><option value="project">Project report</option></select>
          <select className="grow" aria-label="What to report on" required value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}><option value="">Choose…</option>{options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          <button className="btn brand">Generate report</button>
        </form>
      )}
      <table>
        <thead><tr><th>Report</th><th>Status</th><th>Summary</th><th /></tr></thead>
        <tbody>
          {reports?.map((r) => (
            <tr key={r.id}>
              <td><b>{r.kind === 'sprint' ? 'Sprint' : 'Project'}:</b> {name(r)}<div className="muted small">{new Date(r.created_at).toLocaleString()}</div></td>
              <td><span className={`tag ${r.status === 'done' ? 'ok' : r.status === 'failed' ? 'bad' : 'warn'}`}>{r.status}</span>{r.error && <div className="small muted">{r.error}</div>}</td>
              <td className="small">{r.status === 'done' && `${r.summary.done}/${r.summary.total} done (${r.summary.completion_percent}%), ${r.summary.points_done}/${r.summary.points_total} points`}</td>
              <td style={{ textAlign: 'right' }}>{r.status === 'done' && <button className="btn sm" onClick={() => download(`${base}/reports/${r.id}/download/`, `report-${r.id}.csv`).catch(setError)}>Download CSV</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {reports?.length === 0 && <p className="muted">No reports yet.</p>}
    </>
  );
}
