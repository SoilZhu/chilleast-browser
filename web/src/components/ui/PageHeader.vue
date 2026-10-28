<template>
  <!-- ===================================================================
       页面头部（标题 + 副标题 + 右侧操作）
       对应原版 App 各页的 AppBar + 首行说明
       =================================================================== -->
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <button
          v-if="back"
          class="md-icon-btn-sm -ml-1.5"
          title="返回"
          @click="$emit('back')"
        >
          <Icon name="arrow-left" size="sm" />
        </button>
        <span
          v-if="icon"
          class="w-6 h-6 rounded-md2-sm flex items-center justify-center shrink-0"
          :style="iconColor ? { backgroundColor: iconColor + '18', color: iconColor } : undefined"
        >
          <Icon :name="icon" size="sm" />
        </span>
        <h1 class="text-md2-h6 text-md-text-high truncate">{{ title }}</h1>
      </div>
      <p v-if="subtitle" class="text-md2-body2 text-md-text-medium mt-0.5">{{ subtitle }}</p>
    </div>

    <div class="flex items-center gap-1.5 shrink-0">
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
    icon?: string;
    iconColor?: string;
    back?: boolean;
  }>(),
  {
    subtitle: '',
    icon: '',
    iconColor: '',
    back: false,
  },
);

defineEmits<{ (e: 'back'): void }>();
</script>
