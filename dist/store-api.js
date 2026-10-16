// Shared same-origin client. PHP remains the authority for prices, stock and orders.
let sessionPromise;

export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message); this.name = 'ApiError'; this.status = status; this.details = details;
  }
}

async function send(route, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`./api/index.php?route=${encodeURIComponent(route)}`, {
      credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal,
      headers: { Accept: 'application/json', ...options.headers },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.error) {
      const message = typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message;
      throw new ApiError(message || 'The store service is unavailable. Please try again shortly.', response.status, data?.fields || data?.details || data?.error?.details);
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.name === 'AbortError' ? 'The request timed out. Please try again.' : 'Unable to reach the store. Check your connection and try again.');
  } finally { clearTimeout(timer); }
}

export function getSession(force = false) {
  if (force) sessionPromise = undefined;
  if (!sessionPromise) sessionPromise = send('session').catch(error => { sessionPromise = undefined; throw error; });
  return sessionPromise;
}

export async function apiRequest(route, { method = 'GET', body, headers = {} } = {}) {
  method = method.toUpperCase();
  const options = { method, headers: { ...headers } };
  if (method !== 'GET' && method !== 'HEAD') {
    const session = await getSession();
    const token = session.csrfToken || session.csrf || session.session?.csrfToken;
    if (!token) throw new ApiError('Your session could not be verified. Reload the page and try again.');
    options.headers['X-CSRF-Token'] = token;
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body ?? {});
  }
  try { return await send(route, options); }
  catch (error) {
    // Signing into the dashboard in another tab rotates this shared session.
    // A rejected CSRF request has not mutated anything, so retry with its new token.
    if (error.status !== 403 || method === 'GET' || method === 'HEAD') throw error;
    const session = await getSession(true);
    const token = session.csrfToken || session.csrf || session.session?.csrfToken;
    if (!token || token === options.headers['X-CSRF-Token']) throw error;
    options.headers['X-CSRF-Token'] = token;
    return send(route, options);
  }
}

export const request = apiRequest;
