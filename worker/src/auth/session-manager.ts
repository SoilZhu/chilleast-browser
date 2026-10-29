/**
 * 把「凭据 -> 可用会话」的编排收在一处。
 *
 * 调用方（工具）只关心拿到一个带 Cookie 的 CookieSession，
 * 不需要知道登录、内存缓存、过期重登、子系统换票是怎么发生的。
 *
 * 凭据完全不落盘：仅在 Worker 单实例进程堆内存（RAM）中做短时间的 Cookie 防抖缓存，
 * Worker 实例回收自动消失，服务端零数据留存。
 */

import { CookieJar, type StoredCookie } from './cookies';
import { CookieSession } from './http';
import { LoginError, login, type LoginIdentity, type LoginResult } from './hunau-login';
import { credentialFingerprint, getEffectiveSessionKey, open, seal } from './crypto-box';
import type { Env } from '../env';

export interface Credentials {
  oaId: string;
  oaKey: string;
  clientSession?: string | null;
  request?: Request;
}

export interface ClientSessionPayload {
  oaId: string;
  identity: LoginIdentity | null;
  cookies: StoredCookie[];
  exp: number;
}

/** 客户端自持有加密 Cookie 凭据默认有效期：2 小时 */
export const CLIENT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** 关联请求与最新加密会话的 WeakMap */
const responseSessionMap = new WeakMap<Request, string>();

export function setResponseSession(request: Request, sealedSession: string): void {
  responseSessionMap.set(request, sealedSession);
}

export function getResponseSession(request: Request): string | undefined {
  return responseSessionMap.get(request);
}

/**
 * 将 CookieJar 与身份密封为可安全由客户端持有的自包含加密串
 */
export async function sealClientSession(
  env: Env,
  oaId: string,
  identity: LoginIdentity | null,
  jar: CookieJar,
  ttlMs = CLIENT_SESSION_TTL_MS,
): Promise<string> {
  const payload: ClientSessionPayload = {
    oaId: oaId.trim(),
    identity,
    cookies: jar.toJSON(),
    exp: Date.now() + ttlMs,
  };
  const jsonStr = JSON.stringify(payload);
  const sealed = await seal(jsonStr, getEffectiveSessionKey(env));
  return sealed.replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * 校验并解密客户端提交的加密 Cookie 凭据
 */
export async function openClientSession(
  env: Env,
  sealed: string,
  expectedOaId: string,
): Promise<{ jar: CookieJar; identity: LoginIdentity | null } | null> {
  if (!sealed) return null;
  const trimmed = sealed.trim();
  if (!trimmed) return null;
  try {
    const rawSealed = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = await open(rawSealed, getEffectiveSessionKey(env));
    const payload = JSON.parse(jsonStr) as Partial<ClientSessionPayload>;
    if (
      payload &&
      payload.oaId === expectedOaId.trim() &&
      typeof payload.exp === 'number' &&
      Date.now() < payload.exp &&
      Array.isArray(payload.cookies) &&
      payload.cookies.length > 0
    ) {
      const jar = CookieJar.fromJSON(payload.cookies);
      if (jar.size > 0) {
        return { jar, identity: payload.identity ?? null };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export class SessionUnavailableError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'SessionUnavailableError';
  }
}

/**
 * 子系统会话失效时抛这个，外层会清掉缓存会话并重登一次再试。
 * 与「业务错误」区分开 —— 业务错误不该触发重登。
 */
export class SessionExpiredError extends Error {
  constructor(message = '校园会话已失效，请重试') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export interface SessionContext {
  session: CookieSession;
  identity: LoginIdentity | null;
  /** 本次请求是否真的执行了登录 */
  didLogin: boolean;
}

interface CachedSession {
  jar: CookieJar;
  identity: LoginIdentity | null;
  expiresAt: number;
}

/** 单实例 RAM 会话防抖缓存：仅在当前 Worker 进程内存中存在，绝不落盘 */
const ramSessionCache = new Map<string, CachedSession>();

/** 正在执行中的登录请求（Singleflight 排队复用，防止并发请求瞬间多次登录触发学校 SSO 风控） */
const inFlightLogins = new Map<string, Promise<LoginResult>>();

/** 内存防抖缓存时间：10 分钟。 */
export const SESSION_RAM_TTL_MS = 10 * 60 * 1000;

async function sessionCacheKey(env: Env, credentials: Credentials): Promise<string> {
  return await credentialFingerprint(
    credentials.oaId.trim(),
    credentials.oaKey,
    env.ACCOUNT_PEPPER ?? '',
  );
}

/** 用于测试或调试：清理内存缓存 */
export function clearRamSessionCache(): void {
  ramSessionCache.clear();
  inFlightLogins.clear();
}

/** 取得当前缓存的会话数（仅用于测试） */
export function ramSessionCacheSize(): number {
  return ramSessionCache.size;
}

/**
 * 取得一个已登录的会话。必要时执行登录。
 */
export async function acquireSession(
  env: Env,
  credentials: Credentials,
): Promise<SessionContext> {
  const oaId = credentials.oaId.trim();
  const oaKey = credentials.oaKey;
  if (oaId === '' || oaKey === '') {
    throw new SessionUnavailableError('缺少 oa_id / oa_key', 'missing_credentials');
  }

  const key = await sessionCacheKey(env, credentials);
  const now = Date.now();
  const cached = ramSessionCache.get(key);

  // 1. 优先命中单实例 RAM 防抖缓存（10 分钟）
  if (cached !== undefined && now < cached.expiresAt) {
    if (credentials.request && !getResponseSession(credentials.request)) {
      const sealed = await sealClientSession(env, oaId, cached.identity, cached.jar);
      setResponseSession(credentials.request, sealed);
    }
    return {
      session: new CookieSession(cached.jar),
      identity: cached.identity,
      didLogin: false,
    };
  }

  // 2. 检查客户端自持有的加密 Cookie 凭据 (方案三：跨 Worker 实例零握手恢复)
  if (credentials.clientSession) {
    const restored = await openClientSession(env, credentials.clientSession, oaId);
    if (restored !== null) {
      ramSessionCache.set(key, {
        jar: restored.jar,
        identity: restored.identity,
        expiresAt: Date.now() + SESSION_RAM_TTL_MS,
      });
      if (credentials.request) {
        setResponseSession(credentials.request, credentials.clientSession);
      }
      return {
        session: new CookieSession(restored.jar),
        identity: restored.identity,
        didLogin: false,
      };
    }
  }

  // 3. 检查是否已有同一凭据正在登录中（并发排队复用同一 Promise）
  const inFlight = inFlightLogins.get(key);
  if (inFlight !== undefined) {
    const result = await inFlight;
    if (credentials.request) {
      const sealed = await sealClientSession(env, oaId, result.identity, result.jar);
      setResponseSession(credentials.request, sealed);
    }
    return {
      session: new CookieSession(result.jar),
      identity: result.identity,
      didLogin: false,
    };
  }

  // 4. 内存无缓存且无有效客户端会话：发起学校 SSO 完整登录
  const loginPromise = (async () => {
    try {
      return await login(oaId, oaKey);
    } finally {
      inFlightLogins.delete(key);
    }
  })();
  inFlightLogins.set(key, loginPromise);

  const result = await loginPromise;
  ramSessionCache.set(key, {
    jar: result.jar,
    identity: result.identity,
    expiresAt: Date.now() + SESSION_RAM_TTL_MS,
  });

  if (credentials.request) {
    const sealed = await sealClientSession(env, oaId, result.identity, result.jar);
    setResponseSession(credentials.request, sealed);
  }

  return {
    session: new CookieSession(result.jar),
    identity: result.identity,
    didLogin: true,
  };
}

/**
 * 把工具执行期间新落的 Cookie 存回内存缓存与客户端加密凭据。
 */
async function persistSession(
  env: Env,
  credentials: Credentials,
  context: SessionContext,
): Promise<void> {
  if (context.session.jar.size === 0) return;
  const key = await sessionCacheKey(env, credentials);
  const existing = ramSessionCache.get(key);
  if (existing !== undefined) {
    existing.jar = context.session.jar;
    if (context.identity !== null) {
      existing.identity = context.identity;
    }
  }
  if (credentials.request) {
    const sealed = await sealClientSession(
      env,
      credentials.oaId,
      context.identity,
      context.session.jar,
    );
    setResponseSession(credentials.request, sealed);
  }
}

/** 丢弃缓存会话（强制下次重新登录）。 */
export async function invalidateSession(env: Env, credentials: Credentials): Promise<void> {
  ramSessionCache.delete(await sessionCacheKey(env, credentials));
}

/** 彻底清除该凭据的内存缓存。 */
export async function forgetSession(env: Env, credentials: Credentials): Promise<void> {
  ramSessionCache.delete(await sessionCacheKey(env, credentials));
}

/**
 * 工具执行的标准入口。
 *
 * 会做两件事：
 *  1. 保证有会话（命中内存防抖或客户端自持有凭据则直接复用，否则去学校 SSO 登录）
 *  2. 如果工具抛 SessionExpiredError，清掉缓存会话并强制重新走一次 SSO 登录
 */
export async function runWithSession<T>(
  env: Env,
  credentials: Credentials,
  fn: (context: SessionContext) => Promise<T>,
): Promise<T> {
  const context = await acquireSession(env, credentials);
  try {
    const result = await fn(context);
    // 工具可能刚建立了子系统会话，存回内存供短时间内复用并同步给客户端
    await persistSession(env, credentials, context);
    return result;
  } catch (error) {
    if (!(error instanceof SessionExpiredError)) throw error;
    if (!context.didLogin) {
      // 说明是缓存的会话在学校端过期了：强制清空并重登一次
      await invalidateSession(env, credentials);
    }
    // 强制忽略旧的 clientSession，走真实登录刷新
    const refreshed = await acquireSession(env, { ...credentials, clientSession: null });
    const result = await fn(refreshed);
    await persistSession(env, credentials, refreshed);
    return result;
  }
}

export { LoginError };
