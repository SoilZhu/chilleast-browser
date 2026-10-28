<template>
  <!-- ===================================================================
       空状态 / 加载 / 错误占位
       文案规范见 web/COPY.md：空状态「暂无 + 名词」，不写引导语
       =================================================================== -->
  <div
    :class="[
      'flex flex-col items-center justify-center text-center',
      compact ? 'py-10 gap-2' : 'py-16 gap-3',
    ]"
  >
    <span
      v-if="icon"
      :class="[
        'rounded-full bg-md-surface-2 flex items-center justify-center text-md-text-hint',
        compact ? 'w-10 h-10' : 'w-12 h-12',
      ]"
    >
      <Icon :name="icon" :size="compact ? 'md' : 'lg'" />
    </span>

    <p :class="['text-md2-body2', error ? 'text-md-danger' : 'text-md-text-disabled']">
      {{ text }}
    </p>

    <slot />

    <button v-if="retryText" class="md-btn-text mt-1" @click="$emit('retry')">
      <Icon name="refresh" size="sm" />
      {{ retryText }}
    </button>
  </div>
</template>

<script setup lang="ts">
import Icon from '../Icon.vue';

withDefaults(
  defineProps<{
    text: string;
    icon?: string;
    error?: boolean;
    compact?: boolean;
    retryText?: string;
  }>(),
  {
    icon: 'inbox',
    error: false,
    compact: false,
    retryText: '',
  },
);

defineEmits<{ (e: 'retry'): void }>();
</script>
