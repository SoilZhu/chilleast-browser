<template>
  <!-- ===================================================================
       图书馆预约（对应 App 的 _buildLibrarySeatCard）
       只展示当前生效的座位预约；没有就整块不渲染
       =================================================================== -->
  <FeedCard
    v-if="active.length > 0"
    title="图书馆预约"
    :meta="`${active.length} 个`"
    more-text="图书馆"
    @more="$emit('more')"
  >
    <div class="space-y-1">
      <div
        v-for="item in active"
        :key="item.id"
        class="flex items-start gap-3 py-2"
      >
        <span class="w-1 self-stretch rounded-full shrink-0 bg-[#795548]" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-md2-subtitle2 text-md-text-high truncate">
              座位 {{ item.seatNum }}
            </span>
            <span v-if="item.isActive" class="md-chip-success shrink-0">使用中</span>
          </div>
          <div class="text-md2-caption text-md-text-medium mt-1 truncate">
            {{ roomText(item) }}
          </div>
          <div class="text-md2-caption text-md-text-disabled mt-0.5 tabular-nums truncate">
            {{ item.duration || rangeText(item) }}
          </div>
        </div>
      </div>
    </div>
  </FeedCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FeedCard from './FeedCard.vue';
import { parseTime } from './format';
import type { SeatReserveItem } from '../../api/library';

const props = withDefaults(
  defineProps<{
    /** 当前生效的预约；父级没数据时传空数组，组件整块不渲染 */
    reserves?: SeatReserveItem[];
  }>(),
  {
    reserves: () => [],
  },
);

defineEmits<{ (e: 'more'): void }>();

/** 只保留今天的或正在使用的预约 */
const active = computed(() => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return props.reserves.filter((item) => {
    if (item.isActive) return true;
    if (item.today === today) return true;
    const start = parseTime(item.startTime);
    if (!start) return false;
    return (
      start.getFullYear() === now.getFullYear() &&
      start.getMonth() === now.getMonth() &&
      start.getDate() === now.getDate()
    );
  });
});

function roomText(item: SeatReserveItem): string {
  return [item.firstLevelName, item.secondLevelName, item.thirdLevelName]
    .filter(Boolean)
    .join(' · ');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function rangeText(item: SeatReserveItem): string {
  const start = parseTime(item.startTime);
  const end = parseTime(item.endTime);
  if (!start || !end) return '';
  return `${pad2(start.getHours())}:${pad2(start.getMinutes())}-${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
}
</script>
