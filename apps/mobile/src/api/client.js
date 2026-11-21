// HTTP client: attaches the 15-minute access token, refreshes it with the
// rotating refresh token (kept in expo-secure-store) on 401, and retries once.
import { API_URL } from '../config';
import { storage as store } from '../utils/storage';

const REFRESH_KEY = '1call.refreshToken';
let accessToken = null;
let refreshing = null;
let onSessionExpired = () => {};

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const setSessionExpiredHandler = (fn) => {
  onSessionExpired = fn;
};
export const getAccessToken = () => accessToken;

export async function saveSession({ accessToken: a, refreshToken }) {
  accessToken = a;
  if (refreshToken) await store.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearSession() {
  accessToken = null;
  await store.deleteItemAsync(REFRESH_KEY);
}

export const getRefreshToken = () => store.getItemAsync(REFRESH_KEY);

async function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = await getRefreshToken();
      if (!rt) return null;
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        await clearSession();
        return null;
      }
      const data = await res.json();
      await saveSession(data);
      return data;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/** Restore a session at app start. Returns {user} or null. */
export async function restoreSession() {
  try {
    return await refresh();
  } catch {
    return null;
  }
}

async function parse(res) {
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) return res.json();
  return res.text();
}

/**
 * @param {string} path e.g. '/contacts'
 * @param {{method?:string, body?:any, form?:FormData, auth?:boolean, raw?:boolean}} opts
 */
export async function api(path, { method = 'GET', body, form, auth = true, raw = false } = {}) {
  const doFetch = () => {
    const headers = { Accept: 'application/json' };
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${API_URL}/api/v1${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  };

  let res;
  try {
    res = await doFetch();
  } catch (e) {
    // Include the server address and the underlying error so failures can be diagnosed.
    throw new ApiError(
      `Cannot reach the 1CALL server (${API_URL}). Check your internet connection.${e?.message ? ` [${e.message}]` : ''}`,
      0,
      'NETWORK',
    );
  }
  if (res.status === 401 && auth) {
    const r = await refresh().catch(() => null);
    if (!r) {
      onSessionExpired();
      throw new ApiError('Your session has expired. Please sign in again.', 401, 'SESSION_EXPIRED');
    }
    res = await doFetch();
  }
  if (raw && res.ok) return res;
  const data = await parse(res);
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiError(
      e.message || 'Something went wrong. Please try again.',
      res.status,
      e.code,
      e.details,
    );
  }
  return data;
}

/** First field error from a zod "VALIDATION" error, for friendlier messages. */
export function errorMessage(err) {
  const fe = err?.details?.fieldErrors;
  if (err?.code === 'VALIDATION' && fe) {
    const first = Object.values(fe).flat()[0];
    if (first) return first;
  }
  return err?.message || 'Something went wrong.';
}
