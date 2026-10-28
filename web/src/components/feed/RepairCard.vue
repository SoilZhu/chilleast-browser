<template>
  <!-- ===================================================================
       报修工单（对应 App 的 _buildOngoingRepairs）
       只展示处理中的工单
       =================================================================== -->
  <FeedCard v-if="display.length > 0" title="报修工单" more-text="全部" @more="$emit('more')">
    <div class="space-y-2">
      <FeedListRow
        v-for="item in display"
        :key="item.id"
        icon="tool"
        color="#607d8b"
        :title="item.title || '未命名工单'"
        :time="dateLabel(item.createdAt)"
        :status="item.status"
        @click="$emit('open', item)"
      />
    </div>
  </FeedCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FeedCard from './FeedCard.vue';
import FeedListRow from './FeedListRow.vue';
import { parseTime } from './format';
import type { RepairOrder } from '../../api/services';

const props = withDefaults(
  defineProps<{
    orders?: RepairOrder[];
  }>(),
  {
    orders: () => [],
  },
);

defineEmits<{
  (e: 'open', item: RepairOrder): void;
  (e: 'more'): void;
}>();

const display = computed(() => props.orders.slice(0, 3));

/** `2026/10/26` */
function dateLabel(raw: string | null): string {
  const d = parseTime(raw);
  if (!d) return '';
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}
</script>
