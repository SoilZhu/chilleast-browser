<template>
  <!-- ===================================================================
       作业（对应 App 的 _buildHomeworkSection）
       橙色圆点 + 标题 + 课程/截止时间，最多 4 条 + 「全部」
       =================================================================== -->
  <FeedCard
    v-if="items.length > 0"
    title="作业"
    :meta="`${items.length} 项`"
    more-text="全部"
    @more="$emit('more')"
  >
    <div>
      <button
        v-for="hw in items.slice(0, 4)"
        :key="hw.id"
        class="w-full text-left flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0
          hover:bg-md-surface-1 rounded-md2-sm transition-colors duration-md2-short"
        @click="$emit('open', hw)"
      >
        <!-- 待办圈：与作业页同一套标记（空心 = 未完成） -->
        <span class="md-todo-circle mt-0.5" />
        <span class="min-w-0 flex-1">
          <span class="block text-md2-body2 text-md-text-high line-clamp-2 leading-snug">
            {{ hw.title }}
          </span>
          <span class="block text-md2-caption text-md-text-medium mt-0.5 truncate">
            {{ subtitle(hw) }}
          </span>
        </span>
      </button>
    </div>
  </FeedCard>
</template>

<script setup lang="ts">
import FeedCard from './FeedCard.vue';
import { shortDateTime } from './format';
import type { HomeworkItem } from '../../api/study';

defineProps<{
  /** 仅传待完成作业，已排序 */
  items: HomeworkItem[];
}>();

defineEmits<{
  (e: 'open', item: HomeworkItem): void;
  (e: 'more'): void;
}>();

/** 「课程名 · 截止 10-26 23:59」，缺哪段就省哪段 */
function subtitle(hw: HomeworkItem): string {
  const deadline = shortDateTime(hw.endTime) || hw.rawTimeStr || hw.endTimeLocal || '无截止时间';
  return hw.courseName ? `${hw.courseName} · 截止 ${deadline}` : `截止 ${deadline}`;
}
</script>
