import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  errMsg, mins, uploadVideo, useCreateLessonMutation, useCreateLiveMutation, useCreateQuizMutation, useDeleteCourseMutation,
  useDeleteLessonMutation, useDeleteQuizMutation, useEndLiveMutation, useGetCourseQuery, useGetLiveQuery, useGetQuizzesQuery,
  usePublishCourseMutation, useStartLiveMutation, useUpdateCourseMutation, useUpdateLessonMutation, api,
} from '../api';
import { useDispatch } from 'react-redux';
import { Alert, Progress } from '../components/ui.jsx';

const STATUS = { none: ['No video', ''], queued: ['Queued', 'warn'], processing: ['Processing…', 'warn'], ready: ['Ready', 'ok'], failed: ['Failed', 'bad'] };

function Details({ course }) {
  const [f, setF] = useState({ title: course.title, description: course.description, category: course.category, level: course.level, price: (course.priceCents / 100).toString() });
  const [save, { isLoading, error, isSuccess }] = useUpdateCourseMutation();
  return (
    <form className="panel" onSubmit={(e) => { e.preventDefault(); save({ id: course.id, title: f.title, description: f.description, category: f.category, level: f.level, priceCents: Math.round(Number(f.price) * 100) }); }}>
      <h2>Course details</h2>
      <Alert>{error && errMsg(error)}</Alert><Alert kind="ok">{isSuccess && 'Saved.'}</Alert>
      <div className="field"><label htmlFor="t">Title</label><input id="t" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="field"><label htmlFor="d">Description</label><textarea id="d" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="c">Category</label><input id="c" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></div>
        <div className="field"><label htmlFor="l">Level</label><select id="l" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option>beginner</option><option>intermediate</option><option>advanced</option></select></div>
      </div>
      <div className="field" style={{ maxWidth: 220 }}><label htmlFor="p">Price in USD (0 = free)</label><input id="p" type="number" min="0" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
      <button className="btn" disabled={isLoading}>Save details</button>
    </form>
  );
}

function LessonRow({ lesson }) {
  const token = useSelector((s) => s.auth.token);
  const dispatch = useDispatch();
  const [percent, setPercent] = useState(null);
  const [err, setErr] = useState('');
  const [del] = useDeleteLessonMutation();
  const [update] = useUpdateLessonMutation();
  const [label, tone] = STATUS[lesson.video.status];

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setErr(''); setPercent(0);
    try {
      await uploadVideo(lesson.id, file, token, setPercent);
      dispatch(api.util.invalidateTags(['Course'])); // refetch so the status shows "Queued"
    } catch (ex) { setErr(ex.message); }
    setPercent(null);
    e.target.value = '';
  };

  return (
    <div style={{ padding: '.8rem 0', borderTop: '1px solid var(--line)' }}>
      <div className="row between">
        <b>{lesson.order + 1}. {lesson.title}</b>
        <div className="row">
          <span className={`tag ${tone}`}>{label}</span>
          <span className="muted small">{mins(lesson.video.duration)}</span>
          <label className="row small" style={{ margin: 0, fontWeight: 400 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={lesson.isPreview} onChange={(e) => update({ id: lesson.id, isPreview: e.target.checked })} /> Free preview
          </label>
          <button className="btn danger sm" onClick={() => window.confirm('Delete this lesson?') && del(lesson.id)}>Delete</button>
        </div>
      </div>
      <div className="row" style={{ marginTop: '.5rem' }}>
        <input type="file" accept="video/*" onChange={onFile} disabled={percent !== null} style={{ maxWidth: 320 }} aria-label={`Upload video for ${lesson.title}`} />
        {percent !== null && <div style={{ width: 180 }}><Progress value={percent} /></div>}
      </div>
      <Alert>{err}</Alert>
      <Alert>{lesson.video.status === 'failed' && `Processing failed: ${lesson.video.error || 'unknown error'}. Upload the video again.`}</Alert>
    </div>
  );
}

function Lessons({ courseId, lessons }) {
  const [title, setTitle] = useState('');
  const [create, { error }] = useCreateLessonMutation();
  return (
    <div className="panel">
      <h2>Lessons</h2>
      <Alert>{error && errMsg(error)}</Alert>
      {lessons.length === 0 && <p className="muted">No lessons yet.</p>}
      {lessons.map((l) => <LessonRow key={l.id} lesson={l} />)}
      <form className="row" style={{ marginTop: '1rem' }} onSubmit={async (e) => { e.preventDefault(); const r = await create({ courseId, title }); if (r.data) setTitle(''); }}>
        <input style={{ maxWidth: 340 }} placeholder="New lesson title" aria-label="New lesson title" required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn">Add lesson</button>
      </form>
    </div>
  );
}

const blankQ = () => ({ text: '', options: ['', '', '', ''], correctIndex: 0 });

function Quizzes({ courseId }) {
  const { data } = useGetQuizzesQuery(courseId);
  const [create, { isLoading, error }] = useCreateQuizMutation();
  const [del] = useDeleteQuizMutation();
  const [title, setTitle] = useState('');
  const [passMark, setPassMark] = useState(60);
  const [qs, setQs] = useState([blankQ()]);
  const [localErr, setLocalErr] = useState('');

  const setQ = (i, patch) => setQs(qs.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const setOpt = (i, j, v) => setQ(i, { options: qs[i].options.map((o, k) => (k === j ? v : o)) });

  const submit = async (e) => {
    e.preventDefault();
    setLocalErr('');
    const questions = [];
    for (const [n, q] of qs.entries()) {
      if (!q.options[q.correctIndex].trim()) return setLocalErr(`Question ${n + 1}: the correct option is empty.`);
      const kept = q.options.map((o, idx) => ({ o: o.trim(), idx })).filter((x) => x.o);
      if (kept.length < 2) return setLocalErr(`Question ${n + 1}: give at least two options.`);
      questions.push({ text: q.text, options: kept.map((x) => x.o), correctIndex: kept.findIndex((x) => x.idx === q.correctIndex) });
    }
    const r = await create({ courseId, title, passMark: Number(passMark), questions });
    if (r.data) { setTitle(''); setQs([blankQ()]); }
  };

  return (
    <div className="panel">
      <h2>Quizzes</h2>
      {data?.quizzes.map((q) => (
        <div className="row between" key={q.id} style={{ padding: '.4rem 0', borderTop: '1px solid var(--line)' }}>
          <span>{q.title} <span className="muted small">{q.questions.length} questions, pass at {q.passMark}%</span></span>
          <button className="btn danger sm" onClick={() => window.confirm('Delete this quiz?') && del(q.id)}>Delete</button>
        </div>
      ))}
      <form onSubmit={submit} style={{ marginTop: '1rem' }}>
        <h3>Add a quiz</h3>
        <Alert>{localErr || (error && errMsg(error))}</Alert>
        <div className="grid2">
          <div className="field"><label htmlFor="qt">Quiz title</label><input id="qt" required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label htmlFor="qp">Pass mark (%)</label><input id="qp" type="number" min="1" max="100" value={passMark} onChange={(e) => setPassMark(e.target.value)} /></div>
        </div>
        {qs.map((q, i) => (
          <fieldset key={i} style={{ border: '1px solid var(--line)', borderRadius: 6, marginBottom: '.8rem' }}>
            <legend>Question {i + 1}</legend>
            <div className="field"><input aria-label={`Question ${i + 1} text`} placeholder="Question text" required value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} /></div>
            {q.options.map((o, j) => (
              <div className="row" key={j} style={{ marginBottom: '.4rem' }}>
                <input type="radio" style={{ width: 'auto' }} name={`correct-${i}`} checked={q.correctIndex === j} onChange={() => setQ(i, { correctIndex: j })} aria-label={`Option ${j + 1} is correct`} />
                <input style={{ flex: 1 }} placeholder={`Option ${j + 1}${j < 2 ? '' : ' (optional)'}`} aria-label={`Question ${i + 1} option ${j + 1}`} value={o} onChange={(e) => setOpt(i, j, e.target.value)} />
              </div>
            ))}
            <p className="muted small">Select the radio button next to the correct answer.</p>
            {qs.length > 1 && <button type="button" className="btn ghost sm" onClick={() => setQs(qs.filter((_, k) => k !== i))}>Remove question</button>}
          </fieldset>
        ))}
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => setQs([...qs, blankQ()])}>Add question</button>
          <button className="btn" disabled={isLoading}>Save quiz</button>
        </div>
      </form>
    </div>
  );
}

function LiveClasses({ courseId }) {
  const { data } = useGetLiveQuery(courseId);
  const [create, { error }] = useCreateLiveMutation();
  const [start] = useStartLiveMutation();
  const [end] = useEndLiveMutation();
  const [f, setF] = useState({ title: '', scheduledAt: '' });
  return (
    <div className="panel">
      <h2>Live classes</h2>
      <Alert>{error && errMsg(error)}</Alert>
      {data?.liveClasses.map((c) => (
        <div className="row between" key={c.id} style={{ padding: '.5rem 0', borderTop: '1px solid var(--line)' }}>
          <span>{c.title} <span className="muted small">{new Date(c.scheduledAt).toLocaleString()}</span> <span className={`tag ${c.status === 'live' ? 'ok' : ''}`}>{c.status}</span></span>
          <div className="row">
            {c.status === 'scheduled' && <button className="btn sm" onClick={() => start(c.id)}>Go live</button>}
            {c.status === 'live' && <><Link className="btn brand sm" to={`/live/${c.id}`}>Open room</Link><button className="btn danger sm" onClick={() => end(c.id)}>End</button></>}
            {c.status === 'scheduled' && <Link className="btn ghost sm" to={`/live/${c.id}`}>Preview room</Link>}
          </div>
        </div>
      ))}
      <form className="row" style={{ marginTop: '1rem', alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); const r = await create({ courseId, title: f.title, scheduledAt: new Date(f.scheduledAt).toISOString() }); if (r.data) setF({ title: '', scheduledAt: '' }); }}>
        <div><label htmlFor="lt">Title</label><input id="lt" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label htmlFor="ld">Date and time</label><input id="ld" type="datetime-local" required value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} /></div>
        <button className="btn">Schedule</button>
      </form>
    </div>
  );
}

export default function CourseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [poll, setPoll] = useState(0);
  const { data, isLoading, error } = useGetCourseQuery(id, { pollingInterval: poll });
  const [publish, publishState] = usePublishCourseMutation();
  const [remove, removeState] = useDeleteCourseMutation();

  // while any video is queued/processing, ask the server for updates every 4 seconds
  const busy = data?.lessons.some((l) => ['queued', 'processing'].includes(l.video.status));
  useEffect(() => setPoll(busy ? 4000 : 0), [busy]);

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <Alert>{errMsg(error)}</Alert>;
  const { course, lessons } = data;

  return (
    <div className="stack">
      <div className="row between">
        <div><Link to="/teach" className="small">← All courses</Link><h1>{course.title}</h1></div>
        <div className="row">
          <Link className="btn ghost" to={`/courses/${id}`}>Preview</Link>
          <button className={`btn ${course.published ? 'ghost' : 'brand'}`} disabled={publishState.isLoading} onClick={() => publish({ id, published: !course.published })}>{course.published ? 'Unpublish' : 'Publish'}</button>
        </div>
      </div>
      <Alert>{(publishState.error || removeState.error) && errMsg(publishState.error || removeState.error)}</Alert>
      <Details course={course} />
      <Lessons courseId={id} lessons={lessons} />
      <Quizzes courseId={id} />
      <LiveClasses courseId={id} />
      <div><button className="btn danger" onClick={async () => { if (window.confirm('Delete this course permanently?')) { const r = await remove(id); if (r.data) navigate('/teach'); } }}>Delete course</button></div>
    </div>
  );
}
