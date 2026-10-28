<template>
  <!-- ===================================================================
       通知公告（对齐 App 的 notice_list_screen.dart）
       - 数据来自 useNotices 单例：游标分页 + 触底 200px 自动加载
       - 宽屏：左侧通知列表（自己的滚动容器）+ 右侧详情（主从分栏）
       - 窄屏：点开走全屏详情（由父级处理），滚动监听 window
       列表项：发送者首字母头像 + 发送者 + 时间 + 标题 + 正文摘要
       未读态：发送者名与标题加粗（对齐原版 fontWeight.bold）
       列表内**不画分割线**：整块是一张白卡，行与行只靠内边距拉开距离
       =================================================================== -->
  <div class="space-y-4">
    <PageHeader title="通知公告">
      <template #actions>
        <button class="md-icon-btn" title="刷新" :disabled="noticeLoading" @click="onRefresh">
          <Icon name="refresh" size="md" :class="{ 'animate-spin': noticeLoading }" />
        </button>
      </template>
    </PageHeader>

    <!-- ============ 首屏骨架 ============ -->
    <div
      v-if="noticeLoading && notices.length === 0"
      class="md-feed-card"
      aria-busy="true"
      aria-label="通知加载中"
    >
      <div
        v-for="i in 6"
        :key="i"
        class="md-feed-row items-start"
      >
        <div class="md-skeleton w-10 h-10 rounded-full shrink-0" />
        <div class="min-w-0 flex-1 py-1 space-y-2">
          <div class="md-skeleton h-3 w-24" />
          <div class="md-skeleton h-3 w-3/4" />
          <div class="md-skeleton h-2.5 w-1/2" />
        </div>
      </div>
    </div>

    <!-- ============ 空状态 / 加载失败 ============ -->
    <div v-else-if="filtered.length === 0">
      <EmptyState
        v-if="noticeError && notices.length === 0"
        :text="noticeError"
        icon="error"
        error
        retry-text="重试"
        @retry="onRefresh"
      />
      <EmptyState
        v-else
        :text="notices.length === 0 ? '暂无通知' : '没有匹配的通知'"
        icon="inbox"
      />
    </div>

    <!-- ============ 主从分栏 ============ -->
    <MasterDetail
      v-else
      :has-detail="isWide && Boolean(selected)"
      detail-title="通知详情"
      detail-split-class="w-[46%] shrink-0"
      @close="selectedKey = ''"
    >
      <!-- ============ 左：通知列表（宽屏自带滚动容器，整块一张白卡，行间无分割线）============ -->
      <div
        ref="listEl"
        :class="[
          'md-feed-card',
          isWide ? 'overflow-y-auto max-h-[calc(100vh-12rem)]' : 'overflow-hidden',
        ]"
        @scroll.passive="onListScroll"
      >
        <button
          v-for="(n, idx) in filtered"
          :key="noticeKey(n) || `idx-${idx}`"
          :class="[
            'md-feed-row items-start py-3.5',
            selectedKey === noticeKey(n) ? 'bg-brand-50 hover:bg-brand-100' : '',
          ]"
          @click="open(n)"
        >
          <span
            class="w-10 h-10 rounded-full text-white text-[15px] font-medium flex items-center justify-center shrink-0"
            :style="{ backgroundColor: avatarColor(n.sender) }"
          >
            {{ avatarLetter(n) }}
          </span>

          <div class="min-w-0 flex-1">
            <!-- 发送者 + 时间 -->
            <div class="flex items-baseline justify-between gap-3">
              <span
                :class="[
                  'text-md2-subtitle2 truncate',
                  isUnread(n) ? 'text-md-text-high font-bold' : 'text-md-text-medium font-normal',
                ]"
              >
                {{ n.sender || '系统通知' }}
              </span>
              <span class="text-md2-caption text-md-text-disabled shrink-0 tabular-nums">
                {{ shortTime(n.date) }}
              </span>
            </div>

            <!-- 标题 -->
            <div
              :class="[
                'text-md2-body2 mt-0.5 line-clamp-1',
                isUnread(n) ? 'text-md-text-high font-bold' : 'text-md-text-medium font-normal',
              ]"
            >
              {{ n.title }}
            </div>

            <!-- 正文摘要 -->
            <div class="text-md2-caption text-md-text-medium mt-0.5 line-clamp-1">
              {{ stripHtml(n.content) || '暂无正文内容' }}
            </div>
          </div>
        </button>

        <!-- 列表底部：加载更多 / 加载失败 / 没有更多 -->
        <div
          v-if="noticeLoadingMore"
          class="flex items-center justify-center gap-2 py-4 text-md2-caption text-md-text-disabled"
          aria-live="polite"
        >
          <Icon name="refresh" size="sm" class="animate-spin" />
          <span>加载中…</span>
        </div>
        <div v-else-if="noticeError" class="flex flex-col items-center gap-1 py-4">
          <span class="text-md2-caption text-md-danger">{{ noticeError }}</span>
          <button class="md-btn-text" @click="onRetry">重试</button>
        </div>
        <div
          v-else-if="!noticeHasMore"
          class="py-4 text-center text-md2-caption text-md-text-disabled"
        >
          没有更多通知了
        </div>
      </div>

      <!-- ============ 右：通知详情 ============ -->
      <template #detail>
        <div v-if="selected" class="md-card p-5 sm:p-6">
          <!-- 详情头：头像 + 发送者 + 时间（与正文靠留白分区，不画分割线） -->
          <div class="flex items-start gap-3">
            <span
              class="w-10 h-10 rounded-full text-white text-[15px] font-medium flex items-center justify-center shrink-0"
              :style="{ backgroundColor: avatarColor(selected.sender) }"
            >
              {{ avatarLetter(selected) }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-md2-subtitle2 text-md-text-high">
                {{ selected.sender || '系统通知' }}
              </div>
              <div class="text-md2-caption text-md-text-disabled tabular-nums mt-0.5">
                {{ selected.date || '' }}
              </div>
            </div>
          </div>

          <!-- 标题 -->
          <h2 class="text-md2-h6 text-md-text-high mt-4 leading-snug">
            {{ selected.title }}
          </h2>

          <!-- 正文 -->
          <div class="mt-3 text-md2-body2 text-md-text-medium whitespace-pre-wrap leading-relaxed">
            {{ stripHtml(selected.content) || '暂无正文内容' }}
          </div>
        </div>
      </template>
    </MasterDetail>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import MasterDetail from '../components/ui/MasterDetail.vue';
import {
  loadMoreNotices,
  markNoticeRead,
  noticeError,
  noticeHasMore,
  noticeLoading,
  noticeLoadingMore,
  notices,
  noticeKey,
  refreshNotices,
  retryNotices,
  ensureNoticesLoaded,
  avatarLetter,
  avatarColor,
  stripHtml,
} from '../composables/useNotices';
import type { NoticeItem } from '../api/campus';

// ---------------------------------------------------------------------------
// 外部接口：只保留 query（顶部搜索框），数据全部走 useNotices 单例
// ---------------------------------------------------------------------------
const props = withDefaults(
  defineProps<{
    query?: string;
  }>(),
  {
    query: '',
  },
);

const emit = defineEmits<{
  (e: 'open', notice: NoticeItem): void;
}>();

// ---------------------------------------------------------------------------
// 响应式：宽屏走分栏，窄屏由父级走全屏
// ---------------------------------------------------------------------------
const isWide = ref(true);
const listEl = ref<HTMLElement | null>(null);

function updateWide() {
  const wide = window.innerWidth >= 1024;
  if (isWide.value && !wide) {
    selectedKey.value = '';
  }
  isWide.value = wide;
}

// ---------------------------------------------------------------------------
// 无限滚动：距底部 200px 内且 hasMore 时自动加载下一页
//   - 宽屏：列表在自己的滚动容器里（listEl）
//   - 窄屏：整页滚动，监听 window
// ---------------------------------------------------------------------------
const BOTTOM_THRESHOLD = 200;

function nearBottomOf(el: HTMLElement): boolean {
  if (el.clientHeight === 0) return false;
  return el.scrollTop + el.clientHeight >= el.scrollHeight - BOTTOM_THRESHOLD;
}

function nearBottomOfWindow(): boolean {
  const doc = document.documentElement;
  return window.scrollY + window.innerHeight >= doc.scrollHeight - BOTTOM_THRESHOLD;
}

/** 触底判定（防重入由 loadMoreNotices 内部保证） */
function maybeLoadMore() {
  if (noticeLoading.value || noticeLoadingMore.value || !noticeHasMore.value) return;
  if (notices.value.length === 0) return;

  const el = listEl.value;
  // 宽屏：列表在自己的滚动容器里；窄屏：整页滚动
  const reached = isWide.value && el ? nearBottomOf(el) : nearBottomOfWindow();
  if (reached) void loadMoreNotices();
}

/** 列表容器滚动（仅宽屏有意义，窄屏该容器不滚） */
function onListScroll() {
  if (!isWide.value) return;
  maybeLoadMore();
}

/** 整页滚动（仅窄屏有意义，宽屏列表不随页面滚动；被隐藏时不触发） */
function onWindowScroll() {
  if (isWide.value) return;
  if (!listEl.value || listEl.value.offsetParent === null) return;
  maybeLoadMore();
}

/**
 * 首屏不足一屏时用户无法滚动，触底事件永远不会触发；
 * 数据变化后补一次判定，把列表填满（hasMore=false 或空页即停）。
 */
function fillViewport() {
  void nextTick(() => maybeLoadMore());
}

// ---------------------------------------------------------------------------
// 选中态：按 key 记录，markRead 替换列表项后仍能对上
// ---------------------------------------------------------------------------
const selectedKey = ref('');

const selected = computed<NoticeItem | null>(() => {
  const key = selectedKey.value;
  if (!key) return null;
  return notices.value.find((n) => noticeKey(n) === key) ?? null;
});

function open(n: NoticeItem) {
  const key = noticeKey(n);
  // 点开即本地标记已读（对齐原版 markAsRead，不调服务端）
  markNoticeRead(key);

  if (isWide.value) {
    selectedKey.value = selectedKey.value === key ? '' : key;
  } else {
    // 交给父级全屏弹窗时用已读后的对象，避免父级拿着旧的 isRead
    emit('open', notices.value.find((x) => noticeKey(x) === key) ?? n);
  }
}

function onRefresh() {
  selectedKey.value = '';
  void refreshNotices();
}

function onRetry() {
  void retryNotices();
}

// 搜索词变化时清掉选中，避免详情与列表不匹配
watch(
  () => props.query,
  () => {
    selectedKey.value = '';
  },
);

// 列表变化后补一次触底判定（首屏不满一屏 / 上一页刚好填满）
watch(() => notices.value.length, fillViewport);
watch(noticeLoading, (v) => {
  if (!v) fillViewport();
});

// ---------------------------------------------------------------------------
// 列表展示
// ---------------------------------------------------------------------------
const filtered = computed(() => {
  const q = props.query.trim().toLowerCase();
  if (!q) return notices.value;
  return notices.value.filter((n) => {
    const hay = `${n.title || ''} ${n.content || ''} ${n.sender || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

/** 未读态（isRead === false 时加粗） */
function isUnread(n: NoticeItem): boolean {
  return n.isRead !== true;
}

/** 今天的只显示时分，其余显示月日（App 的 timeDisplay 逻辑） */
function shortTime(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '';
  const parts = raw.split(' ');
  if (parts.length < 2) return raw;
  const [date, time] = parts;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (date === today) return time.slice(0, 5);
  return date.length >= 5 ? date.slice(5) : date;
}

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------
onMounted(() => {
  updateWide();
  window.addEventListener('resize', updateWide);
  window.addEventListener('scroll', onWindowScroll, { passive: true });
  // 已加载过就直接复用单例里的列表（切 Tab 回来不重拉）
  void ensureNoticesLoaded().then(fillViewport);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateWide);
  window.removeEventListener('scroll', onWindowScroll);
});
</script>
