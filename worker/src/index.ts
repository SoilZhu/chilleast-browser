/**
 * ChillEast Browser Relay Worker
 *
 * 湖南农业大学校园服务零状态中转服务
 * - 纯无状态架构：不持久化存储任何用户密码、数据库记录或会话
 * - AES-GCM 加密封装自包含 Bearer Token
 * - 单实例内存 RAM 10 分钟防抖缓存与 Singleflight 排队
 */

import type { Env } from './env';
import { CORS_HEADERS, fail, json } from './util/response';
import { getResponseSession } from './auth/session-manager';
import { handleLogin, handleLogout, handleProfile } from './routes/auth';
import {
  handleClassrooms,
  handleExams,
  handleScores,
  handleSemesters,
  handleTimetable,
  handleTimetableRules,
  handleTimetableSubscription,
  handleTimetableSubscriptionDelete,
} from './routes/academic';
import {
  handleCardInfo,
  handleCardRecords,
  handlePaymentCode,
  handleElectricity,
  handleElectricityAreas,
  handleElectricityBuildings,
  handleElectricityPreOrder,
  handleElectricityRooms,
  handleDormitory,
  handleNoticeDetail,
  handleNotices,
} from './routes/campus';
import { handleHomework } from './routes/study';
import {
  handleLibraryBookDetail,
  handleLibraryBooks,
  handleLibraryLevels,
  handleLibraryRooms,
  handleLibrarySeatCancel,
  handleLibrarySeatGrid,
  handleLibrarySeatMatch,
  handleLibrarySeatReserve,
  handleLibrarySeats,
  handleLibrarySeatSignBack,
  handleLibrarySeatSignIn,
  handleLibraryStartEndTime,
  handleLibraryUsedSeats,
} from './routes/library';
import {
  handleSunshineDepartments,
  handleSunshineDetail,
  handleSunshineLetters,
  handleSunshineSubmit,
} from './routes/sunshine';
import {
  handleRepairCancel,
  handleRepairCatalogs,
  handleRepairDetail,
  handleRepairOrders,
  handleRepairSubmit,
} from './routes/repair';
import {
  handleCloudiskDownload,
  handleCloudiskFiles,
  handleCloudiskGetBackup,
  handleCloudiskSaveBackup,
  handleCloudiskUpload,
} from './routes/cloudisk';
import { handleProxy } from './routes/proxy';
import {
  handleLeaveDelete,
  handleLeaveDuration,
  handleLeaveList,
  handleLeaveSubmit,
  handleLeaveTypes,
  handleQuestionnaireDetail,
  handleQuestionnaireList,
  handleQuestionnaireSubmit,
} from './routes/xgxt';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. 处理 CORS Preflight OPTIONS 请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const isApiHost =
      url.hostname === 'api.chilleast.soilzhu.su' ||
      url.hostname === 'dev.api.chilleast.soilzhu.su' ||
      url.hostname.startsWith('api.') ||
      url.hostname.startsWith('dev.api.');

    // 2. 健康检查与 API 根路径信息
    if (
      url.pathname === '/health' ||
      url.pathname === '/api/health' ||
      url.pathname === '/api' ||
      url.pathname === '/api/' ||
      (isApiHost && url.pathname === '/')
    ) {
      return json({
        service: 'chilleast-browser-relay',
        version: '1.0.0',
        status: 'ok',
        stateless: true,
        sessionKeyConfigured: Boolean(env.SESSION_KEY && env.SESSION_KEY.length >= 32),
        accountPepperConfigured: Boolean(env.ACCOUNT_PEPPER && env.ACCOUNT_PEPPER.length >= 16),
      });
    }

    // 3. API 路由分发（支持 /api/* 以及在 api.chilleast.soilzhu.su 上未带 /api 前缀的请求）
    let apiPath: string | null = null;
    if (url.pathname.startsWith('/api/')) {
      apiPath = url.pathname;
    } else if (isApiHost && url.pathname !== '/') {
      apiPath = `/api${url.pathname}`;
    }

    if (apiPath) {
      const attachSessionHeader = (res: Response): Response => {
        const updatedSession = getResponseSession(request);
        if (updatedSession) {
          try {
            res.headers.set('X-Client-Session', updatedSession);
          } catch {
            const cloneHeaders = new Headers(res.headers);
            cloneHeaders.set('X-Client-Session', updatedSession);
            return new Response(res.body, {
              status: res.status,
              statusText: res.statusText,
              headers: cloneHeaders,
            });
          }
        }
        return res;
      };

      const handleApiRequest = async (): Promise<Response> => {
        switch (apiPath) {
          // 身份认证
          case '/api/auth/login':
            if (request.method === 'POST') return await handleLogin(request, env);
            break;
          case '/api/auth/profile':
            if (request.method === 'GET') return await handleProfile(request, env);
            break;
          case '/api/auth/logout':
            if (request.method === 'POST') return await handleLogout(request, env);
            break;

          // 教务与课表
          case '/api/academic/timetable':
            if (request.method === 'GET') return await handleTimetable(request, env);
            break;
          case '/api/academic/timetable/rules':
            if (request.method === 'POST') return await handleTimetableRules(request, env);
            break;
          case '/api/academic/scores':
            if (request.method === 'GET') return await handleScores(request, env);
            break;
          case '/api/academic/semesters':
            if (request.method === 'GET') return await handleSemesters(request, env);
            break;
          case '/api/academic/exams':
            if (request.method === 'GET') return await handleExams(request, env);
            break;
          case '/api/academic/classrooms':
            if (request.method === 'GET') return await handleClassrooms(request, env);
            break;
          case '/api/academic/timetable/subscription':
            if (request.method === 'POST') return await handleTimetableSubscription(request, env);
            if (request.method === 'DELETE') return await handleTimetableSubscriptionDelete(request, env);
            break;

          // 校园生活 (一卡通、电费、通知)
          case '/api/campus/card':
            if (request.method === 'GET') return await handleCardInfo(request, env);
            break;
          case '/api/campus/card/records':
            if (request.method === 'GET') return await handleCardRecords(request, env);
            break;
          case '/api/campus/card/payment-code':
            if (request.method === 'GET') return await handlePaymentCode(request, env);
            break;
          case '/api/campus/electricity':
            if (request.method === 'GET') return await handleElectricity(request, env);
            break;
          case '/api/campus/electricity/areas':
            if (request.method === 'GET') return await handleElectricityAreas(request, env);
            break;
          case '/api/campus/electricity/buildings':
            if (request.method === 'GET') return await handleElectricityBuildings(request, env);
            break;
          case '/api/campus/electricity/rooms':
            if (request.method === 'GET') return await handleElectricityRooms(request, env);
            break;
          case '/api/campus/electricity/preorder':
            if (request.method === 'POST') return await handleElectricityPreOrder(request, env);
            break;
          case '/api/campus/dormitory':
            if (request.method === 'GET') return await handleDormitory(request, env);
            break;
          case '/api/campus/notices':
            if (request.method === 'GET') return await handleNotices(request, env);
            break;
          case '/api/campus/notices/detail':
            if (request.method === 'GET') return await handleNoticeDetail(request, env);
            break;

          // 阳光服务
          case '/api/campus/sunshine/departments':
            if (request.method === 'GET') return await handleSunshineDepartments(request, env);
            break;
          case '/api/campus/sunshine/letters':
            if (request.method === 'GET') return await handleSunshineLetters(request, env);
            break;
          case '/api/campus/sunshine/detail':
            if (request.method === 'GET') return await handleSunshineDetail(request, env);
            break;
          case '/api/campus/sunshine/submit':
            if (request.method === 'POST') return await handleSunshineSubmit(request, env);
            break;

          // 报修平台
          case '/api/campus/repair/orders':
            if (request.method === 'GET') return await handleRepairOrders(request, env);
            break;
          case '/api/campus/repair/catalogs':
            if (request.method === 'GET') return await handleRepairCatalogs();
            break;
          case '/api/campus/repair/orders/detail':
            if (request.method === 'GET') return await handleRepairDetail(request, env);
            break;
          case '/api/campus/repair/cancel':
            if (request.method === 'POST') return await handleRepairCancel(request, env);
            break;
          case '/api/campus/repair/submit':
            if (request.method === 'POST') return await handleRepairSubmit(request, env);
            break;

          // 超星学习通 (作业)
          case '/api/study/homework':
            if (request.method === 'GET') return await handleHomework(request, env);
            break;

          // 超星云盘与云备份
          case '/api/study/cloudisk/files':
            if (request.method === 'GET') return await handleCloudiskFiles(request, env);
            break;
          case '/api/study/cloudisk/upload':
            if (request.method === 'POST') return await handleCloudiskUpload(request, env);
            break;
          case '/api/study/cloudisk/download':
            if (request.method === 'GET') return await handleCloudiskDownload(request, env);
            break;
          case '/api/study/cloudisk/backup':
            if (request.method === 'GET') return await handleCloudiskGetBackup(request, env);
            if (request.method === 'POST') return await handleCloudiskSaveBackup(request, env);
            break;

          // 图书馆 (座位、图书)
          case '/api/library/seats':
            if (request.method === 'GET') return await handleLibrarySeats(request, env);
            break;
          case '/api/library/seats/reserve':
            if (request.method === 'POST') return await handleLibrarySeatReserve(request, env);
            break;
          case '/api/library/rooms':
            if (request.method === 'GET') return await handleLibraryRooms(request, env);
            break;
          case '/api/library/seats/grid':
            if (request.method === 'GET') return await handleLibrarySeatGrid(request, env);
            break;
          case '/api/library/seats/used':
            if (request.method === 'GET') return await handleLibraryUsedSeats(request, env);
            break;
          case '/api/library/seats/match':
            if (request.method === 'POST') return await handleLibrarySeatMatch(request, env);
            break;
          case '/api/library/seats/sign':
            if (request.method === 'POST') return await handleLibrarySeatSignIn(request, env);
            break;
          case '/api/library/seats/sign-back':
            if (request.method === 'POST') return await handleLibrarySeatSignBack(request, env);
            break;
          case '/api/library/seats/cancel':
            if (request.method === 'POST') return await handleLibrarySeatCancel(request, env);
            break;
          case '/api/library/seats/start-end-time':
            if (request.method === 'GET') return await handleLibraryStartEndTime(request, env);
            break;
          case '/api/library/levels':
            if (request.method === 'GET') return await handleLibraryLevels(request, env);
            break;
          case '/api/library/books':
            if (request.method === 'GET') return await handleLibraryBooks(request, env);
            break;
          case '/api/library/books/detail':
            if (request.method === 'GET') return await handleLibraryBookDetail(request, env);
            break;

          // 学工系统：请假申请
          case '/api/xgxt/leave':
            if (request.method === 'GET') return await handleLeaveList(request, env);
            if (request.method === 'POST') return await handleLeaveSubmit(request, env);
            break;
          case '/api/xgxt/leave/types':
            if (request.method === 'GET') return await handleLeaveTypes(request, env);
            break;
          case '/api/xgxt/leave/duration':
            if (request.method === 'GET') return await handleLeaveDuration(request, env);
            break;
          case '/api/xgxt/leave/delete':
            if (request.method === 'POST') return await handleLeaveDelete(request, env);
            break;

          // 学工系统：问卷
          case '/api/xgxt/questionnaires':
            if (request.method === 'GET') return await handleQuestionnaireList(request, env);
            break;
          case '/api/xgxt/questionnaires/detail':
            if (request.method === 'GET') return await handleQuestionnaireDetail(request, env);
            break;
          case '/api/xgxt/questionnaires/submit':
            if (request.method === 'POST') return await handleQuestionnaireSubmit(request, env);
            break;

          // 安全受限代理
          case '/api/proxy':
            return await handleProxy(request, env);

          default:
            return fail(`未找到接口: ${url.pathname}`, 404, 'not_found');
        }

        return fail(`不支持的请求方法: ${request.method}`, 405, 'method_not_allowed');
      };

      try {
        const response = await handleApiRequest();
        return attachSessionHeader(response);
      } catch (err) {
        console.error('Unhandled API Error:', err);
        return attachSessionHeader(
          fail(
            `服务内部异常: ${err instanceof Error ? err.message : String(err)}`,
            500,
            'internal_error',
          ),
        );
      }
    }

    // 4. 重定向历史路径 /web 到 /
    if (url.pathname === '/web' || url.pathname === '/web/') {
      return Response.redirect(`${url.origin}/`, 301);
    }
    if (url.pathname.startsWith('/web/')) {
      const target = url.pathname.slice('/web'.length) || '/';
      return Response.redirect(`${url.origin}${target}${url.search}`, 301);
    }

    // 5. 静态资产支持（Workers Assets 模式）
    if (env.ASSETS) {
      return await env.ASSETS.fetch(request);
    }

    return new Response('ChillEast Browser Relay is running. Frontend SPA not bound.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS },
    });
  },
};
