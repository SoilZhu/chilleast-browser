<template>
  <!-- ===================================================================
       PC 宽屏「主从分栏」布局（对应原版 App 的 MasterDetail / EmbeddedDetailPane）
       - 宽屏（≥1024px）：左侧主列表 + 右侧详情面板，详情滑入
       - 窄屏：只显示主列表，详情由父级用全屏路由承载
       =================================================================== -->
  <div class="flex items-stretch gap-0 min-h-[calc(100vh-4rem)]">
    <!-- 主列表 -->
    <div
      :class="[
        'min-w-0 transition-all duration-md2-medium ease-md2-standard',
        hasDetail ? detailSplitClass : 'w-full',
      ]"
    >
      <slot />
    </div>

    <!-- 详情面板 -->
    <transition
      enter-active-class="transition-all duration-md2-medium ease-md2-decelerate"
      enter-from-class="opacity-0 translate-x-4"
      leave-active-class="transition-all duration-md2-short ease-md2-accelerate"
      leave-to-class="opacity-0 translate-x-4"
    >
      <div
        v-if="hasDetail"
        class="min-w-0 flex-1 border-l border-md-divider pl-5 sm:pl-6"
      >
        <div class="sticky top-0">
          <!-- 详情头：关闭按钮 + 标题 -->
          <div class="flex items-center gap-2 pb-3">
            <button class="md-icon-btn-sm" title="关闭详情" @click="$emit('close')">
              <Icon name="close" size="sm" />
            </button>
            <h2 v-if="detailTitle" class="text-md2-subtitle1 text-md-text-high truncate">
              {{ detailTitle }}
            </h2>
          </div>
          <slot name="detail" />
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../Icon.vue';

const props = withDefaults(
  defineProps<{
    /** 是否有选中的详情 */
    hasDetail: boolean;
    detailTitle?: string;
    /** 主列表在分栏时的宽度占比类 */
    detailSplitClass?: string;
  }>(),
  {
    detailTitle: '',
    detailSplitClass: 'w-[42%] shrink-0',
  },
);

const hasDetail = computed(() => props.hasDetail);

defineEmits<{ (e: 'close'): void }>();
</script>
