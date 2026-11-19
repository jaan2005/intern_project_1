import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, money, useLoad } from '../api';
import { ErrorBox, Notice } from '../components/ui.jsx';
import { useWorkspace } from '../workspace.jsx';

const Usage = ({ label, used, limit }) => (
  <div className="field">
    <div className="row between small"><span>{label}</span><span>{used}{limit == null ? ' (unlimited)' : ` / ${limit}`}</span></div>
    <div className={`usage ${limit != null && used >= limit ? 'full' : ''}`}><i style={{ width: limit == null ? '8%' : `${Math.min(100, (used / limit) * 100)}%` }} /></div>
  </div>
);

export default function Billing() {
  const { slug, can, role, reloadWorkspace } = useWorkspace();
  const [params] = useSearchParams();
  const { data: b, reload } = useLoad(() => api(`/w/${slug}/billing/`), [slug]);
  const [error, setError] = useState(null);
  if (!can('admin')) return <Navigate to={`/w/${slug}`} replace />;
  const owner = role === 'owner';
  const run = async (fn) => { setError(null); try { await fn(); } catch (err) { setError(err); } };
  const upgrade = (plan) => run(async () => { const r = await api(`/w/${slug}/billing/checkout/`, { method: 'POST', body: { plan } }); window.location.href = r.url; });
  const cancel = () => window.confirm('Switch back to the Free plan?') && run(async () => { await api(`/w/${slug}/billing/cancel/`, { method: 'POST' }); reload(); reloadWorkspace(); });

  return (
    <>
      <div className="page-head"><div><h1>Plan and billing</h1><p className="muted">{owner ? 'Only owners can change the plan.' : 'You can see the plan. Only an owner can change it.'}</p></div></div>
      {params.get('checkout') === 'success' && <Notice>Payment received. Your plan is now {b?.plan_name}.</Notice>}
      <ErrorBox error={error} slug={slug} role={role} />
      {b && (
        <div className="stack">
          {b.billing_mode === 'mock' && <Notice kind="info"><b>Simulated billing (test mode).</b> Checkout uses a test card; no real payment is made.</Notice>}
          <div className="panel" style={{ maxWidth: 560 }}>
            <div className="row between"><h2>Current plan: {b.plan_name}</h2><span className={`tag ${b.status === 'active' ? 'ok' : 'warn'}`}>{b.status}</span></div>
            {b.current_period_end && <p className="muted small">Renews {new Date(b.current_period_end).toLocaleDateString()}</p>}
            <Usage label="Projects" used={b.usage.projects} limit={b.limits.max_projects} />
            <Usage label="Members" used={b.usage.members} limit={b.limits.max_members} />
            <p className="small">Webhooks: {b.limits.webhooks ? 'included' : 'not included'}</p>
            {owner && b.plan !== 'free' && <button className="btn ghost sm" onClick={cancel}>Cancel subscription</button>}
          </div>
          <div className="plans">
            {b.plans.map((p) => (
              <div key={p.key} className={`plan ${p.key === b.plan ? 'current' : ''}`}>
                <h3>{p.name}</h3><div className="price">{money(p.price_cents)}<span className="muted small">{p.price_cents ? ' / month' : ''}</span></div>
                <ul><li>{p.max_projects ?? 'Unlimited'} projects</li><li>{p.max_members ?? 'Unlimited'} members</li><li>{p.webhooks ? 'Webhooks' : 'No webhooks'}</li></ul>
                {p.key === b.plan ? <span className="tag brand">Your plan</span> : p.key !== 'free' && owner && <button className="btn brand" onClick={() => upgrade(p.key)}>Choose {p.name}</button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Stand-in for Stripe's hosted checkout page, used when no Stripe key is configured.
export function MockBilling() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const navigate = useNavigate();
  const { data, error } = useLoad(() => api(`/billing/mock/${sessionId}/`), [sessionId]);
  const [card, setCard] = useState('4242 4242 4242 4242');
  const [payError, setPayError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (error) return <div className="pad"><ErrorBox error={error} /></div>;
  if (!data) return <p className="muted pad">Loading checkout…</p>;
  const pay = async (e) => {
    e.preventDefault(); setBusy(true); setPayError(null);
    try { await api('/billing/mock/pay/', { method: 'POST', body: { session_id: sessionId, card_number: card } }); navigate(`/w/${data.workspace_slug}/billing?checkout=success`); }
    catch (err) { setPayError(err); setBusy(false); }
  };
  return (
    <div className="auth-form" style={{ minHeight: '100vh' }}>
      <form onSubmit={pay} className="panel stack" style={{ maxWidth: 440, width: '100%' }}>
        <Notice kind="info"><b>Simulated checkout.</b> Test mode: no real payment is made, and no real card should be entered.</Notice>
        <div><h1>{data.plan_name} plan</h1><p className="muted">For {data.workspace}</p><div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{money(data.price_cents)} <span className="muted small">/ month</span></div></div>
        <ErrorBox error={payError} />
        <div className="field"><label htmlFor="card">Card number</label><input id="card" inputMode="numeric" autoComplete="off" value={card} onChange={(e) => setCard(e.target.value)} /></div>
        <div className="grid2"><div className="field"><label htmlFor="exp">Expiry</label><input id="exp" defaultValue="12/34" /></div><div className="field"><label htmlFor="cvc">CVC</label><input id="cvc" defaultValue="123" /></div></div>
        <p className="muted small">Test cards: <b>4242 4242 4242 4242</b> succeeds, <b>4000 0000 0000 0002</b> is declined.</p>
        <div className="row"><button className="btn brand" disabled={busy || data.status === 'paid'}>{busy ? 'Processing…' : `Pay ${money(data.price_cents)}`}</button><a href={`/w/${data.workspace_slug}/billing`}>Cancel</a></div>
      </form>
    </div>
  );
}
