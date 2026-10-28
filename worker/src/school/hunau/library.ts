/**
 * 图书馆座位预约（超星 `office.chaoxing.com`）客户端。
 * 对齐 ChillEast `lib/features/library/services/library_service.dart`。
 *
 * 两条与登录链的关系：
 *  1. 登录链已经产出 `.chaoxing.com` 的 UID Cookie，所以这里不需要额外换票；
 *  2. 但座位系统还要求先用 `GET /front/third/apps/seat/index?fidEnc=…`
 *     完成一次「凭证置换」（见 `seedSeatSession`），否则后续接口会跳登录页。
 *
 * 签名：提交预约时页面里有一个 `input#submit_enc`，把它和排序后的
 * `[k=v]` 片段拼在一起做 MD5 —— 见 `generateEnc`（逆向自 submitVerify.min.js）。
 */

import { CookieSession } from '../../auth/http';
import { SessionExpiredError } from '../../auth/session-manager';
import { md5Hex } from '../../util/md5';
import { DESKTOP_UA, HOSTS } from './constants';

/** 图书馆（含座位系统）在超星侧的部门加密 ID。 */
export const DEPT_ID_ENC = '4dc85b11270eab26';

/**
 * 抓 `submit_enc` 的两个页面写死了 Pixel 9 的 UA（不是 CHAOXING_UA，也不是 DESKTOP_UA）。
 * 与 ChillEast 客户端一致，改动会让页面回到另一套模板、`#submit_enc` 消失。
 */
export const PIXEL9_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/151.0.0.0 Mobile Safari/537.36';

const OFFICE_BASE = HOSTS.chaoxingOffice;

export const SEAT_URLS = {
  /** 第三方入口：完成凭证置换 */
  thirdEntrance: `${OFFICE_BASE}/front/third/apps/seat/index?fidEnc=${DEPT_ID_ENC}`,
  /** 首页数据：当前预约 / 即将开始 / 系统规则 */
  index: `${OFFICE_BASE}/data/apps/seat/index`,
  /** 阅览室列表 */
  roomList: `${OFFICE_BASE}/data/apps/seat/room/list`,
  /** 选座页（含 submit_enc） */
  selectPage: `${OFFICE_BASE}/front/third/apps/seat/select`,
  /** 快速预约页（含 submit_enc，签名参数与选座页不同） */
  liveSelectPage: `${OFFICE_BASE}/front/third/apps/seat/live/select`,
  /** 提交预约（普通与快速共用） */
  submit: `${OFFICE_BASE}/data/apps/seat/submit`,
  /** 快速预约：智能匹配空闲座位 */
  matchSeat: `${OFFICE_BASE}/data/apps/seat/getseatinfo`,
  /** 座位分布图（网格坐标 + 障碍物配置） */
  seatGrid: `${OFFICE_BASE}/data/apps/seat/seatgrid/roomid`,
  /** 指定时段已占用的座位号 */
  usedSeats: `${OFFICE_BASE}/data/apps/seat/getusedseatnums`,
  /** 分类层级（一级 / 二级楼层 / 三级阅览室） */
  levels: `${OFFICE_BASE}/data/apps/seat/levels`,
  /** 快速预约页的开放时间与服务器当前日期 */
  startEndTime: `${OFFICE_BASE}/data/apps/seat/getstartendtime`,
  /** 取消预约 */
  cancel: `${OFFICE_BASE}/data/apps/seat/cancel`,
  /** 签到 */
  sign: `${OFFICE_BASE}/data/apps/seat/sign`,
  /** 退座（与取消预约是两个不同业务） */
  signBack: `${OFFICE_BASE}/data/apps/seat/signback`,
} as const;

/** 业务错误（服务端明确拒绝 / 页面结构变化），与「会话失效」区分开。 */
export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryError';
  }
}

export interface SeatReserve {
  id: number;
  roomId: number;
  deptId: number;
  seatNum: string;
  /** 起止时间：epoch 毫秒 */
  startTime: number;
  endTime: number;
  expireTime: number | null;
  insertTime: number | null;
  status: number;
  firstLevelName: string;
  secondLevelName: string;
  thirdLevelName: string;
  today: string;
  duration: string;
  uname: string;
  uid: number | null;
}

export interface SeatIndexData {
  curReserves: SeatReserve[];
  nearReserves: SeatReserve[];
}

export interface MatchedSeat {
  roomId: number;
  seatNum: string;
  firstLevelName: string;
  secondLevelName: string;
  thirdLevelName: string;
  startTime: number;
  endTime: number;
  duration: string;
}

export interface ReservationRequest {
  roomId: number;
  seatNum: string;
  day: string;
  startTime: string;
  endTime: string;
}

// ---- 小工具 ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return toInt(value, 0);
}

function toStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** 阅览室的完整名称：`图书馆 · 2楼 · 301`（与 Dart `fullRoomName` 一致）。 */
export function fullRoomName(parts: {
  firstLevelName?: string;
  secondLevelName?: string;
  thirdLevelName?: string;
}): string {
  return [
    parts.firstLevelName ?? '',
    parts.secondLevelName ?? '',
    parts.thirdLevelName ?? '',
  ]
    .filter((part) => part !== '')
    .join(' · ');
}

/** 座位预约状态码 → 中文标签（对齐 Dart `ReserveStatus`）。 */
export function reserveStatusLabel(status: number): string {
  switch (status) {
    case 0:
      return '待签到';
    case 1:
      return '使用中';
    case 3:
      return '暂离中';
    case 5:
      return '可签到';
    case 7:
      return '已结束';
    default:
      return '未知';
  }
}

/** `buildSeatReserve` 里 status 字段可能出现在 status 或 reserveStatus。 */
export function parseSeatReserve(raw: Record<string, unknown>): SeatReserve {
  const now = Date.now();
  const rawStart = raw['startTime'];
  const rawEnd = raw['endTime'];
  return {
    id: toInt(raw['id']),
    roomId: toInt(raw['roomId']),
    deptId: toInt(raw['deptId']),
    seatNum: toStr(raw['seatNum']),
    startTime: rawStart === null || rawStart === undefined ? now : toInt(rawStart),
    endTime: rawEnd === null || rawEnd === undefined ? now : toInt(rawEnd),
    expireTime: toIntOrNull(raw['expireTime']),
    insertTime: toIntOrNull(raw['inserttime']),
    status: toInt(raw['status']),
    firstLevelName: toStr(raw['firstLevelName']),
    secondLevelName: toStr(raw['secondLevelName']),
    thirdLevelName: toStr(raw['thirdLevelName']),
    today: toStr(raw['today']),
    duration: toStr(raw['duration']),
    uname: toStr(raw['uname']),
    uid: toIntOrNull(raw['uid']),
  };
}

export function parseMatchedSeat(raw: Record<string, unknown>): MatchedSeat {
  const now = Date.now();
  const rawStart = raw['startTime'];
  const rawEnd = raw['endTime'];
  return {
    roomId: toInt(raw['roomId']),
    seatNum: toStr(raw['seatNum']),
    firstLevelName: toStr(raw['firstLevelName']),
    secondLevelName: toStr(raw['secondLevelName']),
    thirdLevelName: toStr(raw['thirdLevelName']),
    startTime: rawStart === null || rawStart === undefined ? now : toInt(rawStart),
    endTime: rawEnd === null || rawEnd === undefined ? now : toInt(rawEnd),
    duration: toStr(raw['duration']),
  };
}

// ---- 响应解析 ----

/**
 * 超星这套接口统一返回 `{"success":true,"data":{…}}`；
 * 会话失效时**有两种表现**：
 *   1. 返回 HTML 登录页（选座页 / 快速预约页走这条）；
 *   2. 返回 HTTP 200 + `{"msg":"您当前未登录","success":false}`
 *      —— 实测首页 / getseatinfo / submit 都是这条。
 * 两种都必须识别成 SessionExpiredError，外层才会清掉缓存会话重登一次再试。
 * ChillEast 客户端第 2 种会当成普通业务错误（它的 Cookie 由 App 自己维持），
 * 在无状态的 Worker 里必须当成会话问题，否则会话静默过期后就再也恢复不了。
 */
const SESSION_EXPIRED_HINTS = [
  '未登录',
  '登录已过期',
  '登录过期',
  '请先登录',
  '登录超时',
  '重新登录',
  '会话已失效',
];

function isSessionExpiredMessage(message: string): boolean {
  return SESSION_EXPIRED_HINTS.some((hint) => message.includes(hint));
}

export function parseSeatResponse(body: string, defaultError: string): Record<string, unknown> {
  const trimmed = body.trim();
  let parsed: Record<string, unknown> | null = null;

  if (trimmed.startsWith('{')) {
    try {
      const decoded: unknown = JSON.parse(trimmed);
      if (isRecord(decoded)) parsed = decoded;
    } catch {
      parsed = null;
    }
  }

  if (parsed === null) {
    if (looksLikeLoginPage(trimmed)) {
      throw new SessionExpiredError('座位系统会话已失效（返回了登录页）');
    }
    if (trimmed.includes('<html') || trimmed.includes('<!DOCTYPE html>')) {
      throw new SessionExpiredError('登录会话已过期，请尝试重新登录');
    }
    throw new LibraryError(`${defaultError}: ${trimmed.slice(0, 200)}`);
  }

  if (parsed['success'] !== true) {
    const message = toStr(parsed['msg']) || toStr(parsed['message']);
    if (isSessionExpiredMessage(message)) {
      throw new SessionExpiredError(`座位系统会话已失效（${message}）`);
    }
    throw new LibraryError(message !== '' ? message : defaultError);
  }

  return parsed;
}

/** 超星的未登录跳转目标（passport2 的 mlogin 页）。 */
export function looksLikeLoginPage(html: string): boolean {
  return (
    html.includes('passport2.chaoxing.com') ||
    /<title>\s*登录\s*<\/title>/.test(html) ||
    html.includes('name="pwd"') ||
    html.includes('id="loginForm"')
  );
}

/**
 * 抓页面里的 `input#submit_enc`（预约签名凭证）。
 * 先用 HTMLRewriter 取属性，失败再退回正则 —— 与 Dart 的两级兜底一致。
 */
export async function extractSubmitEnc(
  html: string,
  missingMessage: string,
): Promise<string> {
  let value = '';
  await new HTMLRewriter()
    .on('input#submit_enc', {
      element(element) {
        const attribute = element.getAttribute('value');
        if (attribute !== null && attribute !== '' && value === '') value = attribute;
      },
    })
    .transform(new Response(html))
    .text();

  if (value !== '') return value;

  const match = /id="submit_enc"\s+value="(.*?)"/.exec(html);
  if (match !== null && match[1] !== '') return match[1];

  if (looksLikeLoginPage(html)) {
    throw new SessionExpiredError('座位系统会话已失效（选座页跳到了登录页）');
  }
  throw new LibraryError(missingMessage);
}

/**
 * 计算提交参数签名（逆向自超星 submitVerify.min.js）。
 * 规则：把参数按 key 字典序排好，拼成 `[k=v]` 片段，最后追加 `[submit_enc]`，再取 MD5。
 */
export function buildEncSource(
  params: Readonly<Record<string, string | number>>,
  submitEnc: string,
): string {
  const parts = Object.keys(params)
    .sort()
    .map((key) => `[${key}=${params[key] ?? ''}]`);
  parts.push(`[${submitEnc}]`);
  return parts.join('');
}

/** 与 Dart `_generateEnc` 完全一致：返回小写十六进制 MD5。 */
export function generateEnc(
  params: Readonly<Record<string, string | number>>,
  submitEnc: string,
): string {
  return md5Hex(buildEncSource(params, submitEnc));
}

// ---- 会话准备 ----

export type LogFn = (message: string, fields?: Record<string, unknown>) => void;

/**
 * 凭证置换：先访问第三方入口，让超星把当前会话与座位系统绑定。
 * 与 Dart 一致：失败只记日志不抛错 —— 真正的失败会在后续接口以
 * SessionExpiredError 的形式暴露，由外层重登后重试。
 */
export async function seedSeatSession(session: CookieSession, log?: LogFn): Promise<void> {
  try {
    const response = await session.get(SEAT_URLS.thirdEntrance, {
      headers: { 'User-Agent': PIXEL9_UA, Accept: 'text/html,application/xhtml+xml' },
    });
    log?.('座位系统凭证置换完成', { status: response.status });
  } catch (error) {
    log?.('座位系统凭证置换失败（继续尝试后续接口）', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---- 业务接口 ----

function seatHeaders(referer: string, options: { origin?: boolean } = {}): Record<string, string> {
  return {
    'User-Agent': DESKTOP_UA,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: referer,
    ...(options.origin === true ? { Origin: OFFICE_BASE } : {}),
  };
}

/** 首页数据：当前预约（curReserves）与即将开始（nearReserves）。 */
export async function fetchSeatIndex(session: CookieSession): Promise<SeatIndexData> {
  const referer = SEAT_URLS.thirdEntrance;
  const response = await session.get(
    `${SEAT_URLS.index}?fidEnc=${DEPT_ID_ENC}&r=${Date.now()}`,
    { headers: seatHeaders(referer) },
  );
  if (response.status !== 200) {
    throw new LibraryError(`获取图书馆首页数据失败: HTTP ${response.status}`);
  }

  const json = parseSeatResponse(response.body, '获取图书馆数据失败');
  const data = asRecord(json['data']);
  return {
    curReserves: asRecords(data['curReserves']).map(parseSeatReserve),
    nearReserves: asRecords(data['nearReserves']).map(parseSeatReserve),
  };
}

export interface LibraryRoom {
  id: number;
  roomId: number;
  displayName: string;
  roomName: string;
  name: string;
  firstLevelName: string;
  secondLevelName: string;
  thirdLevelName: string;
  capacity: number;
  moreInfo: string;
  reserveBeforeDay?: number;
  reserveBeforeTime?: string;
  raw?: unknown;
}

/** 查询指定日期的阅览室列表（带分页与必须参数）。 */
export async function fetchLibraryRooms(
  session: CookieSession,
  day: string,
): Promise<LibraryRoom[]> {
  const referer = `${OFFICE_BASE}/front/third/apps/seat/list?deptIdEnc=${DEPT_ID_ENC}`;
  const query = new URLSearchParams({
    time: '',
    cpage: '1',
    pageSize: '100',
    firstLevelName: '',
    secondLevelName: '',
    thirdLevelName: '',
    day,
    deptIdEnc: DEPT_ID_ENC,
  });

  const response = await session.get(`${SEAT_URLS.roomList}?${query.toString()}`, {
    headers: seatHeaders(referer),
  });

  if (response.status !== 200) {
    throw new LibraryError(`获取阅览室列表失败: HTTP ${response.status}`);
  }

  const json = parseSeatResponse(response.body, '获取阅览室列表失败');
  const data = asRecord(json['data']);
  const listRaw = Array.isArray(data['seatRoomList'])
    ? (data['seatRoomList'] as Array<Record<string, unknown>>)
    : Array.isArray(data['roomList'])
      ? (data['roomList'] as Array<Record<string, unknown>>)
      : Array.isArray(json['data'])
        ? (json['data'] as Array<Record<string, unknown>>)
        : [];

  return listRaw.map((item) => {
    const id = toInt(item['id']);
    const firstLevelName = toStr(item['firstLevelName']) || '图书馆';
    const secondLevelName = toStr(item['secondLevelName']);
    const thirdLevelName = toStr(item['thirdLevelName']);
    const displayName = thirdLevelName || secondLevelName || '自习室';
    const capacity = toInt(item['capacity']);

    return {
      id,
      roomId: id,
      displayName,
      roomName: displayName,
      name: displayName,
      firstLevelName,
      secondLevelName,
      thirdLevelName,
      capacity,
      moreInfo: capacity > 0 ? `${capacity} 个座位` : '开放自习中',
      reserveBeforeDay: toIntOrNull(item['reserveBeforeDay']) ?? undefined,
      reserveBeforeTime: toStr(item['reserveBeforeTime']) || undefined,
      raw: item,
    };
  });
}

/** 快速预约：让服务端按时间与楼层/阅览室偏好匹配一个空闲座位。 */
export async function matchSeat(
  session: CookieSession,
  params: {
    startTime: string;
    endTime: string;
    firstLevelName?: string;
    secondLevelName?: string;
    thirdLevelName?: string;
  },
): Promise<MatchedSeat> {
  const response = await session.postForm(
    SEAT_URLS.matchSeat,
    [
      ['deptIdEnc', DEPT_ID_ENC],
      ['startTime', params.startTime],
      ['endTime', params.endTime],
      ['firstLevelName', params.firstLevelName ?? ''],
      ['secondLevelName', params.secondLevelName ?? ''],
      ['thirdLevelName', params.thirdLevelName ?? ''],
    ],
    {
      headers: seatHeaders(`${SEAT_URLS.liveSelectPage}?deptIdEnc=${DEPT_ID_ENC}`, {
        origin: true,
      }),
    },
  );
  if (response.status !== 200) {
    throw new LibraryError(`匹配座位失败: HTTP ${response.status}`);
  }

  const json = parseSeatResponse(response.body, '暂无符合条件的空闲座位');
  const data = asRecord(json['data']);
  const matchReserve = data['matchReserve'];
  if (!isRecord(matchReserve)) {
    throw new LibraryError('暂无符合条件的空闲座位，请调整筛选条件后重试');
  }
  return parseMatchedSeat(matchReserve);
}

function selectPageUrl(roomId: number, day: string): string {
  return (
    `${SEAT_URLS.selectPage}?deptIdEnc=${DEPT_ID_ENC}&id=${roomId}` +
    `&day=${encodeURIComponent(day)}&backLevel=2&fidEnc=${DEPT_ID_ENC}`
  );
}

/** 从选座页抓 `submit_enc`（该页面写死 Pixel 9 UA）。 */
export async function fetchSeatSubmitEnc(
  session: CookieSession,
  params: { roomId: number; day: string },
): Promise<string> {
  const response = await session.get(selectPageUrl(params.roomId, params.day), {
    headers: {
      'User-Agent': PIXEL9_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (response.status !== 200) {
    throw new LibraryError(`获取选座页面失败: HTTP ${response.status}`);
  }
  return await extractSubmitEnc(response.body, '无法从页面提取预约签名凭证');
}

/** 从快速预约页抓 `submit_enc`（同样是写死的 Pixel 9 UA）。 */
export async function fetchLiveSubmitEnc(session: CookieSession): Promise<string> {
  const response = await session.get(`${SEAT_URLS.liveSelectPage}?deptIdEnc=${DEPT_ID_ENC}`, {
    headers: {
      'User-Agent': PIXEL9_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (response.status !== 200) {
    throw new LibraryError(`获取快速预约页面失败: HTTP ${response.status}`);
  }
  return await extractSubmitEnc(response.body, '无法从快速预约页面提取签名凭证');
}

/** 从 `data.seatReserve` 里取出预约结果；没有有效结果就抛错。 */
function extractReserve(json: Record<string, unknown>, fallbackMessage: string): SeatReserve {
  const data = asRecord(json['data']);
  const reserveRaw = data['seatReserve'];
  if (!isRecord(reserveRaw) || Object.keys(reserveRaw).length === 0) {
    const message = toStr(json['msg']) || toStr(json['message']);
    throw new LibraryError(message !== '' ? message : fallbackMessage);
  }
  const reserve = parseSeatReserve(reserveRaw);
  if (reserve.id <= 0 && reserve.seatNum === '') {
    throw new LibraryError(fallbackMessage);
  }
  return reserve;
}

/**
 * 提交普通座位预约。
 * 注意签名参数里**带 deptIdEnc**（快速预约不带），这是两条链路的唯一区别。
 */
export async function submitReservation(
  session: CookieSession,
  request: ReservationRequest,
): Promise<SeatReserve> {
  const submitEnc = await fetchSeatSubmitEnc(session, {
    roomId: request.roomId,
    day: request.day,
  });

  const signed: Record<string, string | number> = {
    deptIdEnc: DEPT_ID_ENC,
    roomId: request.roomId,
    day: request.day,
    startTime: request.startTime,
    endTime: request.endTime,
    seatNum: request.seatNum,
    captcha: '',
    wyToken: '',
  };
  const enc = generateEnc(signed, submitEnc);

  const referer = selectPageUrl(request.roomId, request.day);
  const response = await session.postForm(
    SEAT_URLS.submit,
    [
      ['deptIdEnc', DEPT_ID_ENC],
      ['roomId', String(request.roomId)],
      ['startTime', request.startTime],
      ['endTime', request.endTime],
      ['day', request.day],
      ['seatNum', request.seatNum],
      ['captcha', ''],
      ['wyToken', ''],
      ['enc', enc],
    ],
    { headers: seatHeaders(referer) },
  );
  if (response.status !== 200) {
    throw new LibraryError(`预约请求失败: HTTP ${response.status}`);
  }

  const json = parseSeatResponse(response.body, '预约失败，请稍后重试');
  return extractReserve(json, '预约失败，服务器未返回有效预约结果');
}

/**
 * 提交快速预约（签名参数里不带 deptIdEnc，且从 live/select 页面取 submit_enc）。
 * 这是**写操作**：调用成功即意味着座位已被占用。
 */
export async function submitQuickReservation(
  session: CookieSession,
  request: ReservationRequest,
): Promise<SeatReserve> {
  const submitEnc = await fetchLiveSubmitEnc(session);

  const signed: Record<string, string | number> = {
    roomId: request.roomId,
    startTime: request.startTime,
    endTime: request.endTime,
    day: request.day,
    captcha: '',
    seatNum: request.seatNum,
    wyToken: '',
  };
  const enc = generateEnc(signed, submitEnc);

  const referer = `${SEAT_URLS.liveSelectPage}?deptIdEnc=${DEPT_ID_ENC}`;
  const response = await session.postForm(
    SEAT_URLS.submit,
    [
      ['roomId', String(request.roomId)],
      ['startTime', request.startTime],
      ['endTime', request.endTime],
      ['day', request.day],
      ['captcha', ''],
      ['seatNum', request.seatNum],
      ['wyToken', ''],
      ['enc', enc],
    ],
    { headers: seatHeaders(referer, { origin: true }) },
  );
  if (response.status !== 200) {
    throw new LibraryError(`快速预约请求失败: HTTP ${response.status}`);
  }

  const json = parseSeatResponse(response.body, '快速预约失败，请稍后重试');
  return extractReserve(json, '快速预约失败，服务器未返回有效预约结果');
}

// ---------------------------------------------------------------------------
// 座位分布图（原版 library_seat_screen 依赖）
// ---------------------------------------------------------------------------

export interface SeatGridSeat {
  id: number;
  roomId: number;
  seatNum: string;
  /** 1-based 列 */
  x: number;
  /** 1-based 行 */
  y: number;
  /** 非 0 表示该座位在服务器侧已被占用 */
  reserveStatus: number;
}

export interface SeatGridObstacle {
  x: number;
  y: number;
  type: number;
  label: string;
}

export interface SeatGridData {
  roomId: number;
  /** 网格列数 */
  cols: number;
  /** 网格行数 */
  rows: number;
  seats: SeatGridSeat[];
  obstacles: SeatGridObstacle[];
}

/** 解析 `otherDatas.config` —— 超星把它塞成一个 JSON **字符串**。 */
export function parseGridConfig(raw: unknown): SeatGridObstacle[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const decoded: unknown = JSON.parse(raw);
    return asRecords(decoded).map((item) => ({
      x: toInt(item['x']),
      y: toInt(item['y']),
      type: toInt(item['type']),
      label: toStr(item['label']),
    }));
  } catch {
    return [];
  }
}

export function parseSeatGrid(data: Record<string, unknown>): SeatGridData {
  const other = asRecord(data['otherDatas']);
  return {
    roomId: toInt(other['roomId']),
    cols: toInt(other['x']),
    rows: toInt(other['y']),
    seats: asRecords(data['seatDatas']).map((item) => ({
      id: toInt(item['id']),
      roomId: toInt(item['roomId']),
      seatNum: toStr(item['seatNum']),
      x: toInt(item['x']),
      y: toInt(item['y']),
      reserveStatus: toInt(item['reserveStatus']),
    })),
    obstacles: parseGridConfig(other['config']),
  };
}

export function seatGridUrl(roomId: number): string {
  return `${SEAT_URLS.seatGrid}?roomId=${roomId}&fidEnc=${DEPT_ID_ENC}`;
}

export function seatSelectReferer(roomId: number, day: string): string {
  return selectPageUrl(roomId, day);
}

/** 座位分布图的 Referer 是选座页（不带 day）；与 Dart `fetchSeatGrid` 一致。 */
export async function fetchSeatGrid(
  session: CookieSession,
  roomId: number,
): Promise<SeatGridData> {
  const referer =
    `${SEAT_URLS.selectPage}?deptIdEnc=${DEPT_ID_ENC}&id=${roomId}&fidEnc=${DEPT_ID_ENC}`;
  const response = await session.get(seatGridUrl(roomId), { headers: seatHeaders(referer) });
  if (response.status !== 200) {
    throw new LibraryError(`获取座位分布图失败: HTTP ${response.status}`);
  }
  const json = parseSeatResponse(response.body, '获取座位分布图失败');
  return parseSeatGrid(asRecord(json['data']));
}

/** 解析 `data.seatReserves`：可能是字符串数组，也可能是带 seatNum 的对象数组。 */
export function parseUsedSeatNums(data: Record<string, unknown>): string[] {
  const list = data['seatReserves'];
  if (!Array.isArray(list)) return [];
  const result: string[] = [];
  for (const item of list) {
    if (typeof item === 'string' && item !== '') {
      result.push(item);
    } else if (isRecord(item) && item['seatNum'] !== undefined) {
      result.push(toStr(item['seatNum']));
    }
  }
  return result;
}

/**
 * 指定时段已占用的座位号。
 * 与 Dart 的差异：Dart 把错误吞成空集合（座图会全绿），这里**向上抛**，
 * 让路由返回明确错误——否则用户以为整屋空座，点进去却约不到。
 */
export async function fetchUsedSeats(
  session: CookieSession,
  params: { roomId: number; day: string; startTime: string; endTime: string },
): Promise<string[]> {
  const referer =
    `${SEAT_URLS.selectPage}?deptIdEnc=${DEPT_ID_ENC}&id=${params.roomId}` +
    `&day=${encodeURIComponent(params.day)}&backLevel=2&fidEnc=${DEPT_ID_ENC}`;
  const response = await session.postForm(
    SEAT_URLS.usedSeats,
    [
      ['roomId', String(params.roomId)],
      ['startTime', params.startTime],
      ['endTime', params.endTime],
      ['day', params.day],
      ['fidEnc', DEPT_ID_ENC],
    ],
    { headers: seatHeaders(referer) },
  );
  if (response.status !== 200) {
    throw new LibraryError(`获取占用座位失败: HTTP ${response.status}`);
  }
  const json = parseSeatResponse(response.body, '获取占用座位失败');
  return parseUsedSeatNums(asRecord(json['data']));
}

// ---------------------------------------------------------------------------
// 分级（快速预约的楼层 / 阅览室筛选）
// ---------------------------------------------------------------------------

export const LEVEL_KEYS = ['firstLevelName', 'secondLevelName', 'thirdLevelName'] as const;

/** `type` 0 → 一级，1 → 二级楼层，2 → 三级阅览室。 */
export function levelKeyForType(type: number): (typeof LEVEL_KEYS)[number] {
  if (type === 1) return 'secondLevelName';
  if (type === 2) return 'thirdLevelName';
  return 'firstLevelName';
}

export function parseLevels(payload: Record<string, unknown>, type: number): string[] {
  const key = levelKeyForType(type);
  const result: string[] = [];
  for (const item of asRecords(payload['levels'])) {
    const value = toStr(item[key]).trim();
    if (value !== '' && !result.includes(value)) result.push(value);
  }
  return result;
}

export async function fetchLevels(
  session: CookieSession,
  params: { type: number; firstLevelName?: string; secondLevelName?: string },
): Promise<string[]> {
  const fields: Array<[string, string]> = [
    ['deptIdEnc', DEPT_ID_ENC],
    ['type', String(params.type)],
  ];
  if (params.firstLevelName) fields.push(['firstLevelName', params.firstLevelName]);
  if (params.secondLevelName) fields.push(['secondLevelName', params.secondLevelName]);

  const response = await session.postForm(SEAT_URLS.levels, fields, {
    headers: seatHeaders(`${SEAT_URLS.liveSelectPage}?deptIdEnc=${DEPT_ID_ENC}`, {
      origin: true,
    }),
  });
  if (response.status !== 200) {
    throw new LibraryError(`获取分类信息失败: HTTP ${response.status}`);
  }
  const json = parseSeatResponse(response.body, '获取分类信息失败');
  return parseLevels(asRecord(json['data']), params.type);
}

// ---------------------------------------------------------------------------
// 快速预约页的开放时间与服务器日期
// ---------------------------------------------------------------------------

export interface SeatStartEndTime {
  /** 服务器侧的「今天」，形如 2026-10-27；拿不到时为空串 */
  ymd: string;
  startTime: string;
  endTime: string;
}

export function parseStartEndTime(payload: Record<string, unknown>): SeatStartEndTime {
  return {
    ymd: toStr(payload['ymd']),
    startTime: toStr(payload['startTime']),
    endTime: toStr(payload['endTime']),
  };
}

export async function fetchStartEndTime(session: CookieSession): Promise<SeatStartEndTime> {
  const response = await session.postForm(
    SEAT_URLS.startEndTime,
    [['deptIdEnc', DEPT_ID_ENC]],
    {
      headers: seatHeaders(`${SEAT_URLS.liveSelectPage}?deptIdEnc=${DEPT_ID_ENC}`, {
        origin: true,
      }),
    },
  );
  if (response.status !== 200) {
    throw new LibraryError(`获取开放时间失败: HTTP ${response.status}`);
  }
  const json = parseSeatResponse(response.body, '获取开放时间失败');
  return parseStartEndTime(asRecord(json['data']));
}

// ---------------------------------------------------------------------------
// 签到 / 退座 / 取消预约（三个不同的业务接口）
// ---------------------------------------------------------------------------

/** 签到页 URL —— 超星要求 Referer 是这个页面，否则按「非扫码签到」拒绝。 */
export function seatCodePageUrl(reserve: {
  roomId: number;
  seatNum: string;
  id: number;
}): string {
  const normalized = reserve.seatNum.trim();
  const parsed = Number.parseInt(normalized, 10);
  const padded = Number.isFinite(parsed) ? String(parsed).padStart(3, '0') : normalized;
  const query = new URLSearchParams();
  if (reserve.roomId > 0) query.set('id', String(reserve.roomId));
  if (normalized !== '') query.set('seatNum', normalized);
  if (padded !== '') query.set('num', padded);
  query.set('reserveId', String(reserve.id));
  if (reserve.roomId > 0) query.set('room', String(reserve.roomId));
  query.set('signType', '1');
  return `${OFFICE_BASE}/front/apps/seat/code?${query.toString()}`;
}

/** 签到。对齐 Dart `signInSeat`：GET + `id` 查询参数。 */
export async function signInSeat(
  session: CookieSession,
  reserve: { id: number; roomId: number; seatNum: string },
): Promise<void> {
  if (reserve.id <= 0 || reserve.roomId <= 0 || reserve.seatNum.trim() === '') {
    throw new LibraryError('当前预约信息不完整，无法签到');
  }
  const response = await session.get(`${SEAT_URLS.sign}?id=${reserve.id}`, {
    headers: {
      ...seatHeaders(seatCodePageUrl(reserve), { origin: true }),
      Accept: 'application/json, text/javascript, */*; q=0.01',
    },
  });
  if (response.status !== 200) {
    throw new LibraryError(`签到请求失败: HTTP ${response.status}`);
  }
  parseSeatResponse(response.body, '签到失败，请稍后重试');
}

/** 退座。对齐 Dart `signBackSeat`：GET + `id`（可选 objectId）。 */
export async function signBackSeat(
  session: CookieSession,
  params: { id: number; objectId?: string },
): Promise<void> {
  if (params.id <= 0) throw new LibraryError('预约信息不完整，无法退座');
  const query = new URLSearchParams({ id: String(params.id) });
  if (params.objectId) query.set('objectId', params.objectId);
  const response = await session.get(`${SEAT_URLS.signBack}?${query.toString()}`, {
    headers: {
      ...seatHeaders(SEAT_URLS.thirdEntrance, { origin: true }),
      Accept: 'application/json, text/javascript, */*; q=0.01',
    },
  });
  if (response.status !== 200) {
    throw new LibraryError(`退座请求失败: HTTP ${response.status}`);
  }
  parseSeatResponse(response.body, '退座失败，请稍后重试');
}

/** 取消预约。对齐 Dart `cancelReservation`：GET + `id` 查询参数。 */
export async function cancelReservation(
  session: CookieSession,
  reserveId: number,
): Promise<void> {
  if (reserveId <= 0) throw new LibraryError('预约信息不完整，无法取消');
  const response = await session.get(`${SEAT_URLS.cancel}?id=${reserveId}`, {
    headers: seatHeaders(SEAT_URLS.thirdEntrance),
  });
  if (response.status !== 200) {
    throw new LibraryError(`取消预约失败: HTTP ${response.status}`);
  }
  parseSeatResponse(response.body, '取消预约失败');
}
