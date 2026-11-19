import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ErrorBox } from '../components/ui.jsx';

function AuthPage({ mode }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'register';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await (signup ? register(f) : login({ email: f.email, password: f.password })); navigate('/'); }
    catch (err) { setError(err); setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <section className="auth-hero">
        <div className="brand-mark"><i /> Trackwise</div>
        <h1>Plan work. Ship it together.</h1>
        <p>Boards, sprints and billing for every team, with each company's data kept completely separate.</p>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
          <ErrorBox error={error} />
          {signup && <div className="field"><label htmlFor="name">Your name</label><input id="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>}
          <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="field"><label htmlFor="password">Password{signup ? ' (8+ characters)' : ''}</label><input id="password" type="password" required minLength={signup ? 8 : 1} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          <button className="btn brand" disabled={busy}>{signup ? 'Sign up' : 'Log in'}</button>
          <p className="muted small" style={{ marginTop: '1rem' }}>{signup ? <>Already have an account? <Link to="/login">Log in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}</p>
        </form>
      </section>
    </div>
  );
}
export const Login = () => <AuthPage mode="login" />;
export const Register = () => <AuthPage mode="register" />;
