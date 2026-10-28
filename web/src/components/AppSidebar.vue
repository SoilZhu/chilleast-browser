<template>
  <!-- ===================================================================
       PC 侧边导航（MD2 Navigation Drawer，展开 256px / 收起 Rail 72px）
       - 桌面常驻；点击汉堡菜单可在展开与收起间平滑切换（参考 Google Keep）
       - 移动端为临时抽屉（scrim + 侧滑）
       - 一级：App 的 5 个 Tab（首页/课表/作业/通知/功能）
       - 二级：按「学习 / 生活 / 设置」分组
       Keep 实测：
       - 展开宽 256px，收起 Rail 宽 72px，图标横向中心对齐（距左 36px）
       - 收起态单项为 48px 圆形，选中态带有圆底高亮
       =================================================================== -->
  <aside
    :class="[
      'flex flex-col h-full bg-md-background shrink-0 overflow-x-hidden transition-[width] duration-200 ease-in-out',
      isRail ? 'w-[72px]' : 'w-64'
    ]"
  >
    <!-- ---------- 桌面：顶栏 64px 已把抽屉推下来，这里再留 8px 呼吸（Keep 的导航从 y≈72 起）---------- -->
    <div v-if="!mobile" class="h-2 shrink-0" aria-hidden="true" />
    <!-- ---------- 品牌区（仅抽屉内显示，顶栏已有时可省）---------- -->
    <div v-if="mobile" class="flex items-center gap-3 px-5 pt-5 pb-4 shrink-0">
      <img
        src="/brand/mark-light.png"
        alt=""
        class="h-9 w-auto shrink-0 select-none"
        draggable="false"
        aria-hidden="true"
      />
      <div class="min-w-0">
        <div class="text-md2-subtitle1 text-md-text-high leading-tight">自在东湖</div>
        <div class="text-md2-caption text-md-text-medium">v1.0.0</div>
      </div>
    </div>

    <!-- ---------- 一级导航（App 的 5 Tab）---------- -->
    <nav class="shrink-0 flex flex-col" :class="isRail ? 'items-center px-0' : ''">
      <button
        v-for="tab in NAV_TABS"
        :key="tab.id"
        :class="[
          isRail
            ? [
                'w-12 h-12 rounded-full mx-auto flex items-center justify-center my-0.5 select-none cursor-pointer transition-colors duration-md2-short shrink-0',
                currentTab === tab.id
                  ? 'bg-brand-50 text-md-primary'
                  : 'text-md-text-medium hover:bg-md-surface-2 hover:text-md-text-high'
              ]
            : [
                currentTab === tab.id ? 'md-nav-item-active' : 'md-nav-item'
              ]
        ]"
        :title="t(NAV_TAB_I18N[tab.id] || '') || tab.label"
        :aria-label="t(NAV_TAB_I18N[tab.id] || '') || tab.label"
        @click="$emit('navigate', tab.id)"
      >
        <!-- MD2 选中态：图标从线性换成实心，和 Google Keep 的导航一致 -->
        <Icon :name="tab.icon" size="md" :variant="currentTab === tab.id ? 'filled' : 'outlined'" />
        <span v-if="!isRail" class="whitespace-nowrap truncate">{{ t(NAV_TAB_I18N[tab.id] || '') || tab.label }}</span>
      </button>
    </nav>

    <!-- ---------- 间距 / 分隔线 ---------- -->
    <div v-if="!isRail" class="h-px bg-md-divider mx-6 my-2 shrink-0" aria-hidden="true" />
    <div v-else class="w-8 h-px bg-md-divider mx-auto my-2 shrink-0" aria-hidden="true" />

    <!-- ---------- 二级页面（可折叠分组 / Rail 模式）---------- -->
    <nav class="flex-1 overflow-y-auto no-scrollbar pb-2 flex flex-col" :class="isRail ? 'items-center px-0' : ''">
      <template v-for="(group, gIdx) in groups" :key="group.name">
        <!-- Rail 模式下组间细分隔线 -->
        <div
          v-if="isRail && gIdx > 0"
          class="w-8 h-px bg-md-divider mx-auto my-2 shrink-0"
          aria-hidden="true"
        />

        <!-- 分组标题：与一级导航平行（仅展开时显示） -->
        <button
          v-if="!isRail"
          class="md-nav-group"
          :aria-expanded="!isGroupCollapsed(group.name)"
          @click="toggleGroup(group.name)"
        >
          <span class="truncate">{{ group.name }}</span>
          <span class="text-[12px] text-md-text-hint tabular-nums bg-md-surface-2 px-1.5 py-0.5 rounded-full font-normal">
            {{ group.pages.length }}
          </span>
          <Icon
            name="chevron-down"
            size="sm"
            class="ml-auto text-md-text-hint transition-transform duration-md2-short"
            :class="isGroupCollapsed(group.name) ? '-rotate-90' : ''"
          />
        </button>

        <!-- 组内页面（展开模式遵循折叠；Rail 模式平铺图标） -->
        <template v-if="isRail || !isGroupCollapsed(group.name)">
          <button
            v-for="page in group.pages"
            :key="page.id"
            :class="[
              isRail
                ? [
                    'w-12 h-12 rounded-full mx-auto flex items-center justify-center my-0.5 select-none cursor-pointer transition-colors duration-md2-short shrink-0',
                    currentTab === page.id
                      ? 'bg-brand-50 text-md-primary'
                      : 'text-md-text-medium hover:bg-md-surface-2 hover:text-md-text-high'
                  ]
                : [
                    currentTab === page.id ? 'md-nav-item-active' : 'md-nav-item'
                  ]
            ]"
            :title="page.label"
            :aria-label="page.label"
            @click="$emit('navigate', page.id)"
          >
            <Icon
              :name="page.icon"
              size="md"
              :variant="currentTab === page.id ? 'filled' : 'outlined'"
            />
            <span v-if="!isRail" class="whitespace-nowrap truncate">{{ page.label }}</span>
          </button>
        </template>
      </template>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { NAV_TABS, NAV_TAB_I18N, groupedSubPages } from '../utils/functions';
import { useT } from '../stores/i18n';
import type { StudentInfo } from '../utils/storage';

const props = withDefaults(
  defineProps<{
    student: StudentInfo | null;
    currentTab: string;
    /** 一级 Tab 高亮（二级页面归属到它所属的一级 Tab） */
    activeNav?: string;
    mobile?: boolean;
    collapsed?: boolean;
  }>(),
  {
    activeNav: '',
    mobile: false,
    collapsed: false,
  },
);

defineEmits<{
  (e: 'navigate', tab: string): void;
  (e: 'logout'): void;
}>();

const t = useT();

const isRail = computed(() => props.collapsed && !props.mobile);

const groups = computed(() => groupedSubPages());

/** 当前展开的子版块名称：始终只展开一个，默认全部缩起 (null) */
const expandedGroup = ref<string | null>(null);

function isGroupCollapsed(name: string): boolean {
  return expandedGroup.value !== name;
}

function toggleGroup(name: string) {
  expandedGroup.value = expandedGroup.value === name ? null : name;
}

// 当前页所在的分组自动展开（例如从搜索跳进某个二级页）
watch(
  () => props.currentTab,
  (tab) => {
    const group = groups.value.find((g) => g.pages.some((p) => p.id === tab));
    if (group) {
      expandedGroup.value = group.name;
    }
  },
);
</script>
