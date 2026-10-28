<template>
  <!-- ===================================================================
       座位图（对应原版 library_seat_screen.dart）
       -------------------------------------------------------------------
       原版结构自上而下：
         AppBar（阅览室名 + 刷新座位状态）
         → 顶部时段条（点开时段选择）+ 图例
         → 可缩放座位网格
         → 底部「立即预约」按钮
       网页端顺序一致；底部按钮放右对齐，与其它页面的提交位一致。
       =================================================================== -->
  <div class="flex flex-col min-h-[calc(100vh-9rem)]">
    <PageHeader
      :title="roomDisplayName(room)"
      :subtitle="fullRoomName(room)"
      back
      @back="$emit('back')"
    >
      <template #actions>
        <button class="md-icon-btn" title="刷新座位状态" :disabled="usedLoading" @click="loadUsedSeats">
          <Icon name="refresh" size="md" :class="{ 'animate-spin': usedLoading }" />
        </button>
      </template>
    </PageHeader>

    <!-- 顶部时段条 -->
    <div class="mt-3 mb-3">
      <button
        type="button"
        class="md-row rounded-md2-md bg-brand-50 px-3 py-2.5 text-md-primary"
        @click="pickingTime = true"
      >
        <Icon name="clock" size="sm" class="shrink-0" />
        <span class="text-md2-body2 font-medium tabular-nums flex-1 text-left">
          日期：{{ day }}　|　时段：{{ startTime }} - {{ endTime }}
        </span>
        <Icon
          v-if="usedLoading"
          name="refresh"
          size="sm"
          class="animate-spin shrink-0"
        />
        <Icon v-else name="chevron-right" size="sm" class="shrink-0" />
      </button>
    </div>

    <Alert v-if="actionNotice" :kind="actionNotice.kind" :text="actionNotice.text" />

    <!-- 座位图 -->
    <div v-if="gridLoading" class="flex-1 flex flex-col items-center justify-center gap-2 py-16">
      <Icon name="refresh" size="lg" class="animate-spin text-md-text-hint" />
      <p class="text-md2-body2 text-md-text-medium">正在加载座位分布图…</p>
    </div>

    <EmptyState
      v-else-if="gridError"
      :text="gridError"
      icon="event-seat"
      error
      retry-text="重试"
      @retry="loadGrid"
    />

    <SeatGrid
      v-else-if="grid"
      v-model="selectedSeat"
      :grid="grid"
      :used-seats="usedSeats"
      class="min-h-[420px]"
    />

    <!-- 底部动作条 -->
    <div class="mt-3 pt-3 border-t border-md-card-border flex items-center justify-between gap-3">
      <p class="text-md2-caption text-md-text-medium min-w-0 truncate">
        <template v-if="selectedSeat">
          已选座位 <span class="text-md-text-high font-medium tabular-nums">{{ selectedSeat }}</span>
        </template>
        <template v-else>在图中点选一个座位</template>
      </p>
      <button
        type="button"
        class="md-btn-filled shrink-0"
        :disabled="selectedSeat === null || submitting"
        @click="submit"
      >
        <Icon v-if="submitting" name="refresh" size="sm" class="animate-spin" />
        {{ submitting ? '提交中…' : '立即预约' }}
      </button>
    </div>

    <!-- 时段改选 -->
    <LibraryTimeRangePicker
      v-if="pickingTime"
      :day="day"
      :initial-start-time="startTime"
      :initial-end-time="endTime"
      @close="pickingTime = false"
      @confirm="applyTimeRange"
    />

    <!-- 预约成功 -->
    <div v-if="success" class="md-scrim flex items-center justify-center p-4" @click.self="closeSuccess">
      <div class="md-dialog rounded-md2-md w-full max-w-sm">
        <div class="md-dialog-header">
          <h3 class="md-dialog-title flex items-center gap-2">
            <Icon name="check-circle" size="md" class="text-md-success" />
            预约成功
          </h3>
        </div>
        <div class="md-dialog-body border-t border-md-card-border pt-4 space-y-1.5">
          <p class="text-md2-body2 text-md-text-high">阅览室：{{ roomDisplayName(room) }}</p>
          <p class="text-md2-body2 text-md-text-high tabular-nums">座位号：{{ success.seatNum }}</p>
          <p class="text-md2-body2 text-md-text-high tabular-nums">日期：{{ day }}</p>
          <p class="text-md2-body2 text-md-text-high tabular-nums">时间：{{ startTime }} ~ {{ endTime }}</p>
          <p class="text-md2-caption text-md-text-medium pt-2">
            请在规定时间内完成签到，超时未签到将视为违规。
          </p>
        </div>
        <div class="md-dialog-actions border-t border-md-card-border">
          <button type="button" class="md-btn-filled" @click="closeSuccess">完成</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
import PageHeader from '../ui/PageHeader.vue';
import EmptyState from '../ui/EmptyState.vue';
import Alert from '../ui/Alert.vue';
import SeatGrid from './SeatGrid.vue';
import LibraryTimeRangePicker from './LibraryTimeRangePicker.vue';
import {
  fetchSeatGrid,
  fetchUsedSeats,
  fullRoomName,
  reserveLibrarySeat,
  roomDisplayName,
  type LibraryRoom,
  type SeatGridData,
} from '../../api/library';

const props = defineProps<{
  room: LibraryRoom;
  day: string;
  startTime: string;
  endTime: string;
}>();

const emit = defineEmits<{ (e: 'back'): void }>();

const grid = ref<SeatGridData | null>(null);
const gridLoading = ref(true);
const gridError = ref('');
const usedSeats = ref<Set<string>>(new Set());
const usedLoading = ref(false);
const selectedSeat = ref<string | null>(null);
const pickingTime = ref(false);
const submitting = ref(false);
const success = ref<{ seatNum: string } | null>(null);
const actionNotice = ref<{ kind: 'success' | 'error' | 'warning'; text: string } | null>(null);

const day = ref(props.day);
const startTime = ref(props.startTime);
const endTime = ref(props.endTime);

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^.*?:\s*/, '').trim();
}

async function loadGrid() {
  gridLoading.value = true;
  gridError.value = '';
  try {
    grid.value = await fetchSeatGrid(props.room.id, day.value);
    await loadUsedSeats();
  } catch (error) {
    grid.value = null;
    gridError.value = errorText(error) || '加载失败，请检查网络后重试';
  } finally {
    gridLoading.value = false;
  }
}

/** 时段变化后必须重新拉占用列表 —— 否则会显示别的时段的空位。 */
async function loadUsedSeats() {
  usedLoading.value = true;
  try {
    usedSeats.value = await fetchUsedSeats({
      roomId: props.room.id,
      day: day.value,
      startTime: startTime.value,
      endTime: endTime.value,
    });
    // 已选座位如果在新时段被占用，清掉选择
    if (selectedSeat.value && usedSeats.value.has(selectedSeat.value)) {
      selectedSeat.value = null;
    }
  } catch (error) {
    actionNotice.value = { kind: 'error', text: `座位占用状态刷新失败：${errorText(error)}` };
  } finally {
    usedLoading.value = false;
  }
}

async function applyTimeRange(value: { startTime: string; endTime: string }) {
  pickingTime.value = false;
  startTime.value = value.startTime;
  endTime.value = value.endTime;
  selectedSeat.value = null;
  await loadUsedSeats();
}

async function submit() {
  if (selectedSeat.value === null) return;
  submitting.value = true;
  actionNotice.value = null;
  try {
    const res = await reserveLibrarySeat({
      roomId: props.room.id,
      seatNum: selectedSeat.value,
      day: day.value,
      startTime: startTime.value,
      endTime: endTime.value,
      firstLevelName: props.room.firstLevelName,
      secondLevelName: props.room.secondLevelName,
      thirdLevelName: props.room.thirdLevelName,
    });
    success.value = { seatNum: res?.reserve?.seatNum || selectedSeat.value || '' };
    window.dispatchEvent(new CustomEvent('chilleast:library-changed'));
    // 预约成功后座位立即被占，刷新一次占用列表
    await loadUsedSeats();
  } catch (error) {
    actionNotice.value = { kind: 'error', text: `预约失败：${errorText(error)}` };
  } finally {
    submitting.value = false;
  }
}

function closeSuccess() {
  success.value = null;
  emit('back');
}

onMounted(loadGrid);
</script>
