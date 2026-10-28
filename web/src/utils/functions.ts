/**
 * 功能分类与项目定义
 *
 * 分组顺序 = FUNCTION_GROUPS 常量顺序，组内顺序 = ids 数组顺序。
 *
 * ---------------------------------------------------------------------------
 * 与原版 App 的差异（网页版刻意为之，不要"修回去"）
 * ---------------------------------------------------------------------------
 * 1. **付款码 / 校园卡充值已移除**。这两项依赖原生 SDK 唤起微信/支付宝或展示
 *    动态二维码，网页端做不了，也不该假装能做。`payment_code` / `recharge`
 *    两个 id 不再出现。
 * 2. **电费充值保留，且走校园卡余额支付**（对齐原版 `_handleCampusCardRecharge`
 *    的 payWay=2）。原版还提供微信/支付宝两种第三方支付，网页版不提供。
 * 3. **跳转站外的小程序入口全部隐藏**。原版用 WebView 内嵌这些站点（办事大厅 /
 *    学工系统 / 教评 / 场馆预约 / 校园卡 / 更多小程序），网页端无法内嵌，只能
 *    `window.open` 到站外 —— 这与"网页版即开即用"的定位相悖，因此**只隐藏入口，
 *    不删除定义**：`hidden: true` 的项仍留在 ALL_FUNCTIONS 里，外观设置页的
 *    排序清单可以照常列出它们（用户不会看到入口，但 id 不会因为消失而丢配置）。
 */

/** 点击一个功能入口后会发生什么 */
export type FunctionAction =
  | { kind: 'tab'; tab: string }
  | { kind: 'modal'; modal: ModalKind }
  | { kind: 'external'; url: string };

/** 网页版保留的弹窗类功能 */
export type ModalKind = 'vpn' | 'bus' | 'payment';

export interface FunctionItemDef {
  /** 稳定 id，勿随意变更 */
  id: string;
  name: string;
  /** 所属分组 id */
  groupId: string;
  icon: string;
  /** 强调色（Material 600 档） */
  color: string;
  description: string;
  action: FunctionAction;
  /** 是否需要在未登录时拦截 */
  requiresAuth: boolean;
  /**
   * 不在界面上露出（但保留定义与配置）。
   * 站外小程序入口走这个标记 —— 见文件头注释第 3 条。
   */
  hidden?: boolean;
}

export interface FunctionGroupDef {
  /** 稳定 id，对应分组名称 */
  id: string;
  name: string;
  icon: string;
  color: string;
  /** 组内成员 id，顺序固定 */
  ids: string[];
}

// ---------------------------------------------------------------------------
// 分组（顺序即展示顺序）
// ---------------------------------------------------------------------------

export const FUNCTION_GROUPS: FunctionGroupDef[] = [
  {
    id: 'groupPayment',
    name: '支付',
    icon: 'wallet',
    color: '#ff9800',
    ids: ['payment_code', 'transactions', 'ele_recharge'],
  },
  {
    id: 'groupStudy',
    name: '学习',
    icon: 'graduation-cap',
    color: '#795548',
    ids: ['library', 'empty_classroom', 'score', 'exam'],
  },
  {
    id: 'groupLife',
    name: '生活',
    icon: 'heart',
    color: '#e63476',
    ids: ['repairs', 'leave', 'questionnaire', 'sunshine', 'dormitory'],
  },
  {
    id: 'groupTravel',
    name: '出行',
    icon: 'bus',
    color: '#2196f3',
    ids: ['bus', 'cs_bus', 'campus_bus_route'],
  },
  {
    id: 'groupTools',
    name: '工具',
    icon: 'tool',
    color: '#607d8b',
    ids: ['vpn'],
  },
  {
    id: 'groupMiniApps',
    name: '小程序',
    icon: 'apps',
    color: '#09c489',
    ids: ['info_portal', 'ehall', 'xgxt', 'teaching_eval', 'gym', 'campus_card'],
  },
];

// ---------------------------------------------------------------------------
// 功能项
// ---------------------------------------------------------------------------

const ITEMS: FunctionItemDef[] = [
  // ===== 支付 =====
  {
    id: 'payment_code',
    name: '付款码',
    groupId: 'groupPayment',
    icon: 'qr-code',
    color: '#008268',
    description: '校园卡扫码付款',
    action: { kind: 'modal', modal: 'payment' },
    requiresAuth: true,
  },
  {
    id: 'transactions',
    name: '交易流水',
    groupId: 'groupPayment',
    icon: 'list-ordered',
    color: '#0f9d58',
    description: '校园卡消费与充值记录',
    action: { kind: 'tab', tab: 'transactions' },
    requiresAuth: true,
  },
  {
    id: 'ele_recharge',
    name: '电费充值',
    groupId: 'groupPayment',
    icon: 'zap',
    color: '#fbbc04',
    description: '双宿舍 · 校园卡支付',
    action: { kind: 'tab', tab: 'electricity' },
    requiresAuth: true,
  },
  {
    id: 'recharge',
    name: '校园卡充值',
    groupId: 'groupPayment',
    icon: 'card',
    color: '#008268',
    description: '校园卡线上充值',
    action: {
      kind: 'external',
      url: 'http://fin-serv.hunau.edu.cn/homecx/openCXOAuthPage?urltype=1',
    },
    requiresAuth: true,
    hidden: true,
  },

  // ===== 学习 =====
  {
    id: 'library',
    name: '图书馆',
    groupId: 'groupStudy',
    icon: 'book',
    color: '#795548',
    description: '座位预约与馆藏检索',
    action: { kind: 'tab', tab: 'library' },
    requiresAuth: true,
  },
  {
    id: 'empty_classroom',
    name: '空教室',
    groupId: 'groupStudy',
    icon: 'classroom',
    color: '#9c27b0',
    description: '按节次查空闲教室',
    action: { kind: 'tab', tab: 'classroom' },
    requiresAuth: true,
  },
  {
    id: 'score',
    name: '成绩查询',
    groupId: 'groupStudy',
    icon: 'scores',
    color: '#e63476',
    description: '学期成绩与绩点',
    action: { kind: 'tab', tab: 'scores' },
    requiresAuth: true,
  },
  {
    id: 'exam',
    name: '考试安排',
    groupId: 'groupStudy',
    icon: 'exam',
    color: '#5c6bc0',
    description: '未开考科目与考场',
    action: { kind: 'tab', tab: 'exams' },
    requiresAuth: true,
  },

  // ===== 生活 =====
  {
    id: 'repairs',
    name: '报修平台',
    groupId: 'groupLife',
    icon: 'tool',
    color: '#607d8b',
    description: '宿舍与网络报修',
    action: { kind: 'tab', tab: 'repair' },
    requiresAuth: true,
  },
  {
    id: 'leave',
    name: '请假申请',
    groupId: 'groupLife',
    icon: 'leave',
    color: '#009688',
    description: '事假病假线上申报',
    action: { kind: 'tab', tab: 'leave' },
    requiresAuth: true,
  },
  {
    id: 'questionnaire',
    name: '学工问卷',
    groupId: 'groupLife',
    icon: 'questionnaire',
    color: '#3476e6',
    description: '全校线上问卷',
    action: { kind: 'tab', tab: 'questionnaire' },
    requiresAuth: true,
  },
  {
    id: 'sunshine',
    name: '阳光服务',
    groupId: 'groupLife',
    icon: 'sun',
    color: '#09c489',
    description: '校务信箱与诉求',
    action: { kind: 'tab', tab: 'sunshine' },
    requiresAuth: true,
  },
  {
    id: 'dormitory',
    name: '我的宿舍',
    groupId: 'groupLife',
    icon: 'dormitory',
    color: '#5c6bc0',
    description: '床位与电费信息',
    action: { kind: 'tab', tab: 'dormitory' },
    requiresAuth: true,
  },

  // ===== 出行 =====
  {
    id: 'bus',
    name: '实时校车',
    groupId: 'groupTravel',
    icon: 'bus',
    color: '#34e676',
    description: '校内班车到站时间',
    action: { kind: 'external', url: 'https://bus.jingzhixx.com/h5/' },
    requiresAuth: false,
  },
  {
    id: 'cs_bus',
    name: '长沙实时公交',
    groupId: 'groupTravel',
    icon: 'bus',
    color: '#2196f3',
    description: '途经农大的公交到站',
    action: { kind: 'external', url: 'https://xlcxweb.busrise.cn/h5/mycs/' },
    requiresAuth: false,
  },
  {
    id: 'campus_bus_route',
    name: '校内公交线路',
    groupId: 'groupTravel',
    icon: 'route',
    color: '#00a86b',
    description: '通勤班车线路图',
    action: { kind: 'tab', tab: 'campus_bus_route' },
    requiresAuth: false,
  },

  // ===== 工具 =====
  {
    id: 'vpn',
    name: 'VPN转换',
    groupId: 'groupTools',
    icon: 'vpn',
    color: '#607d8b',
    description: '校外访问校内站点',
    action: { kind: 'tab', tab: 'vpn' },
    requiresAuth: false,
  },

  // ===== 小程序（全部隐藏：只能跳站外，网页版不露出入口）=====
  {
    id: 'info_portal',
    name: '更多小程序',
    groupId: 'groupMiniApps',
    icon: 'apps',
    color: '#1976d2',
    description: '掌上东湖微应用',
    action: { kind: 'external', url: 'https://portal.hunau.edu.cn/ydd/microService2/toApps2' },
    requiresAuth: true,
    hidden: true,
  },
  {
    id: 'ehall',
    name: '办事大厅',
    groupId: 'groupMiniApps',
    icon: 'building',
    color: '#1e88e5',
    description: '线上办事与审批',
    action: { kind: 'external', url: 'https://ehall.hunau.edu.cn/' },
    requiresAuth: true,
    hidden: true,
  },
  {
    id: 'xgxt',
    name: '学工系统',
    groupId: 'groupMiniApps',
    icon: 'clipboard',
    color: '#3476e6',
    description: '学生事务与资助',
    action: { kind: 'external', url: 'https://xgxt.hunau.edu.cn/wap/main/welcome' },
    requiresAuth: true,
    hidden: true,
  },
  {
    id: 'teaching_eval',
    name: '教评系统',
    groupId: 'groupMiniApps',
    icon: 'message',
    color: '#00bcd4',
    description: '课程教学质量评教',
    action: {
      kind: 'external',
      url: 'https://v1.chaoxing.com/appInter/openPcApp?mappId=8056745',
    },
    requiresAuth: true,
    hidden: true,
  },
  {
    id: 'gym',
    name: '场馆预约',
    groupId: 'groupMiniApps',
    icon: 'activity',
    color: '#e91e63',
    description: '体育馆场地预约',
    action: {
      kind: 'external',
      url: 'https://reserve.chaoxing.com/front/web/apps/reservepc/index?reserveId=14191&fidEnc=a915b52ee0aa18ad',
    },
    requiresAuth: true,
    hidden: true,
  },
  {
    id: 'campus_card',
    name: '校园卡',
    groupId: 'groupMiniApps',
    icon: 'card',
    color: '#008268',
    description: '校园卡线上服务',
    action: {
      kind: 'external',
      url: 'http://fin-serv.hunau.edu.cn/homecx/openCXOAuthPage?urltype=1',
    },
    requiresAuth: true,
    hidden: true,
  },
];

export const ALL_FUNCTIONS: FunctionItemDef[] = ITEMS;

const ITEM_MAP = new Map(ITEMS.map((item) => [item.id, item]));

export function getFunction(id: string): FunctionItemDef | undefined {
  return ITEM_MAP.get(id);
}

/** 是否需要在界面上露出这个入口 */
export function isFunctionVisible(item: FunctionItemDef | undefined): boolean {
  return Boolean(item) && item?.hidden !== true;
}

/** 按分组顺序返回 [{ group, items }]，组内按 ids 顺序；隐藏项与空分组都被过滤 */
export function groupedFunctions(): Array<{ group: FunctionGroupDef; items: FunctionItemDef[] }> {
  return FUNCTION_GROUPS.map((group) => ({
    group,
    items: group.ids
      .map((id) => ITEM_MAP.get(id))
      .filter((x): x is FunctionItemDef => Boolean(x))
      .filter((item) => isFunctionVisible(item)),
  })).filter((entry) => entry.items.length > 0);
}

// ---------------------------------------------------------------------------
// 一级 Tab（底部导航的 5 个页面）
// ---------------------------------------------------------------------------

export interface NavTab {
  id: string;
  label: string;
  icon: string;
}

export const NAV_TABS: NavTab[] = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'timetable', label: '课表', icon: 'calendar' },
  { id: 'homework', label: '作业', icon: 'tasks' },
  { id: 'notice', label: '通知', icon: 'inbox' },
  { id: 'functions', label: '功能', icon: 'dashboard' },
];

/** 导航文案的 i18n key（与 NAV_TABS 的 id 对应） */
export const NAV_TAB_I18N: Record<string, string> = {
  home: 'nav.home',
  timetable: 'nav.timetable',
  homework: 'nav.homework',
  notice: 'nav.notice',
  functions: 'nav.functions',
};

// ---------------------------------------------------------------------------
// 抽屉（导航）里的二级页面
//
// 抽屉是「导航」而不是「目录」：只放**独立页面**。
// 弹窗（VPN/校车）和外部小程序都不进抽屉 —— 它们在「功能」页里。
// ---------------------------------------------------------------------------

export interface SubPage {
  /** 目标页面 id（对应 MainView 的 currentTab） */
  id: string;
  label: string;
  icon: string;
  /** 分组名，需与 SUB_PAGE_GROUPS 中某一项一致 */
  group: string;
}

export const SUB_PAGE_GROUPS = ['学习', '生活', '设置'] as const;

export const SUB_PAGES: SubPage[] = [
  // ===== 学习 =====
  { id: 'scores', label: '成绩查询', icon: 'scores', group: '学习' },
  { id: 'exams', label: '考试安排', icon: 'exam', group: '学习' },
  { id: 'library', label: '图书馆', icon: 'book', group: '学习' },
  { id: 'classroom', label: '空教室', icon: 'classroom', group: '学习' },

  // ===== 生活 =====
  { id: 'campus', label: '校园卡', icon: 'card', group: '生活' },
  { id: 'electricity', label: '电费充值', icon: 'zap', group: '生活' },
  { id: 'sunshine', label: '阳光服务', icon: 'sun', group: '生活' },
  { id: 'repair', label: '报修平台', icon: 'tool', group: '生活' },
  { id: 'leave', label: '请假申请', icon: 'leave', group: '生活' },
  { id: 'questionnaire', label: '学工问卷', icon: 'questionnaire', group: '生活' },
  { id: 'dormitory', label: '我的宿舍', icon: 'dormitory', group: '生活' },
  { id: 'transactions', label: '交易流水', icon: 'list-ordered', group: '生活' },

  // ===== 设置 =====
  { id: 'settings', label: '设置', icon: 'settings', group: '设置' },
  { id: 'about', label: '关于', icon: 'info', group: '设置' },
  { id: 'help', label: '帮助与反馈', icon: 'help-circle', group: '设置' },
  { id: 'profile', label: '个人中心', icon: 'user', group: '设置' },
];

/** 按 SUB_PAGE_GROUPS 顺序聚合，保持组内原始顺序 */
export function groupedSubPages(): Array<{ name: string; pages: SubPage[] }> {
  return SUB_PAGE_GROUPS.map((name) => ({
    name,
    pages: SUB_PAGES.filter((page) => page.group === name),
  })).filter((entry) => entry.pages.length > 0);
}

// ---------------------------------------------------------------------------
// 设置页的二级页面（设置页主从分栏的右栏）
// ---------------------------------------------------------------------------

export interface SettingsPageDef {
  id: string;
  label: string;
  icon: string;
}

/**
 * 顺序对应原版 App 的 settings_screen.dart（网页版未接入 AI Agent 助手，不展示 Agent 设置）：
 * 语言 → 外观 → 小组件 → 通知 → 课表 → 数据
 */
export const SETTINGS_PAGES: SettingsPageDef[] = [
  { id: 'language', label: '语言', icon: 'translate' },
  { id: 'appearance', label: '外观', icon: 'palette' },
  { id: 'widget', label: '小组件', icon: 'widgets' },
  { id: 'notification', label: '通知', icon: 'bell-ring' },
  { id: 'timetable-settings', label: '课表', icon: 'calendar' },
  { id: 'data', label: '数据', icon: 'database' },
];
