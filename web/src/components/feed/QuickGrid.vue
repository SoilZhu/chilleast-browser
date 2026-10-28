<template>
  <!-- ===================================================================
       快捷功能（对应 App 的 _buildQuickActions / _buildQuickGrid）
       圆形彩色底图标 + 下方文字，4 列网格
       =================================================================== -->
  <FeedCard title="快捷功能" more-text="全部" @more="$emit('more')">
    <div class="grid grid-cols-4 gap-1">
      <button
        v-for="item in visibleItems"
        :key="item.id"
        class="flex flex-col items-center gap-1.5 py-2 rounded-md2-md
          hover:bg-md-surface-1 active:bg-md-surface-2
          transition-colors duration-md2-short ease-md2-standard"
        :title="item.description"
        @click="$emit('select', item)"
      >
        <span
          class="w-11 h-11 rounded-full flex items-center justify-center"
          :style="{ backgroundColor: item.color + '18', color: item.color }"
        >
          <Icon :name="item.icon" size="md" />
        </span>
        <span class="text-[11px] leading-tight text-md-text-medium text-center line-clamp-2 px-0.5">
          {{ item.name }}
        </span>
      </button>
    </div>
  </FeedCard>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../Icon.vue';
import FeedCard from './FeedCard.vue';
import type { FunctionItemDef } from '../../utils/functions';

const props = defineProps<{
  /** 来自 visibleHomeFunctions，已按用户排序 */
  items: FunctionItemDef[];
}>();

defineEmits<{
  (e: 'select', item: FunctionItemDef): void;
  (e: 'more'): void;
}>();

/**
 * 卡片内最多两行（8 项）。App 的快捷入口是分页的，一页 6 格；
 * 网页版不限页数会让瀑布流里这张卡过高，其余项统一从「全部」进功能页。
 */
const visibleItems = computed(() => props.items.slice(0, 8));
</script>
