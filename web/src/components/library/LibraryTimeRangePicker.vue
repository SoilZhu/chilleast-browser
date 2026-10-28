<template>
  <!-- ===================================================================
       预约时段选择器（对应原版 library_time_range_picker.dart 的底部弹窗）
       -------------------------------------------------------------------
       原版是一个 showModalBottomSheet：标题 + 开始时间横向 chip + 结束时间横向 chip
       + 底部整宽确认按钮。网页端保持同一信息顺序，只是把「抽屉」改成 MD2 对话框。
       日期不在这里选：日期由调用方（阅览室列表页 / 快速预约页）的日期栏决定。
       =================================================================== -->
  <div class="md-scrim flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="md-dialog rounded-md2-md w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col">
      <div class="md-dialog-header shrink-0">
        <div class="min-w-0">
          <h3 class="md-dialog-title">选择预约时段</h3>
          <p class="text-md2-caption text-md-text-medium mt-0.5 tabular-nums">{{ dayLabel }}</p>
        </div>
        <button type="button" class="md-icon-btn-sm -mr-2 shrink-0" @click="$emit('close')">
          <Icon name="close" size="sm" />
        </button>
      </div>

      <div class="md-dialog-body flex-1 overflow-y-auto no-scrollbar border-t border-md-card-border pt-4 space-y-4">
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

        <!-- 结束时间：早于开始时间的刻度禁用（原版是灰色不可点） -->
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
        <button
          type="button"
          class="md-btn-filled"
          :disabled="!canConfirm"
          @click="confirm"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
import {
  availableStartSlots,
  candidateEndSlots,
  defaultEndTime,
  defaultStartTime,
  formatDayLabel,
  isEndSlotUsable,
  isValidRange,
} from '../../utils/library-time';

const props = defineProps<{
  /** 预约日期 YYYY-MM-DD */
  day: string;
  initialStartTime?: string | null;
  initialEndTime?: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', value: { startTime: string; endTime: string }): void;
}>();

/** 打开时刻固定，避免用户停留期间刻度列表抖动（与原版 openedAt 一致）。 */
const openedAt = ref(new Date());
const startTime = ref<string | null>(null);
const endTime = ref<string | null>(null);

const availableStarts = computed(() => availableStartSlots(props.day, openedAt.value));
const candidateEnds = computed(() => candidateEndSlots(props.day, openedAt.value));
const dayLabel = computed(() => formatDayLabel(props.day));

const canConfirm = computed(
  () =>
    startTime.value !== null &&
    endTime.value !== null &&
    isValidRange(props.day, startTime.value, endTime.value),
);

onMounted(() => {
  const starts = availableStarts.value;
  const initialStart =
    props.initialStartTime && starts.includes(props.initialStartTime)
      ? props.initialStartTime
      : defaultStartTime(props.day, openedAt.value);
  startTime.value = initialStart;

  if (initialStart === null) {
    endTime.value = null;
    return;
  }
  const ends = candidateEnds.value;
  const initialEnd =
    props.initialEndTime &&
    ends.includes(props.initialEndTime) &&
    isEndSlotUsable(initialStart, props.initialEndTime)
      ? props.initialEndTime
      : defaultEndTime(initialStart);
  endTime.value = initialEnd;
});

function pickStart(slot: string) {
  startTime.value = slot;
  // 开始时间后移导致结束时间失效时，回落到默认时长（与原版一致）
  if (endTime.value === null || !isEndSlotUsable(slot, endTime.value)) {
    endTime.value = defaultEndTime(slot);
  }
}

function confirm() {
  if (!canConfirm.value || startTime.value === null || endTime.value === null) return;
  emit('confirm', { startTime: startTime.value, endTime: endTime.value });
}
</script>
