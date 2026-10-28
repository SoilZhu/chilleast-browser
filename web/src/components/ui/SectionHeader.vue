<template>
  <!-- ===================================================================
       章节标题（裸标题，不包卡片）
       -------------------------------------------------------------------
       改版前每个区块都被包进一张 md-card，页面全是盒子。
       现在标题直接落在画布上，内容跟在后面：
         - 需要边界时由调用方用 .md-group / .md-card 包裹内容
         - 标题本身永远不占一个盒子
       =================================================================== -->
  <div :class="['flex items-start gap-3', dense ? 'mb-2' : 'mb-3']">
    <!-- 可选的前置图形（分组彩色图标等），与标题同行 -->
    <slot name="leading" />

    <div class="min-w-0 flex-1">
      <h2 :class="['md-section-title', titleClass]">
        <Icon v-if="icon" :name="icon" size="sm" class="text-md-text-medium shrink-0" />
        <span class="truncate">{{ title }}</span>
        <span v-if="count !== null && count !== undefined" class="md-chip-neutral shrink-0">
          {{ count }}
        </span>
      </h2>
      <p v-if="subtitle" class="md-section-subtitle">{{ subtitle }}</p>
    </div>

    <div v-if="$slots.actions" class="md-section-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '../Icon.vue';

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    /** 标题前的可选图标（线性、中灰） */
    icon?: string;
    /** 标题右侧的计数徽章；传 null 不显示 */
    count?: string | number | null;
    /** 紧凑模式（卡片内部用） */
    dense?: boolean;
    titleClass?: string;
  }>(),
  {
    subtitle: '',
    icon: '',
    count: null,
    dense: false,
    titleClass: '',
  },
);
</script>
