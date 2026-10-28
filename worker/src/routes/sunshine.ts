import type { Env } from '../env';
import { fail, ok } from '../util/response';
import { extractBearerCredentials } from '../auth/token';
import { runWithSession } from '../auth/session-manager';
import {
  defaultSunshineFinishTime,
  fetchSunshineForm,
  fetchSunshineLetters,
  fetchSunshineTicketDetail,
  fetchSunshineStatistics,
  findSunshineDepartment,
  normalizeSunshineType,
  submitSunshineLetter,
  type SunshineSubmitResult,
} from '../school/hunau/sun';

/**
 * 查询阳光服务可受理部门与个人身份
 * GET /api/campus/sunshine/departments
 */
export async function handleSunshineDepartments(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const form = await fetchSunshineForm(context.session);
      return {
        identity: form.identity,
        departments: form.departments,
      };
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取阳光服务部门失败', 500);
  }
}

/**
 * 提交阳光服务诉求信件
 * POST /api/campus/sunshine/submit
 * Body: { title, content, type, departmentCode, finishTime?, phone?, email? }
 */
export async function handleSunshineSubmit(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求格式错误', 400);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const typeInput = typeof body.type === 'string' ? body.type : '1';
  const depCode = typeof body.departmentCode === 'string' ? body.departmentCode.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const finishTime = typeof body.finishTime === 'string' && body.finishTime ? body.finishTime : defaultSunshineFinishTime();

  if (!title || !content || !depCode) {
    return fail('请填写信件标题、内容并选择受理部门', 400);
  }

  try {
    const submitResult = await runWithSession(env, creds, async (context) => {
      const form = await fetchSunshineForm(context.session);
      const department = findSunshineDepartment(form.departments, depCode);
      if (!department) {
        throw new Error(`找不到部门编码为 ${depCode} 的受理单位`);
      }

      const letterType = normalizeSunshineType(typeInput);
      return await submitSunshineLetter(context.session, {
        identity: form.identity,
        department,
        type: letterType,
        title,
        content,
        phone,
        email,
        finishTime,
      });
    });

    if (submitResult === '1' || submitResult === '2') {
      return ok({ success: true, result: submitResult, message: '信件提交成功' });
    }
    return fail('提交未成功或已被服务端拒绝', 400, 'sunshine_rejected');
  } catch (error) {
    return fail(error instanceof Error ? error.message : '提交阳光服务诉求失败', 500);
  }
}

/**
 * 获取公开近期诉求与统计
 * GET /api/campus/sunshine/letters
 */
export async function handleSunshineLetters(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const [letters, statistics] = await Promise.all([
        fetchSunshineLetters(context.session).catch(() => []),
        fetchSunshineStatistics(context.session).catch(() => ({ total: '0', processing: '0', completed: '0' })),
      ]);
      return { letters, statistics };
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取近期诉求失败', 500);
  }
}

/**
 * 获取诉求工单详情
 * GET /api/campus/sunshine/detail?id=...
 */
export async function handleSunshineDetail(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  if (!id) return fail('缺少工单 ID', 400);

  try {
    const detail = await runWithSession(env, creds, async (context) => {
      return await fetchSunshineTicketDetail(context.session, id);
    });

    return ok({ detail });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取工单详情失败', 500);
  }
}
