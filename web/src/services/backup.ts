/**
 * 云端备份序列化（对应原版 App 的 backup_export_service.dart）
 *
 * 备份 JSON 结构必须与手机端完全一致，否则双端互通会互相覆盖：
 *
 *   { format, version, exportedAt, appVersion, settings: {...}, localData: {...} }
 *
 * 关键约束：
 * 1. **未知字段暗盒**：网页端读不懂的手机端字段（`widgetItems`、新版本加的
 *    顶层键等）必须在拉取时原样存下来、推送时原样带回去。否则网页端同步一次，
 *    手机端的这些配置就被抹平了 —— 原版注释写得很直白：「避免高版本功能数据被抹杀」。
 *    实现见下方 `extractUnknownFields` / `mergeUnknownFields`，逐层照抄原版。
 * 2. **不写自己不懂格式的字段**：`localData.courses` / `rawCourses` /
 *    `timetableIcs` / `timetableMeta` 在手机端是 `CourseModel[]` / ICS 文本，
 *    网页端存的是另一套结构。写 null 让暗盒保留云端原值，绝不能拿网页端的
 *    对象覆盖过去 —— 手机端 `readCourseList()` 会因为不是 List 而读成空课表。
 * 3. 布局项全链路只用 `isVisible`（手机端 `FunctionItem.toJson()` 的键名），
 *    读取时两种键名都认。详见 `reconcileLayoutItems` 上方注释。
 */
import { settings } from '../stores/settings';
import {
  appearance,
  DEFAULT_HOME_IDS,
  FEED_SECTIONS,
  type LayoutItem,
} from '../stores/appearance';
import { ALL_FUNCTIONS, FUNCTION_GROUPS } from '../utils/functions';

export const BACKUP_FORMAT = 'chilleast-backup';
export const MODERN_BACKUP_FORMAT = 'chilleast-modern';
export const BACKUP_VERSION = 1;

/** 网页端版本号，与 App 的 appVersion 区分开，便于排查来源 */
export const WEB_APP_VERSION = 'web-1.0.0';

export interface BackupDocument {
  format?: string;
  version?: number;
  exportedAt?: string;
  appVersion?: string;
  settings?: Record<string, unknown>;
  localData?: Record<string, unknown>;
  /** 手机端写入、网页端读不懂的顶层字段，原样带回 */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 已知键集合（严格照抄原版 backup_export_service.dart 的 _known*Keys）
// ---------------------------------------------------------------------------
//
// 这些集合决定「哪些字段算读不懂」：不在集合里的键会被收进暗盒，
// 推送时原样回填。**新增网页端认识的字段时，必须同步加到这里**，
// 否则该字段会被当成未知字段反复回填，语义会变得难以预料。

/** 顶级已知字段 */
const KNOWN_TOP_LEVEL_KEYS = new Set([
  'format',
  'version',
  'exportedAt',
  'appVersion',
  'settings',
  'localData',
]);

/** settings 下的已知一级字段 */
const KNOWN_SETTINGS_KEYS = new Set([
  'languageCode',
  'courseReminderMinutes',
  'homeworkReminderHours',
  'libraryReminderMinutes',
  'courseLiveEnabled',
  'flymeLiveEnabled',
  'timetableAutoSyncEnabled',
  'timetableShowEndTime',
  'timetableSubscription',
  'manualFirstWeekMonday',
  'customCourseColors',
  'appearance',
  'electricityRoom',
  'electricityRoom2',
  'ai',
]);

/** settings.appearance 下的已知二级字段 */
const KNOWN_APPEARANCE_KEYS = new Set([
  'homeItems',
  'functionItems',
  'feedItems',
  'widgetItems',
  'functionGroupOrder',
  'hiddenFunctionGroups',
  'feedAutoSort',
]);

/** settings.ai 下的已知二级字段 */
const KNOWN_AI_KEYS = new Set(['apiUrl', 'model', 'apiKey', 'hasCustomApiKey']);

/** settings.timetableSubscription 下的已知二级字段 */
const KNOWN_SUBSCRIPTION_KEYS = new Set(['enabled', 'uuid']);

/** localData 下的已知一级字段 */
const KNOWN_LOCAL_DATA_KEYS = new Set([
  'timetableIcs',
  'timetableMeta',
  'courses',
  'rawCourses',
  'timetableRules',
  'homeworkList',
  'examList',
  'manualExamList',
  'aiMemories',
]);

/** 暗盒在 localStorage 里的键（原版是文档目录下的 unknown_backup_passthrough.json） */
const UNKNOWN_PASSTHROUGH_KEY = 'chilleast_unknown_backup_passthrough';

/** 暗盒里存「列表内未知 id 项」的容器键（照抄原版的 `_unknownListItems`） */
const UNKNOWN_LIST_ITEMS = '_unknownListItems';

// ---------------------------------------------------------------------------
// 未知字段暗盒
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 取字符串 id（布局项/分组键都用字符串标识） */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * 从备份文档里提取本版本**读不懂**的字段（对齐原版 `extractUnknownFields`）。
 *
 * 层级：
 * 1. 顶层未知键
 * 2. `settings` 未知键
 *    - `settings.appearance` 未知键 + 各列表里**不属于当前 masterPool** 的项
 *    - `settings.ai` 未知键
 *    - `settings.timetableSubscription` 未知键
 * 3. `localData` 未知键
 *
 * 纯函数：只读入参，不碰存储。
 */
export function extractUnknownFields(backup: BackupDocument): Record<string, unknown> {
  const unknown: Record<string, unknown> = {};

  // 1. 顶级未知键
  for (const [key, value] of Object.entries(backup)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) unknown[key] = value;
  }

  // 2. settings 下的未知键与子结构
  const rawSettings = backup.settings;
  if (isPlainObject(rawSettings)) {
    const unknownSettings: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawSettings)) {
      if (!KNOWN_SETTINGS_KEYS.has(key)) unknownSettings[key] = value;
    }

    // 2a. appearance 内部未知键与未知项
    const rawAppearance = rawSettings['appearance'];
    if (isPlainObject(rawAppearance)) {
      const unknownAppearance: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawAppearance)) {
        if (!KNOWN_APPEARANCE_KEYS.has(key)) unknownAppearance[key] = value;
      }

      const masterIds = new Set(ALL_FUNCTIONS.map((f) => f.id));
      const feedIds = new Set(FEED_SECTIONS.map((f) => f.id));
      const validGroupKeys = new Set(FUNCTION_GROUPS.map((g) => g.id));
      const unknownListItems: Record<string, unknown> = {};

      // 功能清单类：masterPool 之外的 id 是手机端新版本才有的功能，必须留住
      for (const listKey of ['homeItems', 'functionItems', 'widgetItems']) {
        const list = rawAppearance[listKey];
        if (!Array.isArray(list)) continue;
        const items = list.filter((item): item is Record<string, unknown> => {
          if (!isPlainObject(item)) return false;
          const id = idOf(item['id']);
          return id !== null && !masterIds.has(id);
        });
        if (items.length > 0) unknownListItems[listKey] = items;
      }

      // 信息流清单用另一套 masterPool
      const feedList = rawAppearance['feedItems'];
      if (Array.isArray(feedList)) {
        const items = feedList.filter((item): item is Record<string, unknown> => {
          if (!isPlainObject(item)) return false;
          const id = idOf(item['id']);
          return id !== null && !feedIds.has(id);
        });
        if (items.length > 0) unknownListItems['feedItems'] = items;
      }

      // 分组顺序 / 隐藏分组里，当前版本没有的分组键
      for (const groupKey of ['functionGroupOrder', 'hiddenFunctionGroups']) {
        const groups = rawAppearance[groupKey];
        if (!Array.isArray(groups)) continue;
        const unknownGroups = groups
          .map((value) => idOf(value))
          .filter((key): key is string => key !== null && !validGroupKeys.has(key));
        if (unknownGroups.length > 0) unknownListItems[groupKey] = unknownGroups;
      }

      if (Object.keys(unknownListItems).length > 0) {
        unknownAppearance[UNKNOWN_LIST_ITEMS] = unknownListItems;
      }
      if (Object.keys(unknownAppearance).length > 0) {
        unknownSettings['appearance'] = unknownAppearance;
      }
    }

    // 2b. AI 内部未知键
    const rawAi = rawSettings['ai'];
    if (isPlainObject(rawAi)) {
      const unknownAi: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawAi)) {
        if (!KNOWN_AI_KEYS.has(key)) unknownAi[key] = value;
      }
      if (Object.keys(unknownAi).length > 0) unknownSettings['ai'] = unknownAi;
    }

    // 2c. 课表订阅内部未知键
    const rawSubscription = rawSettings['timetableSubscription'];
    if (isPlainObject(rawSubscription)) {
      const unknownSubscription: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawSubscription)) {
        if (!KNOWN_SUBSCRIPTION_KEYS.has(key)) unknownSubscription[key] = value;
      }
      if (Object.keys(unknownSubscription).length > 0) {
        unknownSettings['timetableSubscription'] = unknownSubscription;
      }
    }

    if (Object.keys(unknownSettings).length > 0) unknown['settings'] = unknownSettings;
  }

  // 3. localData 下的未知键
  const rawLocalData = backup.localData;
  if (isPlainObject(rawLocalData)) {
    const unknownLocalData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawLocalData)) {
      if (!KNOWN_LOCAL_DATA_KEYS.has(key)) unknownLocalData[key] = value;
    }
    if (Object.keys(unknownLocalData).length > 0) unknown['localData'] = unknownLocalData;
  }

  return unknown;
}

/**
 * 把暗盒里的未知字段回填到刚组装好的备份里（对齐原版 `mergeUnknownFields`）。
 *
 * - 顶层 / settings / localData 的未知键：直接补回（本地没有同名键时）
 * - `appearance` 各列表的未知项：**按 id 去重后追加到列表尾部**
 * - 分组顺序 / 隐藏分组：未知分组键追加到尾部
 *
 * 纯函数：只读入参，不碰存储。
 */
export function mergeUnknownFields(
  fresh: BackupDocument,
  unknown?: Record<string, unknown> | null,
): BackupDocument {
  if (!unknown || Object.keys(unknown).length === 0) return fresh;

  const result: BackupDocument = { ...fresh };

  // 1. 顶级未知键
  for (const [key, value] of Object.entries(unknown)) {
    if (key === 'settings' || key === 'localData') continue;
    result[key] = value;
  }

  // 2. settings 下的未知键
  const unknownSettings = unknown['settings'];
  if (isPlainObject(unknownSettings)) {
    const baseSettings: Record<string, unknown> = isPlainObject(result.settings)
      ? { ...result.settings }
      : {};

    for (const [key, value] of Object.entries(unknownSettings)) {
      if (key === 'appearance' || key === 'ai' || key === 'timetableSubscription') continue;
      if (!(key in baseSettings)) baseSettings[key] = value;
    }

    // 2a. appearance
    const unknownAppearance = unknownSettings['appearance'];
    if (isPlainObject(unknownAppearance)) {
      const baseAppearance: Record<string, unknown> = isPlainObject(baseSettings['appearance'])
        ? { ...(baseSettings['appearance'] as Record<string, unknown>) }
        : {};

      for (const [key, value] of Object.entries(unknownAppearance)) {
        if (key === UNKNOWN_LIST_ITEMS) continue;
        if (!(key in baseAppearance)) baseAppearance[key] = value;
      }

      const unknownListItems = unknownAppearance[UNKNOWN_LIST_ITEMS];
      if (isPlainObject(unknownListItems)) {
        // 列表项按 id 去重追加
        for (const listKey of ['homeItems', 'functionItems', 'widgetItems', 'feedItems']) {
          const extra = unknownListItems[listKey];
          if (!Array.isArray(extra) || extra.length === 0) continue;
          const baseList: Array<Record<string, unknown>> = Array.isArray(baseAppearance[listKey])
            ? (baseAppearance[listKey] as unknown[])
                .filter(isPlainObject)
                .map((item) => ({ ...item }))
            : [];
          const existingIds = new Set(
            baseList.map((item) => idOf(item['id'])).filter((id): id is string => id !== null),
          );
          for (const item of extra) {
            if (!isPlainObject(item)) continue;
            const id = idOf(item['id']);
            if (id === null || existingIds.has(id)) continue;
            baseList.push({ ...item });
            existingIds.add(id);
          }
          baseAppearance[listKey] = baseList;
        }

        // 分组键追加到尾部
        for (const groupKey of ['functionGroupOrder', 'hiddenFunctionGroups']) {
          const extra = unknownListItems[groupKey];
          if (!Array.isArray(extra) || extra.length === 0) continue;
          const baseList: string[] = Array.isArray(baseAppearance[groupKey])
            ? (baseAppearance[groupKey] as unknown[])
                .map((value) => idOf(value))
                .filter((key): key is string => key !== null)
            : [];
          const existing = new Set(baseList);
          for (const value of extra) {
            const key = idOf(value);
            if (key === null || existing.has(key)) continue;
            baseList.push(key);
            existing.add(key);
          }
          baseAppearance[groupKey] = baseList;
        }
      }

      baseSettings['appearance'] = baseAppearance;
    }

    // 2b. AI
    const unknownAi = unknownSettings['ai'];
    if (isPlainObject(unknownAi)) {
      const baseAi: Record<string, unknown> = isPlainObject(baseSettings['ai'])
        ? { ...(baseSettings['ai'] as Record<string, unknown>) }
        : {};
      for (const [key, value] of Object.entries(unknownAi)) {
        if (!(key in baseAi)) baseAi[key] = value;
      }
      baseSettings['ai'] = baseAi;
    }

    // 2c. 课表订阅
    const unknownSubscription = unknownSettings['timetableSubscription'];
    if (isPlainObject(unknownSubscription)) {
      const baseSubscription: Record<string, unknown> = isPlainObject(
        baseSettings['timetableSubscription'],
      )
        ? { ...(baseSettings['timetableSubscription'] as Record<string, unknown>) }
        : {};
      for (const [key, value] of Object.entries(unknownSubscription)) {
        if (!(key in baseSubscription)) baseSubscription[key] = value;
      }
      baseSettings['timetableSubscription'] = baseSubscription;
    }

    result.settings = baseSettings;
  }

  // 3. localData 下的未知键
  const unknownLocalData = unknown['localData'];
  if (isPlainObject(unknownLocalData)) {
    const baseLocalData: Record<string, unknown> = isPlainObject(result.localData)
      ? { ...result.localData }
      : {};
    for (const [key, value] of Object.entries(unknownLocalData)) {
      // 本地明确给了 null 表示「网页端没有这项数据」，此时保留云端原值
      const localValue = baseLocalData[key];
      if (localValue === undefined || localValue === null) baseLocalData[key] = value;
    }
    result.localData = baseLocalData;
  }

  return result;
}

/** 读出暗盒（读不到/损坏时返回空对象）。 */
export function loadUnknownFields(): Record<string, unknown> {
  const raw = localStorage.getItem(UNKNOWN_PASSTHROUGH_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** 覆盖写入暗盒（对齐原版「全量替换，防死灰复活」）；空对象时删除键。 */
export function saveUnknownFields(unknown: Record<string, unknown>): void {
  if (!unknown || Object.keys(unknown).length === 0) {
    localStorage.removeItem(UNKNOWN_PASSTHROUGH_KEY);
    return;
  }
  localStorage.setItem(UNKNOWN_PASSTHROUGH_KEY, JSON.stringify(unknown));
}

/** 清除暗盒（退出登录时调用，避免下个账号继承上个账号的未知字段）。 */
export function clearUnknownFields(): void {
  localStorage.removeItem(UNKNOWN_PASSTHROUGH_KEY);
}

// ---------------------------------------------------------------------------
// 外观清单的跨端格式
// ---------------------------------------------------------------------------
//
// 这一节逐条对齐原版 App 的语义，别改回去：
//
//   写入  `appearance_provider.dart _saveSettings()`
//         prefs.setString(key, json.encode(items.map((e) => e.toJson())))
//         `FunctionItem.toJson() => {'id': id, 'isVisible': isVisible}`
//
//   备份  `backup_export_service.dart buildBackupData()`
//         'homeItems': _decodeJson(prefs.getString('home_function_items'))
//         —— 直接搬 prefs 里的原始 JSON，不重新序列化
//
//   恢复  `_reconcileFunctionItems(cloudList, localList, masterIds, defaultVisibility)`
//         1. 先消费云端列表（覆盖顺序与可见性；不在 masterPool 的 id 丢弃）
//         2. 再追加「本地有、云端没有」的项
//         'isVisible': isVisible is bool ? isVisible
//                      : (localMap[id]?['isVisible'] ?? defaultVisibility[id] ?? false)
//
// 结论：**全链路只有 `isVisible` 一个键名**，且恢复时是与本地 merge 而不是覆盖。
// 网页端早先只认 `visible`，一旦拉到手机端写的备份就 `Boolean(undefined) === false`，
// 所有条目被判成隐藏 —— 首页与功能页会整页空白。这是必须防住的回归。

/** 网页端 `{ id, visible }` → 手机端 `{ id, isVisible }`（与 FunctionItem.toJson 一致） */
function toPhoneItems(items: readonly LayoutItem[]): Array<{ id: string; isVisible: boolean }> {
  return items.map((item) => ({ id: item.id, isVisible: item.visible }));
}

/** 从任意一条云端/本地布局项里读出可见性（两种键名都认） */
function pickVisible(entry: Record<string, unknown>): boolean | undefined {
  const value = entry['visible'] ?? entry['isVisible'];
  if (value === undefined || value === null) return undefined;
  return Boolean(value);
}

/**
 * 对齐原版 `_reconcileFunctionItems`：云端列表定顺序与可见性，
 * 本地有而云端没有的项追加在后面；不在 masterIds 里的 id 直接丢弃。
 *
 * @param cloudList 云端备份里的列表（手机端 `isVisible` 或网页端 `visible` 都行）
 * @param localList 本地已有的列表
 * @param masterIds 当前版本合法的全部 id（原版的 masterPool）
 * @param defaultVisible 云端与本地都没给可见性时的兜底
 */
export function reconcileLayoutItems(
  cloudList: unknown,
  localList: readonly LayoutItem[],
  masterIds: readonly string[],
  defaultVisible: (id: string) => boolean,
): LayoutItem[] {
  const master = new Set(masterIds);
  const localMap = new Map(localList.map((item) => [item.id, item.visible]));

  const result: LayoutItem[] = [];
  const added = new Set<string>();

  // 1. 云端优先：决定顺序与可见性
  if (Array.isArray(cloudList)) {
    for (const raw of cloudList) {
      if (typeof raw !== 'object' || raw === null) continue;
      const rec = raw as Record<string, unknown>;
      const id = rec['id'];
      if (typeof id !== 'string' || !master.has(id) || added.has(id)) continue;

      const fromCloud = pickVisible(rec);
      const visible = fromCloud ?? localMap.get(id) ?? defaultVisible(id);
      result.push({ id, visible });
      added.add(id);
    }
  }

  // 2. 本地有、云端没有的继续保留
  for (const item of localList) {
    if (added.has(item.id) || !master.has(item.id)) continue;
    result.push({ id: item.id, visible: item.visible });
    added.add(item.id);
  }

  // 3. 两边都没有的新增项（网页端后续版本加的功能）
  for (const id of masterIds) {
    if (added.has(id)) continue;
    result.push({ id, visible: defaultVisible(id) });
    added.add(id);
  }

  return result;
}

// ---------------------------------------------------------------------------
// 读取本地各模块数据
// ---------------------------------------------------------------------------

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readString(key: string): string | null {
  return localStorage.getItem(key);
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

/** 手工作业（与 App 的 homeworkList 字段对齐） */
function readManualHomework(): unknown[] {
  return readJson<unknown[]>('chilleast_manual_homework', []);
}

/** 手工考试（与 App 的 examList 字段对齐） */
function readManualExam(): unknown[] {
  return readJson<unknown[]>('chilleast_manual_exam', []);
}

/** 课表调课规则（Worker 从云端读出来的结构） */
export function readTimetableRules(): unknown[] {
  return readJson<unknown[]>('chilleast_timetable_rules', []);
}

/** 自定义课程颜色 */
function readCustomCourseColors(): Record<string, string> {
  return readJson<Record<string, string>>('chilleast_course_colors', {});
}

/**
 * 读取某个宿舍槽位的绑定（App 用 `saved_electricity_room` / `saved_electricity_room_2`）。
 *
 * 槽位 0 兼容网页端早期写在 `chilleast_dorm` 里的旧数据；
 * 槽位 1 没有历史包袱，只认手机端键名。
 */
function readElectricityRoom(slot = 0): unknown {
  const raw =
    readString(slot === 0 ? 'saved_electricity_room' : 'saved_electricity_room_2') ||
    (slot === 0 ? readString('chilleast_dorm') : null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 课表云端订阅（键名与原版 TimetableSubscriptionService 一致） */
function readTimetableSubscription(): { enabled: boolean; uuid: string | null } {
  const uuid = (readString('timetable_subscription_uuid') ?? '').trim();
  return {
    enabled: readBool('timetable_subscription_enabled', false),
    // 手机端 applyBackupData 只在 uuid != null 时才写，空串写 null 才安全
    uuid: uuid === '' ? null : uuid,
  };
}

/** AI 配置（接口地址 / 模型 / 自定义 Key） */
function readAiSettings(): Record<string, unknown> {
  const apiKey = readString('ai_api_key') || '';
  return {
    apiUrl: readString('ai_api_url') || null,
    model: readString('ai_model') || null,
    // 与 App 一致：只导出用户自定义的 Key，空则不写
    apiKey: apiKey || null,
    hasCustomApiKey: Boolean(apiKey),
  };
}

/** AI 记忆条目 */
function readAiMemories(): unknown[] {
  return readJson<unknown[]>('ai_memory_items', []);
}

// ---------------------------------------------------------------------------
// 生成备份
// ---------------------------------------------------------------------------

/**
 * 生成与手机端结构一致的备份文档。
 *
 * @param format   现代轨（chilleast-modern）或兼容轨（chilleast-backup）
 * @param preserve 上次拉取到的云端备份；其**未知字段**会被回填（见暗盒一节）
 */
export function buildBackupData(
  format: string = MODERN_BACKUP_FORMAT,
  preserve?: BackupDocument | null,
): BackupDocument {
  const base: BackupDocument = {
    format,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: WEB_APP_VERSION,
    settings: {
      languageCode: readString('app_language_code'),
      courseReminderMinutes: settings.reminderMinutes,
      homeworkReminderHours: settings.homeworkReminderHours,
      libraryReminderMinutes: settings.libraryReminderMinutes,
      courseLiveEnabled: false,
      flymeLiveEnabled: false,
      timetableAutoSyncEnabled: settings.timetableAutoSyncEnabled,
      timetableShowEndTime: settings.timetableShowEndTime,
      // 必须读真实键：写死 false 会让手机端把用户的 ICS 订阅**关掉**
      // （手机端 applyBackupData 看到 enabled:false 就直接落盘）
      timetableSubscription: readTimetableSubscription(),
      manualFirstWeekMonday: settings.manualFirstWeekMonday,
      customCourseColors: readCustomCourseColors(),
      appearance: {
        // 必须序列化成手机端的 `{id, isVisible}` 格式，否则 App 读不到显隐状态
        // （`FunctionItem.fromJson` 只认 `isVisible`，见 appearance_state.dart）
        homeItems: toPhoneItems(appearance.home),
        functionItems: toPhoneItems(appearance.functions),
        feedItems: toPhoneItems(appearance.feed),
        // 手机端的小组件是独立清单（`widget_function_items`），不能拿首页清单顶替：
        // 直接复用会让 App 的桌面小组件显示成首页那 6 个入口。
        // 网页端没有小组件，这里写 null，让暗盒保留云端原值。
        widgetItems: null,
        functionGroupOrder: appearance.groupOrder,
        hiddenFunctionGroups: appearance.hiddenGroups,
        feedAutoSort: appearance.feedAutoSort,
      },
      // 双宿舍两个槽位都要带，否则第二间宿舍永远同步不过去
      electricityRoom: readElectricityRoom(0),
      electricityRoom2: readElectricityRoom(1),
      ai: readAiSettings(),
    },
    localData: {
      // ⚠️ 这四个字段网页端**故意不写**（写 null 交给暗盒保留云端原值）：
      //
      // 手机端 `courses.json` 是 `CourseModel[]` 数组，网页端的课表缓存是
      // `{weeks:{...}}` 对象。把对象写进 `localData.courses` 后，手机端
      // `_writeDocFile('courses.json', ...)` 会原样落盘，紧接着
      // `readCourseList()` 里 `decoded is List` 判定失败 → 返回空列表 →
      // **用户手机上的课表就空了**。反向同理。
      //
      // 网页端的全量课表随时可以从教务重新拉，不必进备份。
      timetableIcs: null,
      timetableMeta: null,
      courses: null,
      rawCourses: null,
      timetableRules: readTimetableRules(),
      homeworkList: readManualHomework(),
      examList: readManualExam(),
      aiMemories: readAiMemories(),
    },
  };

  // 暗盒回填：preserve 里读不懂的字段优先于本地的 null 占位
  const unknown = preserve ? extractUnknownFields(preserve) : loadUnknownFields();
  return mergeUnknownFields(base, unknown);
}

// ---------------------------------------------------------------------------
// 现代轨与兼容轨的合并（对齐 cloud_backup_manager.dart mergeModernWithLegacy）
// ---------------------------------------------------------------------------

/** 合并时以兼容轨（老设备刚改过）为准的基础设置键 */
const MERGE_LEGACY_SETTINGS_KEYS = [
  'languageCode',
  'courseReminderMinutes',
  'homeworkReminderHours',
  'libraryReminderMinutes',
  'courseLiveEnabled',
  'flymeLiveEnabled',
  'timetableAutoSyncEnabled',
  'timetableShowEndTime',
  'manualFirstWeekMonday',
  'electricityRoom',
] as const;

/** 合并时以兼容轨为准的外观列表键 */
const MERGE_LEGACY_APPEARANCE_KEYS = [
  'homeItems',
  'functionItems',
  'feedItems',
  'widgetItems',
  'functionGroupOrder',
  'hiddenFunctionGroups',
] as const;

/** 合并时兼容轨有值就覆盖的本地数据键 */
const MERGE_LEGACY_LOCAL_DATA_KEYS = [
  'timetableIcs',
  'timetableMeta',
  'courses',
  'rawCourses',
  'timetableRules',
  'homeworkList',
  'examList',
] as const;

/**
 * 两轨同时存在、且**兼容轨更新**时的智能合并（对齐原版 `mergeModernWithLegacy`）。
 *
 * 场景：用户换了网页端，但老版本手机 App 还在写兼容轨。兼容轨只带基础设置，
 * 现代轨带全量数据。于是以现代轨为底，用兼容轨里「老设备刚改过」的那几项覆盖。
 *
 * 规则（逐条照抄 Dart）：
 * 1. 基础设置键以兼容轨覆盖
 * 2. `settings.appearance` 的 6 个列表/分组键以兼容轨覆盖
 * 3. `localData` 的课表与作业数据在兼容轨有值时覆盖
 * 4. 结果 `format` 强制为 `chilleast-modern`
 *
 * 纯函数，不读写存储。
 */
export function mergeModernWithLegacy(
  modern: BackupDocument,
  legacy: BackupDocument,
): BackupDocument {
  const merged: BackupDocument = { ...modern, format: MODERN_BACKUP_FORMAT };

  const modernSettings: Record<string, unknown> = isPlainObject(merged.settings)
    ? { ...merged.settings }
    : {};
  const legacySettings: Record<string, unknown> = isPlainObject(legacy.settings)
    ? legacy.settings
    : {};
  const modernLocalData: Record<string, unknown> = isPlainObject(merged.localData)
    ? { ...merged.localData }
    : {};
  const legacyLocalData: Record<string, unknown> = isPlainObject(legacy.localData)
    ? legacy.localData
    : {};

  // 1. 基础设置项以老版较新的设置覆盖
  for (const key of MERGE_LEGACY_SETTINGS_KEYS) {
    if (key in legacySettings) modernSettings[key] = legacySettings[key];
  }

  // 2. 外观设置
  if ('appearance' in legacySettings) {
    const legacyAppearance: Record<string, unknown> = isPlainObject(legacySettings['appearance'])
      ? (legacySettings['appearance'] as Record<string, unknown>)
      : {};
    const modernAppearance: Record<string, unknown> = isPlainObject(modernSettings['appearance'])
      ? { ...(modernSettings['appearance'] as Record<string, unknown>) }
      : {};
    for (const key of MERGE_LEGACY_APPEARANCE_KEYS) {
      if (key in legacyAppearance) modernAppearance[key] = legacyAppearance[key];
    }
    modernSettings['appearance'] = modernAppearance;
  }

  // 3. 课表、作业与考试数据：若老版有更新则覆盖（null / 缺失都视为没有）
  for (const key of MERGE_LEGACY_LOCAL_DATA_KEYS) {
    const value = legacyLocalData[key];
    if (value !== null && value !== undefined) modernLocalData[key] = value;
  }
  if (!('examList' in legacyLocalData) && 'manualExamList' in legacyLocalData) {
    const value = legacyLocalData['manualExamList'];
    if (value !== null && value !== undefined) modernLocalData['examList'] = value;
  }

  merged.settings = modernSettings;
  merged.localData = modernLocalData;
  return merged;
}

// ---------------------------------------------------------------------------
// 应用云端备份到本地
// ---------------------------------------------------------------------------

export interface ApplyResult {
  /** 实际写入的模块名（用于界面展示「已同步 N 项」） */
  applied: string[];
}

/**
 * 按 id 合并两份列表（对齐原版 `_applyManualHomeworkList` 的合并语义）。
 *
 * 顺序：云端优先（顺序也跟云端）→ 本地有、云端没有的追加在后面。
 * 这样既不会丢用户在网页端刚加的手工作业，也不会把手机端删掉的项复活。
 */
function mergeById(
  cloudList: unknown[],
  localList: unknown[],
): unknown[] {
  const merged: unknown[] = [];
  const addedIds = new Set<string>();

  for (const item of cloudList) {
    const id = isPlainObject(item) ? idOf(item['id']) : null;
    if (id === null || addedIds.has(id)) continue;
    merged.push(item);
    addedIds.add(id);
  }
  for (const item of localList) {
    const id = isPlainObject(item) ? idOf(item['id']) : null;
    // 没有 id 的项无法判重，直接保留（宁可重复也不丢数据）
    if (id === null) {
      merged.push(item);
      continue;
    }
    if (addedIds.has(id)) continue;
    merged.push(item);
    addedIds.add(id);
  }
  return merged;
}

/** 读取 localStorage 里的列表（读不到返回空数组） */
function readLocalList(key: string): unknown[] {
  return readJson<unknown[]>(key, []);
}

/**
 * 把云端备份里的设置与本地数据写回本地存储。
 *
 * 语义（对齐原版 `applyBackupData`）：
 * - 先提取并保存**未知字段暗盒**（全量替换），保证下次推送时能原样带回
 * - 云端有、本地也有的项：以云端为准
 * - 云端没有、本地有的项：保留本地，不删除
 * - 列表类数据（手工作业/考试）：按 id 合并，而不是整体覆盖
 */
export function applyBackup(doc: BackupDocument): ApplyResult {
  const applied: string[] = [];

  // 先存暗盒 —— 与手机端一致：读不懂的字段要留住，否则下次推送就丢了
  saveUnknownFields(extractUnknownFields(doc));

  const s = isPlainObject(doc.settings) ? doc.settings : undefined;
  const local = isPlainObject(doc.localData) ? doc.localData : undefined;

  if (s) {
    // ---- 设置项 ----
    if (typeof s['languageCode'] === 'string' && s['languageCode']) {
      localStorage.setItem('app_language_code', s['languageCode'] as string);
      applied.push('语言');
    }
    if (typeof s['courseReminderMinutes'] === 'number') {
      localStorage.setItem('course_reminder_minutes', String(s['courseReminderMinutes']));
      applied.push('上课提醒');
    }
    if (typeof s['homeworkReminderHours'] === 'number') {
      localStorage.setItem('homework_reminder_hours', String(s['homeworkReminderHours']));
      applied.push('作业提醒');
    }
    if (typeof s['libraryReminderMinutes'] === 'number') {
      localStorage.setItem('library_reminder_minutes', String(s['libraryReminderMinutes']));
      applied.push('图书馆提醒');
    }
    if (typeof s['timetableAutoSyncEnabled'] === 'boolean') {
      localStorage.setItem('timetable_auto_sync_enabled', String(s['timetableAutoSyncEnabled']));
      applied.push('课表自动同步');
    }
    if (typeof s['timetableShowEndTime'] === 'boolean') {
      localStorage.setItem('timetable_show_end_time', String(s['timetableShowEndTime']));
      applied.push('下课时间');
    }
    if (typeof s['manualFirstWeekMonday'] === 'string' && s['manualFirstWeekMonday']) {
      localStorage.setItem('timetable_manual_first_week_monday', s['manualFirstWeekMonday']);
      applied.push('第一周周一');
    }

    // ---- 课程自定义颜色：与本地合并（对齐原版：云端逐项覆盖本地，本地独有的保留）----
    if (isPlainObject(s['customCourseColors'])) {
      const mergedColors: Record<string, unknown> = {
        ...readJson<Record<string, unknown>>('chilleast_course_colors', {}),
      };
      for (const [key, value] of Object.entries(s['customCourseColors'])) {
        mergedColors[key] = value;
      }
      localStorage.setItem('chilleast_course_colors', JSON.stringify(mergedColors));
    }

    // ---- 课表云端订阅 ----
    const subscription = s['timetableSubscription'];
    if (isPlainObject(subscription)) {
      if (typeof subscription['enabled'] === 'boolean') {
        localStorage.setItem('timetable_subscription_enabled', String(subscription['enabled']));
      }
      // 手机端只在 uuid != null 时写；null 表示云端也没有，保留本地值
      if (subscription['uuid'] !== null && subscription['uuid'] !== undefined) {
        localStorage.setItem('timetable_subscription_uuid', String(subscription['uuid']));
      }
    }

    // ---- 外观（信息流/按钮顺序与显隐）----
    //
    // 与本地列表 merge，而不是直接覆盖：原版 `_reconcileFunctionItems`
    // 就是「云端定顺序与可见性 + 本地独有的项追加」，这样既不会丢用户
    // 在网页端刚做的调整，也不会因为云端列表缺项而把某些入口抹掉。
    const ap = s['appearance'];
    if (isPlainObject(ap)) {
      const masterIds = ALL_FUNCTIONS.map((f) => f.id);
      const feedIds = FEED_SECTIONS.map((f) => f.id);

      if (ap['homeItems'] !== undefined) {
        const merged = reconcileLayoutItems(
          ap['homeItems'],
          appearance.home,
          masterIds,
          (id) => DEFAULT_HOME_IDS.includes(id),
        );
        localStorage.setItem('home_function_items', JSON.stringify(merged));
      }
      if (ap['functionItems'] !== undefined) {
        const merged = reconcileLayoutItems(ap['functionItems'], appearance.functions, masterIds, () => true);
        localStorage.setItem('function_page_items', JSON.stringify(merged));
      }
      if (ap['feedItems'] !== undefined) {
        const merged = reconcileLayoutItems(ap['feedItems'], appearance.feed, feedIds, () => true);
        localStorage.setItem('home_feed_items', JSON.stringify(merged));
      }
      if (Array.isArray(ap['functionGroupOrder'])) {
        localStorage.setItem('function_group_order', JSON.stringify(ap['functionGroupOrder']));
      }
      if (Array.isArray(ap['hiddenFunctionGroups'])) {
        localStorage.setItem('hidden_function_groups', JSON.stringify(ap['hiddenFunctionGroups']));
      }
      if (typeof ap['feedAutoSort'] === 'boolean') {
        localStorage.setItem('feed_auto_sort', String(ap['feedAutoSort']));
      }
      applied.push('外观');
    }

    // ---- 宿舍绑定：两个槽位都还原（对齐原版 electricityRoom / electricityRoom2）----
    const roomKeys = [
      ['electricityRoom', 'saved_electricity_room', 'chilleast_dorm', 'chilleast_dorm_name'],
      ['electricityRoom2', 'saved_electricity_room_2', null, null],
    ] as const;
    for (const [field, storageKey, legacyKey, legacyNameKey] of roomKeys) {
      const room = s[field];
      if (!isPlainObject(room)) continue;
      localStorage.setItem(storageKey, JSON.stringify(room));
      if (legacyKey) localStorage.setItem(legacyKey, JSON.stringify(room));
      const r = room as Record<string, unknown>;
      const text = (value: unknown): string =>
        typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
      const name =
        text(r['fullName']) ||
        [
          text(r['areaName']) || text(r['area']),
          text(r['buildingName']) || text(r['building']),
          text(r['roomName']) || text(r['room']),
        ]
          .filter(Boolean)
          .join(' ');
      if (name && legacyNameKey) localStorage.setItem(legacyNameKey, name);
      applied.push(field === 'electricityRoom' ? '宿舍绑定' : '第二宿舍绑定');
    }

    // ---- AI 配置 ----
    const ai = s['ai'];
    if (isPlainObject(ai)) {
      if (typeof ai['apiUrl'] === 'string' && ai['apiUrl']) {
        localStorage.setItem('ai_api_url', ai['apiUrl'] as string);
      }
      if (typeof ai['model'] === 'string' && ai['model']) {
        localStorage.setItem('ai_model', ai['model'] as string);
      }
      if (typeof ai['apiKey'] === 'string' && ai['apiKey']) {
        localStorage.setItem('ai_api_key', ai['apiKey'] as string);
      }
      if (ai['apiUrl'] || ai['model'] || ai['apiKey']) applied.push('Agent');
    }
  }

  if (local) {
    // ---- 课表规则 ----
    if (Array.isArray(local['timetableRules'])) {
      localStorage.setItem('chilleast_timetable_rules', JSON.stringify(local['timetableRules']));
      applied.push('调课规则');
    }

    // ---- 手工作业：按 id 合并，不整体覆盖 ----
    if (Array.isArray(local['homeworkList'])) {
      // 手机端只把 isManual 的项放进备份；这里同样只接管手动作业，
      // 云端列表里若混入非手动作业（老数据）也不该覆盖本地。
      const cloudManual = local['homeworkList'].filter(
        (item) => !isPlainObject(item) || item['isManual'] === true,
      );
      const merged = mergeById(cloudManual, readLocalList('chilleast_manual_homework'));
      localStorage.setItem('chilleast_manual_homework', JSON.stringify(merged));
      applied.push('手工作业');
    }

    // ---- 手工考试：兼容老键名 manualExamList ----
    const cloudExams = local['examList'] ?? local['manualExamList'];
    if (Array.isArray(cloudExams)) {
      const merged = mergeById(cloudExams, readLocalList('chilleast_manual_exam'));
      localStorage.setItem('chilleast_manual_exam', JSON.stringify(merged));
      applied.push('手工考试');
    }

    // ---- AI 记忆 ----
    if (Array.isArray(local['aiMemories'])) {
      localStorage.setItem('ai_memory_items', JSON.stringify(local['aiMemories']));
    }

    // ⚠️ 故意**不**还原 courses / rawCourses / timetableIcs / timetableMeta：
    // 那是手机端格式，网页端读不懂也写不对（见 buildBackupData 的说明）。
    // 它们由暗盒原样保管，推送时带回手机端。
  }

  return { applied };
}
