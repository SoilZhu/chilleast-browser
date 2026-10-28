<template>
  <!-- ===================================================================
       图书馆首页（对应原版 library_home_screen.dart）
       自上而下的顺序与原版完全一致：
         1. 当前预约看板（有预约才显示；待签到给「取消预约 + 签到」，已入座给「退座」）
         2. 快速预约入口
         3. 预约选座入口
         4. 图书查询入口
         5. 近期预约记录（顶格标题 + 无卡片列表，空预约时每条带「预约」按钮）
       =================================================================== -->
  <div class="space-y-5">
    <PageHeader title="图书馆">
      <template #actions>
        <button class="md-icon-btn" title="刷新" :disabled="loading" @click="loadData">
          <Icon name="refresh" size="md" :class="{ 'animate-spin': loading }" />
        </button>
      </template>
    </PageHeader>

    <!-- 动作反馈 -->
    <Alert
      v-if="notice"
      :kind="notice.kind"
      :text="notice.text"
      action-text="关闭"
      @action="notice = null"
    />

    <!-- 加载态 -->
    <div v-if="loading && !loaded" class="space-y-3 py-8">
      <div v-for="i in 3" :key="i" class="space-y-1.5">
        <div class="md-skeleton h-4 w-28" />
        <div class="md-skeleton h-3 w-48" />
      </div>
    </div>

    <!-- 加载失败 -->
    <EmptyState
      v-else-if="loadError"
      :text="loadError"
      icon="book"
      error
      retry-text="重新加载"
      @retry="loadData"
    />

    <template v-else>
      <!-- ============ 1. 当前预约（每一条一张便签卡）============ -->
      <NoteCard
        v-for="reserve in activeReserves"
        :key="reserve.id"
        :title="`座位号 ${reserve.seatNum}`"
        :meta="reserveStatusLabel(reserve.status)"
      >
        <div class="min-w-0">
          <div class="text-md2-body1 text-md-text-high">{{ fullRoomName(reserve) }}</div>
          <div class="flex items-center gap-1.5 text-md2-caption text-md-text-medium mt-1.5 tabular-nums">
            <Icon name="clock" size="xs" />
            <span>{{ reserve.today }} {{ formatEpochHHmm(reserve.startTime) }} - {{ formatEpochHHmm(reserve.endTime) }}</span>
          </div>
        </div>

        <div class="flex items-center justify-end gap-1.5 mt-3 pt-3 md-feed-divider">
          <!-- 已入座（使用中 / 暂离中 / 可签到）只给退座；待签到给取消 + 签到 -->
          <button
            v-if="canSignBack(reserve.status)"
            class="md-btn-danger"
            :disabled="busy"
            @click="askSignBack(reserve)"
          >
            <Icon name="log-out" size="sm" />
            退座
          </button>
          <template v-else>
            <button class="md-btn-text" :disabled="busy" @click="askCancel(reserve)">
              取消预约
            </button>
            <button class="md-btn-filled" :disabled="busy" @click="doSignIn(reserve)">
              <Icon :name="busy ? 'refresh' : 'check-circle'" size="sm" :class="{ 'animate-spin': busy }" />
              签到
            </button>
          </template>
        </div>
      </NoteCard>

      <!-- ============ 2-4. 三个入口（卡片形式）============ -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          v-for="entry in ENTRIES"
          :key="entry.id"
          type="button"
          class="md-card-interactive flex items-center justify-between p-4 w-full text-left"
          @click="openEntry(entry.id)"
        >
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-6 h-6 shrink-0 flex items-center justify-center text-md-primary">
              <Icon :name="entry.icon" size="md" />
            </span>
            <span class="text-md2-body1 text-md-text-high font-medium truncate">{{ entry.label }}</span>
          </div>
          <Icon name="chevron-right" size="sm" class="text-md-text-hint shrink-0" />
        </button>
      </div>

      <!-- ============ 5. 近期预约记录（卡片形式）============ -->
      <NoteCard
        title="近期预约记录"
        :meta="nearReserves.length ? `共 ${nearReserves.length} 条` : ''"
        :flush="true"
      >
        <EmptyState v-if="nearReserves.length === 0" text="暂无历史预约记录" icon="book" compact />

        <div v-else class="md-feed-list">
          <div
            v-for="item in nearReserves"
            :key="item.id"
            class="md-feed-row items-center justify-between gap-3"
          >
            <div class="min-w-0 flex-1">
              <div class="text-md2-subtitle2 text-md-text-high tabular-nums">{{ item.seatNum }}</div>
              <div class="text-md2-body2 text-md-text-high mt-0.5 truncate">{{ fullRoomName(item) }}</div>
              <div class="text-md2-caption text-md-text-medium mt-0.5 tabular-nums">
                {{ item.today }} {{ formatEpochHHmm(item.startTime) }} - {{ formatEpochHHmm(item.endTime) }}
              </div>
            </div>
            <button
              v-if="activeReserves.length === 0"
              type="button"
              class="md-btn-outlined shrink-0"
              :disabled="busy"
              @click="openQuickReserve(item)"
            >
              预约
            </button>
          </div>
        </div>
      </NoteCard>
    </template>

    <!-- 二次确认：退座 / 取消预约 -->
    <div
      v-if="confirming"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="confirming = null"
    >
      <div class="md-dialog rounded-md2-md w-full max-w-sm">
        <div class="md-dialog-header">
          <h3 class="md-dialog-title">
            {{ confirming.kind === 'signBack' ? '确认退座？' : '确认取消预约？' }}
          </h3>
        </div>
        <div class="md-dialog-body border-t border-md-card-border pt-4">
          <p class="text-md2-body2 text-md-text-medium">
            {{
              confirming.kind === 'signBack'
                ? `确定结束在【${confirming.reserve.thirdLevelName}】的 ${confirming.reserve.seatNum} 号座位使用吗？`
                : `确定取消在【${confirming.reserve.thirdLevelName}】的 ${confirming.reserve.seatNum} 号座位预约吗？`
            }}
          </p>
        </div>
        <div class="md-dialog-actions border-t border-md-card-border">
          <button type="button" class="md-btn-text" @click="confirming = null">再想想</button>
          <button type="button" class="md-btn-danger" :disabled="busy" @click="runConfirm">
            {{ confirming.kind === 'signBack' ? '确认退座' : '确认取消' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 从历史记录一键再约（原版 showLibraryQuickReserveSheet） -->
    <QuickReserveSheet
      v-if="quickTarget"
      :item="quickTarget"
      @close="quickTarget = null"
      @confirm="submitQuickReserve"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
import PageHeader from '../ui/PageHeader.vue';
import SectionHeader from '../ui/SectionHeader.vue';
import NoteCard from '../ui/NoteCard.vue';
import EmptyState from '../ui/EmptyState.vue';
import Alert from '../ui/Alert.vue';
import QuickReserveSheet from './QuickReserveSheet.vue';
import {
  canSignBack,
  cancelLibraryReservation,
  fetchLibrarySeats,
  fullRoomName,
  reserveLibrarySeat,
  reserveStatusLabel,
  signBackSeat,
  signInSeat,
  type SeatReserveItem,
} from '../../api/library';
import { formatEpochHHmm } from '../../utils/library-time';

const emit = defineEmits<{
  (e: 'open-book-search'): void;
  (e: 'open-room'): void;
  (e: 'open-quick'): void;
}>();

const ENTRIES = [
  { id: 'quick', label: '快速预约', icon: 'zap' },
  { id: 'room', label: '预约选座', icon: 'room' },
  { id: 'book', label: '图书查询', icon: 'book' },
] as const;

function openEntry(id: string) {
  if (id === 'quick') {
    emit('open-quick');
    return;
  }
  if (id === 'room') {
    emit('open-room');
    return;
  }
  emit('open-book-search');
}

// ---------------------------------------------------------------------------
// 数据
// ---------------------------------------------------------------------------

const activeReserves = ref<SeatReserveItem[]>([]);
const nearReserves = ref<SeatReserveItem[]>([]);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref('');
const busy = ref(false);
const notice = ref<{ kind: 'success' | 'error' | 'warning'; text: string } | null>(null);

function toast(kind: 'success' | 'error' | 'warning', text: string) {
  notice.value = { kind, text };
}

/** 把后端错误里的前缀剥掉，只留人能读的那句。 */
function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/^.*?:\s*/, '')
    .replace(/\s*\(code:.*\)$/, '')
    .trim();
}

async function loadData() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await fetchLibrarySeats();
    activeReserves.value = res?.index?.curReserves ?? [];
    nearReserves.value = res?.index?.nearReserves ?? [];
  } catch (error) {
    loadError.value = errorText(error) || '加载失败，请检查网络后重试';
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

/** 动作完成后同时刷新本页与首页信息流的图书馆卡片。 */
async function refreshAll() {
  await loadData();
  window.dispatchEvent(new CustomEvent('chilleast:library-changed'));
}

// ---------------------------------------------------------------------------
// 签到 / 退座 / 取消
// ---------------------------------------------------------------------------

async function doSignIn(reserve: SeatReserveItem) {
  busy.value = true;
  try {
    await signInSeat({ id: reserve.id, roomId: reserve.roomId, seatNum: reserve.seatNum });
    toast('success', '签到成功，祝您学习愉快');
    await refreshAll();
  } catch (error) {
    toast('error', `签到失败：${errorText(error)}`);
  } finally {
    busy.value = false;
  }
}

type ConfirmKind = 'signBack' | 'cancel';
const confirming = ref<{ kind: ConfirmKind; reserve: SeatReserveItem } | null>(null);

function askSignBack(reserve: SeatReserveItem) {
  confirming.value = { kind: 'signBack', reserve };
}

function askCancel(reserve: SeatReserveItem) {
  confirming.value = { kind: 'cancel', reserve };
}

async function runConfirm() {
  if (!confirming.value) return;
  const { kind, reserve } = confirming.value;
  busy.value = true;
  try {
    if (kind === 'signBack') {
      await signBackSeat({ id: reserve.id });
      toast('success', '退座成功');
    } else {
      await cancelLibraryReservation(reserve.id);
      toast('success', '已取消预约');
    }
    confirming.value = null;
    await refreshAll();
  } catch (error) {
    toast('error', `${kind === 'signBack' ? '退座' : '取消'}失败：${errorText(error)}`);
  } finally {
    busy.value = false;
  }
}

// ---------------------------------------------------------------------------
// 从历史记录一键再约
// ---------------------------------------------------------------------------

const quickTarget = ref<SeatReserveItem | null>(null);

function openQuickReserve(item: SeatReserveItem) {
  if (activeReserves.value.length > 0) {
    toast('warning', '已有进行中的预约，请先退座或取消');
    return;
  }
  quickTarget.value = item;
}

async function submitQuickReserve(value: { day: string; startTime: string; endTime: string }) {
  const item = quickTarget.value;
  if (!item) return;
  busy.value = true;
  try {
    await reserveLibrarySeat({
      roomId: item.roomId,
      seatNum: item.seatNum,
      day: value.day,
      startTime: value.startTime,
      endTime: value.endTime,
      firstLevelName: item.firstLevelName,
      secondLevelName: item.secondLevelName,
      thirdLevelName: item.thirdLevelName,
    });
    quickTarget.value = null;
    toast('success', '预约成功，请按时签到');
    await refreshAll();
  } catch (error) {
    toast('error', `预约失败：${errorText(error)}`);
  } finally {
    busy.value = false;
  }
}

onMounted(loadData);

defineExpose({ loadData });
</script>
