<template>
  <!-- ===================================================================
       指标组（余额 / 绩点 / 统计数字）
       -------------------------------------------------------------------
       改版前：4 个数字 = 4 张各自带描边和内部横线的卡片，视觉噪音大。
       现在：一组数字排在一起，用竖线分隔，**整体只是一个区块**。
       需要强调边界时才传 bordered，此时才画一条外框。
       =================================================================== -->
  <div
    :class="[
      'md-metrics',
      columnsClass,
      divided ? 'md-metric-divided' : '',
      bordered ? 'md-card px-5 py-4' : '',
    ]"
  >
    <div v-for="item in items" :key="item.label" class="md-metric">
      <div class="md-metric-label">
        <Icon
          v-if="item.icon"
          :name="item.icon"
          size="sm"
          :class="item.iconClass || 'text-md-text-medium'"
          class="shrink-0"
        />
        <span class="truncate">{{ item.label }}</span>
        <span v-if="item.chip" :class="['ml-auto shrink-0', item.chipClass || 'md-chip-neutral']">
          {{ item.chip }}
        </span>
      </div>

      <div :class="['md-metric-value', item.valueClass]">
        <slot name="value" :item="item">
          <span v-if="item.prefix" class="text-[15px] text-md-text-medium mr-0.5">
            {{ item.prefix }}
          </span>
          <span>{{ item.value }}</span>
          <span v-if="item.suffix" class="text-md2-body2 text-md-text-medium ml-1">
            {{ item.suffix }}
          </span>
        </slot>
      </div>

      <div v-if="item.hint" class="md-metric-hint truncate">{{ item.hint }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../Icon.vue';

export interface MetricItem {
  label: string;
  value: string | number;
  /** 数值前缀，如「¥」 */
  prefix?: string;
  /** 数值后缀，如「元」「项」 */
  suffix?: string;
  /** 底部说明文字 */
  hint?: string;
  icon?: string;
  iconClass?: string;
  /** 右上角徽章文字 */
  chip?: string;
  chipClass?: string;
  /** 数值额外样式（如低余额标红） */
  valueClass?: string;
}

const props = withDefaults(
  defineProps<{
    items: MetricItem[];
    /** 宽屏列数 */
    columns?: 2 | 3 | 4;
    /** 指标之间是否画竖线（宽屏生效） */
    divided?: boolean;
    /** 是否整体加外框（默认不加，落在画布上） */
    bordered?: boolean;
  }>(),
  {
    columns: 4,
    divided: true,
    bordered: false,
  },
);

const COLUMNS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};

const columnsClass = computed(() => COLUMNS[props.columns] ?? COLUMNS[4]);
</script>
