import type { Env } from '../env';
import { fail, ok } from '../util/response';
import { extractBearerCredentials } from '../auth/token';
import { runWithSession } from '../auth/session-manager';
import {
  deleteFile,
  downloadFile,
  ensureCloudiskSession,
  listRes,
  uploadFile,
} from '../school/hunau/cloudisk';
import {
  readLatestBackup,
  readTimetableRules,
  readManualHomework,
  readManualExam,
  readDormitory,
  readCustomCourseColors,
  writeBackup,
  type BackupDocument,
} from '../school/hunau/backup';
import { b64ToBytes } from '../util/bytes';

/**
 * 查询云盘文件列表
 * GET /api/study/cloudisk/files?folderId=...&page=1
 */
export async function handleCloudiskFiles(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const folderIdParam = url.searchParams.get('folderId') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const auth = await ensureCloudiskSession(context.session);
      const folderId = folderIdParam || auth.rootDirId;
      const data = await listRes(context.session, auth, folderId, page);
      return {
        rootDirId: auth.rootDirId,
        currentFolderId: folderId,
        puid: auth.puid,
        totalCount: data.totalCount,
        files: data.entries.map((e) => e.raw),
      };
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取云盘文件列表失败', 500);
  }
}

/**
 * 上传文件到云盘
 * POST /api/study/cloudisk/upload
 * Body: { filename, contentBase64, folderId? }
 */
export async function handleCloudiskUpload(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求格式错误', 400);
  }

  const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
  const contentBase64 = typeof body.contentBase64 === 'string' ? body.contentBase64 : '';
  const folderIdParam = typeof body.folderId === 'string' ? body.folderId.trim() : '';

  if (!filename || !contentBase64) {
    return fail('缺少文件名或文件内容', 400);
  }

  try {
    const cleanB64 = contentBase64.replace(/^data:[^;]+;base64,/, '');
    const bytes = b64ToBytes(cleanB64);

    const result = await runWithSession(env, creds, async (context) => {
      const auth = await ensureCloudiskSession(context.session);
      const folderId = folderIdParam || auth.rootDirId;
      return await uploadFile(context.session, auth, folderId, filename, bytes);
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '上传文件失败', 500);
  }
}

/**
 * 下载云盘文件
 * GET /api/study/cloudisk/download?resid=...&encryptedId=...&folderId=...&filename=...
 */
export async function handleCloudiskDownload(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const resid = url.searchParams.get('resid') || '';
  const encryptedId = url.searchParams.get('encryptedId') || '';
  const folderId = url.searchParams.get('folderId') || '';
  const filename = url.searchParams.get('filename') || 'file';

  if (!resid || !encryptedId) {
    return fail('缺少 resid 或 encryptedId', 400);
  }

  try {
    const bytes = await runWithSession(env, creds, async (context) => {
      const auth = await ensureCloudiskSession(context.session);
      return await downloadFile(context.session, auth, {
        resid,
        encryptedId,
        folderId: folderId || auth.rootDirId,
      });
    });

    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    headers.set(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(bytes, { headers });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '下载文件失败', 500);
  }
}

/**
 * 读取最新云备份数据
 * GET /api/study/cloudisk/backup
 */
export async function handleCloudiskGetBackup(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const auth = await ensureCloudiskSession(context.session);
      const backup = await readLatestBackup(context.session, auth);
      const doc = backup.backup;
      return {
        // 原有字段保持不动（前端已依赖）
        fileName: backup.entry.name,
        slot: backup.slot,
        exportedAt: doc.exportedAt,
        dormitory: readDormitory(doc),
        timetableRules: readTimetableRules(doc),
        manualHomework: readManualHomework(doc),
        manualExam: readManualExam(doc),
        customCourseColors: readCustomCourseColors(doc),
        data: doc,
        // 新增：仲裁结果。网页端据此判断走的是现代轨/兼容轨/合并分支
        // （SYNC-ALIGN 4.2），并核对云端每轨保留的份数。
        format: backup.format,
        stamp: backup.stamp,
        arbitration: {
          /** 'modern' 只拉现代轨 | 'legacy-only' 仅兼容轨 | 'merged' 两轨合并 */
          branch: backup.branch,
          sources: backup.sources,
          modern: backup.modern?.name ?? null,
          legacy: backup.legacy?.name ?? null,
        },
        retained: backup.retained,
      };
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取云备份失败', 500);
  }
}

/**
 * 写入云备份数据
 * POST /api/study/cloudisk/backup
 * Body: { payload: object }
 */
export async function handleCloudiskSaveBackup(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求格式错误', 400);
  }

  const payload = (body.payload ?? body) as BackupDocument;

  try {
    const written = await runWithSession(env, creds, async (context) => {
      const auth = await ensureCloudiskSession(context.session);
      return await writeBackup(context.session, auth, payload, null);
    });

    return ok({
      success: true,
      fileName: written.filename,
      // 新增：写入的轨道与本次同轨收敛删掉的旧文件（前端可展示「每轨保留 3 份」）
      format: written.format,
      pruned: written.pruned,
      message: '备份成功写入超星云盘',
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '写入云备份失败', 500);
  }
}
