import type { Env } from '../env';
import { fail, withCors } from '../util/response';
import { extractBearerCredentials } from '../auth/token';

const ALLOWED_SUFFIXES = ['.hunau.edu.cn', '.chaoxing.com'];
const ALLOWED_EXACT = ['hunau.edu.cn', 'chaoxing.com'];

function isWhitelisted(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (ALLOWED_EXACT.includes(lower)) return true;
  return ALLOWED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/**
 * 零状态安全透明转发代理
 * 仅允许转发学校与超星域名，避免开放代理滥用。
 * POST /api/proxy
 * Body: { url: string, method?: string, headers?: Record<string, string>, body?: string }
 */
export async function handleProxy(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) {
    return fail('代理请求需要 Bearer 身份认证', 401, 'unauthorized');
  }

  let reqData: { url?: unknown; method?: unknown; headers?: unknown; body?: unknown };
  try {
    reqData = (await request.json()) as typeof reqData;
  } catch {
    return fail('请求体格式错误', 400);
  }

  const targetUrlStr = typeof reqData.url === 'string' ? reqData.url.trim() : '';
  if (!targetUrlStr) {
    return fail('缺少 target url', 400);
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(targetUrlStr);
  } catch {
    return fail('非法目标 URL', 400);
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return fail('仅支持 HTTP/HTTPS 协议', 400);
  }

  if (!isWhitelisted(targetUrl.hostname)) {
    return fail(`目标域名 ${targetUrl.hostname} 不在农大/超星安全白名单内`, 403, 'forbidden_domain');
  }

  const forwardHeaders = new Headers();
  if (typeof reqData.headers === 'object' && reqData.headers !== null) {
    for (const [k, v] of Object.entries(reqData.headers)) {
      if (typeof v === 'string') {
        const lowerKey = k.toLowerCase();
        // 过滤 hop-by-hop 头
        if (lowerKey !== 'host' && lowerKey !== 'content-length') {
          forwardHeaders.set(k, v);
        }
      }
    }
  }

  const method = typeof reqData.method === 'string' ? reqData.method.toUpperCase() : 'GET';
  const fetchBody = method !== 'GET' && method !== 'HEAD' && typeof reqData.body === 'string' ? reqData.body : undefined;

  try {
    const upstreamRes = await fetch(targetUrl.toString(), {
      method,
      headers: forwardHeaders,
      body: fetchBody,
      redirect: 'manual',
    });

    const resHeaders = new Headers(upstreamRes.headers);
    // 注入 CORS
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    resHeaders.set('Access-Control-Allow-Headers', '*');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: resHeaders,
    });
  } catch (error) {
    return fail(`上游请求失败: ${error instanceof Error ? error.message : String(error)}`, 502);
  }
}
