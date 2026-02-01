import axios, { AxiosRequestConfig } from "axios";

export interface ApiClientOptions {
  auth?: { username: string; password: string } | null;
  signal?: AbortSignal;
  responseType?: AxiosRequestConfig['responseType'];
}

function buildAuthHeader(auth?: { username: string; password: string } | null) {
  if (!auth || !auth.username || !auth.password) {
    return {};
  }
  const token = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

async function handleError(err: any): Promise<never> {
  if (axios.isCancel(err) || err?.name === 'CanceledError' || err?.name === 'AbortError') {
    throw err;
  }
  if (!err?.response) {
    throw new Error(err?.message || 'Network failure');
  }
  const { status, statusText, data } = err.response;
  const detail = data && typeof data === 'object' && data.error ? `: ${data.error}` : '';
  throw new Error(`HTTP Error: ${status} ${statusText}${detail}`);
}

async function get<T = any>(url: string, options: ApiClientOptions = {}): Promise<T> {
  try {
    const headers = { ...buildAuthHeader(options.auth) };
    const resp = await axios.get<T>(url, { headers, signal: options.signal });
    return resp.data as T;
  } catch (err: any) {
    return handleError(err);
  }
}

async function post<T = any>(url: string, body: any = {}, options: ApiClientOptions = {}): Promise<T> {
  try {
    const headers = { 'Content-Type': 'application/json', ...buildAuthHeader(options.auth) };
    const resp = await axios.post<T>(url, body, { headers, signal: options.signal, responseType: options.responseType });
    return resp.data as T;
  } catch (err: any) {
    return handleError(err);
  }
}

/**
 * POST and return base64-encoded payload for binary responses (zip)
 * Preserves existing shape: { data: string } where data is base64 ZIP
 */
async function download(url: string, body: any = {}, options: ApiClientOptions = {}): Promise<{ data: string }> {
  try {
    const headers = { ...buildAuthHeader(options.auth), 'Content-Type': 'application/json' };
    const resp = await axios.post(url, body, { headers, signal: options.signal, responseType: 'arraybuffer' });

    const contentType = resp.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      const text = Buffer.from(resp.data).toString('utf8');
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.data === 'string') {
          return parsed;
        }
      } catch (e) {
        // fallthrough to base64
      }
    }

    const base64 = Buffer.from(resp.data).toString('base64');
    return { data: base64 };
  } catch (err: any) {
    return handleError(err);
  }
}

export const apiClient = {
  get,
  post,
  download,
};

// named exports kept for tests/advanced use (but prefer apiClient)
export { get as _get, post as _post, download as _download };
