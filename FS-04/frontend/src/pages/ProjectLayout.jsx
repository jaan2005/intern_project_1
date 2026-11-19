import { NavLink, Outlet, useParams } from 'react-router-dom';
import { api, list, useLoad } from '../api';
import { useWorkspace } from '../workspace.jsx';

// Loads everything a project page needs once (project, columns, sprints, people) and shares it with the tabs below.
export default function ProjectLayout() {
  const { slug, can } = useWorkspace();
  const { pid } = useParams();
  const { data, error, loading, reload } = useLoad(async () => {
    const base = `/w/${slug}`;
    const [project, statuses, sprints, members] = await Promise.all([
      api(`${base}/projects/${pid}/`), list(`${base}/statuses/?project=${pid}`), list(`${base}/sprints/?project=${pid}`), list(`${base}/members/`)]);
    return { project, statuses, sprints, members };
  }, [slug, pid]);

  if (loading && !data) return <p className="muted">Loading project…</p>;
  if (error) return <div className="alert err">{error.status === 404 ? 'Project not found in this workspace.' : error.message}</div>;
  const tab = ({ isActive }) => (isActive ? 'active' : '');
  return (
    <>
      <div className="page-head"><div><span className="key">{data.project.key}</span><h1>{data.project.name}</h1></div></div>
      <nav className="tabs">
        <NavLink end to={`/w/${slug}/projects/${pid}`} className={tab}>Board</NavLink>
        <NavLink to={`/w/${slug}/projects/${pid}/backlog`} className={tab}>Backlog and sprints</NavLink>
        {can('admin') && <NavLink to={`/w/${slug}/projects/${pid}/workflow`} className={tab}>Workflow</NavLink>}
      </nav>
      <Outlet context={{ ...data, pid, reloadMeta: reload }} />
    </>
  );
}
