import { storage } from '../utils/storage';

export const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.PROD ? 'https://api.chilleast.soilzhu.su' : '');

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, status = 500, code = 'error') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = storage.getToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.method && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url =
    path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${API_BASE}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err) {
    throw new ApiError(
      '网络连接失败，请检查网络或稍后重试',
      0,
      'network_offline',
    );
  }

  let body: any;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  } else {
    body = await response.text();
  }

  if (!response.ok) {
    if (response.status === 401) {
      storage.removeToken();
      window.dispatchEvent(new CustomEvent('chilleast:unauthorized'));
    }
    const message = body?.error?.message || body?.message || `请求失败 (${response.status})`;
    const code = body?.error?.code || 'request_failed';
    throw new ApiError(message, response.status, code);
  }

  return body?.data !== undefined ? body.data : body;
}
