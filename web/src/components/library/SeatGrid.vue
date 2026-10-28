<template>
  <!-- ===================================================================
       座位分布图（对应原版 library_seat_screen.dart 的 InteractiveViewer + Stack）
       -------------------------------------------------------------------
       原版把座位画在一个 `cols × rows` 的网格里，每个座位是一个 36dp 方块，
       障碍物（柱子/书架/指示牌）也占一个格子。网页端保持同一套坐标（1-based），
       只是把「手势缩放」换成滚动容器 + 缩放按钮，PC 上更好用。
       =================================================================== -->
  <div class="flex flex-col min-h-0 flex-1">
    <!-- 图例：可选 / 已选 / 占用（与原版图例顺序一致） -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 pb-2.5">
      <span class="flex items-center gap-1.5 text-md2-caption text-md-text-medium">
        <span class="w-3.5 h-3.5 rounded-md2-xs bg-brand-50 border border-brand-300" />
        可选
      </span>
      <span class="flex items-center gap-1.5 text-md2-caption text-md-text-medium">
        <span class="w-3.5 h-3.5 rounded-md2-xs bg-md-primary border border-md-primary" />
        已选
      </span>
      <span class="flex items-center gap-1.5 text-md2-caption text-md-text-medium">
        <span class="w-3.5 h-3.5 rounded-md2-xs bg-md-surface-3 border border-md-divider" />
        占用/不可选
      </span>

      <div class="ml-auto flex items-center gap-1">
        <button type="button" class="md-icon-btn-sm" title="缩小" @click="zoomOut">
          <Icon name="minus" size="sm" />
        </button>
        <span class="text-md2-caption text-md-text-medium tabular-nums w-10 text-center">
          {{ Math.round(scale * 100) }}%
        </span>
        <button type="button" class="md-icon-btn-sm" title="放大" @click="zoomIn">
          <Icon name="plus" size="sm" />
        </button>
      </div>
    </div>

    <!-- 座位画布 -->
    <div
      ref="scroller"
      class="flex-1 min-h-0 overflow-auto no-scrollbar rounded-md2-md bg-md-surface-1 border border-md-card-border"
    >
      <div class="p-4 inline-block" :style="{ minWidth: '100%' }">
        <div
          class="relative"
          :style="{ width: `${cols * cell}px`, height: `${rows * cell}px` }"
        >
          <!-- 1. 障碍物（柱子 / 书架 / 指示牌） -->
          <div
            v-for="(obs, i) in grid.obstacles"
            :key="`obs-${i}`"
            class="absolute flex items-center justify-center rounded-md2-xs bg-white border border-md-card-border text-md-text-hint overflow-hidden"
            :style="cellStyle(obs.x, obs.y)"
            :title="obs.label || undefined"
          >
            <span v-if="obs.label" class="text-[9px] leading-none truncate px-0.5">
              {{ obs.label }}
            </span>
          </div>

          <!-- 2. 座位 -->
          <button
            v-for="seat in grid.seats"
            :key="seat.id || `${seat.x}-${seat.y}`"
            type="button"
            class="absolute flex items-center justify-center rounded-md2-xs border text-[10px] font-bold leading-none transition-colors"
            :class="seatClass(seat)"
            :style="cellStyle(seat.x, seat.y)"
            :disabled="isOccupied(seat)"
            :title="`${seat.seatNum}${isOccupied(seat) ? ' · 已占用' : ''}`"
            @click="toggle(seat)"
          >
            {{ seat.seatNum }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import type { SeatGridData, SeatGridSeat } from '../../api/library';

const props = withDefaults(
  defineProps<{
    grid: SeatGridData;
    /** 已占用座位号集合（来自 getusedseatnums，可能包含网格外的历史占座） */
    usedSeats: Set<string>;
    modelValue: string | null;
    /** 座位格子边长基准（px），缩放时按比例放大 */
    baseCell?: number;
  }>(),
  { baseCell: 44 },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
}>();

const scroller = ref<HTMLElement | null>(null);
const scale = ref(1);

const cell = computed(() => Math.round(props.baseCell * scale.value));
const cols = computed(() => Math.max(props.grid.cols, 1));
const rows = computed(() => Math.max(props.grid.rows, 1));

/** 1-based 坐标 → 绝对定位（与原版 `(x - 1) * cellSize` 完全一致）。 */
function cellStyle(x: number, y: number) {
  const size = cell.value - 2;
  return {
    left: `${(x - 1) * cell.value}px`,
    top: `${(y - 1) * cell.value}px`,
    width: `${size}px`,
    height: `${size}px`,
  };
}

/** 服务器侧 reserveStatus ≠ 0 或出现在占用列表里，都算已占用。 */
function isOccupied(seat: SeatGridSeat): boolean {
  return seat.reserveStatus !== 0 || props.usedSeats.has(seat.seatNum);
}

function seatClass(seat: SeatGridSeat): string {
  if (isOccupied(seat)) {
    return 'bg-md-surface-3 border-md-divider text-md-text-disabled cursor-not-allowed';
  }
  if (props.modelValue === seat.seatNum) {
    return 'bg-md-primary border-md-primary text-white';
  }
  return 'bg-brand-50 border-brand-300 text-md-primary hover:bg-brand-100';
}

/** 再次点击已选座位 → 取消选择（与原版一致）。 */
function toggle(seat: SeatGridSeat) {
  if (isOccupied(seat)) return;
  emit('update:modelValue', props.modelValue === seat.seatNum ? null : seat.seatNum);
}

function zoomIn() {
  scale.value = Math.min(2.4, Math.round((scale.value + 0.2) * 10) / 10);
}

function zoomOut() {
  scale.value = Math.max(0.6, Math.round((scale.value - 0.2) * 10) / 10);
}

defineExpose({ zoomIn, zoomOut });
</script>
