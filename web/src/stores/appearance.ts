/**
 * 外观 / 布局个性化（对应原版 App 的 AppearanceNotifier）
 *
 * 原版维护四张清单：首页按钮、功能页按钮、信息流区块、桌面小组件。
 * 网页版把「小组件」换成「首页快捷入口」，其余语义保持一致。
 *
 * 所有清单都是 [{ id, visible }] 的有序数组，顺序 = 展示顺序。
 */
import { reactive, computed } from 'vue';
import { ALL_FUNCTIONS, FUNCTION_GROUPS, isFunctionVisible } from '../utils/functions';
import { markDirty } from '../services/cloudSync';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface LayoutItem {
  id: string;
  visible: boolean;
}

export type ListType = 'home' | 'functions' | 'feed';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppearanceState {
  /** 主题模式：跟随系统 (system) / 浅色 (light) / 深色 (dark) */
  themeMode: ThemeMode;
  home: LayoutItem[];
  functions: LayoutItem[];
  feed: LayoutItem[];
  /** 功能页分组顺序（分组 id） */
  groupOrder: string[];
  /** 隐藏的功能分组 */
  hiddenGroups: string[];
  /** 信息流自动排序 */
  feedAutoSort: boolean;
}

const KEYS = {
  themeMode: 'app_theme_mode',
  legacyThemeMode: 'theme_mode',
  home: 'home_function_items',
  functions: 'function_page_items',
  feed: 'home_feed_items',
  groupOrder: 'function_group_order',
  hiddenGroups: 'hidden_function_groups',
  feedAutoSort: 'feed_auto_sort',
} as const;

// ---------------------------------------------------------------------------
// 默认值（与 App 一致）
// ---------------------------------------------------------------------------

/** 首页默认显示的快捷入口（与 App 一致） */
export const DEFAULT_HOME_IDS = [
  'payment_code',
  'library',
  'empty_classroom',
  'repairs',
  'bus',
  'score',
  'ele_recharge',
];

/**
 * 功能页默认顺序。
 * 直接用 ALL_FUNCTIONS 的定义顺序，保证新增功能自动出现在末尾。
 */
const FUNCTION_IDS = ALL_FUNCTIONS.map((f) => f.id);

/** 信息流区块 */
export interface FeedSectionDef {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export const FEED_SECTIONS: FeedSectionDef[] = [
  { id: 'feed_quick', label: '快捷功能', icon: 'apps', description: '常用功能入口网格' },
  { id: 'feed_library', label: '图书馆预约', icon: 'book', description: '当前生效的座位预约' },
  { id: 'feed_agenda', label: '今日日程', icon: 'calendar', description: '今天的课程与考试' },
  { id: 'feed_homework', label: '作业', icon: 'tasks', description: '待完成的作业' },
  { id: 'feed_leave', label: '请假申请', icon: 'leave', description: '进行中的请假单' },
  { id: 'feed_repair', label: '报修工单', icon: 'tool', description: '处理中的报修单' },
  { id: 'feed_questionnaire', label: '待完成的问卷', icon: 'questionnaire', description: '未填写的线上问卷' },
  { id: 'feed_balance', label: '余额', icon: 'wallet', description: '校园卡余额与宿舍电费' },
];

const FEED_IDS = FEED_SECTIONS.map((s) => s.id);

// ---------------------------------------------------------------------------
// 读写
// ---------------------------------------------------------------------------

/**
 * 从一条布局项里读出「是否可见」。
 *
 * ⚠️ 必须同时认两种键名，否则首页/功能页会**整页空白**：
 *   - 网页端自己写的：`{ id, visible }`
 *   - 手机 App 写的：  `{ id, isVisible }`（见 `appearance_state.dart` 的
 *     `FunctionItem.toJson() => {'id': id, 'isVisible': isVisible}`）
 *
 * 云同步会把手机端的 `settings.appearance` 原样写进 localStorage，
 * 如果这里只读 `visible`，`Boolean(undefined)` 得到 false ——
 * 所有条目都被判成「隐藏」，首页与功能页就一个卡片都不剩。
 */
function readVisible(entry: Record<string, unknown>): boolean {
  const value = entry['visible'] ?? entry['isVisible'];
  return value === undefined ? true : Boolean(value);
}

function readList(key: string, ids: string[], defaultVisible: (id: string) => boolean): LayoutItem[] {
  const raw = localStorage.getItem(key);
  let parsed: LayoutItem[] | null = null;
  if (raw) {
    try {
      const decoded = JSON.parse(raw);
      if (Array.isArray(decoded)) {
        parsed = decoded
          .filter((e) => e && typeof e.id === 'string')
          .map((e) => ({
            id: e.id as string,
            visible: readVisible(e as Record<string, unknown>),
          }));
      }
    } catch {
      parsed = null;
    }
  }
  if (!parsed) {
    return ids.map((id) => ({ id, visible: defaultVisible(id) }));
  }
  // 保留已保存的顺序，剔除失效 id，追加新增 id
  const known = new Set(ids);
  const result = parsed.filter((e) => known.has(e.id));
  const present = new Set(result.map((e) => e.id));
  for (const id of ids) {
    if (!present.has(id)) result.push({ id, visible: defaultVisible(id) });
  }
  return result;
}

function readStringList(key: string): string[] | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const decoded = JSON.parse(raw);
    if (!Array.isArray(decoded)) return null;
    return decoded.map((e) => String(e));
  } catch {
    return null;
  }
}

const DEFAULT_GROUP_ORDER = FUNCTION_GROUPS.map((g) => g.id);

function readGroupOrder(): string[] {
  const saved = readStringList(KEYS.groupOrder);
  if (!saved) return [...DEFAULT_GROUP_ORDER];
  const valid = new Set(DEFAULT_GROUP_ORDER);
  const order = saved.filter((k) => valid.has(k));
  for (const k of DEFAULT_GROUP_ORDER) {
    if (!order.includes(k)) order.push(k);
  }
  return order;
}

function readThemeMode(): ThemeMode {
  const raw = localStorage.getItem(KEYS.themeMode) ?? localStorage.getItem(KEYS.legacyThemeMode);
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }
  return 'system';
}

let mql: MediaQueryList | null = null;
let mqlHandler: ((e: MediaQueryListEvent) => void) | null = null;

export function isDarkMode(): boolean {
  if (appearance.themeMode === 'dark') return true;
  if (appearance.themeMode === 'light') return false;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

export function applyTheme(mode: ThemeMode = appearance.themeMode): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const isDark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isDark ? '#202124' : '#ffffff');
  }
}

export function initTheme(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (!mql && window.matchMedia) {
    mql = window.matchMedia('(prefers-color-scheme: dark)');
    mqlHandler = () => {
      if (appearance.themeMode === 'system') {
        applyTheme('system');
      }
    };
    if (mql.addEventListener) {
      mql.addEventListener('change', mqlHandler);
    } else if ((mql as any).addListener) {
      (mql as any).addListener(mqlHandler);
    }
  }

  applyTheme(appearance.themeMode);
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

export const appearance = reactive<AppearanceState>({
  themeMode: readThemeMode(),
  home: readList(KEYS.home, FUNCTION_IDS, (id) => DEFAULT_HOME_IDS.includes(id)),
  functions: readList(KEYS.functions, FUNCTION_IDS, () => true),
  feed: readList(KEYS.feed, FEED_IDS, () => true),
  groupOrder: readGroupOrder(),
  hiddenGroups: readStringList(KEYS.hiddenGroups) ?? [],
  feedAutoSort: localStorage.getItem(KEYS.feedAutoSort) === 'true',
});

/**
 * 从 localStorage 重新载入布局到 reactive 状态。
 *
 * 用途：云端备份写回 localStorage 后，让首页/功能页立即用上新布局
 * （对应原版 `appearanceProvider.reload()`，由 `backupRefresh` 调用）。
 *
 * ⚠️ 不能走 `persistAll()` —— 它会 `markDirty()`，拉下来的数据会立刻被回推。
 */
export function reloadAppearance(): void {
  appearance.themeMode = readThemeMode();
  appearance.home = readList(KEYS.home, FUNCTION_IDS, (id) => DEFAULT_HOME_IDS.includes(id));
  appearance.functions = readList(KEYS.functions, FUNCTION_IDS, () => true);
  appearance.feed = readList(KEYS.feed, FEED_IDS, () => true);
  appearance.groupOrder = readGroupOrder();
  appearance.hiddenGroups = readStringList(KEYS.hiddenGroups) ?? [];
  appearance.feedAutoSort = localStorage.getItem(KEYS.feedAutoSort) === 'true';
  applyTheme(appearance.themeMode);
}

function persistList(key: string, list: LayoutItem[]) {
  localStorage.setItem(key, JSON.stringify(list));
}

function persistAll() {
  persistList(KEYS.home, appearance.home);
  persistList(KEYS.functions, appearance.functions);
  persistList(KEYS.feed, appearance.feed);
  localStorage.setItem(KEYS.groupOrder, JSON.stringify(appearance.groupOrder));
  localStorage.setItem(KEYS.hiddenGroups, JSON.stringify(appearance.hiddenGroups));
  localStorage.setItem(KEYS.feedAutoSort, String(appearance.feedAutoSort));
  // 与原版一致：布局变更也参与云同步
  markDirty();
}

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

export const appearanceActions = {
  setThemeMode(mode: ThemeMode) {
    appearance.themeMode = mode;
    localStorage.setItem(KEYS.themeMode, mode);
    localStorage.setItem(KEYS.legacyThemeMode, mode);
    applyTheme(mode);
    markDirty();
  },

  list(type: ListType): LayoutItem[] {
    return appearance[type];
  },

  setList(type: ListType, items: LayoutItem[]) {
    appearance[type] = items;
    persistAll();
  },

  toggleVisible(type: ListType, id: string) {
    appearance[type] = appearance[type].map((item) =>
      item.id === id ? { ...item, visible: !item.visible } : item,
    );
    persistAll();
  },

  /** 把 from 位置移动到 to 位置 */
  move(type: ListType, from: number, to: number) {
    const list = [...appearance[type]];
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    appearance[type] = list;
    persistAll();
  },

  /** 上移 / 下移一位（键盘与按钮操作） */
  moveUp(type: ListType, id: string) {
    const idx = appearance[type].findIndex((e) => e.id === id);
    if (idx > 0) appearanceActions.move(type, idx, idx - 1);
  },

  moveDown(type: ListType, id: string) {
    const idx = appearance[type].findIndex((e) => e.id === id);
    if (idx >= 0 && idx < appearance[type].length - 1) appearanceActions.move(type, idx, idx + 1);
  },

  /** 全部显示 / 全部隐藏 */
  setAllVisible(type: ListType, visible: boolean) {
    appearance[type] = appearance[type].map((item) => ({ ...item, visible }));
    persistAll();
  },

  setGroupOrder(order: string[]) {
    appearance.groupOrder = order;
    persistAll();
  },

  moveGroup(from: number, to: number) {
    const order = [...appearance.groupOrder];
    if (from < 0 || from >= order.length || to < 0 || to >= order.length) return;
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    appearance.groupOrder = order;
    persistAll();
  },

  toggleGroupHidden(groupId: string) {
    const set = new Set(appearance.hiddenGroups);
    if (set.has(groupId)) set.delete(groupId);
    else set.add(groupId);
    appearance.hiddenGroups = [...set];
    persistAll();
  },

  setFeedAutoSort(v: boolean) {
    appearance.feedAutoSort = v;
    persistAll();
  },

  reset(type: ListType) {
    if (type === 'home') {
      appearance.home = FUNCTION_IDS.map((id) => ({ id, visible: DEFAULT_HOME_IDS.includes(id) }));
    } else if (type === 'functions') {
      appearance.functions = FUNCTION_IDS.map((id) => ({ id, visible: true }));
    } else {
      appearance.feed = FEED_IDS.map((id) => ({ id, visible: true }));
      appearance.feedAutoSort = false;
    }
    persistAll();
  },

  resetGroups() {
    appearance.groupOrder = [...DEFAULT_GROUP_ORDER];
    appearance.hiddenGroups = [];
    persistAll();
  },
};

// ---------------------------------------------------------------------------
// 派生数据
// ---------------------------------------------------------------------------

/** 首页可见的快捷入口（按用户顺序；隐藏项不进首页） */
export const visibleHomeFunctions = computed(() => {
  const map = new Map(ALL_FUNCTIONS.map((f) => [f.id, f]));
  return appearance.home
    .filter((e) => e.visible)
    .map((e) => map.get(e.id))
    .filter((x): x is (typeof ALL_FUNCTIONS)[number] => Boolean(x))
    .filter((f) => isFunctionVisible(f));
});

/** 信息流可见区块 id（按用户顺序） */
export const visibleFeedIds = computed(() =>
  appearance.feed.filter((e) => e.visible).map((e) => e.id),
);

/** 功能页分组（按用户大类顺序 + 隐藏大类过滤 + 组内按 ids 固定顺序展示） */
export const visibleFunctionGroups = computed(() => {
  const map = new Map(ALL_FUNCTIONS.map((f) => [f.id, f]));
  const hidden = new Set(appearance.hiddenGroups);
  const groups = appearance.groupOrder
    .map((gid) => FUNCTION_GROUPS.find((g) => g.id === gid))
    .filter((g): g is (typeof FUNCTION_GROUPS)[number] => Boolean(g));

  return groups
    .filter((g) => !hidden.has(g.id))
    .map((g) => ({
      group: g,
      items: g.ids
        .map((id) => map.get(id))
        .filter((x): x is (typeof ALL_FUNCTIONS)[number] => Boolean(x))
        .filter((f) => isFunctionVisible(f)),
    }))
    .filter((entry) => entry.items.length > 0);
});

/**
 * 排序与隐藏页的可编辑清单（含隐藏项）。
 *
 * 站外小程序入口在功能页不露出，但**仍然列在设置里**：这样 id 不会因为
 * 「页面上看不到」而被当成失效配置清掉，将来放开也只改 `hidden` 一处。
 */
export const reorderableItems = computed(() => {
  const map = new Map(ALL_FUNCTIONS.map((f) => [f.id, f]));
  return appearance.functions
    .map((e) => map.get(e.id))
    .filter((x): x is (typeof ALL_FUNCTIONS)[number] => Boolean(x));
});

/** 首页按钮的可编辑清单（同样含隐藏项，避免配置丢失） */
export const reorderableHomeItems = computed(() => {
  const map = new Map(ALL_FUNCTIONS.map((f) => [f.id, f]));
  return appearance.home
    .map((e) => map.get(e.id))
    .filter((x): x is (typeof ALL_FUNCTIONS)[number] => Boolean(x));
});
