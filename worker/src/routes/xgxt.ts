/**
 * 学工系统业务路由：请假申请 + 学工问卷。
 *
 * 协议来源见 `../school/hunau/xgxt.ts` 顶部注释（对齐 ChillEast 客户端）。
 */

import type { Env } from '../env';
import { fail, ok } from '../util/response';
import { extractBearerCredentials } from '../auth/token';
import { runWithSession } from '../auth/session-manager';
import {
  calculateLeaveDuration,
  connectXgxt,
  deleteLeave,
  fetchLeaveList,
  fetchLeaveTypes,
  fetchQuestionnaireDetail,
  fetchQuestionnaireList,
  submitLeave,
  submitQuestionnaire,
} from '../school/hunau/xgxt';

/** 单张附件上限（Workers 内存 128MB，这里留足余量） */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

// ===========================================================================
// 请假
// ===========================================================================

/**
 * 请假记录列表
 * GET /api/xgxt/leave
 */
export async function handleLeaveList(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const records = await runWithSession(env, creds, async (context) => {
      await connectXgxt(context.session);
      return await fetchLeaveList(context.session);
    });
    return ok(records);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '请假记录获取失败', 500);
  }
}

/**
 * 请假类别字典 + 算时长
 * GET /api/xgxt/leave/types
 * GET /api/xgxt/leave/duration?start=...&end=...
 */
export async function handleLeaveTypes(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const types = await runWithSession(env, creds, async (context) => {
      await connectXgxt(context.session);
      return await fetchLeaveTypes(context.session);
    });
    return ok(types);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '请假类别获取失败', 500);
  }
}

export async function handleLeaveDuration(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const start = url.searchParams.get('start') || '';
  const end = url.searchParams.get('end') || '';
  if (start === '' || end === '') return fail('缺少 start / end 参数', 400);

  try {
    const duration = await runWithSession(env, creds, async (context) => {
      await connectXgxt(context.session);
      return await calculateLeaveDuration(context.session, start, end);
    });
    return ok(duration);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '请假时长计算失败', 500);
  }
}

/**
 * 提交请假申请
 * POST /api/xgxt/leave
 * Body: { fields: Record<string,string>, attachment?: { filename, contentBase64, contentType } }
 */
export async function handleLeaveSubmit(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let payload: {
    fields?: unknown;
    attachment?: { filename?: unknown; contentBase64?: unknown; contentType?: unknown };
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return fail('请求体格式错误', 400);
  }

  if (typeof payload.fields !== 'object' || payload.fields === null) {
    return fail('缺少 fields 字段', 400);
  }

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload.fields as Record<string, unknown>)) {
    fields[key] = value === null || value === undefined ? '' : String(value);
  }

  let attachment: { filename: string; bytes: Uint8Array; contentType: string } | undefined;
  const raw = payload.attachment;
  if (raw !== undefined && raw !== null) {
    const filename = typeof raw.filename === 'string' ? raw.filename : '';
    const contentBase64 = typeof raw.contentBase64 === 'string' ? raw.contentBase64 : '';
    const contentType =
      typeof raw.contentType === 'string' && raw.contentType !== ''
        ? raw.contentType
        : 'application/octet-stream';

    if (filename === '' || contentBase64 === '') {
      return fail('附件缺少 filename 或 contentBase64', 400);
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(contentBase64);
    } catch {
      return fail('附件 base64 解码失败', 400);
    }
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return fail(`附件超过 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB 上限`, 413);
    }
    attachment = { filename, bytes, contentType };
  }

  try {
    await runWithSession(env, creds, async (context) => {
      await connectXgxt(context.session);
      await submitLeave(context.session, fields, attachment);
    });
    return ok({ submitted: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '请假申请提交失败', 500);
  }
}

/**
 * 撤销请假申请
 * POST /api/xgxt/leave/delete
 * Body: { id: string }
 */
export async function handleLeaveDelete(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let payload: { id?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return fail('请求体格式错误', 400);
  }
  const id = typeof payload.id === 'string' ? payload.id : '';
  if (id === '') return fail('缺少请假单 id', 400);

  try {
    await runWithSession(env, creds, async (context) => {
      await connectXgxt(context.session);
      await deleteLeave(context.session, id);
    });
    return ok({ deleted: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '撤销请假申请失败', 500);
  }
}

// ===========================================================================
// 学工问卷
// ===========================================================================

/**
 * 问卷列表
 * GET /api/xgxt/questionnaires
 */
export async function handleQuestionnaireList(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const list = await runWithSession(env, creds, async (context) => {
      await connectXgxt(context.session);
      return await fetchQuestionnaireList(context.session);
    });
    return ok(list);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '问卷列表获取失败', 500);
  }
}

/**
 * 问卷详情（含题目）
 * GET /api/xgxt/questionnaires/detail?taskTime=...
 */
export async function handleQuestionnaireDetail(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const taskTimeM = url.searchParams.get('taskTime') || '';
  if (taskTimeM === '') return fail('缺少 taskTime 参数', 400);

  try {
    const detail = await runWithSession(env, creds, async (context) => {
      await connectXgxt(context.session);
      return await fetchQuestionnaireDetail(context.session, taskTimeM);
    });
    return ok(detail);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '问卷详情获取失败', 500);
  }
}

/**
 * 提交问卷
 * POST /api/xgxt/questionnaires/submit
 * Body: { taskTime: string, answers: Record<string, string | string[]> }
 */
export async function handleQuestionnaireSubmit(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let payload: { taskTime?: unknown; answers?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return fail('请求体格式错误', 400);
  }

  const taskTimeM = typeof payload.taskTime === 'string' ? payload.taskTime : '';
  if (taskTimeM === '') return fail('缺少 taskTime', 400);
  if (typeof payload.answers !== 'object' || payload.answers === null) {
    return fail('缺少 answers 字段', 400);
  }

  const answers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(payload.answers as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      answers[key] = value.map((item) => String(item));
    } else {
      answers[key] = value === null || value === undefined ? '' : String(value);
    }
  }

  try {
    await runWithSession(env, creds, async (context) => {
      await connectXgxt(context.session);
      // 先取详情拿到题目顺序与 jgM，再用同一份 detail 组 body
      const detail = await fetchQuestionnaireDetail(context.session, taskTimeM);
      await submitQuestionnaire(context.session, detail, answers);
    });
    return ok({ submitted: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '问卷提交失败', 500);
  }
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const binary = atob(normalized.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
