<template>
  <!-- ===================================================================
       信息流区块外壳：标题与动作在卡片外侧上方，卡片实体在下方
       =================================================================== -->
  <section class="break-inside-avoid">
    <div class="flex items-center justify-between gap-2 mb-2">
      <h2 class="text-[14px] leading-5 font-medium text-md-text-high">{{ title }}</h2>
      <div class="flex items-center gap-1.5 shrink-0">
        <span v-if="meta" class="md-chip-neutral">{{ meta }}</span>
        <button
          v-if="moreText"
          class="text-md2-caption text-md-primary hover:underline"
          @click.stop="$emit('more')"
        >
          {{ moreText }}
        </button>
      </div>
    </div>
    <div
      v-if="!bare"
      :class="[
        interactive ? 'md-card-interactive' : 'md-card',
        cardClass || 'p-4',
      ]"
      @click="interactive && $emit('card-click')"
    >
      <slot />
    </div>
    <slot v-else />
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    /** 标题右侧的计数徽章，如「3 项」 */
    meta?: string;
    /** 右侧动作文案，留空则不显示 */
    moreText?: string;
    /** 是否不包裹外层卡片（直接裸落内容） */
    bare?: boolean;
    /** 是否启用整卡悬浮交互态 */
    interactive?: boolean;
    /** 卡片内边距等样式覆盖 */
    cardClass?: string;
  }>(),
  {
    meta: '',
    moreText: '',
    bare: false,
    interactive: false,
    cardClass: '',
  },
);

defineEmits<{
  (e: 'more'): void;
  (e: 'card-click'): void;
}>();
</script>
