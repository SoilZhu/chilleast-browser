/**
 * 应用设置（对应原版 App 的 SettingsNotifier）
 *
 * 原版把设置存在 SharedPreferences；网页版存 localStorage，键名保持同名，
 * 便于云备份 JSON 互通时字段语义一致。
 */
import { reactive, computed, watch } from 'vue';
import { markDirty } from '../services/cloudSync';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface SettingsState {
  /** 上课提醒：0 表示不通知 */
  reminderMinutes: number;
  /** 作业截止提醒：小时，0 表示不通知 */
  homeworkReminderHours: number;
  /** 图书馆预约提醒：0 表示不通知 */
  libraryReminderMinutes: number;
  /** 登录后自动同步课表 */
  timetableAutoSyncEnabled: boolean;
  /** 本地变更后自动同步到云盘 */
  cloudBackupAutoSyncEnabled: boolean;
  /** 周视图显示下课时间 */
  timetableShowEndTime: boolean;
  /** 手动指定本学期第一周周一（ISO yyyy-mm-dd） */
  manualFirstWeekMonday: string | null;
}

const KEYS = {
  reminder: 'course_reminder_minutes',
  homeworkReminder: 'homework_reminder_hours',
  libraryReminder: 'library_reminder_minutes',
  timetableAutoSync: 'timetable_auto_sync_enabled',
  /**
   * 云备份自动同步开关。
   *
   * ⚠️ 键名必须与手机端 `CloudBackupManager.toggleKey` 完全一致（`cloud_backup_auto_sync`），
   * 与 `services/cloudSync.ts` 的 `TOGGLE_KEY` 也必须是同一个键 ——
   * 早先这里误写成 `cloud_backup_auto_sync_enabled`，导致设置页开关与同步引擎
   * 各读写各的，重启后状态对不上。
   */
  cloudBackupAutoSync: 'cloud_backup_auto_sync',
  timetableShowEndTime: 'timetable_show_end_time',
  manualFirstWeekMonday: 'timetable_manual_first_week_monday',
} as const;

/** 旧键（仅在初始化时迁移读取一次，读到 true 就搬到新键） */
const LEGACY_CLOUD_BACKUP_TOGGLE_KEY = 'cloud_backup_auto_sync_enabled';

function readCloudBackupToggle(): boolean {
  if (localStorage.getItem(KEYS.cloudBackupAutoSync) === 'true') return true;
  if (localStorage.getItem(LEGACY_CLOUD_BACKUP_TOGGLE_KEY) === 'true') {
    localStorage.setItem(KEYS.cloudBackupAutoSync, 'true');
    localStorage.removeItem(LEGACY_CLOUD_BACKUP_TOGGLE_KEY);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 选项（与 App 完全一致的候选值）
// ---------------------------------------------------------------------------

/** 分钟档位：上课 / 图书馆提醒 */
export const MINUTE_OPTIONS: number[] = [0, 5, 10, 20, 30, 40, 50, 60];

/** 小时档位：作业截止提醒 */
export const HOUR_OPTIONS: number[] = [0, 0.5, 1, 2, 6, 12, 24, 48];

export function minuteLabel(v: number): string {
  return v === 0 ? '不通知' : `${v} 分钟前`;
}

export function hourLabel(v: number): string {
  if (v === 0) return '不通知';
  return `${Number.isInteger(v) ? v : v.toFixed(1)} 小时前`;
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const settings = reactive<SettingsState>({
  reminderMinutes: readNumber(KEYS.reminder, 0),
  homeworkReminderHours: readNumber(KEYS.homeworkReminder, 0),
  libraryReminderMinutes: readNumber(KEYS.libraryReminder, 0),
  timetableAutoSyncEnabled: readBool(KEYS.timetableAutoSync, true),
  cloudBackupAutoSyncEnabled: readCloudBackupToggle(),
  timetableShowEndTime: readBool(KEYS.timetableShowEndTime, false),
  manualFirstWeekMonday: localStorage.getItem(KEYS.manualFirstWeekMonday),
});

/**
 * 从 localStorage 重新载入全部设置到 reactive 状态。
 *
 * 用途：云端备份写回 localStorage 后，让界面立即反映新值
 * （对应原版 `settingsProvider.reload()`，由 `backupRefresh` 调用）。
 *
 * ⚠️ 必须**不经过** `persist()` —— persist 会 `markDirty()`，
 * 那样刚拉下来的云端数据会立刻被标脏并回推，形成同步回环。
 */
export function reloadSettings(): void {
  settings.reminderMinutes = readNumber(KEYS.reminder, 0);
  settings.homeworkReminderHours = readNumber(KEYS.homeworkReminder, 0);
  settings.libraryReminderMinutes = readNumber(KEYS.libraryReminder, 0);
  settings.timetableAutoSyncEnabled = readBool(KEYS.timetableAutoSync, true);
  settings.cloudBackupAutoSyncEnabled = readCloudBackupToggle();
  settings.timetableShowEndTime = readBool(KEYS.timetableShowEndTime, false);
  settings.manualFirstWeekMonday = localStorage.getItem(KEYS.manualFirstWeekMonday);
}

function persist(key: string, value: string | null) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  // 与原版一致：任一设置项落盘都标记为脏，由同步引擎去抖上传
  markDirty();
}

export const settingsActions = {
  setReminderMinutes(v: number) {
    settings.reminderMinutes = v;
    persist(KEYS.reminder, String(v));
  },
  setHomeworkReminderHours(v: number) {
    settings.homeworkReminderHours = v;
    persist(KEYS.homeworkReminder, String(v));
  },
  setLibraryReminderMinutes(v: number) {
    settings.libraryReminderMinutes = v;
    persist(KEYS.libraryReminder, String(v));
  },
  setTimetableAutoSync(v: boolean) {
    settings.timetableAutoSyncEnabled = v;
    persist(KEYS.timetableAutoSync, String(v));
  },
  setCloudBackupAutoSync(v: boolean) {
    settings.cloudBackupAutoSyncEnabled = v;
    persist(KEYS.cloudBackupAutoSync, String(v));
  },
  setTimetableShowEndTime(v: boolean) {
    settings.timetableShowEndTime = v;
    persist(KEYS.timetableShowEndTime, String(v));
  },
  setManualFirstWeekMonday(iso: string | null) {
    settings.manualFirstWeekMonday = iso;
    persist(KEYS.manualFirstWeekMonday, iso);
  },
  reset() {
    settingsActions.setReminderMinutes(0);
    settingsActions.setHomeworkReminderHours(0);
    settingsActions.setLibraryReminderMinutes(0);
    settingsActions.setTimetableAutoSync(true);
    settingsActions.setCloudBackupAutoSync(false);
    settingsActions.setTimetableShowEndTime(false);
    settingsActions.setManualFirstWeekMonday(null);
  },
};

/** 是否有任意提醒处于开启状态（设置页用来显示「已开启 N 项」） */
export const activeReminderCount = computed(() => {
  let n = 0;
  if (settings.reminderMinutes > 0) n++;
  if (settings.homeworkReminderHours > 0) n++;
  if (settings.libraryReminderMinutes > 0) n++;
  return n;
});
