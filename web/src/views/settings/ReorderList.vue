<template>
  <!-- ===================================================================
       排序与隐藏列表（对应原版 App 的 button_reorder_screen.dart）
       - 上块「已显示」：可拖拽排序，每项右侧 = 拖拽把手 + 隐藏按钮
       - 下块「已隐藏」：每项右侧 = 显示按钮
       - 底部：恢复默认
       - 信息流额外提供「自动排序」开关
       =================================================================== -->
  <div class="space-y-4">
    <!-- 操作提示 -->
    <p class="flex items-center gap-1.5 text-md2-caption text-md-text-disabled px-1">
      <Icon name="info" size="xs" />
      {{ type === 'functions' ? '拖动调整功能大类顺序，点眼睛图标隐藏大类' : '拖动调整顺序，点眼睛图标隐藏' }}
    </p>

    <!-- 信息流：自动排序 -->
    <div v-if="type === 'feed'" class="md-settings-group">
      <SettingRow
        title="自动排序"
        subtitle="按日期与状态自动排列"
        icon="sort"
        :clickable="false"
      >
        <template #trailing>
          <SwitchToggle
            :model-value="appearance.feedAutoSort"
            @update:model-value="appearanceActions.setFeedAutoSort($event)"
          />
        </template>
      </SettingRow>
    </div>

    <div :class="autoSortOn ? 'opacity-55 pointer-events-none space-y-4' : 'space-y-4'">
      <!-- 已显示 -->
      <section class="space-y-2">
        <div class="flex items-center gap-1.5 px-1">
          <Icon name="eye" size="xs" class="text-md-text-disabled" />
          <h3 class="text-md2-overline uppercase text-md-text-disabled">已显示</h3>
          <span class="text-md2-caption text-md-text-hint tabular-nums">{{ visibleItems.length }}</span>
        </div>

        <ul class="space-y-1.5">
          <li
            v-for="(item, index) in visibleItems"
            :key="item.id"
            :class="[
              'md-sort-item',
              dragIndex === index ? 'md-sort-item-dragging' : '',
              dropIndex === index && dragIndex !== null && dragIndex !== index
                ? 'border-md-primary'
                : '',
            ]"
            draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent="dropIndex = index"
            @dragend="onDragEnd"
            @drop.prevent="onDrop(index)"
          >
            <span
              class="w-8 h-8 rounded-md2-md flex items-center justify-center shrink-0"
              :style="{ backgroundColor: item.color + '18', color: item.color }"
            >
              <Icon :name="item.icon" size="sm" />
            </span>

            <span class="min-w-0 flex-1 text-md2-body1 text-md-text-high truncate">
              {{ item.name }}
            </span>

            <button
              type="button"
              class="md-icon-btn-sm"
              title="隐藏"
              @click="toggleVisible(item.id)"
            >
              <Icon name="eye-off" size="sm" />
            </button>

            <span class="md-drag-handle px-0.5" aria-hidden="true">
              <Icon name="drag-handle" size="md" />
            </span>
          </li>
        </ul>

        <EmptyState
          v-if="visibleItems.length === 0"
          text="暂无显示项"
          icon="eye-off"
          compact
        />
      </section>

      <!-- 已隐藏 -->
      <section class="space-y-2">
        <div class="flex items-center gap-1.5 px-1">
          <Icon name="eye-off" size="xs" class="text-md-text-disabled" />
          <h3 class="text-md2-overline uppercase text-md-text-disabled">已隐藏</h3>
          <span class="text-md2-caption text-md-text-hint tabular-nums">{{ hiddenItems.length }}</span>
        </div>

        <ul class="space-y-1.5">
          <li
            v-for="item in hiddenItems"
            :key="item.id"
            class="md-sort-item md-sort-item-hidden"
          >
            <span
              class="w-8 h-8 rounded-md2-md flex items-center justify-center shrink-0"
              :style="{ backgroundColor: item.color + '18', color: item.color }"
            >
              <Icon :name="item.icon" size="sm" />
            </span>

            <span class="min-w-0 flex-1 text-md2-body1 text-md-text-high truncate">
              {{ item.name }}
            </span>

            <button
              type="button"
              class="md-icon-btn-sm"
              title="显示"
              @click="toggleVisible(item.id)"
            >
              <Icon name="eye" size="sm" />
            </button>
          </li>
        </ul>

        <EmptyState v-if="hiddenItems.length === 0" text="暂无隐藏项" icon="eye" compact />
      </section>
    </div>

    <!-- 恢复默认 -->
    <div class="pt-1">
      <button class="md-btn-outlined w-full" @click="handleReset">
        <Icon name="refresh-cw" size="sm" />
        恢复默认
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import SettingRow from '@/components/ui/SettingRow.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { appearance, appearanceActions, FEED_SECTIONS } from '@/stores/appearance';
import type { ListType } from '@/stores/appearance';
import { FUNCTION_GROUPS, getFunction, isFunctionVisible } from '@/utils/functions';

const props = defineProps<{
  /** 要编辑的清单：首页按钮 / 功能 / 信息流 */
  type: ListType;
}>();

/** 列表项的可展示信息（图标 + 名称 + 强调色） */
interface DisplayItem {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const groupMap = new Map(FUNCTION_GROUPS.map((g) => [g.id, g]));

/** 从 id 解析展示信息：功能大类取 FUNCTION_GROUPS，信息流取 FEED_SECTIONS，首页入口取 ALL_FUNCTIONS */
function resolve(id: string): DisplayItem {
  if (props.type === 'functions') {
    const group = groupMap.get(id);
    return {
      id,
      name: group?.name ?? id,
      icon: group?.icon ?? 'apps',
      color: group?.color ?? '#5f6368',
    };
  }
  if (props.type === 'feed') {
    const section = FEED_SECTIONS.find((s) => s.id === id);
    return {
      id,
      name: section?.label ?? id,
      icon: section?.icon ?? 'apps',
      color: '#5f6368',
    };
  }
  const fn = getFunction(id);
  return {
    id,
    name: fn?.name ?? id,
    icon: fn?.icon ?? 'apps',
    color: fn?.color ?? '#5f6368',
  };
}

/**
 * 可编辑的清单（仅首页/信息流使用当前列表）。
 * `hidden: true` 的功能（站外小程序入口）在功能页本来就不露出，
 * 这里也不列出来 —— 但 id 仍留在 appearance 清单里，配置不会丢。
 */
const currentList = computed(() => {
  if (props.type === 'functions') return [];
  return appearance[props.type].filter(
    (e) => props.type === 'feed' || isFunctionVisible(getFunction(e.id)),
  );
});

const visibleItems = computed(() => {
  if (props.type === 'functions') {
    const hiddenSet = new Set(appearance.hiddenGroups);
    return appearance.groupOrder
      .filter((id) => !hiddenSet.has(id))
      .map((id) => resolve(id));
  }
  return currentList.value.filter((e) => e.visible).map((e) => resolve(e.id));
});

const hiddenItems = computed(() => {
  if (props.type === 'functions') {
    const hiddenSet = new Set(appearance.hiddenGroups);
    return appearance.groupOrder
      .filter((id) => hiddenSet.has(id))
      .map((id) => resolve(id));
  }
  return currentList.value.filter((e) => !e.visible).map((e) => resolve(e.id));
});

const toggleVisible = (id: string) => {
  if (props.type === 'functions') {
    appearanceActions.toggleGroupHidden(id);
  } else {
    appearanceActions.toggleVisible(props.type, id);
  }
};

const handleReset = () => {
  if (props.type === 'functions') {
    appearanceActions.resetGroups();
  } else {
    appearanceActions.reset(props.type);
  }
};

/** 信息流开了自动排序时，手动列表整体置灰不可操作 */
const autoSortOn = computed(() => props.type === 'feed' && appearance.feedAutoSort);

// ---------------------------------------------------------------------------
// 拖拽排序（HTML5 draggable）
// ---------------------------------------------------------------------------
const dragIndex = ref<number | null>(null);
const dropIndex = ref<number | null>(null);

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index;
  dropIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    // Firefox 需要写入数据才会触发拖拽
    event.dataTransfer.setData('text/plain', String(index));
  }
}

function onDrop(target: number) {
  const from = dragIndex.value;
  if (from !== null && from !== target) {
    if (props.type === 'functions') {
      const visibleIds = visibleItems.value.map((e) => e.id);
      const hiddenIds = hiddenItems.value.map((e) => e.id);
      const [moved] = visibleIds.splice(from, 1);
      visibleIds.splice(target, 0, moved);
      appearanceActions.setGroupOrder([...visibleIds, ...hiddenIds]);
    } else {
      // 已显示项之间换位：重排后把隐藏项统一排到末尾
      const visibleIds = visibleItems.value.map((e) => e.id);
      const hiddenIds = hiddenItems.value.map((e) => e.id);
      const [moved] = visibleIds.splice(from, 1);
      visibleIds.splice(target, 0, moved);
      // 界面上不露出的项（`hidden: true`）不参与排序，但要原样保留在清单末尾，
      // 否则一次拖拽就会把它们的配置整条抹掉。
      const offScreen = appearance[props.type]
        .filter((e) => !visibleIds.includes(e.id) && !hiddenIds.includes(e.id))
        .map((e) => ({ id: e.id, visible: e.visible }));
      appearanceActions.setList(props.type, [
        ...visibleIds.map((id) => ({ id, visible: true })),
        ...hiddenIds.map((id) => ({ id, visible: false })),
        ...offScreen,
      ]);
    }
  }
  onDragEnd();
}

function onDragEnd() {
  dragIndex.value = null;
  dropIndex.value = null;
}
</script>
