<template>
  <!-- ===================================================================
       快速预约时段选择（对应原版 library_quick_reserve_sheet.dart）
       -------------------------------------------------------------------
       原版是「从近期预约记录一键再约」的底部抽屉：
         目标座位信息条 → 选择日期 chip → 开始时间 chip → 结束时间 chip → 整宽确认
       其中「日期」是可选项（22:00 后才有明天），时段默认沿用该条历史预约的时间。
       网页端保持同样的信息顺序与默认值回退规则。
       =================================================================== -->
  <div class="md-scrim flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="md-dialog rounded-md2-md w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col">
      <div class="md-dialog-header shrink-0">
        <h3 class="md-dialog-title">快速预约</h3>
        <button type="button" class="md-icon-btn-sm -mr-2 shrink-0" @click="$emit('close')">
          <Icon name="close" size="sm" />
        </button>
      </div>

      <div class="md-dialog-body flex-1 overflow-y-auto no-scrollbar border-t border-md-card-border pt-4 space-y-4">
        <!-- 目标座位信息条（浅色底，无描边） -->
        <div class="flex items-center gap-2.5 rounded-md2-sm bg-brand-50 px-3 py-2.5">
          <Icon name="event-seat" size="sm" class="text-md-primary shrink-0" />
          <div class="min-w-0">
            <div class="text-md2-subtitle2 text-md-primary tabular-nums">座位号 {{ item.seatNum }}</div>
            <div class="text-md2-caption text-md-text-medium truncate">
              {{ fullRoomName(item) }}
            </div>
          </div>
        </div>

        <!-- 日期：只有一天时也显示，方便确认约的是哪天 -->
        <div>
          <div class="md-label">选择日期</div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button
              v-for="day in availableDays"
              :key="day"
              type="button"
              :class="day === selectedDay ? 'md-chip-filter-active' : 'md-chip-filter'"
              @click="pickDay(day)"
            >
              {{ formatDayLabel(day) }}
            </button>
          </div>
        </div>

        <!-- 开始时间 -->
        <div>
          <div class="md-label">开始时间</div>
          <div v-if="availableStarts.length === 0" class="mt-2 text-md2-caption text-md-warning">
            当天已无可预约时段
          </div>
          <div v-else class="mt-2 flex flex-wrap gap-1.5">
            <button
              v-for="slot in availableStarts"
              :key="slot"
              type="button"
              :class="slot === startTime ? 'md-chip-filter-active' : 'md-chip-filter'"
              class="tabular-nums"
              @click="pickStart(slot)"
            >
              {{ slot }}
            </button>
          </div>
        </div>

        <!-- 结束时间 -->
        <div>
          <div class="md-label">结束时间</div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button
              v-for="slot in candidateEnds"
              :key="slot"
              type="button"
              class="tabular-nums"
              :class="[
                slot === endTime ? 'md-chip-filter-active' : 'md-chip-filter',
                !isEndSlotUsable(startTime, slot) ? 'opacity-40 cursor-not-allowed' : '',
              ]"
              :disabled="!isEndSlotUsable(startTime, slot)"
              @click="endTime = slot"
            >
              {{ slot }}
            </button>
          </div>
        </div>
      </div>

      <div class="md-dialog-actions shrink-0 border-t border-md-card-border">
        <button type="button" class="md-btn-text" @click="$emit('close')">取消</button>
        <button type="button" class="md-btn-filled" :disabled="!canConfirm" @click="confirm">
          确认预约
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
import { fullRoomName, type SeatReserveItem } from '../../api/library';
import {
  availableReserveDays,
  availableStartSlots,
  candidateEndSlots,
  defaultEndTime,
  defaultStartTime,
  formatDayLabel,
  formatEpochHHmm,
  isEndSlotUsable,
  isValidRange,
} from '../../utils/library-time';

const props = defineProps<{ item: SeatReserveItem }>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', value: { day: string; startTime: string; endTime: string }): void;
}>();

const openedAt = ref(new Date());
const availableDays = computed(() => availableReserveDays(openedAt.value));
const selectedDay = ref('');
const startTime = ref<string | null>(null);
const endTime = ref<string | null>(null);

const availableStarts = computed(() => availableStartSlots(selectedDay.value, openedAt.value));
const candidateEnds = computed(() => candidateEndSlots(selectedDay.value, openedAt.value));
const canConfirm = computed(
  () =>
    startTime.value !== null &&
    endTime.value !== null &&
    isValidRange(selectedDay.value, startTime.value, endTime.value),
);

/**
 * 默认日期：22:00 后或今天已无时段时切到明天（与原版 `_initDaysAndTimes` 一致）。
 */
function initialDay(): string {
  const days = availableDays.value;
  if (days.length === 0) return '';
  const now = openedAt.value;
  const todayStarts = availableStartSlots(days[0], now);
  const hour = new Date(now.getTime() + 8 * 3600_000).getUTCHours();
  if ((hour >= 22 || todayStarts.length === 0) && days.length > 1) return days[1];
  return days[0];
}

/** 历史预约的时间段在新日期上合法时优先沿用，否则回退到默认推荐时段。 */
function applyTimesForDay(day: string) {
  const historyStart = formatEpochHHmm(props.item.startTime);
  const historyEnd = formatEpochHHmm(props.item.endTime);
  if (isValidRange(day, historyStart, historyEnd, openedAt.value)) {
    startTime.value = historyStart;
    endTime.value = historyEnd;
    return;
  }
  const start = defaultStartTime(day, openedAt.value);
  startTime.value = start;
  endTime.value = start === null ? null : defaultEndTime(start);
}

onMounted(() => {
  selectedDay.value = initialDay();
  if (selectedDay.value !== '') applyTimesForDay(selectedDay.value);
});

function pickDay(day: string) {
  if (day === selectedDay.value) return;
  selectedDay.value = day;
  const starts = availableStartSlots(day, openedAt.value);
  if (startTime.value === null || !starts.includes(startTime.value)) {
    startTime.value = defaultStartTime(day, openedAt.value);
  }
  if (startTime.value === null) {
    endTime.value = null;
    return;
  }
  if (endTime.value === null || !isEndSlotUsable(startTime.value, endTime.value)) {
    endTime.value = defaultEndTime(startTime.value);
  }
}

function pickStart(slot: string) {
  startTime.value = slot;
  if (endTime.value === null || !isEndSlotUsable(slot, endTime.value)) {
    endTime.value = defaultEndTime(slot);
  }
}

function confirm() {
  if (!canConfirm.value || startTime.value === null || endTime.value === null) return;
  emit('confirm', {
    day: selectedDay.value,
    startTime: startTime.value,
    endTime: endTime.value,
  });
}
</script>
