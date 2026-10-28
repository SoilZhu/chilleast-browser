<template>
  <!-- ===================================================================
       提示条（全站唯一的 alert / banner 实现）
       -------------------------------------------------------------------
       改版前同一个「错误提示」有 6 种写法：
         - 圆角 4px / 8px 混用
         - 有的带 1px 描边（手写 #f6aea9 / #fde293 色值），有的不带
         - 图标 14px / 16px / 20px 混用
         - 文字有的 12px 有的 14px
       现在统一为一条：浅色底 + 无描边 + 左图标 + 14px 正文，圆角 4px。

       用法：
         <Alert kind="error" text="提交失败，请重试" />
         <Alert kind="success" title="该问卷已提交" text="提交后不可修改" />
         <Alert kind="warning" text="已按云端调课规则调整" :dense="true" />
       =================================================================== -->
  <div :class="['md-alert', kindClass, dense ? 'md-alert-dense' : '']" role="status">
    <Icon :name="resolvedIcon" :size="dense ? 'xs' : 'sm'" class="shrink-0 mt-0.5" />

    <div class="min-w-0 flex-1">
      <p v-if="title" class="md-alert-title">{{ title }}</p>
      <p v-if="text" :class="title ? 'md-alert-text' : 'md-alert-title'">{{ text }}</p>
      <slot />
    </div>

    <button
      v-if="actionText"
      class="md-btn-text shrink-0 -my-1"
      @click="$emit('action')"
    >
      {{ actionText }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../Icon.vue';

const props = withDefaults(
  defineProps<{
    kind?: 'info' | 'success' | 'warning' | 'error';
    title?: string;
    text?: string;
    /** 覆盖默认图标 */
    icon?: string;
    /** 紧凑模式（卡片内、表格上方用） */
    dense?: boolean;
    /** 右侧动作按钮文案 */
    actionText?: string;
  }>(),
  {
    kind: 'info',
    title: '',
    text: '',
    icon: '',
    dense: false,
    actionText: '',
  },
);

defineEmits<{ (e: 'action'): void }>();

const KIND_CLASS: Record<string, string> = {
  info: 'md-alert-info',
  success: 'md-alert-success',
  warning: 'md-alert-warning',
  error: 'md-alert-error',
};

const KIND_ICON: Record<string, string> = {
  info: 'info',
  success: 'check',
  warning: 'warning',
  error: 'error',
};

const kindClass = computed(() => KIND_CLASS[props.kind] ?? KIND_CLASS.info);
const resolvedIcon = computed(() => props.icon || KIND_ICON[props.kind] || 'info');
</script>
