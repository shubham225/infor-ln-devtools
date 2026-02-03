import axios, { AxiosRequestConfig } from "axios";

export interface ApiClientOptions {
  auth?: { username: string; password: string } | null;
  signal?: AbortSignal;
  responseType?: AxiosRequestConfig['responseType'];
}

function buildAuthHeader(auth?: { username: string; password: string } | null): Record<string, string> {
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
    const headers: Record<string,string> = { ...(buildAuthHeader(options.auth) as Record<string,string>) };
    const resp = await axios.get<T>(url, { headers, signal: options.signal });
    return resp.data as T;
  } catch (err: any) {
    return handleError(err);
  }
}

async function post<T = any>(url: string, body: any = {}, options: ApiClientOptions = {}): Promise<T> {
  try {
    let headers: Record<string, string> = { ...(buildAuthHeader(options.auth) as Record<string,string>) };

    // Detect form-data (node) and let axios set Content-Type with boundary
    if (body && typeof (body as any).getHeaders === 'function') {
      headers = { ...headers, ...(body as any).getHeaders() };
    } else {
      headers = { 'Content-Type': 'application/json', ...headers };
    }

    const resp = await axios.post<T>(url, body, { headers, signal: options.signal, responseType: options.responseType });
    return resp.data as T;
  } catch (err: any) {
    return handleError(err);
  }
}

/**
 * POST and return a raw binary Buffer for binary responses (zip)
 * Accepts JSON or multipart/form-data request bodies.
 */
async function download(url: string, body: any = {}, options: ApiClientOptions = {}): Promise<Buffer> {
  try {
    let headers: Record<string, string> = { ...(buildAuthHeader(options.auth) as Record<string,string>) };
    if (body && typeof (body as any).getHeaders === 'function') {
      headers = { ...headers, ...(body as any).getHeaders() };
    } else {
      headers = { 'Content-Type': 'application/json', ...headers };
    }

    const resp = await axios.post(url, body, { headers, signal: options.signal, responseType: 'arraybuffer' });
    const contentType = resp.headers['content-type'] || '';

    if (contentType.includes('application/json')) {
      // JSON error or wrapped response
      const text = Buffer.from(resp.data).toString('utf8');
      try {
        const parsed = JSON.parse(text);
        // legacy shape: { data: base64 }
        if (parsed && typeof parsed.data === 'string') {
          return Buffer.from(parsed.data, 'base64');
        }
      } catch (e) {
        // pass through
      }
      throw new Error(`Unexpected JSON response`);
    }

    return Buffer.from(resp.data);
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
