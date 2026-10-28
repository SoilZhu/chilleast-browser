import type { Env } from '../env';
import { fail, ok } from '../util/response';
import { createStatelessToken, extractBearerCredentials } from '../auth/token';
import { forgetSession, runWithSession } from '../auth/session-manager';
import { LoginError } from '../auth/hunau-login';

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求体必须是合法的 JSON', 400, 'invalid_json');
  }

  const oaId = typeof body.oaId === 'string' ? body.oaId.trim() : '';
  const oaKey = typeof body.oaKey === 'string' ? body.oaKey : '';

  if (!oaId || !oaKey) {
    return fail('请输入学工号与密码', 400, 'missing_credentials');
  }

  try {
    // 零状态校验：尝试向学校统一身份认证 (CAS/CIMS) 建立短效会话
    const credentials = { oaId, oaKey };
    const context = await runWithSession(env, credentials, async (ctx) => {
      return ctx.identity;
    });

    // 签发自包含的 AES-GCM 加密 Token
    const token = await createStatelessToken(env, credentials);

    return ok(
      {
        token,
        student: {
          username: context?.username || oaId,
          realName: context?.realName || '同学',
          userId: context?.userId,
        },
      },
      { message: '登录成功' },
    );
  } catch (error) {
    if (error instanceof LoginError) {
      return fail(error.message, 401, error.code || 'login_failed');
    }
    const message = error instanceof Error ? error.message : '统一身份认证服务异常，请稍后重试';
    return fail(message, 500, 'auth_error');
  }
}

export async function handleProfile(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) {
    return fail('未登录或会话凭据已过期，请重新登录', 401, 'unauthorized');
  }

  try {
    const identity = await runWithSession(env, creds, async (ctx) => ctx.identity);
    return ok({
      username: identity?.username || creds.oaId,
      realName: identity?.realName || '同学',
      userId: identity?.userId,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取用户信息失败', 500);
  }
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (creds) {
    await forgetSession(env, creds);
  }
  return ok({ message: '已安全退出登录' });
}
