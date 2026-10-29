import { storage } from '../utils/storage';

export const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'dev.web.chilleast.soilzhu.su' ||
    window.location.hostname.startsWith('dev.'))
    ? 'https://dev.api.chilleast.soilzhu.su'
    : import.meta.env.PROD
      ? 'https://api.chilleast.soilzhu.su'
      : '');

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
  const clientSession = storage.getSession();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.method && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // 方案三：自动上报客户端自持有的加密 Cookie 凭据，加速会话复用
  if (clientSession && !headers.has('X-Client-Session')) {
    headers.set('X-Client-Session', clientSession);
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

  // 捕获服务端回传的最新的加密会话凭据并同步至本地
  const updatedSession = response.headers.get('x-client-session');
  if (updatedSession) {
    storage.setSession(updatedSession);
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
      storage.removeSession();
      window.dispatchEvent(new CustomEvent('chilleast:unauthorized'));
    }
    const message = body?.error?.message || body?.message || `请求失败 (${response.status})`;
    const code = body?.error?.code || 'request_failed';
    throw new ApiError(message, response.status, code);
  }

  if (body?.data?.session && typeof body.data.session === 'string') {
    storage.setSession(body.data.session);
  }

  return body?.data !== undefined ? body.data : body;
}
