<template>
  <!-- ===================================================================
       便签卡：卡头标题与动作移至卡片外侧上方，卡片实体在下方
       =================================================================== -->
  <section class="break-inside-avoid">
    <!-- 卡头：标题 + 计数 + 右侧动作（标题为空且无操作时不渲染） -->
    <div
      v-if="title || $slots.actions || meta"
      class="flex items-center justify-between gap-2 mb-2"
    >
      <div class="flex items-center gap-2 min-w-0">
        <Icon v-if="icon" :name="icon" size="sm" class="text-md-text-medium shrink-0" />
        <h2 class="text-[14px] leading-5 font-medium text-md-text-high truncate">{{ title }}</h2>
        <span v-if="meta" class="md-chip-neutral shrink-0">{{ meta }}</span>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <slot name="actions" />
        <button
          v-if="moreText"
          class="text-md2-caption text-md-primary hover:underline"
          @click="$emit('more')"
        >
          {{ moreText }}
        </button>
      </div>
    </div>

    <!-- 卡片实体 -->
    <div :class="['md-card overflow-hidden', padded ? 'p-4' : 'p-0']">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import Icon from '../Icon.vue';

withDefaults(
  defineProps<{
    /** 卡头标题；留空则不渲染卡头 */
    title?: string;
    /** 标题右侧的计数徽章，如「3 项」 */
    meta?: string;
    /** 右侧动作文案，留空则不显示 */
    moreText?: string;
    /** 标题前的可选图标 */
    icon?: string;
    /** 是否自带 16px 内边距（默认 true；列表型卡片传 false 由内部行自己控距） */
    padded?: boolean;
    /** flush：列表型卡片，卡头左右补 16px 但内容贴边（行自带左右内边距） */
    flush?: boolean;
  }>(),
  {
    title: '',
    meta: '',
    moreText: '',
    icon: '',
    padded: true,
    flush: false,
  },
);

defineEmits<{ (e: 'more'): void }>();
</script>
