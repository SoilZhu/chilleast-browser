<template>
  <!-- ===================================================================
       外观设置（对应原版 App 的 appearance_settings_screen.dart）
       - 主题模式：跟随系统 / 浅色模式 / 深色模式
       - 布局入口：首页按钮 / 功能 / 信息流排序与隐藏
       =================================================================== -->
  <div class="space-y-6">
    <!-- 主题模式 -->
    <div class="space-y-2">
      <div class="text-md2-overline uppercase text-md-text-disabled px-1">主题模式</div>
      <div class="md-settings-group">
        <button
          v-for="opt in THEME_OPTIONS"
          :key="opt.value"
          type="button"
          :class="[
            'md-row py-3',
            appearance.themeMode === opt.value ? 'bg-brand-50 hover:bg-brand-100' : '',
          ]"
          :aria-pressed="appearance.themeMode === opt.value"
          @click="appearanceActions.setThemeMode(opt.value)"
        >
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <Icon
              :name="opt.icon"
              size="md"
              :class="appearance.themeMode === opt.value ? 'text-md-primary' : 'text-md-text-medium'"
            />
            <div class="min-w-0 flex-1">
              <div
                :class="[
                  'text-md2-body1 truncate',
                  appearance.themeMode === opt.value ? 'text-md-primary font-medium' : 'text-md-text-high',
                ]"
              >
                {{ opt.label }}
              </div>
              <div class="text-md2-caption text-md-text-medium truncate">
                {{ opt.subtitle }}
              </div>
            </div>
          </div>
          <Icon
            v-if="appearance.themeMode === opt.value"
            name="check"
            size="md"
            class="text-md-primary shrink-0"
          />
        </button>
      </div>
    </div>

    <!-- 页面布局 -->
    <div class="space-y-2">
      <div class="text-md2-overline uppercase text-md-text-disabled px-1">页面布局</div>
      <div class="md-settings-group">
        <SettingRow
          v-for="entry in ENTRIES"
          :key="entry.type"
          :title="entry.title"
          :subtitle="entry.subtitle"
          :icon="entry.icon"
          @click="$emit('open', entry.type)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';
import SettingRow from '@/components/ui/SettingRow.vue';
import { appearance, appearanceActions, type ListType, type ThemeMode } from '@/stores/appearance';

defineEmits<{ (e: 'open', type: ListType): void }>();

const THEME_OPTIONS: { value: ThemeMode; label: string; subtitle: string; icon: string }[] = [
  { value: 'system', label: '跟随系统', subtitle: '跟随设备系统设置自动切换浅色或深色外观', icon: 'settings' },
  { value: 'light', label: '浅色模式', subtitle: '保持明亮清爽的经典浅色外观', icon: 'sun' },
  { value: 'dark', label: '深色模式', subtitle: '低亮度的深色外观，暗光环境下更护眼', icon: 'moon' },
];

/** 三个入口（标题取自 app_zh.arb 的 homeButtonsSetting / functionsButtonsSetting / feedButtonsSetting） */
const ENTRIES: { type: ListType; title: string; subtitle: string; icon: string }[] = [
  { type: 'home', title: '首页按钮排序与隐藏', subtitle: '决定首页快捷入口', icon: 'home' },
  { type: 'functions', title: '功能排序与隐藏', subtitle: '决定功能页显示项', icon: 'grid' },
  { type: 'feed', title: '信息流排序与隐藏', subtitle: '决定首页区块顺序', icon: 'list' },
];
</script>
