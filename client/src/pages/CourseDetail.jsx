import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { errMsg, mins, money, useCheckoutMutation, useEnrollFreeMutation, useGetCourseQuery } from '../api';
import { Alert, Cover, Progress } from '../components/ui.jsx';

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const { data, isLoading, error } = useGetCourseQuery(id);
  const [enroll, enrollState] = useEnrollFreeMutation();
  const [checkout, checkoutState] = useCheckoutMutation();

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <Alert>{errMsg(error)}</Alert>;
  const { course, lessons, quizCount, enrollment, isOwner } = data;
  const free = course.priceCents === 0;

  const buy = async () => {
    if (!user) return navigate('/login');
    if (free) {
      const r = await enroll(id);
      if (r.data) navigate(`/learn/${id}`);
    } else {
      const r = await checkout(id);
      if (r.data?.url) window.location.href = r.data.url; // Stripe-hosted checkout page
    }
  };

  return (
    <div className="stack">
      <Cover title={course.title} label={course.category} large />
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>{course.title}</h1>
          <p className="muted">By {course.instructor?.name} · {course.level} · {lessons.length} lessons{quizCount ? ` · ${quizCount} quiz${quizCount > 1 ? 'zes' : ''}` : ''}</p>
          {!course.published && <span className="tag warn">Draft (only you can see this)</span>}
        </div>
        <div className="panel" style={{ minWidth: 250 }}>
          <div className="price" style={{ fontSize: '1.7rem' }}>{money(course.priceCents)}</div>
          <Alert>{(enrollState.error || checkoutState.error) && errMsg(enrollState.error || checkoutState.error)}</Alert>
          {isOwner ? (
            <Link className="btn" to={`/teach/courses/${id}`}>Edit course</Link>
          ) : enrollment ? (
            <div className="stack">
              <Progress value={enrollment.progress} />
              <Link className="btn brand" to={`/learn/${id}`}>{enrollment.completed ? 'Review course' : 'Continue learning'}</Link>
            </div>
          ) : (
            <button className="btn brand" onClick={buy} disabled={enrollState.isLoading || checkoutState.isLoading}>
              {free ? 'Enroll for free' : 'Buy this course'}
            </button>
          )}
        </div>
      </div>
      <div className="panel">
        <h2>About this course</h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>{course.description || 'No description yet.'}</p>
      </div>
      <div className="panel">
        <h2>Lessons</h2>
        <ol style={{ paddingLeft: '1.2rem', margin: 0 }}>
          {lessons.map((l) => (
            <li key={l.id} style={{ padding: '.3rem 0' }}>
              {l.title} {l.isPreview && <span className="tag ok">Free preview</span>} <span className="muted small">{mins(l.video.duration)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
