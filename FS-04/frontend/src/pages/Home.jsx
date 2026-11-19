import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, useLoad } from '../api';
import { useAuth } from '../auth.jsx';
import { ErrorBox } from '../components/ui.jsx';

// Pick one of my workspaces (companies), or create a new one.
export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data, loading } = useLoad(() => api('/workspaces/'), []);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [stay, setStay] = useState(false);

  if (loading) return <p className="muted pad">Loading…</p>;
  if (data?.length === 1 && !stay && !new URLSearchParams(window.location.search).has('all')) return <Navigate to={`/w/${data[0].slug}`} replace />;

  const create = async (e) => {
    e.preventDefault(); setError(null);
    try { const ws = await api('/workspaces/', { method: 'POST', body: { name } }); navigate(`/w/${ws.slug}`); } catch (err) { setError(err); }
  };
  return (
    <div className="auth-wrap">
      <section className="auth-hero"><div className="brand-mark"><i /> Trackwise</div><h1>Hi {user.name.split(' ')[0]}.</h1><p>A workspace is your company's private space. People only ever see the workspaces they belong to.</p></section>
      <section className="auth-form" style={{ alignItems: 'flex-start', paddingTop: '4rem' }}>
        <div style={{ width: '100%', maxWidth: 420 }} className="stack">
          <h2>Your workspaces</h2>
          {data?.length === 0 && <p className="muted">You are not in any workspace yet. Create one, or ask a colleague to add you by email.</p>}
          {data?.map((w) => <Link key={w.slug} to={`/w/${w.slug}`} className="panel row between" onClick={() => setStay(true)}><span><b>{w.name}</b></span><span className="row"><span className="tag">{w.role}</span><span className="tag brand">{w.plan}</span></span></Link>)}
          <form className="panel" onSubmit={create}>
            <h3>Create a workspace</h3>
            <ErrorBox error={error} />
            <div className="row"><input className="grow" placeholder="Company name" aria-label="Company name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /><button className="btn brand">Create</button></div>
          </form>
          <button className="btn ghost sm" onClick={() => { logout(); navigate('/login'); }}>Log out</button>
        </div>
      </section>
    </div>
  );
}
