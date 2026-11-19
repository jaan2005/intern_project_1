import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { WorkspaceProvider } from './workspace.jsx';
import Shell from './components/Shell.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Home from './pages/Home.jsx';
import Projects from './pages/Projects.jsx';
import ProjectLayout from './pages/ProjectLayout.jsx';
import Board from './pages/Board.jsx';
import Backlog from './pages/Backlog.jsx';
import WorkflowSettings from './pages/WorkflowSettings.jsx';
import Members from './pages/Members.jsx';
import Activity from './pages/Activity.jsx';
import Webhooks from './pages/Webhooks.jsx';
import Reports from './pages/Reports.jsx';
import Billing, { MockBilling } from './pages/Billing.jsx';

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <p className="muted pad">Loading…</p>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/mock-billing" element={<RequireAuth><MockBilling /></RequireAuth>} />
      <Route path="/w/:slug" element={<RequireAuth><WorkspaceProvider><Shell /></WorkspaceProvider></RequireAuth>}>
        <Route index element={<Projects />} />
        <Route path="projects/:pid" element={<ProjectLayout />}>
          <Route index element={<Board />} />
          <Route path="backlog" element={<Backlog />} />
          <Route path="workflow" element={<WorkflowSettings />} />
        </Route>
        <Route path="members" element={<Members />} />
        <Route path="activity" element={<Activity />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="reports" element={<Reports />} />
        <Route path="billing" element={<Billing />} />
      </Route>
      <Route path="*" element={<p className="pad">Page not found.</p>} />
    </Routes>
  );
}
