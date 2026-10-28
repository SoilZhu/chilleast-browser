import type { Env } from '../env';
import { fail, ok } from '../util/response';
import { extractBearerCredentials } from '../auth/token';
import { runWithSession } from '../auth/session-manager';
import { fetchRemoteHomework } from '../school/hunau/chaoxing-study';
import {
  filterHomework,
  homeworkToJson,
  sortHomework,
  type HomeworkStatus,
} from '../school/hunau/homework-model';

/**
 * 作业列表
 * GET /api/study/homework?status=pending&courseName=...&keyword=...
 */
export async function handleHomework(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const statusParam = (url.searchParams.get('status') || 'pending').toLowerCase();
  const courseName = url.searchParams.get('courseName') || '';
  const keyword = url.searchParams.get('keyword') || '';

  const status = ['all', 'pending', 'completed', 'archived'].includes(statusParam)
    ? (statusParam as 'all' | HomeworkStatus)
    : 'pending';

  try {
    const homework = await runWithSession(env, creds, async (context) => {
      const nowMs = Date.now();
      const rawList = await fetchRemoteHomework(context.session, nowMs);
      const filtered = filterHomework(rawList, { status, courseName, keyword });
      const sorted = sortHomework(filtered);
      return sorted.map((entry) => homeworkToJson(entry));
    });

    return ok(homework);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '作业列表获取失败', 500);
  }
}
