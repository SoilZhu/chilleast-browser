/**
 * 学工系统（xgxt.hunau.edu.cn）客户端：CAS 换会话后走请假 / 问卷两组 JSON 接口。
 *
 * 协议来源：ChillEast 客户端
 *   - `lib/features/leave/services/leave_service.dart`
 *   - `lib/features/questionnaire/services/questionnaire_service.dart`
 *   - `debug/请假xgxt.hunau.edu.cn.har` / `debug/问卷xgxt.hunau.edu.cn.har`
 *
 * 关键点（照抄 Dart 的踩坑注释）：
 *   - 业务接口正常只返回 JSON。**必须关掉自动跟随重定向**，会话失效时的 302
 *     跳 SSO 才能被显式识别，而不是跟进登录页后抛 JSON 解码异常。
 *   - 列表接口是 DataTables 风格：返回 `{ aaData: [...] }`。
 *   - 提交接口返回 `{ result: true }`，失败时 `errorInfoList[0]` 才是人话。
 *   - 请假提交：无附件用 urlencoded，有附件用 multipart（与抓包一致）。
 *   - 问卷提交：多选题**同一个 key 重复出现多次**，必须手工拼 body。
 */

import type { CookieSession } from '../../auth/http';
import { SessionExpiredError } from '../../auth/session-manager';
import { exchangeCasTicket, looksLikeLoginPage } from './cas';
import { HOSTS, URLS } from './constants';

const XGXT_HOST = new URL(HOSTS.xgxt).hostname;

/** CAS 子系统入口：与 App 端 `xgxtCasUrl` 一致。 */
const XGXT_SERVICE_URL = URLS.xgxtCas;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// ---------------------------------------------------------------------------
// 通用
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const parsed = Number.parseInt(str(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stamp(): string {
  return String(Date.now());
}

/**
 * 建立（或复用）学工系统会话。
 *
 * 与 bxpt 同一套路：先探一下 `/wap/main/welcome`，已登录就直接用，
 * 否则用 SSO 的 TGC 经 `exchangeCasTicket` 换一张 CAS 票据。
 */
export async function connectXgxt(session: CookieSession): Promise<void> {
  const probe = await session.get(URLS.xgxtWapHome, {
    follow: false,
    headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
  });
  const alreadyIn =
    !REDIRECT_STATUSES.has(probe.status) &&
    probe.status < 400 &&
    !looksLikeLoginPage(probe);
  if (alreadyIn) return;

  await exchangeCasTicket(session, {
    serviceUrl: XGXT_SERVICE_URL,
    expectedHost: XGXT_HOST,
  });
}

// ---------------------------------------------------------------------------
// 请求封装
// ---------------------------------------------------------------------------

/** 业务接口统一头部（Dart `_headers` / `_apiOptions`）。 */
function apiHeaders(referer: string): Record<string, string> {
  return {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: referer,
  };
}

const LEAVE_REFERER = `${HOSTS.xgxt}/wap/menu/student/leave/qjsq`;
const QUESTIONNAIRE_REFERER = `${HOSTS.xgxt}/wap/menu/fwk/wjdc/stu/xs_wjdc`;

export interface XgxtResult {
  status: number;
  /** 原始响应文本 */
  body: string;
  /** 解析出的 JSON（解析失败为 null） */
  json: unknown;
}

/**
 * GET 一个学工接口并解析 JSON。
 * 关闭自动跟随：302 跳 SSO 是「会话失效」的明确信号。
 */
async function getJson(
  session: CookieSession,
  url: string,
  what: string,
  referer: string,
): Promise<unknown> {
  const response = await session.get(url, {
    follow: false,
    headers: apiHeaders(referer),
  });

  if (REDIRECT_STATUSES.has(response.status)) {
    throw new SessionExpiredError(`${what}失败：学工系统会话已失效，请重新登录`);
  }
  if (response.status >= 400) {
    throw new Error(`${what}失败（HTTP ${response.status}）`);
  }

  const head = response.body.slice(0, 2048);
  if (head.includes('<html') || head.includes('cas/login')) {
    throw new SessionExpiredError(`${what}失败：被重定向到登录页，请重新登录`);
  }

  try {
    return JSON.parse(response.body);
  } catch {
    throw new Error(`${what}失败：服务端返回的不是 JSON（会话可能已失效）`);
  }
}

/** 写操作的响应校验（POST 共用）。 */
function parseWriteResponse(
  response: { status: number; body: string },
  what: string,
): unknown {
  if (REDIRECT_STATUSES.has(response.status)) {
    throw new SessionExpiredError(`${what}失败：学工系统会话已失效，请重新登录`);
  }
  if (response.status >= 400) {
    throw new Error(`${what}失败（HTTP ${response.status}）`);
  }
  try {
    return JSON.parse(response.body);
  } catch {
    throw new Error(`${what}失败：服务端返回的不是 JSON（会话可能已失效）`);
  }
}

/** POST 表单（urlencoded）。写操作**不自动重试**，避免重复提交。 */
async function postForm(
  session: CookieSession,
  url: string,
  fields: Record<string, string>,
  what: string,
  referer: string,
): Promise<unknown> {
  const response = await session.postForm(url, fields, {
    follow: false,
    headers: apiHeaders(referer),
  });
  return parseWriteResponse(response, what);
}

/** POST multipart（带附件）。 */
async function postMultipart(
  session: CookieSession,
  url: string,
  form: FormData,
  what: string,
  referer: string,
): Promise<unknown> {
  const response = await session.postMultipart(url, form, {
    follow: false,
    headers: apiHeaders(referer),
  });
  return parseWriteResponse(response, what);
}

/** 从 `{ result:false, errorInfoList:[...], msg }` 里取最可读的错误。 */
function throwIfFailed(json: unknown, what: string): void {
  if (!isRecord(json)) throw new Error(`${what}失败：响应格式异常`);
  if (json['result'] === true) return;

  const errors = json['errorInfoList'];
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(str(errors[0]));
  }
  throw new Error(str(json['msg']) || `${what}失败，请稍后重试`);
}

// ===========================================================================
// 请假
// ===========================================================================

export interface LeaveDictItem {
  id: string;
  name: string;
}

export interface LeaveRecord {
  id: string;
  typeName: string;
  startTime: string;
  endTime: string;
  days: number;
  hours: number;
  reason: string;
  auditStatus: string;
  auditStatusName: string;
  auditResultName: string;
  hasFile: boolean;
  /** 服务端语义化的状态文案（对齐 Dart `statusLabel`） */
  statusLabel: string;
  /** 仅待审核（SHZT=0）允许撤销 */
  canDelete: boolean;
}

export interface LeaveDuration {
  days: number;
  hours: number;
}

/** DataTables 风格的公共查询参数（Dart 里写死）。 */
function dataTablesQuery(size = 50): string {
  return new URLSearchParams({
    bSortable_0: 'false',
    bSortable_1: 'false',
    iSortingCols: '1',
    iDisplayStart: '0',
    iDisplayLength: String(size),
    iSortCol_0: '3',
    sSortDir_0: 'desc',
    _t_s_: stamp(),
  }).toString();
}

/** 请假类别字典（事假 / 病假）。 */
export async function fetchLeaveTypes(session: CookieSession): Promise<LeaveDictItem[]> {
  const url = `${URLS.xgxtLeaveDict}?${new URLSearchParams({
    name: 'MsDict',
    paramValue: 'DM_SF_QJLX',
    _t_s_: stamp(),
  })}`;
  const json = await getJson(session, url, '获取请假类别', LEAVE_REFERER);
  if (!Array.isArray(json)) throw new Error('请假类别数据格式异常');
  return json.filter(isRecord).map((item) => ({
    id: str(item['id']),
    name: str(item['text']),
  }));
}

/** 按起止时间算请假时长。时间格式 `yyyy-MM-dd HH:mm`。 */
export async function calculateLeaveDuration(
  session: CookieSession,
  start: string,
  end: string,
): Promise<LeaveDuration> {
  const url = `${URLS.xgxtLeaveCalculate}?${new URLSearchParams({
    kssj: start,
    jssj: end,
    _t_s_: stamp(),
  })}`;
  const json = await getJson(session, url, '计算请假时长', LEAVE_REFERER);
  if (!isRecord(json)) throw new Error('请假时长数据格式异常');
  return { days: toInt(json['day']), hours: toInt(json['hour']) };
}

/** 请假记录列表。 */
export async function fetchLeaveList(session: CookieSession): Promise<LeaveRecord[]> {
  const url = `${URLS.xgxtLeaveList}?${dataTablesQuery()}`;
  const json = await getJson(session, url, '获取请假记录', LEAVE_REFERER);
  if (!isRecord(json)) throw new Error('请假列表数据格式异常');

  const rows = json['aaData'];
  if (!Array.isArray(rows)) throw new Error('请假列表数据格式异常');

  return rows.filter(isRecord).map((row) => {
    const auditStatus = str(row['SHZT']);
    const auditStatusName = str(row['SHZTMC']);
    const auditResultName = str(row['SHJGMC']);

    let statusLabel = auditStatusName;
    if (statusLabel === '') {
      if (auditStatus === '0') statusLabel = '待审核';
      else if (auditStatus === '8') statusLabel = '审核中';
      else if (auditStatus === '9') {
        statusLabel = auditResultName === '' ? '已审核' : `已审核·${auditResultName}`;
      } else statusLabel = '状态未知';
    } else if (auditStatus === '9' && auditResultName !== '') {
      statusLabel = `${auditStatusName}·${auditResultName}`;
    }

    return {
      id: str(row['ID']),
      typeName: str(row['LXMC']),
      startTime: str(row['KSSJ']),
      endTime: str(row['JSSJ']),
      days: toInt(row['TS']),
      hours: toInt(row['HOUR']),
      reason: str(row['QJSY']),
      auditStatus,
      auditStatusName,
      auditResultName,
      hasFile: str(row['HAS_FILE']) === '1',
      statusLabel,
      canDelete: auditStatus === '0',
    };
  });
}

/** 提交请假单。无附件走 urlencoded，有附件走 multipart（与抓包一致）。 */
export async function submitLeave(
  session: CookieSession,
  fields: Record<string, string>,
  attachment?: { filename: string; bytes: Uint8Array; contentType: string },
): Promise<void> {
  const url = `${URLS.xgxtLeaveApply}?${new URLSearchParams({ _t_s_: stamp() })}`;

  let json: unknown;
  if (attachment === undefined) {
    json = await postForm(session, url, fields, '提交请假申请', LEAVE_REFERER);
  } else {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append(
      'pathFile',
      new Blob([attachment.bytes], { type: attachment.contentType }),
      attachment.filename,
    );
    json = await postMultipart(session, url, form, '提交请假申请', LEAVE_REFERER);
  }
  throwIfFailed(json, '提交请假申请');
}

/** 撤销待审核的请假单。 */
export async function deleteLeave(session: CookieSession, id: string): Promise<void> {
  if (id === '') throw new Error('缺少请假单标识');
  const url = `${URLS.xgxtLeaveDelete}?${new URLSearchParams({ _t_s_: stamp() })}`;
  const json = await postForm(session, url, { dm: id }, '撤销请假申请', LEAVE_REFERER);
  if (json === true) return;
  if (isRecord(json) && json['msg'] !== undefined) {
    throw new Error(str(json['msg']));
  }
  throw new Error('撤销失败，该请假单可能已进入审核');
}

// ===========================================================================
// 学工问卷
// ===========================================================================

export interface QuestionnaireItem {
  dm: string;
  title: string;
  startTime: string;
  endTime: string;
  taskTimeM: string;
  doneInd: string;
  flag: string;
  zt: string;
  shzt: string;
  /** 已提交 / 已截止 / 待填写 */
  statusLabel: string;
  isSubmitted: boolean;
  isExpired: boolean;
}

export interface QuestionnaireOption {
  dm: string;
  name: string;
}

export interface QuestionnaireQuestion {
  dm: string;
  title: string;
  desc: string;
  /** 1=单选 2=多选 4=填空 */
  stType: string;
  /** 填空细分：1=文本 2=数字/电话 3/4=日期 */
  txType: string;
  required: boolean;
  options: QuestionnaireOption[];
  /** 已填写的内容（回填用） */
  answer: string;
}

export interface QuestionnaireDetail {
  dm: string;
  title: string;
  desc: string;
  jgM: string;
  canSubmit: boolean;
  questions: QuestionnaireQuestion[];
}

/** 问卷列表。 */
export async function fetchQuestionnaireList(
  session: CookieSession,
): Promise<QuestionnaireItem[]> {
  const url = `${URLS.xgxtQuestionnaireList}?${dataTablesQuery()}`;
  const json = await getJson(session, url, '获取问卷列表', QUESTIONNAIRE_REFERER);
  if (!isRecord(json)) throw new Error('问卷列表数据格式异常');

  const rows = json['aaData'];
  if (!Array.isArray(rows)) throw new Error('问卷列表数据格式异常');

  const now = Date.now();

  return rows.filter(isRecord).map((row) => {
    const zt = str(row['ZT']);
    const shzt = str(row['SHZT']);
    const doneInd = str(row['DONE_IND']);
    const endTime = str(row['JSSJ']);

    const isSubmitted = zt === '1' || shzt === '1' || doneInd === '1';

    let isExpired = false;
    if (endTime !== '') {
      const parsed = Date.parse(endTime.replace(/-/g, '/'));
      if (Number.isFinite(parsed)) isExpired = now > parsed;
    }

    const statusLabel = isSubmitted ? '已提交' : isExpired ? '已截止' : '待填写';

    return {
      dm: str(row['DM']),
      title: str(row['MC']),
      startTime: str(row['KSSJ']),
      endTime,
      taskTimeM: str(row['TASK_TIME_M']),
      doneInd,
      flag: str(row['FLAG']),
      zt,
      shzt,
      statusLabel,
      isSubmitted,
      isExpired,
    };
  });
}

/** 问卷详情（含题目）。`tasktime` 来自列表项的 `TASK_TIME_M`。 */
export async function fetchQuestionnaireDetail(
  session: CookieSession,
  taskTimeM: string,
): Promise<QuestionnaireDetail> {
  if (taskTimeM === '') throw new Error('该问卷缺少任务标识，无法打开');

  const url = `${URLS.xgxtQuestionnaireDetail}?${new URLSearchParams({
    tasktime: taskTimeM,
    busType: '',
    _t_s_: stamp(),
  })}`;
  const json = await getJson(session, url, '获取问卷详情', QUESTIONNAIRE_REFERER);
  if (!isRecord(json)) throw new Error('问卷详情数据格式异常');

  const rawList = json['stList'];
  const questions: QuestionnaireQuestion[] = Array.isArray(rawList)
    ? rawList.filter(isRecord).map((q) => {
        const rawOptions = q['stxxList'];
        const options: QuestionnaireOption[] = Array.isArray(rawOptions)
          ? rawOptions.filter(isRecord).map((o) => ({
              dm: str(o['dm']),
              name: str(o['mc']),
            }))
          : [];
        return {
          dm: str(q['dm']),
          title: str(q['stmc']),
          desc: str(q['stsm']),
          stType: str(q['stType']),
          txType: str(q['txType']),
          required: str(q['btInd']) === '1',
          options,
          answer: str(q['jg']),
        };
      })
    : [];

  return {
    dm: str(json['dm']),
    title: str(json['mc']) || str(json['sm']),
    desc: str(json['sm']) || str(json['bz']),
    jgM: str(json['jgM']),
    canSubmit: str(json['canSubmit'] ?? '1') === '1',
    questions,
  };
}

/**
 * 提交问卷。
 *
 * `answers` 的 key 是题目 `dm`；选择题 value 是选项 `dm`（多选为数组），
 * 填空题 value 是文本。**多选题同一 key 必须重复出现多次**，与浏览器抓包一致，
 * 所以这里手工拼 body 而不是用 URLSearchParams（后者会覆盖）。
 */
export async function submitQuestionnaire(
  session: CookieSession,
  detail: QuestionnaireDetail,
  answers: Record<string, string | string[]>,
): Promise<void> {
  // 用 [key, value][] 形式提交：encodeForm 会保留重复 key，
  // 这正是多选题需要的（Record 形式会被覆盖）。
  const entries: Array<[string, string]> = [];
  const add = (key: string, value: string) => entries.push([key, value]);

  for (const question of detail.questions) {
    const value = answers[question.dm];
    if (Array.isArray(value)) {
      if (value.length === 0) add(question.dm, '');
      else for (const item of value) add(question.dm, item);
    } else {
      add(question.dm, value ?? '');
    }
  }
  add('ks_jgdm', detail.jgM);
  add('wzDz', '');
  add('wzZb', '');
  add('wzLy', '');
  add('operationType', '');

  const url = `${URLS.xgxtQuestionnaireSubmit}?${new URLSearchParams({ _t_s_: stamp() })}`;
  const response = await session.postForm(url, entries, {
    follow: false,
    headers: apiHeaders(QUESTIONNAIRE_REFERER),
  });
  throwIfFailed(parseWriteResponse(response, '提交问卷'), '提交问卷');
}
