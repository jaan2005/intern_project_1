import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { errMsg, useLoginMutation, useRegisterMutation } from '../api';
import { setCredentials } from '../authSlice';
import { Alert } from '../components/ui.jsx';

function useAuthForm(mutationHook) {
  const [run, { isLoading, error }] = mutationHook();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const submit = async (body) => {
    const res = await run(body);
    if (res.data) {
      dispatch(setCredentials(res.data));
      navigate(res.data.user.role === 'student' ? '/my-learning' : '/teach');
    }
  };
  return { submit, isLoading, error };
}

export function Login() {
  const [f, setF] = useState({ email: '', password: '' });
  const { submit, isLoading, error } = useAuthForm(useLoginMutation);
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(f); }}>
      <h1>Log in</h1>
      <Alert>{error && errMsg(error)}</Alert>
      <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div className="field"><label htmlFor="p">Password</label><input id="p" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
      <button className="btn brand" disabled={isLoading}>Log in</button>
      <p className="muted small" style={{ marginTop: '1rem' }}>New here? <Link to="/register">Create an account</Link></p>
    </form>
  );
}

export function Register() {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'student' });
  const { submit, isLoading, error } = useAuthForm(useRegisterMutation);
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(f); }}>
      <h1>Create your account</h1>
      <Alert>{error && errMsg(error)}</Alert>
      <div className="field"><label htmlFor="n">Name</label><input id="n" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div className="field"><label htmlFor="p">Password (8+ characters)</label><input id="p" type="password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
      <div className="field">
        <label htmlFor="r">I want to</label>
        <select id="r" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="student">Learn (student)</option>
          <option value="instructor">Teach (instructor)</option>
        </select>
      </div>
      <button className="btn brand" disabled={isLoading}>Sign up</button>
    </form>
  );
}
