import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  downloadCertificate, errMsg, useAttemptQuizMutation, useCompleteLessonMutation, useGetCourseQuery, useGetLessonQuery,
  useGetLiveQuery, useGetQuizzesQuery, useMyCertsQuery,
} from '../api';
import { Alert, Progress, VideoPlayer } from '../components/ui.jsx';

function Quiz({ quiz, review }) {
  const [answers, setAnswers] = useState({});
  const [attempt, { data: result, isLoading, error, reset }] = useAttemptQuizMutation();
  const submit = () => attempt({ id: quiz.id, answers: quiz.questions.map((_, i) => answers[i] ?? null) });

  return (
    <div className="panel" style={{ marginTop: '1rem' }}>
      <div className="row between">
        <h3>{quiz.title}</h3>
        {!review && (quiz.passed ? <span className="tag ok">Passed (best {quiz.bestScore}%)</span> : quiz.attempts > 0 ? <span className="tag warn">Best {quiz.bestScore}%, need {quiz.passMark}%</span> : <span className="tag">Pass mark {quiz.passMark}%</span>)}
      </div>
      <Alert>{error && errMsg(error)}</Alert>
      {result && (
        <Alert kind={result.passed ? 'ok' : 'info'}>
          You scored {result.score}% ({result.correctCount}/{result.total}). {result.passed ? 'Passed!' : `You need ${result.passMark}% to pass. Try again.`}
          {result.courseCompleted && ' You completed the course. Your certificate is ready.'}
        </Alert>
      )}
      {quiz.questions.map((q, i) => (
        <div className="q" key={q.id}>
          <b>{i + 1}. {q.text}</b>
          {q.options.map((o, j) => {
            const r = result?.results[i];
            const cls = r ? (j === r.correctIndex ? 'right' : j === r.chosen ? 'wrong' : '') : '';
            return (
              <label className={`opt ${cls}`} key={j}>
                <input type="radio" name={`${quiz.id}-${i}`} disabled={!!result || review} checked={answers[i] === j} onChange={() => setAnswers({ ...answers, [i]: j })} /> {o}
              </label>
            );
          })}
        </div>
      ))}
      {!review && (result
        ? <button className="btn ghost" onClick={() => { reset(); setAnswers({}); }}>Try again</button>
        : <button className="btn brand" disabled={isLoading} onClick={submit}>Submit answers</button>)}
    </div>
  );
}

export default function Learn() {
  const { id } = useParams();
  const { token } = useSelector((s) => s.auth);
  // refetch on open: right after enrolling, the cached copy still says "not enrolled"
  const { data, isLoading, isFetching, error } = useGetCourseQuery(id, { refetchOnMountOrArgChange: true });
  const quizzes = useGetQuizzesQuery(id, { skip: !data });
  const live = useGetLiveQuery(id, { skip: !data });
  const certs = useMyCertsQuery();
  const [complete, completeState] = useCompleteLessonMutation();
  const [current, setCurrent] = useState(null);
  const [dlError, setDlError] = useState('');

  // start on the first lesson that isn't finished yet
  useEffect(() => {
    if (data && !current && data.lessons.length) {
      const done = data.enrollment?.completedLessons || [];
      setCurrent((data.lessons.find((l) => !done.includes(l.id)) || data.lessons[0]).id);
    }
  }, [data, current]);

  const lesson = useGetLessonQuery(current, { skip: !current });

  // wait for fresh data before deciding the student isn't enrolled (but don't flash a spinner on later refetches)
  if (isLoading || (isFetching && !data?.enrollment && !data?.isOwner)) return <p className="muted">Loading…</p>;
  if (error) return <Alert>{errMsg(error)}</Alert>;
  if (!data.enrollment && !data.isOwner) return <Navigate to={`/courses/${id}`} replace />;

  const { course, lessons, enrollment } = data;
  const done = enrollment?.completedLessons || [];
  const cert = certs.data?.certificates.find((c) => c.course === id);
  const l = lesson.data?.lesson;

  return (
    <div className="stack">
      <div className="row between">
        <div><Link to={`/courses/${id}`} className="small">← {course.title}</Link><h1>{l?.title || course.title}</h1></div>
        {cert && <button className="btn brand" onClick={() => downloadCertificate(cert.certificateId, token).catch((e) => setDlError(e.message))}>Download certificate</button>}
      </div>
      <Alert>{dlError}</Alert>
      <div className="learn">
        <div>
          <div className="player">
            {l?.video.url ? <VideoPlayer src={l.video.url} /> : lesson.isFetching ? 'Loading…' : l ? <span>{l.video.status === 'ready' || l.video.status === 'none' ? 'No video for this lesson yet.' : 'This video is still being processed.'}</span> : <span>{lesson.error ? errMsg(lesson.error) : 'Select a lesson'}</span>}
          </div>
          {l && (
            <div className="stack" style={{ marginTop: '1rem' }}>
              {l.description && <p style={{ whiteSpace: 'pre-wrap' }}>{l.description}</p>}
              {enrollment && (done.includes(l.id)
                ? <span className="tag ok">Lesson completed</span>
                : <button className="btn" disabled={completeState.isLoading} onClick={() => complete(l.id)}>Mark as complete</button>)}
            </div>
          )}

          {live.data?.liveClasses.length > 0 && (
            <div className="panel" style={{ marginTop: '1.5rem' }}>
              <h2>Live classes</h2>
              {live.data.liveClasses.map((c) => (
                <div className="row between" key={c.id} style={{ padding: '.4rem 0' }}>
                  <span>{c.title} <span className="muted small">{new Date(c.scheduledAt).toLocaleString()}</span></span>
                  {c.status === 'live' ? <Link className="btn brand sm" to={`/live/${c.id}`}>Join now</Link> : <span className="tag">Not started</span>}
                </div>
              ))}
            </div>
          )}

          {quizzes.data?.quizzes.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h2>Quizzes</h2>
              {quizzes.data.quizzes.map((q) => <Quiz key={q.id} quiz={q} review={data.isOwner} />)}
            </div>
          )}
        </div>

        <aside className="panel">
          {enrollment && <><div className="row between small"><b>Your progress</b><span>{enrollment.progress}%</span></div><Progress value={enrollment.progress} /></>}
          <ul className="lessons" style={{ marginTop: '1rem' }}>
            {lessons.map((x) => (
              <li key={x.id} className={x.id === current ? 'on' : ''}>
                <button onClick={() => setCurrent(x.id)}><span className={`tick ${done.includes(x.id) ? 'done' : ''}`} /> {x.title}</button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
