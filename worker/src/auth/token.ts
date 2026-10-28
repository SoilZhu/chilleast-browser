/**
 * 自包含加密 Bearer Token 处理。
 *
 * 核心原理：
 * 服务端完全不保存 Token 与密码，而是使用 AES-GCM 将用户的 {oaId, oaKey, exp}
 * 加密封装成密文。客户端保管密文并在每次请求时通过 Authorization 头提交，
 * Worker 解密校验有效期，实现纯零状态认证。
 */

import type { Env } from '../env';
import { getEffectiveSessionKey, open, seal } from './crypto-box';
import type { Credentials } from './session-manager';

export interface TokenPayload {
  oaId: string;
  oaKey: string;
  exp: number; // 过期时间戳 (ms)
}

/** 默认 Token 有效期：30 天 */
export const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 签发自包含的零状态 Token
 */
export async function createStatelessToken(
  env: Env,
  credentials: Credentials,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  const payload: TokenPayload = {
    oaId: credentials.oaId.trim(),
    oaKey: credentials.oaKey,
    exp: Date.now() + ttlMs,
  };
  const jsonStr = JSON.stringify(payload);
  const sealed = await seal(jsonStr, getEffectiveSessionKey(env));
  // 转换为 URL-safe base64 变体，方便 Header 传输
  return sealed.replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * 解析并验签 Bearer Token
 */
export async function decodeTokenCredentials(
  env: Env,
  token: string,
): Promise<Credentials | null> {
  if (!token) return null;
  const trimmed = token.trim();
  if (!trimmed) return null;

  try {
    const rawSealed = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = await open(rawSealed, getEffectiveSessionKey(env));
    const payload = JSON.parse(jsonStr) as Partial<TokenPayload>;

    if (
      typeof payload.oaId === 'string' &&
      payload.oaId !== '' &&
      typeof payload.oaKey === 'string' &&
      payload.oaKey !== ''
    ) {
      if (typeof payload.exp === 'number' && Date.now() > payload.exp) {
        return null; // 令牌已过期
      }
      return { oaId: payload.oaId, oaKey: payload.oaKey };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * 从请求中提取并验证凭据
 */
export async function extractBearerCredentials(
  env: Env,
  request: Request,
): Promise<Credentials | null> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) {
    // 兼容可能的前端 Header 或 Query
    const queryToken = new URL(request.url).searchParams.get('token');
    if (queryToken) {
      return await decodeTokenCredentials(env, queryToken);
    }
    return null;
  }
  return await decodeTokenCredentials(env, match[1]);
}
