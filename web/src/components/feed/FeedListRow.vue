<template>
  <!-- ===================================================================
       信息流条目行（对应 App 的 _buildSectionRow）
       左侧图标 + 标题 + 时间（+ 可选状态行），整行可点击
       -------------------------------------------------------------------
       注意：外层 FeedCard 已经是白底 + 1px 描边，
       行内**不能再套浅灰圆角盒子**（那就是卡片套盒子）。
       行只用留白和 hover 反馈；需要分组时用分割线。
       =================================================================== -->
  <button
    class="w-full text-left flex items-start gap-3 py-2 rounded-md2-sm
      hover:bg-md-surface-1 transition-colors duration-md2-short ease-md2-standard"
    @click="$emit('click')"
  >
    <span
      class="w-8 h-8 rounded-md2-md flex items-center justify-center shrink-0"
      :style="{ backgroundColor: color + '14', color }"
    >
      <Icon :name="icon" size="sm" />
    </span>

    <span class="min-w-0 flex-1">
      <span class="flex items-center gap-1.5">
        <span class="text-md2-subtitle2 text-md-text-high truncate">{{ title }}</span>
        <span v-if="status" class="md-chip-neutral shrink-0">{{ status }}</span>
      </span>
      <span v-if="time" class="block text-md2-caption text-md-text-medium mt-0.5 truncate tabular-nums">
        {{ time }}
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
import Icon from '../Icon.vue';

withDefaults(
  defineProps<{
    icon: string;
    color: string;
    title: string;
    time?: string;
    status?: string;
  }>(),
  {
    time: '',
    status: '',
  },
);

defineEmits<{ (e: 'click'): void }>();
</script>
