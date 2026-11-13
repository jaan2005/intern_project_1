import { useState } from 'react';
import { useGetCoursesQuery } from '../api';
import { Alert, CourseCard } from '../components/ui.jsx';

export default function Catalog() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useGetCoursesQuery({ search: q || undefined, page });

  return (
    <div className="stack">
      <div>
        <h1>Learn something you can use this week</h1>
        <p className="muted">Video courses, quizzes, live classes and certificates you can show to an employer.</p>
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search); }}>
        <input style={{ maxWidth: 360 }} placeholder="Search courses" aria-label="Search courses" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn">Search</button>
      </form>
      {error && <Alert>Could not load courses. Is the server running?</Alert>}
      {isLoading && <p className="muted">Loading…</p>}
      {data && data.courses.length === 0 && <p className="muted">No courses found.</p>}
      <div className="cards">{data?.courses.map((c) => <CourseCard key={c.id} c={c} />)}</div>
      {data?.pages > 1 && (
        <div className="row">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted small">Page {page} of {data.pages}</span>
          <button className="btn ghost sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
