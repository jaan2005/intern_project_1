import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errMsg, money, useCreateCourseMutation, useMyCoursesQuery } from '../api';
import { Alert } from '../components/ui.jsx';

export default function Teach() {
  const { data, isLoading } = useMyCoursesQuery();
  const [create, { isLoading: creating, error }] = useCreateCourseMutation();
  const navigate = useNavigate();
  const [f, setF] = useState({ title: '', category: 'General', level: 'beginner', price: '0' });

  const submit = async (e) => {
    e.preventDefault();
    const r = await create({ title: f.title, category: f.category, level: f.level, priceCents: Math.round(Number(f.price) * 100) });
    if (r.data) navigate(`/teach/courses/${r.data.course.id}`);
  };

  return (
    <div className="stack">
      <div className="row between"><h1>Teach</h1><Link className="btn ghost" to="/teach/earnings">Earnings</Link></div>

      <div className="panel">
        <h2>Your courses</h2>
        {isLoading && <p className="muted">Loading…</p>}
        {data?.courses.length === 0 && <p className="muted">No courses yet. Create your first one below.</p>}
        {data?.courses.length > 0 && (
          <table>
            <thead><tr><th>Title</th><th>Status</th><th>Lessons</th><th>Students</th><th>Price</th></tr></thead>
            <tbody>
              {data.courses.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/teach/courses/${c.id}`}>{c.title}</Link></td>
                  <td><span className={`tag ${c.published ? 'ok' : 'warn'}`}>{c.published ? 'Published' : 'Draft'}</span></td>
                  <td>{c.lessonCount}</td><td>{c.studentCount}</td><td>{money(c.priceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form className="form" onSubmit={submit}>
        <h2>New course</h2>
        <Alert>{error && errMsg(error)}</Alert>
        <div className="field"><label htmlFor="t">Title</label><input id="t" required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="c">Category</label><input id="c" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></div>
          <div className="field"><label htmlFor="l">Level</label>
            <select id="l" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option>beginner</option><option>intermediate</option><option>advanced</option></select>
          </div>
        </div>
        <div className="field"><label htmlFor="p">Price in USD (0 = free)</label><input id="p" type="number" min="0" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
        <button className="btn brand" disabled={creating}>Create and add lessons</button>
      </form>
    </div>
  );
}
