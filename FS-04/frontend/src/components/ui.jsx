import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const HUES = [172, 215, 265, 330, 25, 45, 150, 195];
export const initials = (name = '?') => name.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export function Avatar({ name, size = 24 }) {
  if (!name) return <span className="avatar empty" style={{ width: size, height: size }} title="Unassigned" />;
  const hue = HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  return <span className="avatar" title={name} style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 45% 38%)` }}>{initials(name)}</span>;
}

// Shows API errors. A 402 means "your plan does not allow this" and gets an upgrade link.
export function ErrorBox({ error, slug, role }) {
  if (!error) return null;
  const limit = error.status === 402;
  return (
    <div className={`alert ${limit ? 'warn' : 'err'}`} role="alert">
      {error.message}{' '}
      {limit && (role === 'owner' ? <Link to={`/w/${slug}/billing`}>Upgrade your plan</Link> : <span>Ask the workspace owner to upgrade.</span>)}
    </div>
  );
}
export const Notice = ({ kind = 'ok', children }) => (children ? <div className={`alert ${kind}`} role="status">{children}</div> : null);

export function Modal({ title, onClose, children, wide, side }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''} ${side ? 'side' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export const TypeIcon = ({ type }) => <span className={`type type-${type}`} title={type}>{type[0].toUpperCase()}</span>;
export const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
export const Priority = ({ value }) => <span className={`prio prio-${value}`}>{PRIORITY_LABEL[value]}</span>;
