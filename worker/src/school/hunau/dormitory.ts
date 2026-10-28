/**
 * 学生公寓服务平台 (我的宿舍) 业务逻辑。
 * 对齐 ChillEast `lib/features/dormitory/services/dormitory_service.dart` 与
 * `lib/features/dormitory/models/dormitory_info.dart`。
 */

import type { CookieSession, SessionResponse } from '../../auth/http';
import { SessionExpiredError } from '../../auth/session-manager';
import { CHAOXING_UA, URLS } from './constants';

export interface DormitoryField {
  code: string;
  label: string;
  value: string;
}

export interface DormitoryInfo {
  isAssigned: boolean;
  building?: string;
  unit?: string;
  floor?: string;
  room?: string;
  bed?: string;
  academicYear?: string;
  termCode?: string;
  termName?: string;
  formattedRoom: string;
  formattedBed?: string;
  fullAddress: string;
  fields: DormitoryField[];
}

const MAX_REDIRECTS = 10;

function isRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

/**
 * 执行超星 OAuth -> 学生公寓管理平台 (gy.hunau.edu.cn) 会话建立流程。
 *
 * HAR 流程：
 * Hop 0: auth.chaoxing.com/connect/oauth2/authorize?... -> 302 带 code
 * Hop 1: gy.hunau.edu.cn/app/content/main/sitemap?... -> 302 换取 JSESSIONID 并跳转 welcome
 * Hop 2: http://gy.hunau.edu.cn/wap/main/welcome -> 307 HttpsUpgrade
 * Hop 3: https://gy.hunau.edu.cn/wap/main/welcome -> 200 成功落点
 */
export async function authenticateDormitory(session: CookieSession): Promise<boolean> {
  let currentUrl: string | null = URLS.dormitoryOAuth;
  let referer: string | undefined;

  for (let hop = 0; hop < MAX_REDIRECTS && currentUrl !== null; hop++) {
    const response = await session.get(currentUrl, {
      follow: false,
      headers: {
        'User-Agent': CHAOXING_UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Upgrade-Insecure-Requests': '1',
        ...(referer ? { Referer: referer } : {}),
      },
    });

    const status = response.status;
    const location = response.headers.get('location') ?? '';
    const bodyStr = response.body ?? '';

    // 如果在超星授权页面未重定向，说明超星登录态已失效，回显了登录网页
    if (hop === 0 && status === 200 && (bodyStr.includes('passport2') || bodyStr.includes('login'))) {
      throw new SessionExpiredError('超星统一认证已过期，请重新登录');
    }

    if (isRedirect(status) && location !== '') {
      referer = currentUrl;
      let nextUri = new URL(location, currentUrl).toString();
      // 若为 http://gy.hunau.edu.cn，直接升为 https
      if (nextUri.startsWith('http://gy.hunau.edu.cn')) {
        nextUri = nextUri.replace(/^http:/, 'https:');
      }
      currentUrl = nextUri;
      continue;
    }

    // 走到 200 且到达 welcome 或 gy 域名，说明会话建立成功
    if (status === 200) {
      break;
    }

    currentUrl = null;
  }

  return true;
}

async function requestBedHtml(session: CookieSession): Promise<SessionResponse> {
  const timestamp = Date.now();
  const url = `${URLS.dormitoryBed}?_t_s_=${timestamp}`;
  return await session.get(url, {
    follow: false,
    headers: {
      'User-Agent': CHAOXING_UA,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: URLS.dormitoryWelcome,
    },
  });
}

function isBedHtmlValid(response: SessionResponse): boolean {
  if (response.status !== 200) return false;
  const content = response.body ?? '';
  return (
    content.includes('我的床位') ||
    content.includes('createRow') ||
    content.includes('SFSchCalendar') ||
    content.includes('wyDorm')
  );
}

/**
 * 从 `wyDorm` 页面 HTML 解析宿舍与床位数据。
 * 与 ChillEast `DormitoryInfo.fromHtml` 完全一致。
 */
export function parseDormitoryHtml(html: string): DormitoryInfo {
  // 1. 过滤单行注释与块注释，防止匹配到被注释的代码 (例如 // view.createRow("ssl", "宿舍楼", "未安排床位");)
  const withoutBlockComments = html.replace(/\/\*[\s\S]*?\*\//g, '');
  const cleanLines: string[] = [];
  for (const line of withoutBlockComments.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) continue;
    cleanLines.push(line);
  }
  const cleanText = cleanLines.join('\n');

  // 2. 学年与学期
  const xnMatch = /SFSchCalendar\.curXn\s*=\s*["']([^"']*)["']/.exec(cleanText);
  const xqMatch = /SFSchCalendar\.curXq\s*=\s*["']([^"']*)["']/.exec(cleanText);
  const xqMcMatch = /SFSchCalendar\.curXqMc\s*=\s*["']([^"']*)["']/.exec(cleanText);
  const chMatch = /var\s+ch\s*=\s*["']([^"']*)["']/.exec(cleanText);

  const academicYear = xnMatch?.[1]?.trim() || undefined;
  const termCode = xqMatch?.[1]?.trim() || undefined;
  const termName = xqMcMatch?.[1]?.trim() || undefined;
  const bedVar = chMatch?.[1]?.trim() || '';

  // 3. 提取所有 view.createRow(code, label, value)
  const rowRegex = /view\.createRow\s*\(\s*["']([^"']*)["']\s*,\s*["']([^"']*)["']\s*,\s*["']([^"']*)["']\s*\)/g;
  const fields: DormitoryField[] = [];
  let building: string | undefined;
  let unit: string | undefined;
  let floor: string | undefined;
  let room: string | undefined;
  let bed: string | undefined;

  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(cleanText)) !== null) {
    const code = m[1]?.trim() ?? '';
    const label = m[2]?.trim() ?? '';
    const value = m[3]?.trim() ?? '';

    fields.push({ code, label, value });

    switch (code) {
      case 'ssl':
        building = value !== '' ? value : undefined;
        break;
      case 'dy':
        unit = value !== '' ? value : undefined;
        break;
      case 'lc':
        floor = value !== '' ? value : undefined;
        break;
      case 'fj':
        room = value !== '' ? value : undefined;
        break;
      case 'ch':
        bed = value !== '' ? value : undefined;
        break;
    }
  }

  if ((bed === undefined || bed === '') && bedVar !== '') {
    bed = bedVar;
  }

  const isAssigned = Boolean(
    (bed && bed !== '未安排床位' && building && !building.includes('未安排')) ||
    (room && building)
  );

  // 格式化房间与床位（对齐 Flutter formattedRoom, formattedBed, fullAddress）
  let formattedRoom = '未安排床位';
  if (isAssigned) {
    const parts: string[] = [];
    if (building) parts.push(building);
    if (unit) parts.push(unit);
    if (room) parts.push(`${room}室`);
    formattedRoom = parts.length > 0 ? parts.join(' ') : (building ?? '未知宿舍');
  }

  let formattedBed: string | undefined;
  if (bed && bed !== '') {
    formattedBed = bed.endsWith('号床') || bed.endsWith('床') ? bed : `${bed}号床`;
  }

  const fullAddress = !isAssigned
    ? '未安排床位'
    : formattedBed
      ? `${formattedRoom} ${formattedBed}`
      : formattedRoom;

  return {
    isAssigned,
    building,
    unit,
    floor,
    room,
    bed,
    academicYear,
    termCode,
    termName,
    formattedRoom,
    formattedBed,
    fullAddress,
    fields,
  };
}

/**
 * 拉取我的宿舍/床位信息。
 * 支持 forceRefresh 强制走 OAuth 重新认证。
 */
export async function fetchDormitoryInfo(
  session: CookieSession,
  forceRefresh = false,
): Promise<DormitoryInfo> {
  // 如果不是强制刷新，尝试直接带现有 JSESSIONID 探测拉取
  if (!forceRefresh) {
    try {
      const res = await requestBedHtml(session);
      if (isBedHtmlValid(res)) {
        return parseDormitoryHtml(res.body);
      }
    } catch {
      // Direct fetch failed, will authenticate
    }
  }

  // 重新执行授权认证
  await authenticateDormitory(session);

  // 认证后再次拉取床位信息
  const res = await requestBedHtml(session);
  if (!isBedHtmlValid(res)) {
    throw new Error('未能获取到宿舍床位信息，页面返回异常');
  }

  return parseDormitoryHtml(res.body);
}
