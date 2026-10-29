/**
 * 统一的 HTTP 响应与 CORS 工具
 */

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Client-Session',
  'Access-Control-Expose-Headers': 'X-Client-Session',
  'Access-Control-Max-Age': '86400',
};

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function json(data: unknown, status = 200, customHeaders?: Record<string, string>): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
    ...customHeaders,
  });
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

export function ok<T>(data: T, extra?: Record<string, unknown>): Response {
  return json({
    ok: true,
    data,
    ...extra,
  });
}

export function fail(message: string, status = 400, code = 'error', extra?: Record<string, unknown>): Response {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
        ...extra,
      },
    },
    status,
  );
}
