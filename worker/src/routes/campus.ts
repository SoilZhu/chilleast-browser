import type { Env } from '../env';
import { fail, ok } from '../util/response';
import { extractBearerCredentials } from '../auth/token';
import { runWithSession, SessionExpiredError } from '../auth/session-manager';
import {
  connectFinServ,
  fetchCardInfo,
  fetchCardTransactions,
  fetchPaymentCode,
  createElectricityPreOrder,
  fetchElectricAreas,
  fetchElectricBalance,
  fetchElectricBuildings,
  fetchElectricRooms,
  resolveElectricityTarget,
} from '../school/hunau/finserv';
import { fetchDormitoryInfo } from '../school/hunau/dormitory';
import { DESKTOP_UA, HOSTS, URLS } from '../school/hunau/constants';
import { beijingFields, formatBeijing } from '../school/hunau/time';

const NOTICE_LIST_URL = URLS.chaoxingNoticeList;
const NOTICE_REFERER = URLS.chaoxingNoticeMyNotice;

/**
 * 校园卡基本信息与余额
 * GET /api/campus/card
 */
export async function handleCardInfo(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const cardInfo = await runWithSession(env, creds, async (context) => {
      const finServ = await connectFinServ(context.session);
      return await fetchCardInfo(finServ);
    });

    return ok(cardInfo);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '校园卡信息获取失败', 500);
  }
}

/**
 * 校园卡真实付款码（条形码数字 + 二维码 data URL）
 * GET /api/campus/card/payment-code
 *
 * 与 App 端 CampusCardService.fetchPaymentCode 同源，60s 有效期由前端倒计时。
 */
export async function handlePaymentCode(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const finServ = await connectFinServ(context.session);
      return await fetchPaymentCode(finServ);
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '付款码获取失败', 500);
  }
}

/**
 * 校园卡交易明细流水
 * GET /api/campus/card/records?days=7
 */
export async function handleCardRecords(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const daysParam = parseInt(url.searchParams.get('days') || '7', 10);
  const days = Math.min(30, Math.max(1, daysParam || 7));

  try {
    const records = await runWithSession(env, creds, async (context) => {
      const finServ = await connectFinServ(context.session);
      const now = new Date();
      const past = new Date(now.getTime() - days * 24 * 3600 * 1000);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      return await fetchCardTransactions(finServ, {
        beginDate: fmt(past),
        endDate: fmt(now),
        tradeType: '0',
      });
    });

    return ok(records);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '校园卡流水获取失败', 500);
  }
}

/**
 * 宿舍电费查询
 * GET /api/campus/electricity?area=...&building=...&room=...
 */
export async function handleElectricity(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const areaName = url.searchParams.get('area') || '';
  const buildingName = url.searchParams.get('building') || '';
  const roomName = url.searchParams.get('room') || '';
  const roomId = url.searchParams.get('roomId') || '';
  const mertype = url.searchParams.get('mertype') || '';

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const finServ = await connectFinServ(context.session);

      if (!areaName || !buildingName || (!roomName && !roomId)) {
        // 返回区域列表供选择
        const areas = await fetchElectricAreas(finServ);
        return { isSelection: true, areas };
      }

      const target = await resolveElectricityTarget(finServ, {
        areaName,
        buildingName,
        roomId: roomId || '',
        roomName: roomName || roomId || '',
        mertype: mertype || '',
      });

      return await fetchElectricBalance(finServ, target);
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '电费查询失败', 500);
  }
}

/**
 * 电费校区区域列表
 * GET /api/campus/electricity/areas
 */
export async function handleElectricityAreas(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  try {
    const areas = await runWithSession(env, creds, async (context) => {
      const finServ = await connectFinServ(context.session);
      return await fetchElectricAreas(finServ);
    });
    return ok(areas);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取区域失败', 500);
  }
}

/**
 * 电费楼栋列表
 * GET /api/campus/electricity/buildings?areaName=...
 */
export async function handleElectricityBuildings(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const areaName = url.searchParams.get('areaName') || url.searchParams.get('areaId') || '';
  if (!areaName) return fail('缺少 areaName', 400);

  try {
    const buildings = await runWithSession(env, creds, async (context) => {
      const finServ = await connectFinServ(context.session);
      return await fetchElectricBuildings(finServ, areaName);
    });
    return ok(buildings);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取楼栋失败', 500);
  }
}

/**
 * 电费宿舍房间列表
 * GET /api/campus/electricity/rooms?areaName=...&buildingName=...
 */
export async function handleElectricityRooms(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const areaName = url.searchParams.get('areaName') || '';
  const buildingName = url.searchParams.get('buildingName') || '';
  if (!areaName || !buildingName) return fail('缺少 areaName 或 buildingName', 400);

  try {
    const rooms = await runWithSession(env, creds, async (context) => {
      const finServ = await connectFinServ(context.session);
      return await fetchElectricRooms(finServ, areaName, buildingName);
    });
    return ok(rooms);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取房间失败', 500);
  }
}

/** 电费充值金额校验：整数元，1–1000（对齐原版 `electricity_recharge_screen.dart`）。 */
export function validateRechargeAmount(raw: unknown): { ok: true; amount: number } | { ok: false; reason: string } {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { ok: false, reason: '充值金额必须是数字' };
  }
  if (!Number.isInteger(raw)) {
    return { ok: false, reason: '充值金额必须是整数元' };
  }
  if (raw < 1 || raw > 1000) {
    return { ok: false, reason: '充值金额需在 1–1000 元之间' };
  }
  return { ok: true, amount: raw };
}

/**
 * 电费充值预下单（校园卡余额支付）
 * POST /api/campus/electricity/preorder
 * body: { areaName, buildingName, roomId, roomName?, mertype, amount }
 *
 * ⚠️ **这是有真实副作用的接口**：走到 `elepay/createPreThirdTrade` 且 `payWay=2`，
 * 会在学校一卡通平台直接从校园卡余额扣款、生成真实的电费预支付订单。
 * 因此：
 *   - 金额校验在**最前面**做，非法请求绝不进入一卡通链路；
 *   - 失败一律如实上抛，不吞异常（吞掉的话用户会以为充值成功了）；
 *   - 前端调用前必须弹确认框（原版也是先弹 `PaymentResultSheet(confirm)`）。
 *
 * idserial 不能从请求里拿 —— 那是「谁的卡」，必须由服务端从已授权会话里取，
 * 否则任何人塞一个别人的学号就能用别人的卡扣款。
 */
export async function handleElectricityPreOrder(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('请求体不是合法 JSON', 400, 'invalid_body');
  }

  const areaName = typeof payload['areaName'] === 'string' ? payload['areaName'].trim() : '';
  const buildingName = typeof payload['buildingName'] === 'string' ? payload['buildingName'].trim() : '';
  const roomId = typeof payload['roomId'] === 'string' ? payload['roomId'].trim() : '';
  const roomName = typeof payload['roomName'] === 'string' ? payload['roomName'].trim() : '';
  const mertype = typeof payload['mertype'] === 'string' ? payload['mertype'].trim() : '';

  if (areaName === '' || buildingName === '' || roomId === '') {
    return fail('缺少 areaName / buildingName / roomId', 400, 'missing_params');
  }

  const amountCheck = validateRechargeAmount(payload['amount']);
  if (!amountCheck.ok) {
    return fail(amountCheck.reason, 400, 'invalid_amount');
  }

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const finServ = await connectFinServ(context.session);

      // 先把「人类输入」解析成服务端要的 roomId / mertype（与查余额走同一条解析）
      const target = await resolveElectricityTarget(finServ, {
        areaName,
        buildingName,
        roomId,
        roomName: roomName || roomId,
        mertype: mertype || 'yk',
      });

      // idserial 必须来自卡信息，不能用前端传的值
      const card = await fetchCardInfo(finServ);
      if (card.idserial === '') {
        throw new Error('未能获取校园卡学号（idserial），已取消下单以免扣错账户');
      }

      return await createElectricityPreOrder(finServ, target, card.idserial, amountCheck.amount);
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '电费充值下单失败', 500);
  }
}

interface RawNotice {
  idCode?: unknown;
  content?: unknown;
  createrName?: unknown;
  insertTime?: unknown;
  isread?: unknown;
  uuid?: unknown;
  count_all?: unknown;
  count_read?: unknown;
  attachment?: unknown;
}

/** 通知条目：字段名严格对齐 `web/src/api/campus.ts` 的 `NoticeItem`。 */
export interface NoticeItem {
  uuid: string;
  idCode: string;
  title: string;
  content: string;
  /** 发布人（原版 `createrName`） */
  sender: string;
  /** `yyyy-MM-dd HH:mm` */
  date: string;
  sentAt: string;
  isRead: boolean;
}

/** 一页通知 + 下一页游标（对齐原版 `NoticeResult`）。 */
export interface NoticePage {
  list: NoticeItem[];
  /** 下一页游标；空串表示没有更多 */
  lastGetId: string;
  hasMore: boolean;
}

function toInt(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function extractNoticeTitle(notice: RawNotice): string {
  const content = typeof notice.content === 'string' ? notice.content : '';
  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');
  if (firstLine !== undefined) return firstLine.slice(0, 120);

  const attachment = (notice as Record<string, unknown>)['attachment'];
  if (typeof attachment === 'string' && attachment !== '') {
    try {
      const parsed = JSON.parse(attachment) as Array<Record<string, unknown>>;
      const name = parsed[0]?.['name'];
      if (typeof name === 'string' && name) return name;
    } catch {}
  }
  return '(无标题通知)';
}

function normalizeNotice(notice: RawNotice): NoticeItem {
  const insertTime = toInt(notice.insertTime);
  // ⚠️ 必须用北京时间格式化：原版 `MessageModel.fromChaoxingJson` 用
  // `DateTime.fromMillisecondsSinceEpoch`（设备本地时区 = 北京时间），
  // 而 Worker 跑在 UTC —— 直接用 getHours() 会让每条通知的时间都偏 8 小时。
  const sentAt =
    insertTime > 0 ? formatBeijing(insertTime) : formatBeijing(Date.now());
  // isread: 1=已读, 0=未读（与原版 `MessageModel.fromChaoxingJson` 一致）
  const isRead = toInt(notice.isread) === 1;
  return {
    uuid: typeof notice.uuid === 'string' ? notice.uuid : '',
    idCode: typeof notice.idCode === 'string' ? notice.idCode : '',
    title: extractNoticeTitle(notice),
    content: typeof notice.content === 'string' ? notice.content : '',
    sender: typeof notice.createrName === 'string' ? notice.createrName : '学校官方',
    date: sentAt,
    sentAt,
    isRead,
  };
}

/**
 * 解析 `getNoticeList` 的响应体（纯函数，便于单测）。
 *
 * 超星的真实结构是 `{ notices: { list: [...], lastGetId: '...' } }`；
 * `hasMore` 只看 `lastGetId` 是否非空 —— 与原版 `NoticeResult` 完全一致，
 * 超星没有「总页数」概念，最后一页会返回空串。
 */
export function parseNoticePage(body: unknown): NoticePage {
  const record = (body ?? {}) as Record<string, unknown>;
  const noticesObj =
    record['notices'] !== null && typeof record['notices'] === 'object'
      ? (record['notices'] as Record<string, unknown>)
      : null;

  const rawList = Array.isArray(noticesObj?.['list'])
    ? (noticesObj!['list'] as RawNotice[])
    : Array.isArray(record['list'])
      ? (record['list'] as RawNotice[])
      : [];

  const lastGetIdRaw = noticesObj?.['lastGetId'];
  const lastGetId =
    typeof lastGetIdRaw === 'string'
      ? lastGetIdRaw
      : typeof lastGetIdRaw === 'number'
        ? String(lastGetIdRaw)
        : '';

  return {
    list: rawList.map(normalizeNotice),
    lastGetId,
    hasMore: lastGetId !== '',
  };
}

/** 通知列表请求体。字段顺序与取值对齐原版 `NoticeService.fetchMessageList`。 */
export function buildNoticeListForm(lastValue: string, nowMs: number = Date.now()): Record<string, string> {
  return {
    type: '2',
    notice_type: '',
    lastValue,
    sort: '',
    folderUUID: '',
    kw: '',
    startTime: '',
    endTime: '',
    gKw: '',
    gName: '',
    // 超星按「年」过滤通知；原版用设备当前年（北京时间），服务端同样按北京时间取
    year: String(beijingFields(nowMs).year),
    tag: '',
    fidsCode: '',
    queryFolderNoticePrevYear: '0',
    filterSenderPuids: '',
    filterTags: '',
  };
}

/**
 * 超星通知列表（游标分页）
 * GET /api/campus/notices?lastValue=<游标>&size=<n>
 *
 * 为什么用 POST 表单而不是 GET：超星的 `getNoticeList` 只认表单体里的
 * `lastValue`，URL 上的同名参数会被忽略；带页码的 GET 永远只会拿到第一页。
 *
 * ⚠️ `size` 参数照收但**不参与截断**。原因是超星的游标是「页」级别的：
 * `lastGetId` 指向上游这一页的末尾，若我们只返回前 N 条就把这个游标交出去，
 * 被截掉的那些通知再也不会出现在任何一页里 —— 等于永久丢数据。
 * 一页多少条由超星决定（原版 `NoticeService` 同样不传 size，只透传游标）。
 */
export async function handleNotices(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const lastValue = url.searchParams.get('lastValue') || '';

  try {
    const result = await runWithSession(env, creds, async (context) => {
      const response = await context.session.postForm(
        NOTICE_LIST_URL,
        buildNoticeListForm(lastValue),
        {
          headers: {
            'User-Agent': DESKTOP_UA,
            Accept: 'application/json, text/javascript, */*; q=0.01',
            Referer: NOTICE_REFERER,
            'X-Requested-With': 'XMLHttpRequest',
          },
        },
      );

      if (response.status !== 200) {
        throw new Error(`通知接口返回 HTTP ${response.status}`);
      }

      let body: unknown;
      try {
        body = JSON.parse(response.body);
      } catch {
        // 会话失效时超星会回登录页 HTML，此时 JSON.parse 必失败
        throw new SessionExpiredError('超星通知会话失效');
      }

      const record = (body ?? {}) as Record<string, unknown>;
      const errorMsg = typeof record['errorMsg'] === 'string' ? record['errorMsg'] : '';
      if (errorMsg !== '') {
        throw new Error(`通知接口返回错误：${errorMsg}`);
      }
      if (record['result'] !== 1 && record['status'] !== true && record['notices'] === undefined) {
        throw new SessionExpiredError('超星通知会话失效');
      }

      return parseNoticePage(body);
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '通知列表获取失败', 500);
  }
}

/**
 * 超星单条通知详情
 * GET /api/campus/notices/detail?uuid=...
 */
export async function handleNoticeDetail(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const uuid = url.searchParams.get('uuid') || '';
  if (!uuid) return fail('缺少通知 uuid', 400);

  try {
    const detail = await runWithSession(env, creds, async (context) => {
      const response = await context.session.get(
        `${HOSTS.chaoxingNotice}/pc/notice/${encodeURIComponent(uuid)}/getNoticeDetail?sendTag=0`,
        {
          headers: {
            'User-Agent': DESKTOP_UA,
            'X-Requested-With': 'XMLHttpRequest',
            Referer: NOTICE_REFERER,
          },
        },
      );
      if (response.status !== 200) {
        throw new Error(`获取通知详情失败（HTTP ${response.status}）`);
      }
      return JSON.parse(response.body);
    });

    return ok(detail);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取通知详情失败', 500);
  }
}

/**
 * 我的宿舍信息（直接从学生公寓服务平台 gy.hunau.edu.cn 拉取，对齐原版 DormitoryService）
 * GET /api/campus/dormitory
 */
export async function handleDormitory(request: Request, env: Env): Promise<Response> {
  const creds = await extractBearerCredentials(env, request);
  if (!creds) return fail('未授权，请先登录', 401, 'unauthorized');

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('force') === 'true' || url.searchParams.get('refresh') === 'true';

  try {
    const info = await runWithSession(env, creds, async (context) => {
      return await fetchDormitoryInfo(context.session, forceRefresh);
    });

    return ok(info);
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      return fail(error.message, 401, 'session_expired');
    }
    return fail(error instanceof Error ? error.message : '获取宿舍信息失败', 500);
  }
}

