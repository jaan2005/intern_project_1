import { useSelector } from 'react-redux';
import { errMsg, moneyZero, usePublishCourseMutation, useAdminCoursesQuery, useAdminStatsQuery, useAdminUsersQuery, useSetRoleMutation } from '../api';
import { Alert } from '../components/ui.jsx';

export default function Admin() {
  const me = useSelector((s) => s.auth.user);
  const stats = useAdminStatsQuery();
  const users = useAdminUsersQuery();
  const courses = useAdminCoursesQuery();
  const [setRole, roleState] = useSetRoleMutation();
  const [publish] = usePublishCourseMutation();
  const s = stats.data;

  return (
    <div className="stack">
      <h1>Admin</h1>
      {s && (
        <div className="row">
          <div className="stat"><span className="muted small">Students</span><b>{s.users.student || 0}</b></div>
          <div className="stat"><span className="muted small">Instructors</span><b>{s.users.instructor || 0}</b></div>
          <div className="stat"><span className="muted small">Courses (published)</span><b>{s.courses} ({s.publishedCourses})</b></div>
          <div className="stat"><span className="muted small">Enrollments</span><b>{s.enrollments}</b></div>
          <div className="stat"><span className="muted small">Platform revenue</span><b>{moneyZero(s.platformFeeCents)}</b></div>
        </div>
      )}
      <div className="panel">
        <h2>Users</h2>
        <Alert>{roleState.error && errMsg(roleState.error)}</Alert>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            {users.data?.users.map((u) => (
              <tr key={u.id}><td>{u.name}</td><td>{u.email}</td>
                <td><select aria-label={`Role for ${u.name}`} style={{ width: 'auto' }} value={u.role} disabled={u.id === me.id} onChange={(e) => setRole({ id: u.id, role: e.target.value })}>
                  <option>student</option><option>instructor</option><option>admin</option></select></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>All courses</h2>
        <table>
          <thead><tr><th>Title</th><th>Instructor</th><th>Status</th><th /></tr></thead>
          <tbody>
            {courses.data?.courses.map((c) => (
              <tr key={c.id}><td>{c.title}</td><td>{c.instructor?.name}</td>
                <td><span className={`tag ${c.published ? 'ok' : 'warn'}`}>{c.published ? 'Published' : 'Draft'}</span></td>
                <td>{c.published && <button className="btn danger sm" onClick={() => publish({ id: c.id, published: false })}>Unpublish</button>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
