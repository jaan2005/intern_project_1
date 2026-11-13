import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { downloadCertificate, useMyCertsQuery, useMyEnrollmentsQuery } from '../api';
import { Cover, Progress } from '../components/ui.jsx';

export default function MyLearning() {
  const { token } = useSelector((s) => s.auth);
  const { data, isLoading } = useMyEnrollmentsQuery();
  const certs = useMyCertsQuery();

  return (
    <div className="stack">
      <h1>My learning</h1>
      {isLoading && <p className="muted">Loading…</p>}
      {data?.enrollments.length === 0 && <p className="muted">You haven't enrolled in anything yet. <Link to="/">Browse courses</Link>.</p>}
      <div className="cards">
        {data?.enrollments.map((e) => {
          const cert = certs.data?.certificates.find((c) => c.course === e.course.id);
          return (
            <div className="card" key={e.id}>
              <Cover title={e.course.title} label={e.course.category} />
              <div className="card-b stack">
                <h3>{e.course.title}</h3>
                <Progress value={e.progress} />
                <div className="row">
                  <Link className="btn brand sm" to={`/learn/${e.course.id}`}>{e.progress === 0 ? 'Start' : 'Continue'}</Link>
                  {cert && <button className="btn ghost sm" onClick={() => downloadCertificate(cert.certificateId, token)}>Certificate</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
