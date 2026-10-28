import { apiRequest } from './client';

/**
 * 图书馆（座位预约 + 馆藏检索）接口。
 * 全部对齐 ChillEast `lib/features/library/` 下的 service 层。
 */

/** 预约状态码 —— 对齐 Dart `ReserveStatus.fromInt`。 */
export type ReserveStatus = 0 | 1 | 3 | 5 | 7;

export interface SeatReserveItem {
  id: number;
  roomId: number;
  deptId: number;
  seatNum: string;
  /** epoch 毫秒 */
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
  /** 兼容旧字段：首页信息流卡片读它做「正在使用」判断 */
  isActive?: boolean;
  statusLabel?: string;
}

export interface LibrarySeatsData {
  index: {
    curReserves: SeatReserveItem[];
    nearReserves: SeatReserveItem[];
  } | null;
  rooms: LibraryRoom[];
  timeConfig?: {
    availableDays: string[];
    defaultStartTime: string | null;
    defaultEndTime: string | null;
    timeSlots: string[];
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
}

export interface SeatGridSeat {
  id: number;
  roomId: number;
  seatNum: string;
  /** 1-based 列 */
  x: number;
  /** 1-based 行 */
  y: number;
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
  cols: number;
  rows: number;
  seats: SeatGridSeat[];
  obstacles: SeatGridObstacle[];
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

// ---------------------------------------------------------------------------
// 状态与文案
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<number, string> = {
  0: '待签到',
  1: '使用中',
  3: '暂离中',
  5: '可签到',
  7: '已结束',
};

export function reserveStatusLabel(status: number): string {
  return STATUS_LABELS[status] ?? '未知';
}

/**
 * 当前状态是否提供退座入口。
 * 对齐 Dart `ReserveStatus.canSignBack`：使用中 / 暂离中 / 可签到 可以退座。
 */
export function canSignBack(status: number): boolean {
  return status === 1 || status === 3 || status === 5;
}

/** 阅览室完整名称：`图书馆 · 3楼 · 自习室304`。 */
export function fullRoomName(parts: {
  firstLevelName?: string;
  secondLevelName?: string;
  thirdLevelName?: string;
}): string {
  return [parts.firstLevelName, parts.secondLevelName, parts.thirdLevelName]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/** 阅览室的短名称（列表主标题）：优先三级名，其次二级楼层名。 */
export function roomDisplayName(room: LibraryRoom): string {
  return room.displayName || room.thirdLevelName || room.secondLevelName || '阅览室';
}

// ---------------------------------------------------------------------------
// 首页 / 阅览室
// ---------------------------------------------------------------------------

export async function fetchLibrarySeats(): Promise<LibrarySeatsData> {
  return await apiRequest<LibrarySeatsData>('/api/library/seats');
}

/** 指定日期的阅览室列表。 */
export async function fetchLibraryRooms(day: string): Promise<LibraryRoom[]> {
  const q = new URLSearchParams({ day }).toString();
  const res = await apiRequest<{ day: string; rooms: LibraryRoom[] }>(`/api/library/rooms?${q}`);
  return res?.rooms ?? [];
}

// ---------------------------------------------------------------------------
// 座位图
// ---------------------------------------------------------------------------

export async function fetchSeatGrid(roomId: number, day: string): Promise<SeatGridData> {
  const q = new URLSearchParams({ roomId: String(roomId), day }).toString();
  const res = await apiRequest<{ day: string; grid: SeatGridData }>(
    `/api/library/seats/grid?${q}`,
  );
  if (!res?.grid) throw new Error('座位分布图数据为空');
  return res.grid;
}

/** 指定时段已占用的座位号集合。 */
export async function fetchUsedSeats(params: {
  roomId: number;
  day: string;
  startTime: string;
  endTime: string;
}): Promise<Set<string>> {
  const q = new URLSearchParams({
    roomId: String(params.roomId),
    day: params.day,
    startTime: params.startTime,
    endTime: params.endTime,
  }).toString();
  const res = await apiRequest<{ seats: string[] }>(`/api/library/seats/used?${q}`);
  return new Set(Array.isArray(res?.seats) ? res.seats : []);
}

// ---------------------------------------------------------------------------
// 分级（快速预约的楼层 / 阅览室）
// ---------------------------------------------------------------------------

export async function fetchLevels(params: {
  type: 0 | 1 | 2;
  firstLevelName?: string;
  secondLevelName?: string;
}): Promise<string[]> {
  const q = new URLSearchParams({ type: String(params.type) });
  if (params.firstLevelName) q.set('firstLevelName', params.firstLevelName);
  if (params.secondLevelName) q.set('secondLevelName', params.secondLevelName);
  const res = await apiRequest<{ type: number; levels: string[] }>(
    `/api/library/levels?${q.toString()}`,
  );
  return Array.isArray(res?.levels) ? res.levels : [];
}

/** 服务器侧的当前日期与开放时段。 */
export async function fetchStartEndTime(): Promise<{
  ymd: string;
  startTime: string;
  endTime: string;
}> {
  const res = await apiRequest<{ ymd: string; startTime: string; endTime: string }>(
    '/api/library/seats/start-end-time',
  );
  return {
    ymd: res?.ymd ?? '',
    startTime: res?.startTime ?? '',
    endTime: res?.endTime ?? '',
  };
}

// ---------------------------------------------------------------------------
// 预约动作
// ---------------------------------------------------------------------------

/** 选座并提交预约（指定座位号）。 */
export async function reserveLibrarySeat(payload: {
  roomId: number | string;
  day: string;
  startTime: string;
  endTime: string;
  seatNum?: string;
  isQuick?: boolean;
  firstLevelName?: string;
  secondLevelName?: string;
  thirdLevelName?: string;
}): Promise<{ reserve: SeatReserveItem }> {
  return await apiRequest('/api/library/seats/reserve', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** 快速预约第一步：只匹配空闲座位，不落座。 */
export async function matchSeat(payload: {
  startTime: string;
  endTime: string;
  firstLevelName?: string;
  secondLevelName?: string;
  thirdLevelName?: string;
}): Promise<MatchedSeat> {
  return await apiRequest<MatchedSeat>('/api/library/seats/match', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function signInSeat(reserve: {
  id: number;
  roomId: number;
  seatNum: string;
}): Promise<void> {
  await apiRequest('/api/library/seats/sign', {
    method: 'POST',
    body: JSON.stringify(reserve),
  });
}

export async function signBackSeat(reserve: { id: number; objectId?: string }): Promise<void> {
  await apiRequest('/api/library/seats/sign-back', {
    method: 'POST',
    body: JSON.stringify(reserve),
  });
}

export async function cancelLibraryReservation(id: number): Promise<void> {
  await apiRequest('/api/library/seats/cancel', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

// ---------------------------------------------------------------------------
// 馆藏检索
// ---------------------------------------------------------------------------

export interface LibraryBookItem {
  detailParam: string;
  title: string;
  author: string;
  callNumber: string;
  isbn?: string;
  publisher?: string;
  publishYear?: string;
}

export interface BookSearchResult {
  books: LibraryBookItem[];
  totalCount: number;
  totalPages: number;
}

export async function searchLibraryBooks(
  keyword: string,
  type = 'title',
): Promise<BookSearchResult> {
  const q = new URLSearchParams({ keyword, type }).toString();
  const res = await apiRequest<BookSearchResult>(`/api/library/books?${q}`);
  return {
    books: res?.books ?? [],
    totalCount: res?.totalCount ?? 0,
    totalPages: res?.totalPages ?? 0,
  };
}

export async function fetchLibraryBookDetail(detailParam: string): Promise<any> {
  const q = new URLSearchParams({ detailParam }).toString();
  return await apiRequest(`/api/library/books/detail?${q}`);
}
