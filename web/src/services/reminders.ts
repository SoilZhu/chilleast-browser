/**
 * 提醒服务（对应原版 App 的 notification_service.dart + settings_provider 的排程逻辑）
 *
 * 网页版没有原生推送，采用「页内提醒」：
 * - 用 Notification API（浏览器通知）在有权限时推系统通知
 * - 无权限时降级为页内轻提示
 * - 每次设置变化或课表/作业更新后重新排程（去重，避免重复提醒）
 *
 * 三类提醒与 App 一一对应：
 *   上课提醒 N 分钟前 · 作业截止提醒 N 小时前 · 图书馆预约提醒 N 分钟前
 */
import { ref } from 'vue';
import { settings } from '../stores/settings';

/** 浏览器通知权限 */
export const notifyPermission = ref<NotificationPermission>(
  typeof Notification !== 'undefined' ? Notification.permission : 'denied',
);

export interface ReminderItem {
  /** 去重键：同一节课/同一作业只提醒一次 */
  key: string;
  /** 触发时间戳（毫秒） */
  at: number;
  title: string;
  body: string;
}

/** 已提醒过的键，避免重复弹出 */
const fired = new Set<string>();
let timer: number | null = null;
/** 当前排程中的提醒（供界面展示） */
export const scheduledReminders = ref<ReminderItem[]>([]);

// ---------------------------------------------------------------------------
// 权限
// ---------------------------------------------------------------------------

export async function requestNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') {
    notifyPermission.value = 'granted';
    return true;
  }
  if (Notification.permission === 'denied') return false;
  try {
    const r = await Notification.requestPermission();
    notifyPermission.value = r;
    return r === 'granted';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 触发
// ---------------------------------------------------------------------------

function fire(item: ReminderItem) {
  fired.add(item.key);

  // 系统通知（有权限时）
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(item.title, { body: item.body, tag: item.key, silent: false });
      return;
    } catch {
      /* 降级到页内提示 */
    }
  }

  // 页内提示（由 App.vue 监听）
  window.dispatchEvent(
    new CustomEvent('chilleast:reminder', { detail: { title: item.title, body: item.body } }),
  );
}

// ---------------------------------------------------------------------------
// 排程
// ---------------------------------------------------------------------------

const PERIOD_START: Record<number, [number, number]> = {
  1: [8, 0],
  3: [10, 5],
  5: [14, 0],
  7: [16, 5],
  9: [19, 0],
};

function startMinutes(startPeriod: number): [number, number] {
  return PERIOD_START[startPeriod] ?? [8, 0];
}

export interface ScheduleInput {
  /** 今天的课程：[{ name, classroom, startPeriod }]，仅当天 */
  todayCourses?: Array<{ name: string; classroom?: string; startPeriod: number }>;
  /** 待办作业：[{ id, title, endTimeMs }] */
  pendingHomework?: Array<{ id: string; title: string; endTimeMs: number | null }>;
  /** 图书馆当前预约：[{ id, seatNum, roomName, startMs }] */
  libraryReserves?: Array<{ id: number | string; seatNum: string; roomName: string; startMs: number }>;
}

/**
 * 重新排程所有提醒。
 * 每分钟检查一次（与原版的通知排程粒度一致，App 用系统闹钟，网页用定时器）。
 */
export function scheduleReminders(input: ScheduleInput): void {
  const now = Date.now();
  const next: ReminderItem[] = [];

  // ---- 上课提醒 ----
  if (settings.reminderMinutes > 0 && input.todayCourses?.length) {
    const d = new Date();
    for (const c of input.todayCourses) {
      const [h, m] = startMinutes(c.startPeriod);
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0).getTime();
      const fireAt = at - settings.reminderMinutes * 60_000;
      if (fireAt <= now) continue;
      next.push({
        key: `course:${c.name}:${c.startPeriod}:${at}`,
        at: fireAt,
        title: `${settings.reminderMinutes} 分钟后上课`,
        body: `${c.name}${c.classroom ? ` · ${c.classroom}` : ''}`,
      });
    }
  }

  // ---- 作业截止提醒 ----
  if (settings.homeworkReminderHours > 0 && input.pendingHomework?.length) {
    for (const hw of input.pendingHomework) {
      if (hw.endTimeMs == null) continue;
      const fireAt = hw.endTimeMs - settings.homeworkReminderHours * 3_600_000;
      if (fireAt <= now) continue;
      next.push({
        key: `homework:${hw.id}:${hw.endTimeMs}`,
        at: fireAt,
        title: '作业即将截止',
        body: `${hw.title}`,
      });
    }
  }

  // ---- 图书馆预约提醒 ----
  if (settings.libraryReminderMinutes > 0 && input.libraryReserves?.length) {
    for (const r of input.libraryReserves) {
      const fireAt = r.startMs - settings.libraryReminderMinutes * 60_000;
      if (fireAt <= now) continue;
      next.push({
        key: `library:${r.id}:${r.startMs}`,
        at: fireAt,
        title: `${settings.libraryReminderMinutes} 分钟后开始预约`,
        body: `${r.seatNum} 号座位 · ${r.roomName}`,
      });
    }
  }

  scheduledReminders.value = next;

  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  if (next.length === 0) return;

  // 每分钟检查一次是否到点
  timer = window.setInterval(() => {
    const t = Date.now();
    for (const item of scheduledReminders.value) {
      if (item.at <= t && !fired.has(item.key)) {
        fire(item);
      }
    }
    // 清掉已经触发超过 1 小时的，避免集合无限增长
    if (fired.size > 500) fired.clear();
  }, 60_000);
}

/** 停止排程（退出登录时调用） */
export function stopReminders(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  scheduledReminders.value = [];
  fired.clear();
}
