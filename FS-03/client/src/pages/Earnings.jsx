import { Link } from 'react-router-dom';
import { moneyZero, useEarningsQuery } from '../api';

export default function Earnings() {
  const { data, isLoading } = useEarningsQuery();
  if (isLoading) return <p className="muted">Loading…</p>;
  if (!data) return <p>Could not load earnings.</p>;
  const { totals, byCourse, byMonth, recent } = data;
  const max = Math.max(1, ...byMonth.map((m) => m.net));

  return (
    <div className="stack">
      <div><Link to="/teach" className="small">← Teach</Link><h1>Earnings</h1></div>
      <div className="row">
        <div className="stat"><span className="muted small">Your earnings</span><b>{moneyZero(totals.netCents)}</b></div>
        <div className="stat"><span className="muted small">Gross sales</span><b>{moneyZero(totals.grossCents)}</b></div>
        <div className="stat"><span className="muted small">Platform fee</span><b>{moneyZero(totals.platformFeeCents)}</b></div>
        <div className="stat"><span className="muted small">Sales</span><b>{totals.sales}</b></div>
      </div>

      <div className="panel">
        <h2>By month</h2>
        {byMonth.length === 0 ? <p className="muted">No sales yet.</p> : (
          <div className="months">
            {byMonth.map((m) => (
              <div key={m.month} title={`${m.month}: ${moneyZero(m.net)}`}><i style={{ height: `${(m.net / max) * 100}%` }} />{m.month}</div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>By course</h2>
        {byCourse.length === 0 ? <p className="muted">Nothing to show yet.</p> : (
          <table><thead><tr><th>Course</th><th>Sales</th><th>Gross</th><th>Your share</th></tr></thead>
            <tbody>{byCourse.map((c) => <tr key={c.courseId}><td>{c.title}</td><td>{c.sales}</td><td>{moneyZero(c.gross)}</td><td>{moneyZero(c.net)}</td></tr>)}</tbody></table>
        )}
      </div>

      <div className="panel">
        <h2>Recent sales</h2>
        {recent.length === 0 ? <p className="muted">No sales yet. Buy a course with Stripe test card 4242 4242 4242 4242 to see one here.</p> : (
          <table><thead><tr><th>Date</th><th>Student</th><th>Course</th><th>You earned</th></tr></thead>
            <tbody>{recent.map((r) => <tr key={r.id}><td>{new Date(r.paidAt).toLocaleDateString()}</td><td>{r.student}</td><td>{r.course}</td><td>{moneyZero(r.netCents)}</td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}
