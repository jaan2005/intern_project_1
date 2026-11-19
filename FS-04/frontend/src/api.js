import { useCallback, useEffect, useState } from 'react';

export const TOKEN_KEY = 'pm_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);

function message(data) {
  if (!data) return 'Something went wrong. Is the server running?';
  if (typeof data === 'string') return data;
  if (data.detail) return data.detail;
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join(' · ');
}

export class ApiError extends Error {
  constructor(status, data) { super(message(data)); this.status = status; this.data = data; }
}

// One function for every server call. Adds the login token, and logs out automatically if the server says it is invalid.
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Token ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) { localStorage.removeItem(TOKEN_KEY); window.dispatchEvent(new Event('pm-logout')); }
    throw new ApiError(res.status, data);
  }
  return data;
}

export const list = async (path) => (await api(path)).results;   // paginated endpoints

// Files need the login header, so download them with fetch and save the result.
export async function download(path, filename) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Token ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Load data when a page opens: const { data, error, loading, reload } = useLoad(() => api('/x/'), [dep])
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return fn().then((data) => setState({ data, error: null, loading: false }), (error) => setState({ data: null, error, loading: false }));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export const ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };
export const money = (cents) => (cents ? `$${(cents / 100).toFixed(0)}` : 'Free');
