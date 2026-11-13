import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { errMsg, moneyZero, useConfirmPaymentMutation, useMockPayMutation, useMockSessionQuery, useVerifyCertQuery } from '../api';
import { Alert } from '../components/ui.jsx';

// Stripe sends the buyer back here. We ask the server to check the payment and enroll the student.
export function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const [confirm, { data, error, isLoading }] = useConfirmPaymentMutation();
  const sent = useRef(false);
  useEffect(() => { if (sessionId && !sent.current) { sent.current = true; confirm(sessionId); } }, [sessionId, confirm]);

  return (
    <div className="form stack">
      <h1>Payment</h1>
      {isLoading && <p>Confirming your payment…</p>}
      {error && <Alert>{errMsg(error)}</Alert>}
      {data?.status === 'paid' && (<><Alert kind="ok">Payment received. You're enrolled!</Alert><Link className="btn brand" to={`/learn/${data.courseId}`}>Start learning</Link></>)}
      {data && data.status !== 'paid' && <Alert kind="info">Payment not completed yet. If you were charged, refresh in a moment.</Alert>}
    </div>
  );
}

// Public page: anyone can check that a certificate ID is real
export function Verify() {
  const { certId } = useParams();
  const { data, error, isLoading } = useVerifyCertQuery(certId);
  return (
    <div className="form stack">
      <h1>Certificate check</h1>
      {isLoading && <p>Checking…</p>}
      {error && <Alert>No certificate with ID {certId} exists.</Alert>}
      {data?.valid && (
        <Alert kind="ok">
          <b>Valid certificate.</b><br />{data.studentName} completed <b>{data.courseTitle}</b>, taught by {data.instructorName}, on {new Date(data.issuedAt).toLocaleDateString()}.
        </Alert>
      )}
    </div>
  );
}

// A stand-in for Stripe's hosted checkout page, used when no Stripe key is configured (see docs/INTEGRATIONS.md).
// It never handles real card data: only the test cards 4242... (approved) and 4000 0000 0000 0002 (declined) work.
export function MockCheckout() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const navigate = useNavigate();
  const { data, error, isLoading } = useMockSessionQuery(sessionId, { skip: !sessionId });
  const [pay, payState] = useMockPayMutation();
  const [card, setCard] = useState('4242 4242 4242 4242');

  if (!sessionId) return <Alert>Missing checkout session.</Alert>;
  if (isLoading) return <p className="muted">Loading checkout…</p>;
  if (error) return <Alert>{errMsg(error)}</Alert>;

  const submit = async (e) => {
    e.preventDefault();
    const r = await pay({ sessionId, cardNumber: card });
    if (r.data?.status === 'paid') navigate(`/payment/success?session_id=${sessionId}`);
  };

  return (
    <form className="form stack" onSubmit={submit}>
      <Alert kind="info"><b>Simulated checkout.</b> Test mode: no real payment is made and no real card should be entered.</Alert>
      <div>
        <h1>{data.courseTitle}</h1>
        <div className="price" style={{ fontSize: '1.7rem' }}>{moneyZero(data.amountCents)}</div>
      </div>
      <Alert>{payState.error && errMsg(payState.error)}</Alert>
      <div className="field"><label htmlFor="card">Card number</label><input id="card" inputMode="numeric" autoComplete="off" value={card} onChange={(e) => setCard(e.target.value)} /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="exp">Expiry</label><input id="exp" defaultValue="12/34" /></div>
        <div className="field"><label htmlFor="cvc">CVC</label><input id="cvc" defaultValue="123" /></div>
      </div>
      <p className="muted small">Test cards: <b>4242 4242 4242 4242</b> succeeds, <b>4000 0000 0000 0002</b> is declined.</p>
      <div className="row">
        <button className="btn brand" disabled={payState.isLoading || data.status === 'paid'}>{payState.isLoading ? 'Processing…' : `Pay ${moneyZero(data.amountCents)}`}</button>
        <Link to={data.courseId ? `/courses/${data.courseId}` : '/'}>Cancel</Link>
      </div>
    </form>
  );
}
