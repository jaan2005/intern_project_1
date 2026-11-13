import { useEffect, useRef } from 'react';
import { Link, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Hls from 'hls.js';
import { logout } from '../authSlice';
import { api, money } from '../api';

const COLORS = ['#2547d0', '#0f766e', '#b4308a', '#c2410c', '#4338ca', '#1d6f42'];
const colorOf = (s = '') => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

// Course "cover": a flat colour panel with the title's first letter. No image uploads needed.
export function Cover({ title = '?', label, large }) {
  return (
    <div className={`cover ${large ? 'lg' : ''}`} style={{ background: colorOf(title) }} aria-hidden="true">
      <b>{title.trim()[0]?.toUpperCase()}</b>
      <span>{label}</span>
    </div>
  );
}

export function CourseCard({ c }) {
  return (
    <Link to={`/courses/${c.id}`} className="card">
      <Cover title={c.title} label={c.category} />
      <div className="card-b">
        <h3>{c.title}</h3>
        <p className="muted small">{c.instructor?.name} · {c.level}{c.lessonCount != null ? ` · ${c.lessonCount} lessons` : ''}</p>
        <span className="price">{money(c.priceCents)}</span>
      </div>
    </Link>
  );
}

export const Alert = ({ kind = 'err', children }) => (children ? <div className={`alert ${kind}`} role={kind === 'err' ? 'alert' : 'status'}>{children}</div> : null);
export const Progress = ({ value }) => <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin="0" aria-valuemax="100"><i style={{ width: `${value}%` }} /></div>;

export function Nav() {
  const { user } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const out = () => { dispatch(logout()); dispatch(api.util.resetApiState()); navigate('/'); };
  const cls = ({ isActive }) => `link ${isActive ? 'active' : ''}`;
  return (
    <header className="nav">
      <div className="nav-in">
        <Link to="/" className="brand"><i />Lumen Academy</Link>
        <NavLink to="/" end className={cls}>Courses</NavLink>
        {user?.role === 'student' && <NavLink to="/my-learning" className={cls}>My learning</NavLink>}
        {(user?.role === 'instructor' || user?.role === 'admin') && <NavLink to="/teach" className={cls}>Teach</NavLink>}
        {user?.role === 'admin' && <NavLink to="/admin" className={cls}>Admin</NavLink>}
        <span className="spacer" />
        {user ? (
          <>
            <span className="who">{user.name} ({user.role})</span>
            <button className="btn ghost sm" style={{ color: '#fff', borderColor: '#5b6577' }} onClick={out}>Log out</button>
          </>
        ) : (
          <>
            <NavLink to="/login" className={cls}>Log in</NavLink>
            <Link to="/register" className="btn brand sm">Sign up</Link>
          </>
        )}
      </div>
    </header>
  );
}

// Route guard: send visitors to /login, and block roles that aren't allowed
export function RequireAuth({ roles, children }) {
  const { user } = useSelector((s) => s.auth);
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

// Plays an HLS stream. hls.js does the work in most browsers; Safari plays HLS natively.
export function VideoPlayer({ src, onEnded }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return undefined;
    let hls;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
    }
    return () => hls?.destroy();
  }, [src]);
  return <video ref={ref} controls onEnded={onEnded} />;
}
