import axios, { InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// ── CSRF helpers ──────────────────────────────────────────────────────────────

const getCsrfCookie = (): string | undefined =>
  document.cookie
    .split('; ')
    .find((r) => r.startsWith('csrf-token='))
    ?.split('=')[1];

let csrfFetchPromise: Promise<void> | null = null;

const ensureCsrfToken = async (): Promise<void> => {
  if (getCsrfCookie()) return;
  if (!csrfFetchPromise) {
    csrfFetchPromise = axios
      .get('http://localhost:5000/api/auth/csrf-token', { withCredentials: true })
      .then(() => {
        csrfFetchPromise = null;
      })
      .catch(() => {
        csrfFetchPromise = null;
      });
  }
  await csrfFetchPromise;
};

// ── Request interceptor ───────────────────────────────────────────────────────

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? 'get').toUpperCase();

  if (!SAFE_METHODS.has(method)) {
    await ensureCsrfToken();
    const token = getCsrfCookie();
    if (token) config.headers['x-csrf-token'] = decodeURIComponent(token);
  }

  return config;
});

// ── Response interceptor — refresh once on 401, then redirect ─────────────────

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original: RetryConfig = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        await axios.post(
          'http://localhost:5000/api/auth/refresh',
          {},
          { withCredentials: true }
        );
        return api(original);
      } catch {
        // Refresh failed — clear local state and force re-login.
        useAuthStore.getState().setUser(null);
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// Lazy import to avoid a circular dep at module init time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let useAuthStore: any;
export const _setAuthStoreRef = (store: unknown) => {
  useAuthStore = store;
};

export default api;
