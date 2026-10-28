/**
 * 通知公告（学习通）—— 游标分页 + 无限滚动
 * ----------------------------------------------------------------------------
 * 完全对齐原版 `notice_provider.dart` 的语义：
 *   - 超星没有页码，只有游标：第一页 `lastValue` 传空串，
 *     后续页传上一页返回的 `lastGetId`；
 *   - `hasMore` 由 `lastGetId` 是否非空决定（空 = 没有更多）；
 *   - `refresh()` 重置游标重新拉第一页；`loadMore()` 追加到尾部；
 *   - 单次失败只写 error，不清空已有列表（避免一断网就把列表刷没）。
 *
 * 模块级单例：通知页与首页「通知」格共用同一份状态，切 Tab 不重复请求。
 */
import { computed, ref } from 'vue';
import { fetchNotices, type NoticeItem, type NoticePage } from '../api/campus';

/** 单页条数（超星默认一页 20 条，与原版一致） */
const PAGE_SIZE = 20;

/** 累积的通知列表（第一页 + 后续所有页） */
export const notices = ref<NoticeItem[]>([]);
/** 首屏 / 刷新中（列表为空时用它显示骨架屏） */
export const noticeLoading = ref(false);
/** 加载更多中（列表底部显示「加载中…」） */
export const noticeLoadingMore = ref(false);
/** 是否还有下一页 */
export const noticeHasMore = ref(true);
/** 最近一次失败的错误文案（成功即清空） */
export const noticeError = ref<string | null>(null);
/** 是否已经尝试过至少一次加载：用来区分「还没拉过」和「确实没有通知」 */
export const noticeLoaded = ref(false);

/** 未读条数（首页「通知」格用） */
export const noticeUnreadCount = computed(
  () => notices.value.filter((n) => n.isRead !== true).length,
);

/** 下一页游标：上一页返回的 lastGetId，空串表示从头开始或没有更多 */
const nextLastValue = ref('');

/** 列表项去重键（超星列表用 uuid，详情/已读接口可能用 idCode） */
export function noticeKey(n: NoticeItem | null | undefined): string {
  if (!n) return '';
  return String(n.uuid || n.idCode || '');
}

/** 错误对象 → 展示文案 */
function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return msg.trim() || '加载失败，请稍后重试';
}

/**
 * 根据返回页更新游标与 hasMore。
 * @param page 服务端返回的一页
 * @param itemCount 这一页实际拿到的条数（空页直接判定没有更多，避免空转）
 */
function applyCursor(page: NoticePage, itemCount: number): void {
  const cursor = typeof page.lastGetId === 'string' ? page.lastGetId : '';
  nextLastValue.value = cursor;
  noticeHasMore.value = cursor !== '' && page.hasMore !== false && itemCount > 0;
}

/** 追加并去重（服务端游标偶尔会重叠返回同一条） */
function appendUnique(list: NoticeItem[]): void {
  if (list.length === 0) return;
  const seen = new Set(notices.value.map((n) => noticeKey(n)));
  const merged = [...notices.value];
  for (const item of list) {
    const key = noticeKey(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(item);
  }
  notices.value = merged;
}

/**
 * 刷新：重置游标，重新拉第一页。
 * 失败时保留旧列表，只写 error（与原版 NoticeNotifier.refresh 一致）。
 */
export async function refreshNotices(): Promise<void> {
  if (noticeLoading.value) return;

  noticeLoading.value = true;
  noticeError.value = null;
  nextLastValue.value = '';
  noticeHasMore.value = true;

  try {
    const page = await fetchNotices('', PAGE_SIZE);
    const list = Array.isArray(page.list) ? page.list : [];
    notices.value = list;
    applyCursor(page, list.length);
  } catch (e) {
    noticeError.value = errorText(e);
  } finally {
    noticeLoading.value = false;
    noticeLoaded.value = true;
  }
}

/**
 * 加载下一页并追加到列表尾部。
 * 加载中 / 没有更多 / 还没有游标时直接返回（防重入、防止重复拉第一页）。
 */
export async function loadMoreNotices(): Promise<void> {
  if (noticeLoading.value || noticeLoadingMore.value || !noticeHasMore.value) return;

  const cursor = nextLastValue.value;
  if (!cursor) return;

  noticeLoadingMore.value = true;
  noticeError.value = null;

  try {
    const page = await fetchNotices(cursor, PAGE_SIZE);
    const list = Array.isArray(page.list) ? page.list : [];
    appendUnique(list);
    applyCursor(page, list.length);
  } catch (e) {
    noticeError.value = errorText(e);
  } finally {
    noticeLoadingMore.value = false;
  }
}

/**
 * 失败后重试：游标还在就接着加载下一页，否则从头刷新。
 * 用于列表底部的「重试」——避免刷新失败后重试按钮变成死键。
 */
export async function retryNotices(): Promise<void> {
  if (nextLastValue.value) await loadMoreNotices();
  else await refreshNotices();
}

/**
 * 首次进入时确保已加载（已加载过或正在加载则跳过）。
 * 与原版页面的 AutomaticKeepAliveClientMixin 行为一致：切 Tab 回来不重拉。
 */
export async function ensureNoticesLoaded(): Promise<void> {
  if (noticeLoaded.value || noticeLoading.value) return;
  await refreshNotices();
}

/** 本地标记已读（不调服务端，与原版 NoticeNotifier.markAsRead 一致） */
export function markNoticeRead(uuid: string): void {
  const id = String(uuid || '');
  if (!id) return;

  let changed = false;
  const next = notices.value.map((n) => {
    if (n.isRead === true) return n;
    if (n.uuid !== id && n.idCode !== id) return n;
    changed = true;
    return { ...n, isRead: true };
  });
  if (changed) notices.value = next;
}

/** 退出登录 / 切换账号时清空（对齐原版 NoticeNotifier.clear） */
export function resetNotices(): void {
  notices.value = [];
  noticeLoading.value = false;
  noticeLoadingMore.value = false;
  noticeHasMore.value = true;
  noticeError.value = null;
  noticeLoaded.value = false;
  nextLastValue.value = '';
}

/** 发送者首字母（App 用 createrName 首字） */
export function avatarLetter(n: NoticeItem | { sender?: string } | null | undefined): string {
  const name = String(n?.sender || '').trim();
  return name ? name.slice(0, 1) : '通';
}

/** 按发送者名生成稳定的头像底色（App 用 hash 取 Colors.primaries） */
export const AVATAR_COLORS = [
  '#1a73e8',
  '#0f9d58',
  '#f29900',
  '#d93025',
  '#9c27b0',
  '#00897b',
  '#5c6bc0',
  '#e63476',
];

export function avatarColor(sender: string | undefined): string {
  const s = String(sender || '通知');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** 去掉 HTML 标签与实体（App 用 RegExp(r'<[^>]*>|&[^;]+;') 清洗） */
export function stripHtml(html: unknown): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;]+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

