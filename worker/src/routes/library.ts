import type { Env } from '../env';
import { fail, ok } from '../util/response';
import { extractBearerCredentials } from '../auth/token';
import { runWithSession } from '../auth/session-manager';
import {
  cancelReservation,
  DEPT_ID_ENC,
  fetchLibraryRooms,
  fetchLevels,
  fetchSeatGrid,
  fetchSeatIndex,
  fetchStartEndTime,
  fetchUsedSeats,
  matchSeat,
  SEAT_URLS,
  seedSeatSession,
  signBackSeat,
  signInSeat,
  submitQuickReservation,
  submitReservation,
  type LibraryRoom,
  type ReservationRequest,
} from '../school/hunau/library';
import {
  availableReserveDays,
  buildTimeSlots,
  defaultEndTime,
  defaultStartTime,
  isValidRange,
  todayString,
} from '../school/hunau/library-time';
import {
  fetchLibraryBookDetail,
  searchLibraryBooks,
  SEARCH_TYPES,
} from '../school/hunau/library-book';

type SearchType = (typeof SEARCH_TYPES)[number];

/**
 * 图书馆座位首页与阅览室列表
 * GET /api/library/seats
 */
export async function handleLibrarySeats(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const result = await runWithSession(env, creds, async (context) => {
      await seedSeatSession(context.session);
      const indexData = await fetchSeatIndex(context.session).catch(() => null);

      const today = todayString();
      const defStart = defaultStartTime(today);
      const defEnd = defStart ? defaultEndTime(defStart) : null;

      let rooms: LibraryRoom[] = [];
      try {
        rooms = await fetchLibraryRooms(context.session, today);
      } catch (err) {
        console.warn('获取阅览室列表失败:', err);
      }

      return {
        index: indexData,
        rooms,
        timeConfig: {
          availableDays: availableReserveDays(),
          defaultStartTime: defStart,
          defaultEndTime: defEnd,
          timeSlots: buildTimeSlots(),
        },
      };
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取图书馆座位信息失败', 500);
  }
}

/**
 * 预约图书馆座位（支持普通选座与快速预约）
 * POST /api/library/seats/reserve
 * Body: { roomId, day, startTime, endTime, seatNum?, isQuick?, firstLevelName?, secondLevelName?, thirdLevelName? }
 */
export async function handleLibrarySeatReserve(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求格式错误', 400);
  }

  const roomIdNum = parseInt(String(body.roomId || '0'), 10);
  const day = typeof body.day === 'string' ? body.day.trim() : '';
  const startTime = typeof body.startTime === 'string' ? body.startTime.trim() : '';
  const endTime = typeof body.endTime === 'string' ? body.endTime.trim() : '';
  const seatNum = typeof body.seatNum === 'string' ? body.seatNum.trim() : String(body.seatNum || '');
  const isQuick = Boolean(body.isQuick);

  if (!roomIdNum || !day || !startTime || !endTime) {
    return fail('缺少预约参数 (roomId, day, startTime, endTime)', 400);
  }

  const req: ReservationRequest = {
    roomId: roomIdNum,
    day,
    startTime,
    endTime,
    seatNum,
  };

  try {
    const reserve = await runWithSession(env, creds, async (context) => {
      await seedSeatSession(context.session);

      // 如果未指定具体座位号，先调用 matchSeat 智能匹配空闲座位
      if (!req.seatNum) {
        const matched = await matchSeat(context.session, {
          startTime,
          endTime,
          firstLevelName: typeof body.firstLevelName === 'string' ? body.firstLevelName : undefined,
          secondLevelName: typeof body.secondLevelName === 'string' ? body.secondLevelName : undefined,
          thirdLevelName: typeof body.thirdLevelName === 'string' ? body.thirdLevelName : undefined,
        });
        if (!matched || !matched.seatNum) {
          throw new Error('未能在该阅览室匹配到空闲座位，请尝试更换时段或阅览室');
        }
        req.seatNum = matched.seatNum;
        if (matched.roomId) req.roomId = matched.roomId;
      }

      if (isQuick) {
        return await submitQuickReservation(context.session, req);
      }
      return await submitReservation(context.session, req);
    });

    return ok({ success: true, reserve, message: '座位预约成功' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '座位预约失败', 500);
  }
}

/**
 * 图书馆馆藏图书检索
 * GET /api/library/books?keyword=...&type=title
 */
export async function handleLibraryBooks(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const keyword = url.searchParams.get('keyword') || url.searchParams.get('q') || '';
  const searchTypeRaw = url.searchParams.get('type') || 'title';
  const searchType: SearchType = SEARCH_TYPES.includes(searchTypeRaw as SearchType)
    ? (searchTypeRaw as SearchType)
    : 'title';

  if (!keyword.trim()) {
    return fail('请输入检索关键词', 400);
  }

  try {
    const result = await searchLibraryBooks({
      keyword: keyword.trim(),
      searchType,
      maxPages: 1,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '图书检索失败', 500);
  }
}

/**
 * 馆藏图书详情与在馆副本分布
 * GET /api/library/books/detail?detailParam=...
 */
export async function handleLibraryBookDetail(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const detailParam = url.searchParams.get('detailParam') || '';
  if (!detailParam) return fail('缺少 detailParam', 400);

  try {
    const detail = await fetchLibraryBookDetail({ detailParam });
    return ok(detail);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取书目详情失败', 500);
  }
}

// ---------------------------------------------------------------------------
// 座位系统：座位图 / 占用座位 / 分级 / 开放时间
// 全部对齐 ChillEast `library_service.dart` 的对应方法。
// ---------------------------------------------------------------------------

function parsePositiveInt(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** 座位图查询必须带 day —— 与 Dart 一致，选座页 Referer 里带 day 才能通过校验。 */
function requireDay(request: Request): string {
  const url = new URL(request.url);
  return (url.searchParams.get('day') || '').trim();
}

/**
 * 阅览室列表（按日期）
 * GET /api/library/rooms?day=YYYY-MM-DD
 */
export async function handleLibraryRooms(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const day = requireDay(request) || todayString();
  try {
    const rooms = await runWithSession(env, creds, async (context) => {
      await seedSeatSession(context.session);
      return await fetchLibraryRooms(context.session, day);
    });
    return ok({ day, rooms });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取阅览室列表失败', 500);
  }
}

/**
 * 阅览室座位分布图
 * GET /api/library/seats/grid?roomId=14087&day=YYYY-MM-DD
 */
export async function handleLibrarySeatGrid(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const roomId = parsePositiveInt(url.searchParams.get('roomId'));
  if (roomId === null) return fail('缺少或非法的 roomId', 400);
  const day = (url.searchParams.get('day') || '').trim() || todayString();

  try {
    const grid = await runWithSession(env, creds, async (context) => {
      await seedSeatSession(context.session);
      return await fetchSeatGrid(context.session, roomId);
    });
    return ok({ day, grid });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取座位分布图失败', 500);
  }
}

/**
 * 指定时段的已占用座位号
 * GET /api/library/seats/used?roomId=&day=&startTime=&endTime=
 */
export async function handleLibraryUsedSeats(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const roomId = parsePositiveInt(url.searchParams.get('roomId'));
  const day = (url.searchParams.get('day') || '').trim();
  const startTime = (url.searchParams.get('startTime') || '').trim();
  const endTime = (url.searchParams.get('endTime') || '').trim();

  if (roomId === null) return fail('缺少或非法的 roomId', 400);
  if (day === '' || startTime === '' || endTime === '') {
    return fail('缺少 day / startTime / endTime', 400);
  }
  if (!isValidRange(day, startTime, endTime)) {
    return fail('预约时段无效，请选择营业时间内的有效时段', 400);
  }

  try {
    const seats = await runWithSession(env, creds, async (context) => {
      await seedSeatSession(context.session);
      return await fetchUsedSeats(context.session, { roomId, day, startTime, endTime });
    });
    return ok({ roomId, day, startTime, endTime, seats });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取占用座位失败', 500);
  }
}

/**
 * 分类层级（快速预约的楼层 / 阅览室筛选）
 * GET /api/library/levels?type=0|1|2&firstLevelName=&secondLevelName=
 */
export async function handleLibraryLevels(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const typeRaw = Number.parseInt(url.searchParams.get('type') || '0', 10);
  const type = Number.isFinite(typeRaw) && typeRaw >= 0 && typeRaw <= 2 ? typeRaw : 0;
  const firstLevelName = (url.searchParams.get('firstLevelName') || '').trim();
  const secondLevelName = (url.searchParams.get('secondLevelName') || '').trim();

  try {
    const levels = await runWithSession(env, creds, async (context) => {
      await seedSeatSession(context.session);
      return await fetchLevels(context.session, {
        type,
        firstLevelName: firstLevelName || undefined,
        secondLevelName: secondLevelName || undefined,
      });
    });
    return ok({ type, levels });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取分类信息失败', 500);
  }
}

/**
 * 快速预约页的开放时间与服务器日期
 * GET /api/library/seats/start-end-time
 */
export async function handleLibraryStartEndTime(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const data = await runWithSession(env, creds, async (context) => {
      await seedSeatSession(context.session);
      return await fetchStartEndTime(context.session);
    });
    return ok(data);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取开放时间失败', 500);
  }
}

// ---------------------------------------------------------------------------
// 座位系统：预约动作（签到 / 退座 / 取消）
// ---------------------------------------------------------------------------

/**
 * 签到
 * POST /api/library/seats/sign  Body: { id, roomId, seatNum }
 */
export async function handleLibrarySeatSignIn(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求格式错误', 400);
  }

  const id = parsePositiveInt(String(body.id ?? ''));
  const roomId = parsePositiveInt(String(body.roomId ?? ''));
  const seatNum = typeof body.seatNum === 'string' ? body.seatNum.trim() : '';
  if (id === null || roomId === null || seatNum === '') {
    return fail('预约信息不完整，无法签到', 400);
  }

  try {
    await runWithSession(env, creds, async (context) => {
      await seedSeatSession(context.session);
      await signInSeat(context.session, { id, roomId, seatNum });
    });
    return ok({ success: true, message: '签到成功' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '签到失败', 500);
  }
}

/**
 * 退座
 * POST /api/library/seats/sign-back  Body: { id, objectId? }
 */
export async function handleLibrarySeatSignBack(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求格式错误', 400);
  }

  const id = parsePositiveInt(String(body.id ?? ''));
  if (id === null) return fail('预约信息不完整，无法退座', 400);
  const objectId = typeof body.objectId === 'string' ? body.objectId.trim() : '';

  try {
    await runWithSession(env, creds, async (context) => {
      await seedSeatSession(context.session);
      await signBackSeat(context.session, { id, objectId: objectId || undefined });
    });
    return ok({ success: true, message: '退座成功' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '退座失败', 500);
  }
}

/**
 * 取消预约
 * POST /api/library/seats/cancel  Body: { id }
 */
export async function handleLibrarySeatCancel(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求格式错误', 400);
  }

  const id = parsePositiveInt(String(body.id ?? ''));
  if (id === null) return fail('预约信息不完整，无法取消', 400);

  try {
    await runWithSession(env, creds, async (context) => {
      await seedSeatSession(context.session);
      await cancelReservation(context.session, id);
    });
    return ok({ success: true, message: '已取消预约' });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '取消预约失败', 500);
  }
}

/**
 * 快速预约：只做「智能匹配」，不落座。
 * POST /api/library/seats/match  Body: { startTime, endTime, firstLevelName?, secondLevelName?, thirdLevelName? }
 *
 * 与 `/api/library/seats/reserve` 的区别：原版快速预约是「先匹配 → 给用户看座位号和阅览室
 * → 换一个 / 确认」的两步流程。这里只做第一步，第二步仍由 reserve + isQuick 完成。
 */
export async function handleLibrarySeatMatch(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求格式错误', 400);
  }

  const startTime = typeof body.startTime === 'string' ? body.startTime.trim() : '';
  const endTime = typeof body.endTime === 'string' ? body.endTime.trim() : '';
  if (startTime === '' || endTime === '') return fail('缺少 startTime / endTime', 400);

  try {
    const matched = await runWithSession(env, creds, async (context) => {
      await seedSeatSession(context.session);
      return await matchSeat(context.session, {
        startTime,
        endTime,
        firstLevelName: typeof body.firstLevelName === 'string' ? body.firstLevelName : undefined,
        secondLevelName: typeof body.secondLevelName === 'string' ? body.secondLevelName : undefined,
        thirdLevelName: typeof body.thirdLevelName === 'string' ? body.thirdLevelName : undefined,
      });
    });
    return ok(matched);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '匹配空闲座位失败', 500);
  }
}
