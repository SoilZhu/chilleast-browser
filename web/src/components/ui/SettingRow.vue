<template>
  <!-- ===================================================================
       设置行（MD2 ListItem）
       - 左图标 + 标题/副标题 + 右侧值/开关/箭头
       - 对应原版 App 的 _buildSettingItem
       =================================================================== -->
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    :class="[
      'w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors duration-md2-short',
      clickable ? 'hover:bg-md-surface-1 active:bg-md-surface-2' : '',
      selected ? 'bg-brand-50' : '',
    ]"
    :disabled="disabled"
    @click="clickable && !disabled ? $emit('click') : undefined"
  >
    <span
      v-if="icon"
      :class="[
        'w-6 h-6 shrink-0 flex items-center justify-center',
        iconClass || 'text-md-text-medium',
      ]"
    >
      <Icon :name="icon" size="md" />
    </span>

    <span class="min-w-0 flex-1">
      <span
        :class="[
          'block text-md2-body1 leading-tight truncate',
          danger ? 'text-md-danger' : 'text-md-text-high',
          selected ? 'font-medium' : '',
        ]"
      >
        {{ title }}
      </span>
      <span v-if="subtitle" class="block text-md2-caption text-md-text-medium mt-1 leading-snug">
        {{ subtitle }}
      </span>
    </span>

    <slot name="trailing">
      <span v-if="value" class="text-md2-body2 text-md-text-medium shrink-0">{{ value }}</span>
      <Icon
        v-if="chevron"
        name="chevron-right"
        size="sm"
        class="text-md-text-hint shrink-0"
      />
    </slot>
  </component>
</template>

<script setup lang="ts">
import Icon from '../Icon.vue';

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    icon?: string;
    iconClass?: string;
    value?: string;
    chevron?: boolean;
    clickable?: boolean;
    selected?: boolean;
    danger?: boolean;
    disabled?: boolean;
  }>(),
  {
    subtitle: '',
    icon: '',
    iconClass: '',
    value: '',
    chevron: true,
    clickable: true,
    selected: false,
    danger: false,
    disabled: false,
  },
);

defineEmits<{ (e: 'click'): void }>();
</script>
