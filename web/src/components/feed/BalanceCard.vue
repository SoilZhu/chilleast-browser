<template>
  <!-- ===================================================================
       余额（校园卡 + 宿舍电费）
       独立成上下排列的两张卡片，不再嵌套包在同一个外层大卡片里：
         1. 校园卡卡片（点击卡片或「流水」进入一卡通）
         2. 宿舍电费卡片（支持单/双宿舍，点击卡片或「充值」进入电费）
       =================================================================== -->
  <div v-if="hasCard || hasEle" class="space-y-5">
    <!-- 1. 校园卡卡片 -->
    <FeedCard
      v-if="hasCard"
      title="校园卡"
      more-text="流水"
      interactive
      @more="$emit('open-card')"
      @card-click="$emit('open-card')"
    >
      <div class="flex items-baseline justify-between gap-2">
        <div class="text-[28px] leading-8 font-normal tabular-nums text-md-text-high">
          <span class="text-[14px] text-md-text-medium mr-0.5">¥</span>{{ balanceText }}
        </div>
        <span
          v-if="cardInfo?.status && cardInfo.status !== '正常'"
          class="md-chip-neutral shrink-0"
        >
          {{ cardInfo.status }}
        </span>
      </div>
      <div
        v-if="cardNumber"
        class="mt-2 text-md2-caption text-md-text-disabled tabular-nums truncate"
      >
        卡号 {{ cardNumber }}
      </div>
    </FeedCard>

    <!-- 2. 宿舍电费卡片 -->
    <FeedCard
      v-if="hasEle"
      title="宿舍电费"
      more-text="充值"
      interactive
      @more="$emit('open-ele')"
      @card-click="$emit('open-ele')"
    >
      <!-- 双宿舍且已绑定多于 1 个宿舍 -->
      <div v-if="hasSlotData && boundSlots.length > 1" class="divide-y divide-md-divider -my-1">
        <div
          v-for="s in boundSlots"
          :key="s.index"
          class="py-2.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
        >
          <div class="min-w-0">
            <span class="text-md2-body2 text-md-text-high truncate block">
              {{ shortLabel(s) }}
            </span>
            <span v-if="isLowSlot(s)" class="text-md2-caption text-md-danger block mt-0.5">
              余额较低
            </span>
          </div>
          <span
            :class="[
              'text-[18px] leading-6 font-normal tabular-nums shrink-0',
              isLowSlot(s) ? 'text-md-danger' : 'text-md-text-high',
            ]"
          >
            <span class="text-[12px] text-md-text-medium mr-0.5">¥</span>{{ s.balanceText }}
          </span>
        </div>
      </div>

      <!-- 单宿舍（槽位 1 个或旧接口回退） -->
      <template v-else>
        <div class="flex items-baseline justify-between gap-2">
          <div
            :class="[
              'text-[28px] leading-8 font-normal tabular-nums',
              isSingleLow ? 'text-md-danger' : 'text-md-text-high',
            ]"
          >
            <span class="text-[14px] text-md-text-medium mr-0.5">¥</span>{{ singleBalanceText }}
          </div>
          <span
            v-if="isSingleLow"
            class="md-chip-danger shrink-0"
          >
            余额较低
          </span>
        </div>
        <div
          v-if="singleDormLabel"
          class="mt-2 text-md2-caption text-md-text-disabled truncate"
        >
          {{ singleDormLabel }}
        </div>
      </template>
    </FeedCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FeedCard from './FeedCard.vue';
import { toAmount } from './format';
import type { CardInfo } from '../../api/campus';
import type { ElectricitySlotView } from '../../composables/useElectricity';

const props = withDefaults(
  defineProps<{
    cardInfo: CardInfo | null;
    /** 单宿舍回退（旧接口，逐步迁移到 slots） */
    eleBalance?: string | null;
    /** 单宿舍回退用的宿舍名 */
    dormName?: string;
    /** 双宿舍槽位；有任一已绑定时优先按槽位渲染 */
    slots?: ElectricitySlotView[];
  }>(),
  {
    eleBalance: null,
    dormName: '',
    slots: () => [],
  },
);

defineEmits<{
  (e: 'open-card'): void;
  (e: 'open-ele'): void;
}>();

const hasCard = computed(() => props.cardInfo !== null);

/** 已绑定宿舍的槽位 */
const boundSlots = computed(() => (props.slots ?? []).filter((s) => s.room !== null));

/** 有槽位数据时按槽位渲染，否则回退单宿舍 */
const hasSlotData = computed(() => boundSlots.value.length > 0);

/** 电费为空串也视为没有数据 */
const hasEle = computed(() => hasSlotData.value || toAmount(props.eleBalance) !== null);

const balanceText = computed(() => {
  const b = toAmount(props.cardInfo?.balance);
  return b === null ? '--' : b.toFixed(2);
});

const cardNumber = computed(() => {
  return props.cardInfo?.idserial || props.cardInfo?.cardno || '';
});

const eleText = computed(() => {
  const n = toAmount(props.eleBalance);
  return n === null ? '--' : n.toFixed(2);
});

/** 电费低于 10 元标红，与 App 的低余额提示一致 */
const lowEle = computed(() => {
  const n = toAmount(props.eleBalance);
  return n !== null && n <= 10;
});

/** 槽位余额低于 10 元标红 */
function isLowSlot(slot: ElectricitySlotView): boolean {
  const n = toAmount(slot.balanceText);
  return n !== null && n <= 10;
}

const singleBalanceText = computed(() => {
  if (boundSlots.value.length === 1) {
    return boundSlots.value[0].balanceText;
  }
  return eleText.value;
});

const isSingleLow = computed(() => {
  if (boundSlots.value.length === 1) {
    return isLowSlot(boundSlots.value[0]);
  }
  return lowEle.value;
});

const singleDormLabel = computed(() => {
  if (boundSlots.value.length === 1) {
    return shortLabel(boundSlots.value[0]);
  }
  return props.dormName || '';
});

/**
 * 宿舍标签：优先「楼栋 房号」这种最短形式，
 * 拼不出来再退回槽位名称或「宿舍 1 / 宿舍 2」。
 */
function shortLabel(slot: ElectricitySlotView): string {
  const room = slot.room;
  if (room) {
    const roomText = (room.roomName ?? '').trim();
    const building = (room.buildingName ?? '').trim();
    const joined = [building, roomText].filter(Boolean).join(' ');
    if (joined) return joined;
  }
  return slot.label || `宿舍 ${slot.index + 1}`;
}
</script>
