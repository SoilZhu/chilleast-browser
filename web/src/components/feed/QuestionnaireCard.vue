<template>
  <!-- ===================================================================
       待完成的问卷（对应 App 的 _buildPendingQuestionnaires）
       只展示未提交且未截止的问卷
       =================================================================== -->
  <FeedCard v-if="display.length > 0" title="待完成的问卷" more-text="全部" @more="$emit('more')">
    <div class="space-y-2">
      <FeedListRow
        v-for="item in display"
        :key="item.dm"
        icon="questionnaire"
        color="#2e7d32"
        :title="item.title || '未命名问卷'"
        :time="timeText(item)"
        @click="$emit('open', item)"
      />
    </div>
  </FeedCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FeedCard from './FeedCard.vue';
import FeedListRow from './FeedListRow.vue';
import { timeRangeText } from './format';
import type { QuestionnaireItem } from '../../api/xgxt';

const props = withDefaults(
  defineProps<{
    items?: QuestionnaireItem[];
  }>(),
  {
    items: () => [],
  },
);

defineEmits<{
  (e: 'open', item: QuestionnaireItem): void;
  (e: 'more'): void;
}>();

const display = computed(() =>
  props.items.filter((item) => !item.isSubmitted && !item.isExpired).slice(0, 3),
);

function timeText(item: QuestionnaireItem): string {
  return timeRangeText(item.startTime, item.endTime);
}
</script>
