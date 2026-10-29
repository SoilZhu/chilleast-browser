import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/env';
import { createStatelessToken, decodeTokenCredentials } from '../src/auth/token';
import { CookieJar, type StoredCookie } from '../src/auth/cookies';
import {
  sealClientSession,
  openClientSession,
  acquireSession,
  clearRamSessionCache,
} from '../src/auth/session-manager';
import { parseBackupFileName } from '../src/school/hunau/cloudisk';
import { isSupportedBackupFormat, readDormitory } from '../src/school/hunau/backup';
import { applyTimetableRules, parseWeeks } from '../src/school/hunau/timetable-rules';
import { deriveCurrentWeekFromDates } from '../src/school/hunau/ydjwxt';
import {
  availableReserveDays,
  buildTimeSlots,
  dateTimeAt,
  formatDayLabel,
  isValidRange,
} from '../src/school/hunau/library-time';
import { isPendingOrUnfinished, isUpcomingOrToday } from '../src/school/hunau/chaoxing-study';
import { parseDormitoryHtml } from '../src/school/hunau/dormitory';
import {
  buildNoticeListForm,
  parseNoticePage,
  validateRechargeAmount,
} from '../src/routes/campus';
import { buildExamView, buildSubscriptionUrl, isValidSubscriptionUuid } from '../src/routes/academic';

const env: Env = {
  SESSION_KEY: 'dGVzdC1rZXktMzItYnl0ZXMtZm9yLXVuaXQtdGVzdHM=',
  ACCOUNT_PEPPER: 'dGVzdC1wZXBwZXItMzItYnl0ZXMtZm9yLXVuaXQtdGVzdHM=',
};

const ctx: ExecutionContext = {
  waitUntil: () => {},
  passThroughOnException: () => {},
};

describe('ChillEast Browser Relay Worker', () => {
  it('GET /health, /api, /api/ 应返回服务正常与零状态标识', async () => {
    for (const path of ['/health', '/api/health', '/api', '/api/']) {
      const req = new Request(`http://localhost${path}`);
      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.service).toBe('chilleast-browser-relay');
      expect(body.status).toBe('ok');
      expect(body.stateless).toBe(true);
      expect(body.sessionKeyConfigured).toBe(true);
    }
  });

  it('GET / 在 Web 域名下直接由 ASSETS 响应主应用（200），不重定向到 /web/', async () => {
    const html = '<!DOCTYPE html><html lang="zh-CN"><body><div id="app"></div></body></html>';
    const hits: string[] = [];
    const assets = {
      fetch: async (req: Request) => {
        hits.push(new URL(req.url).pathname);
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      },
    } as unknown as Fetcher;

    const res = await worker.fetch(new Request('http://web.chilleast.soilzhu.su/'), { ...env, ASSETS: assets }, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toBe(html);
    expect(hits).toEqual(['/']);
  });

  it('GET / 在 API 域名下返回服务状态 JSON', async () => {
    const res = await worker.fetch(new Request('http://api.chilleast.soilzhu.su/'), env, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const data = (await res.json()) as any;
    expect(data.service).toBe('chilleast-browser-relay');
    expect(data.status).toBe('ok');
  });

  it('GET /web 应 301 重定向到 /', async () => {
    const reqWeb = new Request('http://web.chilleast.soilzhu.su/web');
    const resWeb = await worker.fetch(reqWeb, env, ctx);
    expect(resWeb.status).toBe(301);
    expect(resWeb.headers.get('location')).toBe('http://web.chilleast.soilzhu.su/');
  });

  it('GET /web/ 亦应 301 重定向到 /', async () => {
    const reqWeb = new Request('http://web.chilleast.soilzhu.su/web/');
    const resWeb = await worker.fetch(reqWeb, env, ctx);
    expect(resWeb.status).toBe(301);
    expect(resWeb.headers.get('location')).toBe('http://web.chilleast.soilzhu.su/');
  });

  it('OPTIONS 预检请求应返回 204 及正确 CORS 响应头', async () => {
    const req = new Request('http://localhost/api/academic/timetable', {
      method: 'OPTIONS',
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('自包含 Token 应能安全加密封包并正确解密', async () => {
    const creds = { oaId: '20230001', oaKey: 'mypassword123' };
    const token = await createStatelessToken(env, creds, 10000);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    const decoded = await decodeTokenCredentials(env, token);
    expect(decoded).not.toBeNull();
    expect(decoded?.oaId).toBe('20230001');
    expect(decoded?.oaKey).toBe('mypassword123');
  });

  it('过期的 Token 解密应返回 null', async () => {
    const creds = { oaId: '20230001', oaKey: 'mypassword123' };
    // 立即过期的 token (-1000ms)
    const token = await createStatelessToken(env, creds, -1000);
    const decoded = await decodeTokenCredentials(env, token);
    expect(decoded).toBeNull();
  });

  it('未提供 Authorization 时业务接口应返回 401 unauthorized', async () => {
    const endpoints = [
      '/api/academic/timetable',
      '/api/academic/scores',
      '/api/academic/exams',
      '/api/campus/card',
      '/api/campus/electricity',
      '/api/campus/sunshine/departments',
      '/api/campus/sunshine/letters',
      '/api/campus/sunshine/detail',
      '/api/study/homework',
      '/api/library/seats',
      '/api/campus/notices',
      '/api/campus/notices/detail?uuid=x',
    ];

    for (const ep of endpoints) {
      const req = new Request(`http://localhost${ep}`);
      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(401);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.ok).toBe(false);
    }
  });

  it('新增的写接口在未授权时同样应返回 401', async () => {
    // 电费预下单有真实扣款副作用，未登录必须挡在最前面
    const preorder = await worker.fetch(
      new Request('http://localhost/api/campus/electricity/preorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50 }),
      }),
      env,
      ctx,
    );
    expect(preorder.status).toBe(401);

    // ICS 订阅写入同样要求登录态（防匿名篡改别人的订阅）
    const publish = await worker.fetch(
      new Request('http://localhost/api/academic/timetable/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: 'x', ics: 'BEGIN:VCALENDAR' }),
      }),
      env,
      ctx,
    );
    expect(publish.status).toBe(401);

    const remove = await worker.fetch(
      new Request('http://localhost/api/academic/timetable/subscription?uuid=x', {
        method: 'DELETE',
      }),
      env,
      ctx,
    );
    expect(remove.status).toBe(401);
  });

  it('电费预下单应先校验金额，非法金额不进入一卡通链路', async () => {
    // 这里刻意给一个合法 token：金额校验必须发生在任何网络请求之前，
    // 所以即使后面登录/一卡通全都连不上，也应当拿到 400 而不是 500。
    const token = await createStatelessToken(env, { oaId: '20230001', oaKey: 'pwd' });
    const cases: Array<{ body: Record<string, unknown>; label: string }> = [
      { body: { areaName: 'A', buildingName: 'B', roomId: 'R', mertype: 'yk', amount: 0 }, label: 'amount=0' },
      { body: { areaName: 'A', buildingName: 'B', roomId: 'R', mertype: 'yk', amount: 1001 }, label: 'amount=1001' },
      { body: { areaName: 'A', buildingName: 'B', roomId: 'R', mertype: 'yk', amount: 10.5 }, label: 'amount=10.5' },
      { body: { areaName: 'A', buildingName: 'B', roomId: 'R', mertype: 'yk', amount: '50' }, label: 'amount="50"' },
      { body: { areaName: 'A', buildingName: 'B', roomId: 'R', mertype: 'yk' }, label: 'amount 缺失' },
    ];

    for (const c of cases) {
      const res = await worker.fetch(
        new Request('http://localhost/api/campus/electricity/preorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(c.body),
        }),
        env,
        ctx,
      );
      expect(res.status, c.label).toBe(400);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('invalid_amount');
    }
  });

  it('电费预下单应校验房间参数', async () => {
    const token = await createStatelessToken(env, { oaId: '20230001', oaKey: 'pwd' });
    const res = await worker.fetch(
      new Request('http://localhost/api/campus/electricity/preorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: 50 }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('missing_params');
  });

  it('ICS 订阅接口应校验 uuid 与 ics 内容', async () => {
    const token = await createStatelessToken(env, { oaId: '20230001', oaKey: 'pwd' });

    // uuid 不合法
    const badUuid = await worker.fetch(
      new Request('http://localhost/api/academic/timetable/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uuid: 'not-a-uuid', ics: 'BEGIN:VCALENDAR' }),
      }),
      env,
      ctx,
    );
    expect(badUuid.status).toBe(400);
    expect(((await badUuid.json()) as any).error.code).toBe('invalid_uuid');

    // ics 不含 BEGIN:VCALENDAR
    const badIcs = await worker.fetch(
      new Request('http://localhost/api/academic/timetable/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          uuid: '4f9b1c2d-3e4a-4b5c-8d9e-0f1a2b3c4d5e',
          ics: 'just some text',
        }),
      }),
      env,
      ctx,
    );
    expect(badIcs.status).toBe(400);
    expect(((await badIcs.json()) as any).error.code).toBe('invalid_ics');

    // 合法请求但 env 没配 ICS_API_KEY -> 500，绝不无鉴权写入
    const noKey = await worker.fetch(
      new Request('http://localhost/api/academic/timetable/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          uuid: '4f9b1c2d-3e4a-4b5c-8d9e-0f1a2b3c4d5e',
          ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR',
        }),
      }),
      env,
      ctx,
    );
    expect(noKey.status).toBe(500);
    expect(((await noKey.json()) as any).error.code).toBe('ics_not_configured');

    // DELETE 的 uuid 校验同理
    const badDelete = await worker.fetch(
      new Request('http://localhost/api/academic/timetable/subscription?uuid=oops', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
      ctx,
    );
    expect(badDelete.status).toBe(400);
    expect(((await badDelete.json()) as any).error.code).toBe('invalid_uuid');
  });

  it('课表订阅路由应只接受 POST / DELETE，其它方法返回 405', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/api/academic/timetable/subscription', { method: 'GET' }),
      env,
      ctx,
    );
    expect(res.status).toBe(405);

    const preorderGet = await worker.fetch(
      new Request('http://localhost/api/campus/electricity/preorder', { method: 'GET' }),
      env,
      ctx,
    );
    expect(preorderGet.status).toBe(405);
  });

  it('Proxy 接口应拒绝非白名单域名的转发', async () => {
    const token = await createStatelessToken(env, { oaId: '20230001', oaKey: 'pwd' });
    const req = new Request('http://localhost/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        url: 'https://evil.com/steal-data',
      }),
    });

    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(403);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(false);
  });

  it('parseBackupFileName 应同时兼容历史轨与现代轨备份文件名', () => {
    const legacy = parseBackupFileName('chilleast-backup-b-20261021-120000.json');
    expect(legacy).toEqual({ slot: 'b', stamp: '20261021-120000', format: 'legacy' });

    const modern = parseBackupFileName('chilleast-modern-20261021-143000.json');
    expect(modern).toEqual({ slot: 'b', stamp: '20261021-143000', format: 'modern' });

    expect(parseBackupFileName('random-file.json')).toBeNull();
  });

  it('backup 模块应正确识别合法备份格式并解析宿舍信息', () => {
    expect(isSupportedBackupFormat('chilleast-backup')).toBe(true);
    expect(isSupportedBackupFormat('chilleast-modern')).toBe(true);
    expect(isSupportedBackupFormat('invalid-format')).toBe(false);

    const dorm = readDormitory({
      settings: {
        electricityRoom: {
          areaName: '东湖校区',
          buildingName: '12栋',
          roomName: '305',
        },
      },
    });
    expect(dorm?.areaName).toBe('东湖校区');
    expect(dorm?.buildingName).toBe('12栋');
    expect(dorm?.roomName).toBe('305');
    expect(dorm?.fullName).toBe('东湖校区 12栋 305');
  });

  it('applyTimetableRules 应正确按规则执行加课、调课与停课', () => {
    const rawCourses = [
      {
        name: '高等数学',
        teacher: '李老师',
        classroom: '十教北101',
        dayOfWeek: 1,
        startPeriod: 1,
        endPeriod: 2,
        periods: '01-02',
        weeks: '1-16(周)',
      },
    ];

    // 1. 自定义加课
    const customRule = {
      id: 'rule_custom_1',
      type: 'customCourse' as const,
      description: '加课：Java实训',
      createdAt: '2026-10-21T00:00:00Z',
      data: {
        courseName: 'Java实训',
        teacher: '张老师',
        classroom: '信科楼201',
        dayOfWeek: 3,
        startPeriod: 3,
        endPeriod: 4,
        weeks: '1-8(周)',
      },
    };

    // 2. 调课：将高等数学从第 3 周周一挪到第 3 周周二
    const rescheduleRule = {
      id: 'rule_reschedule_1',
      type: 'reschedule' as const,
      description: '调课：高数周一改周二',
      createdAt: '2026-10-21T00:00:00Z',
      data: {
        courseName: '高等数学',
        sourceWeek: 3,
        targetWeek: 3,
        sourceDayOfWeek: 1,
        targetDayOfWeek: 2,
        action: 'move',
      },
    };

    // 3. 停课：第 5 周停课
    const suspensionRule = {
      id: 'rule_suspension_1',
      type: 'suspension' as const,
      description: '停课：高数第5周放假',
      createdAt: '2026-10-21T00:00:00Z',
      data: {
        courseName: '高等数学',
        startWeek: 5,
        endWeek: 5,
        startDayOfWeek: 1,
        endDayOfWeek: 7,
      },
    };

    const result = applyTimetableRules(rawCourses, [customRule, rescheduleRule, suspensionRule]);

    // 加课生效
    const javaCourse = result.find((c) => c.name === 'Java实训');
    expect(javaCourse).toBeDefined();
    expect(javaCourse?.ruleTag).toBe('custom');
    expect(javaCourse?.dayOfWeek).toBe(3);

    // 调课生效：周二出现高等数学，且带有 rescheduled 标记
    const movedMath = result.find((c) => c.name === '高等数学' && c.dayOfWeek === 2);
    expect(movedMath).toBeDefined();
    expect(movedMath?.ruleTag).toBe('rescheduled');
    expect(parseWeeks(movedMath!.weeks)).toContain(3);

    // 停课生效：原周一的高数在第 5 周被移除
    const originalMath = result.find((c) => c.name === '高等数学' && c.dayOfWeek === 1);
    expect(parseWeeks(originalMath!.weeks)).not.toContain(5);
  });

  it('deriveCurrentWeekFromDates 应根据当前日期正确推算周次', () => {
    const datesMap = new Map<number, Array<{ weekday: string; date: string }>>();
    datesMap.set(1, [
      { weekday: '1', date: '2026-03-02' },
      { weekday: '7', date: '2026-03-08' },
    ]);
    datesMap.set(2, [
      { weekday: '1', date: '2026-03-09' },
      { weekday: '7', date: '2026-03-15' },
    ]);

    // 命中第 2 周中的某天
    const current = deriveCurrentWeekFromDates(datesMap, new Date('2026-03-10T10:00:00Z'));
    expect(current).toBe(2);
  });

  it('library-time 应正确生成预约时间刻度与判断有效性', () => {
    const slots = buildTimeSlots();
    expect(slots[0]).toBe('07:00');
    expect(slots[slots.length - 1]).toBe('22:00');
    expect(slots).toContain('12:00');
    expect(slots).toContain('12:30');

    // 22:00 之前只返回今天，22:00 之后包含明天
    const afternoon = new Date('2026-10-21T06:00:00Z'); // 北京时间 14:00
    const daysAfternoon = availableReserveDays(afternoon);
    expect(daysAfternoon.length).toBe(1);

    const night = new Date('2026-10-21T14:30:00Z'); // 北京时间 22:30
    const daysNight = availableReserveDays(night);
    expect(daysNight.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 考试过滤（对齐原版 ExamService.isPendingOrUnfinished / ExamStorage.isUpcomingOrToday）
  // -------------------------------------------------------------------------

  it('isPendingOrUnfinished 应排除已完成/已结束，只保留待考与进行中', () => {
    // 待开始 / 进行中 / 未交 -> 保留
    for (const status of ['未开始', '进行中', '未交', '待考', '待考试', '考试中', '未开始考试']) {
      expect(isPendingOrUnfinished(status)).toBe(true);
    }

    // 已完成 / 已结束（含子串变体）-> 排除
    for (const status of ['已完成', '已结束', '考试已完成', '本场考试已结束']) {
      expect(isPendingOrUnfinished(status)).toBe(false);
    }

    // 空状态、未知状态 -> 排除（宁缺毋滥，别把历史考试顶到列表里）
    expect(isPendingOrUnfinished('')).toBe(false);
    expect(isPendingOrUnfinished('   ')).toBe(false);
    expect(isPendingOrUnfinished('未知状态')).toBe(false);
  });

  it('isUpcomingOrToday 应只保留开始时间不早于今天 00:00（北京时间）的考试', () => {
    // 参考时间：北京时间 2026-10-26 10:00（UTC 2026-10-26 02:00）
    const now = Date.UTC(2026, 9, 26, 2, 0, 0);

    // 今天 00:00（北京时间）= UTC 2026-10-25 16:00 —— 恰好等于日界，应保留
    const todayStart = Date.UTC(2026, 9, 25, 16, 0, 0);
    expect(isUpcomingOrToday(todayStart, now)).toBe(true);

    // 今天 09:00（北京时间）—— 保留
    expect(isUpcomingOrToday(Date.UTC(2026, 9, 26, 1, 0, 0), now)).toBe(true);

    // 明天 —— 保留
    expect(isUpcomingOrToday(Date.UTC(2026, 9, 27, 2, 0, 0), now)).toBe(true);

    // 昨天 23:59（北京时间）—— 排除
    expect(isUpcomingOrToday(Date.UTC(2026, 9, 25, 15, 59, 0), now)).toBe(false);

    // 上周的考试 —— 排除
    expect(isUpcomingOrToday(Date.UTC(2026, 9, 20, 2, 0, 0), now)).toBe(false);

    // 无可用时间（NaN）—— 保留，与原版 time == null 一致
    expect(isUpcomingOrToday(Number.NaN, now)).toBe(true);
  });

  it('isUpcomingOrToday 的日界必须按北京时间算，不能按 UTC', () => {
    // 北京时间 2026-10-26 07:00（UTC 还是 10-25 23:00）。
    // 若按 UTC 取日界，今天 00:30 的考试会被判成「昨天」而误删。
    const now = Date.UTC(2026, 9, 25, 23, 0, 0); // 北京 10-26 07:00
    const examTodayEarly = Date.UTC(2026, 9, 25, 16, 30, 0); // 北京 10-26 00:30
    expect(isUpcomingOrToday(examTodayEarly, now)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 通知游标分页（对齐原版 NoticeService.fetchMessageList）
  // -------------------------------------------------------------------------

  it('buildNoticeListForm 应产出与原版一致的表单字段', () => {
    // 北京时间 2026-10-26 10:00（UTC 02:00）—— 年份要按北京时间取
    const form = buildNoticeListForm('cursor-abc', Date.UTC(2026, 9, 26, 2, 0, 0));

    // 关键语义字段：type=2（超星通知）、lastValue 游标、year=当前年
    expect(form['type']).toBe('2');
    expect(form['lastValue']).toBe('cursor-abc');
    expect(form['year']).toBe('2026');
    expect(form['queryFolderNoticePrevYear']).toBe('0');

    // 原版明确带上的空字段（缺了超星会按别的查询分支处理）
    for (const key of [
      'notice_type',
      'sort',
      'folderUUID',
      'kw',
      'startTime',
      'endTime',
      'gKw',
      'gName',
      'tag',
      'fidsCode',
      'filterSenderPuids',
      'filterTags',
    ]) {
      expect(form[key]).toBe('');
    }

    // 第一页游标为空串
    expect(buildNoticeListForm('').lastValue).toBe('');

    // 跨年边界：UTC 还是 2026-12-31 16:30，北京时间已是 2027-01-01 00:30。
    // 超星按「年」查通知，这里必须给 2027，否则元旦当天会查不到当年的通知。
    expect(buildNoticeListForm('', Date.UTC(2026, 11, 31, 16, 30, 0)).year).toBe('2027');
  });

  it('parseNoticePage 应解析 list 与 lastGetId，并按游标非空判定 hasMore', () => {
    const page = parseNoticePage({
      notices: {
        list: [
          {
            uuid: 'uuid-1',
            idCode: 'id-1',
            content: '关于开展期中教学检查的通知\n各位老师：',
            createrName: '教务处',
            insertTime: Date.UTC(2026, 9, 26, 1, 30, 0), // 北京 09:30
            isread: 1,
          },
          {
            uuid: 'uuid-2',
            idCode: 'id-2',
            content: '',
            attachment: '[{"name":"附件通知.pdf"}]',
            insertTime: Date.UTC(2026, 9, 25, 0, 0, 0),
            isread: 0,
          },
        ],
        lastGetId: 'next-cursor',
      },
    });

    expect(page.list).toHaveLength(2);
    expect(page.lastGetId).toBe('next-cursor');
    expect(page.hasMore).toBe(true);

    // 标题：content 首行（未超 120 字不截断）
    expect(page.list[0].title).toBe('关于开展期中教学检查的通知');
    expect(page.list[0].sender).toBe('教务处');
    expect(page.list[0].isRead).toBe(true);
    expect(page.list[0].date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(page.list[0].sentAt).toBe(page.list[0].date);
    // insertTime 是 UTC 01:30，北京时间应为 09:30（不能直接读 UTC 的 getHours）
    expect(page.list[0].date).toBe('2026-10-26 09:30');

    // content 为空时退到 attachment 的 name
    expect(page.list[1].title).toBe('附件通知.pdf');
    expect(page.list[1].isRead).toBe(false);
  });

  it('parseNoticePage 在最后一页（lastGetId 为空）时应给出 hasMore=false', () => {
    const page = parseNoticePage({
      notices: { list: [{ uuid: 'u', content: 'x', isread: 0 }], lastGetId: '' },
    });
    expect(page.list).toHaveLength(1);
    expect(page.lastGetId).toBe('');
    expect(page.hasMore).toBe(false);
  });

  it('parseNoticePage 应容忍缺失/异常的响应结构，不抛异常', () => {
    expect(parseNoticePage({}).list).toEqual([]);
    expect(parseNoticePage({}).hasMore).toBe(false);
    expect(parseNoticePage(null).list).toEqual([]);
    // 无 notices 包裹、list 直接在顶层的兼容分支
    expect(parseNoticePage({ list: [{ uuid: 'u2' }] }).list[0].uuid).toBe('u2');
  });

  // -------------------------------------------------------------------------
  // 电费充值金额校验（对齐原版 _handleCampusCardRecharge）
  // -------------------------------------------------------------------------

  it('validateRechargeAmount 只接受 1–1000 的整数元', () => {
    expect(validateRechargeAmount(1)).toEqual({ ok: true, amount: 1 });
    expect(validateRechargeAmount(1000)).toEqual({ ok: true, amount: 1000 });
    expect(validateRechargeAmount(50)).toEqual({ ok: true, amount: 50 });

    // 越界
    expect(validateRechargeAmount(0).ok).toBe(false);
    expect(validateRechargeAmount(1001).ok).toBe(false);
    expect(validateRechargeAmount(-5).ok).toBe(false);

    // 非整数 / 非数字 / 字符串（前端可能把金额当字符串传上来）
    expect(validateRechargeAmount(10.5).ok).toBe(false);
    expect(validateRechargeAmount('50').ok).toBe(false);
    expect(validateRechargeAmount(Number.NaN).ok).toBe(false);
    expect(validateRechargeAmount(null).ok).toBe(false);
    expect(validateRechargeAmount(undefined).ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 课表 ICS 订阅（对齐原版 TimetableSubscriptionService）
  // -------------------------------------------------------------------------

  it('isValidSubscriptionUuid 应只接受 36 位标准 UUID', () => {
    expect(isValidSubscriptionUuid('4f9b1c2d-3e4a-4b5c-8d9e-0f1a2b3c4d5e')).toBe(true);
    expect(isValidSubscriptionUuid('  4f9b1c2d-3e4a-4b5c-8d9e-0f1a2b3c4d5e  ')).toBe(true);
    expect(isValidSubscriptionUuid('4F9B1C2D-3E4A-4B5C-8D9E-0F1A2B3C4D5E')).toBe(true);

    // 长度不对 / 缺段 / 含非法字符 / 路径穿越 / 空
    expect(isValidSubscriptionUuid('')).toBe(false);
    expect(isValidSubscriptionUuid('4f9b1c2d-3e4a-4b5c-8d9e')).toBe(false);
    expect(isValidSubscriptionUuid('4f9b1c2d3e4a4b5c8d9e0f1a2b3c4d5e')).toBe(false);
    expect(isValidSubscriptionUuid('../../etc/passwd')).toBe(false);
    expect(isValidSubscriptionUuid('4f9b1c2d-3e4a-4b5c-8d9e-0f1a2b3c4d5g')).toBe(false);
  });

  it('buildExamView 应只保留待考且未过期的考试，无时间的排在最后', () => {
    // 参考时间：北京时间 2026-10-26 10:00（UTC 02:00）
    const now = Date.UTC(2026, 9, 26, 2, 0, 0);

    const makeExam = (
      id: string,
      status: string,
      timeMs: number,
    ) => ({
      id,
      title: `考试 ${id}`,
      courseName: '',
      timeMs,
      allTimesMs: [timeMs],
      rawTimeStrs: [],
      detailUrl: `https://mooc1-api.chaoxing.com/${id}`,
      status,
      studentName: '张三',
      studentId: '20230001',
    });

    const exams = [
      // 未来的待考 -> 保留
      makeExam('future', '待考', Date.UTC(2026, 10, 1, 2, 0, 0)),
      // 今天的进行中 -> 保留
      makeExam('today', '进行中', Date.UTC(2026, 9, 26, 1, 0, 0)),
      // 昨天的 -> 时间过滤掉
      makeExam('yesterday', '待考', Date.UTC(2026, 9, 25, 2, 0, 0)),
      // 已结束 -> 状态过滤掉
      makeExam('finished', '已结束', Date.UTC(2026, 10, 5, 2, 0, 0)),
      // 已完成 -> 状态过滤掉
      makeExam('completed', '已完成', Date.UTC(2026, 10, 6, 2, 0, 0)),
    ];

    // 详情页没解析出时间的考试（原版会以「未定时间」保留）
    const unresolved = [
      { id: 'no-time', title: '未定时间考试', dataUrl: 'https://x/1', status: '未开始' },
      { id: 'no-time-done', title: '已结束无时间', dataUrl: 'https://x/2', status: '已结束' },
    ];

    const view = buildExamView(exams, unresolved, now);

    // today 与 future 保留且按时间升序；yesterday/finished/completed 全部剔除
    expect(view.map((v) => v.id)).toEqual(['today', 'future', 'no-time']);

    // 无时间的考试 timeMs 为 null（前端据此显示「待定」而不是倒计时）
    const noTime = view.find((v) => v.id === 'no-time')!;
    expect(noTime.timeMs).toBeNull();
    expect(noTime.time).toBeNull();
    expect(noTime.timeLocal).toBeNull();

    // 有时间的考试给出毫秒时间戳与 ISO / 本地两种展示串
    const today = view.find((v) => v.id === 'today')!;
    expect(today.timeMs).toBe(Date.UTC(2026, 9, 26, 1, 0, 0));
    expect(today.time).toBe('2026-10-26T01:00:00.000Z');
    expect(today.timeLocal).toBe('2026-10-26 09:00');

    // 已不再输出 isPast 字段（前端语义是「待考倒计时」）
    expect('isPast' in today).toBe(false);
  });

  it('buildExamView 在全部过期时应返回空列表', () => {
    const now = Date.UTC(2026, 9, 26, 2, 0, 0);
    const past = {
      id: 'p',
      title: '旧考试',
      courseName: '',
      timeMs: Date.UTC(2026, 8, 1, 2, 0, 0),
      allTimesMs: [],
      rawTimeStrs: [],
      detailUrl: '',
      status: '待考',
      studentName: '',
      studentId: '',
    };
    expect(buildExamView([past], [], now)).toEqual([]);
  });

  it('ICS 订阅上传应转发 PUT 到订阅服务，并带上服务端密钥', async () => {
    const uuid = '4f9b1c2d-3e4a-4b5c-8d9e-0f1a2b3c4d5e';
    const icsEnv: Env = {
      ...env,
      ICS_API_KEY: 'test-ics-key',
      ICS_BASE_URL: 'https://ics.example.test/',
    };
    const token = await createStatelessToken(icsEnv, { oaId: '20230001', oaKey: 'pwd' });

    const calls: Array<{ url: string; method: string; auth: string | null; body: unknown }> = [];
    const originalFetch = globalThis.fetch;
    // 用桩替换 fetch：这一层只关心「转发得对不对」，不真的打外部服务
    globalThis.fetch = (async (input: any, init: any) => {
      calls.push({
        url: String(input),
        method: init?.method,
        auth: init?.headers?.Authorization ?? null,
        body: init?.body,
      });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request('http://localhost/api/academic/timetable/subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ uuid, ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR' }),
        }),
        icsEnv,
        ctx,
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      // 返回的 url 必须与 App 端的订阅地址一致（前端拿它展示二维码/复制）
      expect(json.data.success).toBe(true);
      expect(json.data.url).toBe(`https://ics.example.test/${uuid}/timetable.ics`);

      // 转发细节：PUT + Bearer 服务端密钥 + 原样透传 ICS
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`https://ics.example.test/${uuid}/timetable.ics`);
      expect(calls[0].method).toBe('PUT');
      expect(calls[0].auth).toBe('Bearer test-ics-key');
      expect(calls[0].body).toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('ICS 订阅删除应转发 DELETE；上游 404 视作已删除', async () => {
    const uuid = '4f9b1c2d-3e4a-4b5c-8d9e-0f1a2b3c4d5e';
    const icsEnv: Env = { ...env, ICS_API_KEY: 'test-ics-key', ICS_BASE_URL: 'https://ics.example.test' };
    const token = await createStatelessToken(icsEnv, { oaId: '20230001', oaKey: 'pwd' });

    const calls: Array<{ url: string; method: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init: any) => {
      calls.push({ url: String(input), method: init?.method });
      // 上游删不存在的 key 也返回 404，本层应视作「已经没有了」
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request(`http://localhost/api/academic/timetable/subscription?uuid=${uuid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }),
        icsEnv,
        ctx,
      );

      expect(res.status).toBe(200);
      expect(((await res.json()) as any).data.success).toBe(true);
      expect(calls[0].method).toBe('DELETE');
      expect(calls[0].url).toBe(`https://ics.example.test/${uuid}/timetable.ics`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('buildSubscriptionUrl 应拼出与原版一致的订阅地址', () => {
    const uuid = '4f9b1c2d-3e4a-4b5c-8d9e-0f1a2b3c4d5e';
    expect(buildSubscriptionUrl('https://ics.chilleast.soilzhu.su', uuid)).toBe(
      `https://ics.chilleast.soilzhu.su/${uuid}/timetable.ics`,
    );
    // 尾部斜杠要吃掉，避免出现 //uuid
    expect(buildSubscriptionUrl('https://ics.chilleast.soilzhu.su/', uuid)).toBe(
      `https://ics.chilleast.soilzhu.su/${uuid}/timetable.ics`,
    );
    // uuid 统一小写（与 ICS Worker 的 uuid.toLowerCase() 对齐）
    expect(
      buildSubscriptionUrl('https://ics.chilleast.soilzhu.su', uuid.toUpperCase()),
    ).toBe(`https://ics.chilleast.soilzhu.su/${uuid}/timetable.ics`);
  });
});

describe('图书馆座位系统 · 纯逻辑', () => {
  it('parseSeatGrid 应解析坐标、座位与障碍物配置', async () => {
    const { parseSeatGrid } = await import('../src/school/hunau/library');
    const grid = parseSeatGrid({
      otherDatas: {
        roomId: '14087',
        x: '12',
        y: '8',
        config: JSON.stringify([
          { x: 1, y: 1, type: 2, label: '窗' },
          { x: 2, y: 1, type: 1, label: '' },
        ]),
      },
      seatDatas: [
        { id: 1, roomId: 14087, seatNum: '001', x: '1', y: '2', reserveStatus: '0' },
        { id: 2, roomId: 14087, seatNum: '002', x: '2', y: '2', reserveStatus: '1' },
      ],
    });
    expect(grid.roomId).toBe(14087);
    expect(grid.cols).toBe(12);
    expect(grid.rows).toBe(8);
    expect(grid.seats).toHaveLength(2);
    expect(grid.seats[1]).toMatchObject({ seatNum: '002', x: 2, y: 2, reserveStatus: 1 });
    expect(grid.obstacles).toEqual([
      { x: 1, y: 1, type: 2, label: '窗' },
      { x: 2, y: 1, type: 1, label: '' },
    ]);
  });

  it('parseGridConfig 遇到非法配置应返回空数组而不是抛错', async () => {
    const { parseGridConfig } = await import('../src/school/hunau/library');
    expect(parseGridConfig(undefined)).toEqual([]);
    expect(parseGridConfig('')).toEqual([]);
    expect(parseGridConfig('not json')).toEqual([]);
    expect(parseGridConfig({})).toEqual([]);
  });

  it('parseUsedSeatNums 应同时兼容字符串数组与对象数组', async () => {
    const { parseUsedSeatNums } = await import('../src/school/hunau/library');
    expect(parseUsedSeatNums({ seatReserves: ['001', '002'] })).toEqual(['001', '002']);
    expect(parseUsedSeatNums({ seatReserves: [{ seatNum: 'A-3' }, { seatNum: 7 }] })).toEqual([
      'A-3',
      '7',
    ]);
    expect(parseUsedSeatNums({})).toEqual([]);
    expect(parseUsedSeatNums({ seatReserves: 'oops' })).toEqual([]);
  });

  it('parseLevels 应按 type 取对应层级并去重', async () => {
    const { parseLevels } = await import('../src/school/hunau/library');
    const payload = {
      levels: [
        { firstLevelName: '图书馆', secondLevelName: '2楼', thirdLevelName: '201' },
        { firstLevelName: '图书馆', secondLevelName: '3楼', thirdLevelName: '301' },
        { firstLevelName: '图书馆', secondLevelName: '', thirdLevelName: '' },
      ],
    };
    expect(parseLevels(payload, 0)).toEqual(['图书馆']);
    expect(parseLevels(payload, 1)).toEqual(['2楼', '3楼']);
    expect(parseLevels(payload, 2)).toEqual(['201', '301']);
  });

  it('parseStartEndTime 应取 ymd 与开放时段', async () => {
    const { parseStartEndTime } = await import('../src/school/hunau/library');
    expect(parseStartEndTime({ ymd: '2026-10-27', startTime: '07:00', endTime: '22:00' })).toEqual({
      ymd: '2026-10-27',
      startTime: '07:00',
      endTime: '22:00',
    });
    expect(parseStartEndTime({})).toEqual({ ymd: '', startTime: '', endTime: '' });
  });

  it('seatCodePageUrl 应补齐三位座位号与签到参数', async () => {
    const { seatCodePageUrl } = await import('../src/school/hunau/library');
    const url = new URL(seatCodePageUrl({ roomId: 14087, seatNum: '7', id: 99 }));
    expect(url.pathname).toBe('/front/apps/seat/code');
    expect(url.searchParams.get('seatNum')).toBe('7');
    expect(url.searchParams.get('num')).toBe('007');
    expect(url.searchParams.get('reserveId')).toBe('99');
    expect(url.searchParams.get('room')).toBe('14087');
    expect(url.searchParams.get('signType')).toBe('1');
  });

  it('reserveStatusLabel 应覆盖原版全部状态码', async () => {
    const { reserveStatusLabel } = await import('../src/school/hunau/library');
    expect(reserveStatusLabel(0)).toBe('待签到');
    expect(reserveStatusLabel(1)).toBe('使用中');
    expect(reserveStatusLabel(3)).toBe('暂离中');
    expect(reserveStatusLabel(5)).toBe('可签到');
    expect(reserveStatusLabel(7)).toBe('已结束');
    expect(reserveStatusLabel(42)).toBe('未知');
  });
});


describe('云备份 · 双轨仲裁与分轨收敛（SYNC-ALIGN 4.2 / 5）', () => {
  /** 造一个 CloudiskEntry（字段与 listRes 的 toEntry 一致）。 */
  const entry = (name: string, id = name): import('../src/school/hunau/cloudisk').CloudiskEntry => ({
    raw: { name, id },
    name,
    id,
    encryptedId: `enc-${id}`,
    puid: 'puid-1',
  });

  it('parseBackupFileName 应保留 {slot,stamp,format} 返回结构（有兼容性依赖）', () => {
    expect(parseBackupFileName('chilleast-backup-a-20261027-070000.json')).toEqual({
      slot: 'a',
      stamp: '20261027-070000',
      format: 'legacy',
    });
    expect(parseBackupFileName('chilleast-modern-20261027-070000.json')).toEqual({
      slot: 'b',
      stamp: '20261027-070000',
      format: 'modern',
    });
    expect(parseBackupFileName('chilleast-modern-20261027-070000.txt')).toBeNull();
  });

  it('pickLatestModernEntry / pickLatestLegacyEntry 必须分轨，不能混在一起取最新', async () => {
    const { pickLatestModernEntry, pickLatestLegacyEntry } = await import(
      '../src/school/hunau/cloudisk'
    );
    const entries = [
      entry('chilleast-modern-20261027-060000.json', 'm1'),
      entry('chilleast-modern-20261027-090000.json', 'm2'),
      // 兼容轨更新，但现代轨挑选绝不能把它算进来
      entry('chilleast-backup-a-20261027-120000.json', 'l1'),
      entry('chilleast-backup-b-20261027-080000.json', 'l2'),
      entry('random.json', 'x'),
    ];
    expect(pickLatestModernEntry(entries)?.id).toBe('m2');
    expect(pickLatestLegacyEntry(entries)?.id).toBe('l1');

    // 只有一条轨道时，另一条必须返回 null
    const onlyModern = [entry('chilleast-modern-20261027-090000.json', 'm2')];
    expect(pickLatestLegacyEntry(onlyModern)).toBeNull();
    const onlyLegacy = [entry('chilleast-backup-b-20261027-080000.json', 'l2')];
    expect(pickLatestModernEntry(onlyLegacy)).toBeNull();
  });

  it('pickLatest*Entry 应按 stamp 比较而非整个文件名（-a- 不会恒输给 -b-）', async () => {
    const { pickLatestLegacyEntry } = await import('../src/school/hunau/cloudisk');
    const entries = [
      entry('chilleast-backup-b-20261027-080000.json', 'b-old'),
      entry('chilleast-backup-a-20261027-124754.json', 'a-new'),
    ];
    expect(pickLatestLegacyEntry(entries)?.id).toBe('a-new');
  });

  it('pickStaleModernEntries / pickStaleLegacyEntries 应每轨各留 3 份且互不删除', async () => {
    const { pickStaleModernEntries, pickStaleLegacyEntries } = await import(
      '../src/school/hunau/cloudisk'
    );
    const entries = [
      // 现代轨 5 份
      entry('chilleast-modern-20261027-010000.json', 'm1'),
      entry('chilleast-modern-20261027-020000.json', 'm2'),
      entry('chilleast-modern-20261027-030000.json', 'm3'),
      entry('chilleast-modern-20261027-040000.json', 'm4'),
      entry('chilleast-modern-20261027-050000.json', 'm5'),
      // 兼容轨 5 份
      entry('chilleast-backup-b-20261027-010000.json', 'l1'),
      entry('chilleast-backup-b-20261027-020000.json', 'l2'),
      entry('chilleast-backup-b-20261027-030000.json', 'l3'),
      entry('chilleast-backup-b-20261027-040000.json', 'l4'),
      entry('chilleast-backup-b-20261027-050000.json', 'l5'),
    ];

    const staleModern = pickStaleModernEntries(entries, 'm5').map((e) => e.id);
    expect(staleModern.sort()).toEqual(['m1', 'm2']);
    // 现代轨的清理绝不能碰到兼容轨
    expect(staleModern.some((id) => id.startsWith('l'))).toBe(false);

    const staleLegacy = pickStaleLegacyEntries(entries, 'l5').map((e) => e.id);
    expect(staleLegacy.sort()).toEqual(['l1', 'l2']);
    expect(staleLegacy.some((id) => id.startsWith('m'))).toBe(false);
  });

  it('分轨清理只删严格更旧的，不删与手机端并发写入的更新备份', async () => {
    const { pickStaleModernEntries } = await import('../src/school/hunau/cloudisk');
    const entries = [
      entry('chilleast-modern-20261027-010000.json', 'm-old'),
      entry('chilleast-modern-20261027-020000.json', 'm-mid'),
      entry('chilleast-modern-20261027-030000.json', 'm-new'),
      // 手机端并发写了更新的（上传后才出现在列表里）—— 绝不能删
      entry('chilleast-modern-20261027-090000.json', 'm-newer'),
    ];
    const stale = pickStaleModernEntries(entries, 'm-new').map((e) => e.id);
    // 保留 m-newer / m-new / m-mid，只删最旧的 m-old
    expect(stale).toEqual(['m-old']);
  });

  it('decideBackupArbitration 三分支：现代轨>=兼容轨 / 仅兼容轨 / 兼容轨更新', async () => {
    const { decideBackupArbitration } = await import('../src/school/hunau/backup');

    const modern = entry('chilleast-modern-20261027-090000.json', 'm1');
    const legacyOlder = entry('chilleast-backup-b-20261027-080000.json', 'l1');
    const legacyNewer = entry('chilleast-backup-b-20261027-120000.json', 'l2');

    // 分支 1：现代轨更新（>=）
    expect(decideBackupArbitration(modern, legacyOlder)?.branch).toBe('modern');
    // 分支 1 边界：stamp 相等也算现代轨胜
    expect(
      decideBackupArbitration(
        entry('chilleast-modern-20261027-080000.json', 'm2'),
        legacyOlder,
      )?.branch,
    ).toBe('modern');
    // 分支 1：只有现代轨
    expect(decideBackupArbitration(modern, null)?.branch).toBe('modern');
    // 分支 2：只有兼容轨（老用户升级）
    expect(decideBackupArbitration(null, legacyOlder)?.branch).toBe('legacy-only');
    // 分支 3：两者都在且兼容轨更新
    expect(decideBackupArbitration(modern, legacyNewer)?.branch).toBe('merged');
    // 都没有 → null（调用方抛 BackupNotFoundError）
    expect(decideBackupArbitration(null, null)).toBeNull();
  });

  it('readLatestBackup 三分支应实际拉到正确的文档（注入 fake I/O）', async () => {
    const { readLatestBackup, MODERN_BACKUP_FORMAT, BACKUP_FORMAT } = await import(
      '../src/school/hunau/backup'
    );
    const auth = { puid: 'puid-1', rootDirId: 'root', enc: 'e', token: 't' };
    const session = {} as never;

    const modernDoc = { format: MODERN_BACKUP_FORMAT, settings: { languageCode: 'zh' } };
    const legacyDoc = {
      format: BACKUP_FORMAT,
      settings: { languageCode: 'en', electricityRoom: '东湖-12-305' },
    };
    const docs: Record<string, unknown> = {
      'chilleast-modern-20261027-090000.json': modernDoc,
      'chilleast-backup-b-20261027-080000.json': legacyDoc,
      'chilleast-backup-b-20261027-120000.json': legacyDoc,
    };
    const makeDeps = (entries: ReturnType<typeof entry>[]) => ({
      listEntries: async () => entries,
      download: async (_s: never, _a: never, e: { name: string }) =>
        docs[e.name] as never,
    });

    // 分支 1：现代轨更新 → 只拉现代轨
    const r1 = await readLatestBackup(
      session,
      auth,
      makeDeps([
        entry('chilleast-modern-20261027-090000.json', 'm1'),
        entry('chilleast-backup-b-20261027-080000.json', 'l1'),
      ]),
    );
    expect(r1.format).toBe('modern');
    expect(r1.branch).toBe('modern');
    expect(r1.stamp).toBe('20261027-090000');
    expect(r1.sources).toEqual(['chilleast-modern-20261027-090000.json']);
    expect(r1.backup.format).toBe(MODERN_BACKUP_FORMAT);
    expect(r1.retained).toEqual({ keepCount: 3, modern: 1, legacy: 1 });

    // 分支 2：仅兼容轨 → 拉兼容轨
    const r2 = await readLatestBackup(
      session,
      auth,
      makeDeps([entry('chilleast-backup-b-20261027-080000.json', 'l1')]),
    );
    expect(r2.format).toBe('legacy');
    expect(r2.branch).toBe('legacy-only');
    expect(r2.stamp).toBe('20261027-080000');
    expect(r2.slot).toBe('b');
    expect(r2.backup.format).toBe(BACKUP_FORMAT);

    // 分支 3：两轨都在且兼容轨更新 → 合并
    const r3 = await readLatestBackup(
      session,
      auth,
      makeDeps([
        entry('chilleast-modern-20261027-090000.json', 'm1'),
        entry('chilleast-backup-b-20261027-120000.json', 'l2'),
      ]),
    );
    expect(r3.branch).toBe('merged');
    expect(r3.sources).toEqual([
      'chilleast-modern-20261027-090000.json',
      'chilleast-backup-b-20261027-120000.json',
    ]);
    // 合并结果仍是现代轨文档，且兼容轨的基础设置覆盖了现代轨
    expect(r3.backup.format).toBe(MODERN_BACKUP_FORMAT);
    expect(r3.backup.settings?.['languageCode']).toBe('en');
    expect(r3.backup.settings?.['electricityRoom']).toBe('东湖-12-305');
  });

  it('readLatestBackup 无备份时应抛 BackupNotFoundError', async () => {
    const { readLatestBackup, BackupNotFoundError } = await import('../src/school/hunau/backup');
    const auth = { puid: 'p', rootDirId: 'root', enc: 'e', token: 't' };
    await expect(
      readLatestBackup({} as never, auth, {
        listEntries: async () => [],
        download: async () => ({}) as never,
      }),
    ).rejects.toBeInstanceOf(BackupNotFoundError);
  });

  it('mergeModernWithLegacy 应逐条照抄原版合并规则（SYNC-ALIGN 4.2）', async () => {
    const { mergeModernWithLegacy, MODERN_BACKUP_FORMAT } = await import(
      '../src/school/hunau/backup'
    );
    const modern = {
      format: MODERN_BACKUP_FORMAT,
      version: 1,
      appVersion: 'web-1.0.0',
      settings: {
        languageCode: 'zh',
        courseReminderMinutes: 15,
        // 不在覆盖列表里 → 必须保留现代轨的值
        ai: { model: 'modern-model' },
        appearance: {
          homeItems: [{ id: 'modern-home' }],
          feedItems: [{ id: 'modern-feed' }],
          // 不在覆盖列表里 → 保留现代轨
          feedAutoSort: true,
        },
      },
      localData: {
        courses: { full: {} },
        aiMemories: ['modern-memory'],
        homeworkList: [{ id: 'modern-hw' }],
      },
    };
    const legacy = {
      format: 'chilleast-backup',
      settings: {
        languageCode: 'en',
        courseReminderMinutes: 30,
        electricityRoom: '东湖-12-305',
        appearance: {
          homeItems: [{ id: 'legacy-home' }],
          feedItems: [{ id: 'legacy-feed' }],
          functionGroupOrder: ['g1'],
          widgetItems: [{ id: 'legacy-widget' }],
        },
      },
      localData: {
        courses: [{ id: 'legacy-course' }],
        homeworkList: [{ id: 'legacy-hw' }],
        examList: [{ id: 'legacy-exam' }],
        timetableRules: [{ id: 'legacy-rule' }],
        timetableIcs: 'ICS',
        // 不在覆盖列表里 → 不能进结果
        aiMemories: ['legacy-memory'],
      },
    };

    const merged = mergeModernWithLegacy(modern, legacy);

    // 4. format 强制为现代轨
    expect(merged.format).toBe(MODERN_BACKUP_FORMAT);
    // 1. 基础设置以 legacy 覆盖
    expect(merged.settings?.['languageCode']).toBe('en');
    expect(merged.settings?.['courseReminderMinutes']).toBe(30);
    expect(merged.settings?.['electricityRoom']).toBe('东湖-12-305');
    // 非覆盖键保留现代轨
    expect(merged.settings?.['ai']).toEqual({ model: 'modern-model' });
    // 2. appearance 指定列表以 legacy 覆盖
    const appearance = merged.settings?.['appearance'] as Record<string, unknown>;
    expect(appearance['homeItems']).toEqual([{ id: 'legacy-home' }]);
    expect(appearance['feedItems']).toEqual([{ id: 'legacy-feed' }]);
    expect(appearance['widgetItems']).toEqual([{ id: 'legacy-widget' }]);
    expect(appearance['functionGroupOrder']).toEqual(['g1']);
    // 非覆盖键保留现代轨
    expect(appearance['feedAutoSort']).toBe(true);
    // 3. localData 覆盖
    const localData = merged.localData as Record<string, unknown>;
    expect(localData['courses']).toEqual([{ id: 'legacy-course' }]);
    expect(localData['homeworkList']).toEqual([{ id: 'legacy-hw' }]);
    expect(localData['examList']).toEqual([{ id: 'legacy-exam' }]);
    expect(localData['timetableRules']).toEqual([{ id: 'legacy-rule' }]);
    expect(localData['timetableIcs']).toBe('ICS');
    // legacy 独有的非覆盖键不能进结果
    expect(localData['aiMemories']).toEqual(['modern-memory']);
    // 纯函数：不修改入参
    expect(modern.settings.languageCode).toBe('zh');
    expect(modern.localData.courses).toEqual({ full: {} });
  });

  it('mergeModernWithLegacy 应忽略 legacy 里为 null 的 localData 键', async () => {
    const { mergeModernWithLegacy } = await import('../src/school/hunau/backup');
    const merged = mergeModernWithLegacy(
      { format: 'chilleast-modern', localData: { courses: [{ id: 'modern' }] } },
      { format: 'chilleast-backup', localData: { courses: null, homeworkList: null } },
    );
    expect(merged.localData?.['courses']).toEqual([{ id: 'modern' }]);
  });

  it('mergeModernWithLegacy 应容忍缺失的 settings/localData 结构', async () => {
    const { mergeModernWithLegacy } = await import('../src/school/hunau/backup');
    const merged = mergeModernWithLegacy({ format: 'chilleast-modern' }, { format: 'chilleast-backup' });
    expect(merged.format).toBe('chilleast-modern');
    expect(merged.settings).toEqual({});
    expect(merged.localData).toEqual({});
  });

  describe('Dormitory Parser Tests (对齐原版 DormitoryInfo.fromHtml)', () => {
    it('正确解析包含单元的宿舍 HTML', () => {
      const htmlWithUnit = `
        <script>
          SFSchCalendar.curXn = "2026";
          SFSchCalendar.curXq = "1";
          SFSchCalendar.curXqMc = "秋季学期";
          var ch = "2";
          function loadData() {
            view.createRow("ssl", "宿舍楼", "丰泽3栋");
            view.createRow("dy", "单元", "2单元");
            view.createRow("lc", "楼层", "第3层");
            view.createRow("fj", "宿舍", "305");
            view.createRow("ch", "床号", "2");
          }
        </script>
      `;

      const info = parseDormitoryHtml(htmlWithUnit);

      expect(info.isAssigned).toBe(true);
      expect(info.building).toBe('丰泽3栋');
      expect(info.unit).toBe('2单元');
      expect(info.floor).toBe('第3层');
      expect(info.room).toBe('305');
      expect(info.bed).toBe('2');
      expect(info.formattedRoom).toBe('丰泽3栋 2单元 305室');
      expect(info.formattedBed).toBe('2号床');
      expect(info.fullAddress).toBe('丰泽3栋 2单元 305室 2号床');
      expect(info.academicYear).toBe('2026');
      expect(info.termCode).toBe('1');
      expect(info.termName).toBe('秋季学期');
      expect(info.fields.length).toBe(5);
    });

    it('正确解析未安排床位 HTML', () => {
      const unassignedHtml = `
        <script>
          SFSchCalendar.curXn = "2026";
          SFSchCalendar.curXq = "1";
          SFSchCalendar.curXqMc = "秋季学期";
          var ch = "";
          function loadData() {
            view.createRow("ssl", "宿舍楼", "未安排床位");
          }
        </script>
      `;

      const info = parseDormitoryHtml(unassignedHtml);

      expect(info.isAssigned).toBe(false);
      expect(info.formattedRoom).toBe('未安排床位');
      expect(info.fullAddress).toBe('未安排床位');
    });

    it('忽略注释中的代码（含未安排床位注释）', () => {
      const commentedHtml = `
        <script>
          var ch = "1";
          function loadData() {
            // view.createRow("ssl", "宿舍楼", "未安排床位");
            /* view.createRow("ssl", "宿舍楼", "未安排床位"); */
            view.createRow("ssl", "宿舍楼", "芷兰4栋");
            view.createRow("fj", "宿舍", "101");
            view.createRow("ch", "床号", "1");
          }
        </script>
      `;

      const info = parseDormitoryHtml(commentedHtml);

      expect(info.isAssigned).toBe(true);
      expect(info.building).toBe('芷兰4栋');
      expect(info.room).toBe('101');
      expect(info.bed).toBe('1');
      expect(info.formattedRoom).toBe('芷兰4栋 101室');
      expect(info.formattedBed).toBe('1号床');
    });

    it('GET /api/campus/dormitory 未携带 Authorization 应返回 401', async () => {
      const req = new Request('http://localhost/api/campus/dormitory');
      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(401);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(false);
      expect(body.error?.code).toBe('unauthorized');
    });
  });

  describe('方案三 · 客户端自持有加密 Cookie 凭据 (Client-Side Encrypted Session Cache)', () => {
    const fakeCookie: StoredCookie = {
      name: 'JSESSIONID',
      value: 'session_xyz123',
      domain: 'ydjwxt.hunau.edu.cn',
      path: '/',
      hostOnly: true,
      secure: false,
      httpOnly: true,
    };

    it('sealClientSession / openClientSession 编解码完整性', async () => {
      const jar = new CookieJar([fakeCookie]);
      const identity = { username: '20230001', realName: '测试同学' };

      const sealed = await sealClientSession(env, '20230001', identity, jar);
      expect(typeof sealed).toBe('string');
      expect(sealed.length).toBeGreaterThan(32);

      const restored = await openClientSession(env, sealed, '20230001');
      expect(restored).not.toBeNull();
      expect(restored?.identity?.username).toBe('20230001');
      expect(restored?.identity?.realName).toBe('测试同学');
      expect(restored?.jar.get('ydjwxt.hunau.edu.cn', 'JSESSIONID')).toBe('session_xyz123');
    });

    it('openClientSession 学工号不匹配时应拒绝解密', async () => {
      const jar = new CookieJar([fakeCookie]);
      const sealed = await sealClientSession(env, '20230001', null, jar);

      const restored = await openClientSession(env, sealed, '20230002');
      expect(restored).toBeNull();
    });

    it('openClientSession 过期凭据应拒绝解密', async () => {
      const jar = new CookieJar([fakeCookie]);
      // 传入负 TTL 模拟已过期
      const sealed = await sealClientSession(env, '20230001', null, jar, -1000);

      const restored = await openClientSession(env, sealed, '20230001');
      expect(restored).toBeNull();
    });

    it('openClientSession 篡改密文应安全返回 null', async () => {
      const restored = await openClientSession(env, 'invalid.tampered.token', '20230001');
      expect(restored).toBeNull();
    });

    it('acquireSession 能直接通过 clientSession 恢复会话而无需发起任何网络登录', async () => {
      clearRamSessionCache();
      const jar = new CookieJar([fakeCookie]);
      const sealed = await sealClientSession(env, '20230001', { username: '20230001', realName: '王同学' }, jar);

      // acquireSession 传入 clientSession
      const req = new Request('http://localhost/api/test');
      const context = await acquireSession(env, {
        oaId: '20230001',
        oaKey: 'mock_password',
        clientSession: sealed,
        request: req,
      });

      expect(context.didLogin).toBe(false);
      expect(context.identity?.username).toBe('20230001');
      expect(context.session.jar.get('ydjwxt.hunau.edu.cn', 'JSESSIONID')).toBe('session_xyz123');
    });

    it('OPTIONS 预检与响应应暴露 X-Client-Session CORS 头', async () => {
      const optReq = new Request('http://localhost/api/academic/scores', {
        method: 'OPTIONS',
      });
      const optRes = await worker.fetch(optReq, env, ctx);
      expect(optRes.headers.get('Access-Control-Allow-Headers')).toContain('X-Client-Session');
      expect(optRes.headers.get('Access-Control-Expose-Headers')).toContain('X-Client-Session');
    });

    it('dev.api.chilleast.soilzhu.su 域名应正确被识别为 API 路由', async () => {
      const devReq = new Request('https://dev.api.chilleast.soilzhu.su/health');
      const res = await worker.fetch(devReq, env, ctx);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe('ok');
    });
  });
});
