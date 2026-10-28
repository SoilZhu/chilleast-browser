<template>
  <div class="space-y-5">
    <!-- ============ 页头：全部功能 / 搜索结果（不显示副标题） ============ -->
    <PageHeader :title="isSearching ? '搜索结果' : '全部功能'">
      <template #actions>
        <button v-if="isSearching" class="md-btn-text" @click="$emit('update:query', '')">
          <Icon name="close" size="sm" />
          清空
        </button>
      </template>
    </PageHeader>

    <!-- ============ 空搜索结果 ============ -->
    <EmptyState v-if="groups.length === 0" :text="isSearching ? '暂无匹配功能' : '暂无功能'" icon="search">
      <button v-if="isSearching" class="md-btn-text mt-1" @click="$emit('update:query', '')">
        清空搜索
      </button>
    </EmptyState>

    <!-- ============ 瀑布流：每个分组一块（裸标题 + 组内功能卡） ============
         分组块整体 break-inside-avoid，长分组不会被瀑布流从中间拆开；
         每个功能是**一张独立卡片**，不再是分组卡里的一行。
         ==================================================================== -->
    <div v-else class="keep-grid">
      <section v-for="entry in groups" :key="entry.group.id" class="break-inside-avoid">
        <!-- 分组名是裸标题，不包卡片 -->
        <h2 class="md-section-title mb-2">{{ entry.group.name }}</h2>

        <div class="md-grid-auto gap-3">
          <button
            v-for="item in entry.items"
            :key="item.id"
            class="md-card-interactive flex items-center gap-3 p-4 w-full text-left"
            :title="item.name"
            @click="$emit('select', item)"
          >
            <span
              class="w-6 h-6 shrink-0 flex items-center justify-center"
              :style="{ color: item.color }"
            >
              <Icon :name="item.icon" size="md" />
            </span>

            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1">
                <span class="text-[14px] leading-5 font-medium text-md-text-high truncate">
                  {{ item.name }}
                </span>
                <Icon
                  v-if="item.action.kind === 'external'"
                  name="external"
                  size="xs"
                  class="text-md-text-disabled shrink-0"
                />
              </span>
            </span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import Icon from '../components/Icon.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import EmptyState from '../components/ui/EmptyState.vue';

import { visibleFunctionGroups } from '../stores/appearance';
import type { FunctionItemDef } from '../utils/functions';

const props = withDefaults(
  defineProps<{
    query?: string;
  }>(),
  {
    query: '',
  },
);

defineEmits<{
  (e: 'select', item: FunctionItemDef): void;
  (e: 'update:query', value: string): void;
}>();

const isSearching = computed(() => props.query.trim().length > 0);

/** 按功能名 / 描述过滤，组内全空则整组隐藏 */
const groups = computed(() => {
  const q = props.query.trim().toLowerCase();
  const source = visibleFunctionGroups.value;
  if (!q) return source;

  return source
    .map((entry) => ({
      group: entry.group,
      items: entry.items.filter((item) =>
        `${item.name} ${item.description}`.toLowerCase().includes(q),
      ),
    }))
    .filter((entry) => entry.items.length > 0);
});
</script>
