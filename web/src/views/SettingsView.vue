<template>
  <!-- ===================================================================
       设置主页（对应原版 App 的 settings_screen.dart）
       - 宽屏（≥1024px）：MasterDetail 主从分栏，左列表固定 5 项，右侧渲染详情
       - 窄屏：二级页铺满整宽，通过返回按钮回到列表
       - 默认选中「语言」
       =================================================================== -->
  <div>
    <!-- ================= 宽屏：主从分栏 ================= -->
    <MasterDetail
      v-if="isWide"
      :has-detail="detailOpen"
      :detail-title="detailTitle"
      @close="detailOpen = false"
    >
      <!-- 左：设置项列表 -->
      <div class="py-1">
        <PageHeader title="设置" />
        <nav class="md-settings-group mt-4">
          <SettingRow
            v-for="page in SETTINGS_PAGES"
            :key="page.id"
            :title="page.label"
            :icon="page.icon"
            :value="valueOf(page.id)"
            :selected="detailOpen && selected === page.id"
            @click="openPage(page.id)"
          />
        </nav>
      </div>

      <!-- 右：二级页详情（长列表在栏内滚动，避免整页被撑高） -->
      <template #detail>
        <div v-if="detailOpen" class="max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
          <!-- 外观 → 排序列表：提供返回外观页的路径 -->
          <button
            v-if="reorderType"
            class="md-btn-text -ml-2 mb-3"
            @click="reorderType = null"
          >
            <Icon name="arrow-left" size="sm" />
            外观
          </button>

          <ReorderList v-if="reorderType" :type="reorderType" />

          <LanguageSettings
            v-else-if="selected === 'language'"
            :model-value="languageCode"
            @update:model-value="setLanguage"
          />
          <AppearanceSettings
            v-else-if="selected === 'appearance'"
            @open="reorderType = $event"
          />
          <WidgetSettings v-else-if="selected === 'widget'" @open-home-buttons="openReorder('home')" />
          <NotificationSettings v-else-if="selected === 'notification'" />
          <TimetableSettings v-else-if="selected === 'timetable-settings'" />
          <DataSettings v-else-if="selected === 'data'" />
        </div>
      </template>
    </MasterDetail>

    <!-- ================= 窄屏：列表 / 详情二选一 ================= -->
    <div v-else class="max-w-2xl">
      <template v-if="!detailOpen">
        <PageHeader title="设置" />
        <nav class="md-settings-group mt-4">
          <SettingRow
            v-for="page in SETTINGS_PAGES"
            :key="page.id"
            :title="page.label"
            :icon="page.icon"
            :value="valueOf(page.id)"
            @click="openPage(page.id)"
          />
        </nav>
      </template>

      <template v-else>
        <PageHeader
          :title="detailTitle"
          :back="true"
          @back="handleBack"
        />

        <div class="mt-4">
          <ReorderList v-if="reorderType" :type="reorderType" />

          <LanguageSettings
            v-else-if="selected === 'language'"
            :model-value="languageCode"
            @update:model-value="setLanguage"
          />
          <AppearanceSettings
            v-else-if="selected === 'appearance'"
            @open="reorderType = $event"
          />
          <WidgetSettings v-else-if="selected === 'widget'" @open-home-buttons="openReorder('home')" />
          <NotificationSettings v-else-if="selected === 'notification'" />
          <TimetableSettings v-else-if="selected === 'timetable-settings'" />
          <DataSettings v-else-if="selected === 'data'" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import Icon from '@/components/Icon.vue';
import MasterDetail from '@/components/ui/MasterDetail.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SettingRow from '@/components/ui/SettingRow.vue';

import LanguageSettings from './settings/LanguageSettings.vue';
import { currentLang, setLanguage as setLang, languageLabel, type LangCode } from '@/stores/i18n';
import AppearanceSettings from './settings/AppearanceSettings.vue';
import ReorderList from './settings/ReorderList.vue';
import WidgetSettings from './settings/WidgetSettings.vue';
import NotificationSettings from './settings/NotificationSettings.vue';
import TimetableSettings from './settings/TimetableSettings.vue';
import DataSettings from './settings/DataSettings.vue';

import { SETTINGS_PAGES } from '@/utils/functions';
import { settings, activeReminderCount } from '@/stores/settings';
import { appearance, type ListType } from '@/stores/appearance';

/** 设置页契约：退出登录 / 清理缓存由父级承载 */
defineEmits<{ (e: 'logout'): void; (e: 'clearCache'): void }>();

// ---------------------------------------------------------------------------
// 分栏状态
// ---------------------------------------------------------------------------
const isWide = ref(window.matchMedia('(min-width: 1024px)').matches);
/** 当前选中的二级页 id（默认语言） */
const selected = ref<string>('language');
/** 详情是否展开：宽屏右侧渲染、窄屏整屏切换（窄屏先看列表） */
const detailOpen = ref(isWide.value);
/** 外观页里的排序列表类型（非空时右栏显示 ReorderList） */
const reorderType = ref<ListType | null>(null);

let mql: MediaQueryList | null = null;
function syncWide(event: MediaQueryListEvent | MediaQueryList) {
  isWide.value = event.matches;
}

onMounted(() => {
  mql = window.matchMedia('(min-width: 1024px)');
  syncWide(mql);
  mql.addEventListener('change', syncWide);
  window.addEventListener('popstate', onSettingsPopState);
});

onUnmounted(() => {
  mql?.removeEventListener('change', syncWide);
  window.removeEventListener('popstate', onSettingsPopState);
});

function openPage(id: string) {
  selected.value = id;
  reorderType.value = null;
  detailOpen.value = true;
  if (!isWide.value && typeof window !== 'undefined' && window.history?.pushState) {
    window.history.pushState(
      { ...window.history.state, settingPage: id },
      '',
      window.location.href,
    );
  }
}

/** 从小组件页跳到「首页按钮排序与隐藏」 */
function openReorder(type: ListType) {
  selected.value = 'appearance';
  reorderType.value = type;
  detailOpen.value = true;
  if (!isWide.value && typeof window !== 'undefined' && window.history?.pushState) {
    window.history.pushState(
      { ...window.history.state, settingPage: 'appearance', reorder: type },
      '',
      window.location.href,
    );
  }
}

function handleBack() {
  if (typeof window !== 'undefined' && (window.history?.state?.settingPage || window.history?.state?.reorder)) {
    window.history.back();
  } else if (reorderType.value) {
    reorderType.value = null;
  } else {
    detailOpen.value = false;
  }
}

function onSettingsPopState(event: PopStateEvent) {
  if (isWide.value) return;
  const state = event.state || {};
  if (state.reorder) {
    reorderType.value = state.reorder;
    detailOpen.value = true;
  } else if (state.settingPage) {
    selected.value = state.settingPage;
    reorderType.value = null;
    detailOpen.value = true;
  } else {
    reorderType.value = null;
    detailOpen.value = false;
  }
}

/** 右栏标题：外观页里的排序列表沿用三项标题，其余用二级页名 */
const detailTitle = computed(() => {
  if (reorderType.value === 'home') return '首页按钮设置';
  if (reorderType.value === 'functions') return '功能排序';
  if (reorderType.value === 'feed') return '信息流设置';
  return SETTINGS_PAGES.find((p) => p.id === selected.value)?.label ?? '设置';
});

// ---------------------------------------------------------------------------
// 语言（localStorage 键沿用 App 的 app_language_code）
// ---------------------------------------------------------------------------
const languageCode = computed(() => currentLang.value);

function setLanguage(code: string) {
  setLang(code as LangCode);
}

// ---------------------------------------------------------------------------
// 左列表右侧的值：全部来自真实状态，不写死
// ---------------------------------------------------------------------------
function valueOf(id: string): string {
  if (id === 'appearance') {
    const mode = appearance.themeMode;
    if (mode === 'light') return '浅色模式';
    if (mode === 'dark') return '深色模式';
    return '跟随系统';
  }
  if (id === 'language') return languageLabel(languageCode.value);
  if (id === 'notification') {
    return activeReminderCount.value > 0 ? `已开启 ${activeReminderCount.value} 项` : '未开启';
  }
  if (id === 'timetable-settings') return settings.timetableAutoSyncEnabled ? '自动同步' : '手动';
  if (id === 'data') return settings.cloudBackupAutoSyncEnabled ? '自动同步' : '手动';
  if (id === 'widget') return '仅手机';
  return '';
}
</script>
