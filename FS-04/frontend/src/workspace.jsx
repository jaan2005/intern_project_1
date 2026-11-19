import { createContext, useContext } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { ROLE_RANK, api, useLoad } from './api';

const WorkspaceCtx = createContext(null);
export const useWorkspace = () => useContext(WorkspaceCtx);

// Loads the current workspace (and my role in it) once; every page below can ask "can I do this?"
export function WorkspaceProvider({ children }) {
  const { slug } = useParams();
  const { data: ws, error, loading, reload } = useLoad(() => api(`/w/${slug}/`), [slug]);
  if (loading && !ws) return <p className="muted pad">Loading workspace…</p>;
  if (error) return <div className="pad"><div className="alert err">{error.status === 404 ? 'This workspace does not exist, or you are not a member of it.' : error.message}</div><Link to="/">Back to my workspaces</Link></div>;
  const can = (minRole) => ROLE_RANK[ws.role] >= ROLE_RANK[minRole];
  return <WorkspaceCtx.Provider value={{ ws, slug, role: ws.role, can, reloadWorkspace: reload }}>{children ?? <Outlet />}</WorkspaceCtx.Provider>;
}
