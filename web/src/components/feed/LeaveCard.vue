<template>
  <!-- ===================================================================
       请假申请（对应 App 的 _buildOngoingLeaves）
       只展示 7 天内待审核 / 审核中以及正在生效的请假单
       =================================================================== -->
  <FeedCard v-if="display.length > 0" title="请假申请" more-text="全部" @more="$emit('more')">
    <div class="space-y-2">
      <FeedListRow
        v-for="item in display"
        :key="item.id"
        icon="leave"
        color="#009688"
        :title="titleOf(item)"
        :time="item.timeRange || rangeOf(item)"
        :status="item.statusLabel || item.auditStatusName"
        @click="$emit('open', item)"
      />
    </div>
  </FeedCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FeedCard from './FeedCard.vue';
import FeedListRow from './FeedListRow.vue';
import { parseTime, timeRangeText } from './format';
import type { LeaveRecord } from '../../api/xgxt';

/** 带展示字段的请假单（timeRange 由后端或父级补齐） */
type LeaveRow = LeaveRecord & { timeRange?: string };

const props = withDefaults(
  defineProps<{
    leaves?: LeaveRow[];
  }>(),
  {
    leaves: () => [],
  },
);

defineEmits<{
  (e: 'open', item: LeaveRow): void;
  (e: 'more'): void;
}>();

const DAY = 24 * 60 * 60 * 1000;

/** 驳回 / 不通过的不进首页 */
function isRejected(item: LeaveRow): boolean {
  const text = `${item.auditResultName ?? ''}${item.statusLabel ?? ''}`;
  return ['不通过', '不同意', '驳回', '拒绝'].some((word) => text.includes(word));
}

/** 是否 7 天内开始或仍在进行 */
function isUpcoming(item: LeaveRow): boolean {
  const start = parseTime(item.startTime);
  const end = parseTime(item.endTime);
  if (!start) return false;
  const now = Date.now();
  if (end && end.getTime() <= now) return false;
  if (!end && start.getTime() <= now) return false;
  return start.getTime() - now <= 7 * DAY;
}

const display = computed(() =>
  props.leaves
    .filter((item) => !isRejected(item) && isUpcoming(item))
    .sort((a, b) => {
      const ta = parseTime(a.startTime)?.getTime() ?? 0;
      const tb = parseTime(b.startTime)?.getTime() ?? 0;
      return ta - tb;
    })
    .slice(0, 3),
);

function titleOf(item: LeaveRow): string {
  const days = item.days > 0 ? `${item.days} 天` : '';
  const hours = !days && item.hours > 0 ? `${item.hours} 小时` : '';
  const duration = days || hours;
  const type = item.typeName || '请假';
  return duration ? `${type} · ${duration}` : type;
}

function rangeOf(item: LeaveRow): string {
  return timeRangeText(item.startTime, item.endTime);
}
</script>
