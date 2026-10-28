/**
 * 图标语义名 → Material Icons 字形名
 * ----------------------------------------------------------------------------
 * 全站只写语义名（`home` / `tasks` / `map-pin`），渲染层统一走 Material Icons
 * 字体。这样视觉风格与 Google Keep / Gmail 一致（MD2 线性图标），
 * 换字形时只改这张表，不动 44 个页面组件。
 *
 * 字形名必须存在于 Material Icons 字体中（构建期由 `scripts/icon-lint.mjs`
 * 校验，缺字形会直接报错）。
 */

/** 每个语义名的配置：Material 字形名 + 是否默认用实心（filled）变体 */
export interface IconDef {
  /** Material Icons 字形名，如 `event_note` */
  glyph: string;
  /** 默认使用 filled 变体（选中态、强调、实心徽章等） */
  filled?: boolean;
}

export const ICON_MAP: Record<string, IconDef> = {
  // ---------- 导航 ----------
  home: { glyph: 'home' },
  dashboard: { glyph: 'dashboard' },
  inbox: { glyph: 'inbox' },
  menu: { glyph: 'menu' },
  close: { glyph: 'close' },
  grid: { glyph: 'grid_view' },
  list: { glyph: 'view_list' },
  apps: { glyph: 'apps' },
  settings: { glyph: 'settings' },
  more: { glyph: 'more_horiz' },
  logout: { glyph: 'logout' },
  'log-out': { glyph: 'logout' },
  user: { glyph: 'person_outline' },

  // ---------- 通用动作 ----------
  search: { glyph: 'search' },
  refresh: { glyph: 'refresh' },
  'refresh-cw': { glyph: 'refresh' },
  /** 调课（对调 / 平移） */
  swap: { glyph: 'swap_horiz' },
  /** 调课规则管理 */
  rule: { glyph: 'rule_folder' },
  /** 加课 */
  'add-circle': { glyph: 'add_circle_outline' },
  /** 作业「存档」档 */
  archive: { glyph: 'archive' },
  unarchive: { glyph: 'unarchive' },
  inventory: { glyph: 'inventory_2' },
  /** 日程里的考试 / 作业标记 */
  quiz: { glyph: 'quiz' },
  'assignment-late': { glyph: 'assignment_late' },
  check: { glyph: 'check' },
  done: { glyph: 'check' },
  'check-circle': { glyph: 'check_circle_outline' },
  plus: { glyph: 'add' },
  minus: { glyph: 'remove' },
  copy: { glyph: 'content_copy' },
  layers: { glyph: 'layers' },
  rss: { glyph: 'rss_feed' },
  edit: { glyph: 'edit' },
  trash: { glyph: 'delete_outline' },
  filter: { glyph: 'filter_list' },
  external: { glyph: 'open_in_new' },
  'external-link': { glyph: 'open_in_new' },
  link: { glyph: 'link' },
  eye: { glyph: 'visibility' },
  'eye-off': { glyph: 'visibility_off' },
  upload: { glyph: 'file_upload' },
  download: { glyph: 'file_download' },
  sort: { glyph: 'sort' },
  pin: { glyph: 'push_pin' },
  star: { glyph: 'star_border' },

  // ---------- 箭头 ----------
  'chevron-left': { glyph: 'chevron_left' },
  'chevron-right': { glyph: 'chevron_right' },
  'chevron-down': { glyph: 'expand_more' },
  'chevron-up': { glyph: 'expand_less' },
  'arrow-left': { glyph: 'arrow_back' },
  'arrow-right': { glyph: 'arrow_forward' },
  'arrow-up': { glyph: 'arrow_upward' },
  'arrow-down': { glyph: 'arrow_downward' },

  // ---------- 学业 ----------
  calendar: { glyph: 'calendar_today' },
  'calendar-check': { glyph: 'event_available' },
  scores: { glyph: 'grading' },
  tasks: { glyph: 'assignment' },
  exam: { glyph: 'event_note' },
  book: { glyph: 'menu_book' },
  classroom: { glyph: 'meeting_room' },
  /** 阅览室 / 自习室（图书馆预约选座） */
  room: { glyph: 'meeting_room' },
  /** 座位（图书馆座位图与快速预约） */
  'event-seat': { glyph: 'event_seat' },
  /** 楼层筛选 */
  floor: { glyph: 'layers' },
  clipboard: { glyph: 'content_paste' },
  'file-text': { glyph: 'description' },
  file: { glyph: 'insert_drive_file' },
  folder: { glyph: 'folder' },

  // ---------- 校园生活 ----------
  card: { glyph: 'credit_card' },
  'qr-code': { glyph: 'qr_code_2' },
  wallet: { glyph: 'account_balance_wallet' },
  zap: { glyph: 'bolt' },
  sun: { glyph: 'wb_sunny' },
  moon: { glyph: 'dark_mode' },
  bulb: { glyph: 'lightbulb' },
  bell: { glyph: 'notifications_none' },
  tool: { glyph: 'build' },
  dormitory: { glyph: 'hotel' },
  leave: { glyph: 'event_busy' },
  questionnaire: { glyph: 'quiz' },
  'graduation-cap': { glyph: 'school' },
  building: { glyph: 'apartment' },
  campus: { glyph: 'location_city' },

  // ---------- 出行 ----------
  bus: { glyph: 'directions_bus' },
  route: { glyph: 'alt_route' },
  'map-pin': { glyph: 'place' },
  clock: { glyph: 'schedule' },

  // ---------- 云 / 安全 ----------
  cloud: { glyph: 'cloud' },
  database: { glyph: 'storage' },
  lock: { glyph: 'lock' },
  shield: { glyph: 'shield' },
  vpn: { glyph: 'vpn_key' },
  wifi: { glyph: 'wifi' },

  // ---------- 提示 ----------
  info: { glyph: 'info' },
  warning: { glyph: 'warning' },
  error: { glyph: 'error' },
  'help-circle': { glyph: 'help' },

  // ---------- 其他 ----------
  tag: { glyph: 'label' },
  camera: { glyph: 'photo_camera' },
  phone: { glyph: 'call' },
  mail: { glyph: 'mail' },
  image: { glyph: 'image' },
  'thumbs-up': { glyph: 'thumb_up' },
  message: { glyph: 'message' },
  miniapp: { glyph: 'widgets' },
  parking: { glyph: 'local_parking' },
  'trending-up': { glyph: 'trending_up' },
  activity: { glyph: 'timeline' },

  // ---------- 设置 / 个性化 ----------
  palette: { glyph: 'palette' },
  globe: { glyph: 'language' },
  code: { glyph: 'code' },
  rocket: { glyph: 'rocket_launch' },
  /** 仓库入口：Material 没有品牌图，用 `fork_right` 表示「代码分叉」 */
  github: { glyph: 'fork_right' },
  translate: { glyph: 'translate' },
  widgets: { glyph: 'widgets' },
  sliders: { glyph: 'tune' },
  'bell-ring': { glyph: 'notifications_active' },
  'bell-off': { glyph: 'notifications_off' },
  'drag-handle': { glyph: 'drag_indicator' },
  heart: { glyph: 'favorite_border' },
  'list-ordered': { glyph: 'format_list_numbered' },
  'layout-grid': { glyph: 'grid_view' },

  // ---------- 表单控件（供 checkbox / radio / select 使用）----------
  'checkbox-on': { glyph: 'check_box', filled: true },
  'checkbox-off': { glyph: 'check_box_outline_blank' },
  'radio-on': { glyph: 'radio_button_checked', filled: true },
  'radio-off': { glyph: 'radio_button_unchecked' },
  'select-arrow': { glyph: 'arrow_drop_down', filled: true },
};

/** 默认图标（找不到名字时兜底，不显示空白） */
export const FALLBACK_ICON: IconDef = { glyph: 'help' };
