<template>
  <!-- ===================================================================
       课表设置（对应原版 App 的 timetable_settings_screen.dart）
       - 自动同步课表（关闭时二次确认）
       - 周视图中显示下课时间
       - 第一周周一（仅自动同步关闭时可手动指定）
       - 课表订阅（原地展开）
       - 导出课表 (.ics)
       =================================================================== -->
  <div class="space-y-4">
    <div class="md-settings-group">
      <!-- 自动同步 -->
      <SettingRow title="自动同步课表" icon="refresh-cw" :clickable="false">
        <template #trailing>
          <SwitchToggle :model-value="settings.timetableAutoSyncEnabled" @update:model-value="onToggleAutoSync" />
        </template>
      </SettingRow>

      <!-- 显示下课时间 -->
      <SettingRow title="显示下课时间" icon="clock" :clickable="false">
        <template #trailing>
          <SwitchToggle
            :model-value="settings.timetableShowEndTime"
            @update:model-value="settingsActions.setTimetableShowEndTime($event)"
          />
        </template>
      </SettingRow>

      <!-- 第一周周一 -->
      <SettingRow
        title="第一周周一"
        icon="calendar"
        :clickable="false"
        :disabled="settings.timetableAutoSyncEnabled"
      >
        <template #trailing>
          <input
            type="date"
            class="md-field w-[168px] text-md2-body2"
            :class="settings.timetableAutoSyncEnabled ? 'opacity-50 cursor-not-allowed' : ''"
            :disabled="settings.timetableAutoSyncEnabled"
            :value="settings.manualFirstWeekMonday ?? ''"
            aria-label="第一周周一"
            @change="onPickMonday(($event.target as HTMLInputElement).value)"
          />
        </template>
      </SettingRow>

      <!-- 课表订阅（原地展开面板） -->
      <SettingRow
        title="课表订阅"
        icon="rss"
        :clickable="true"
        :selected="subscriptionOpen"
        @click="subscriptionOpen = !subscriptionOpen"
      >
        <template #trailing>
          <Icon
            :name="subscriptionOpen ? 'chevron-up' : 'chevron-down'"
            size="sm"
            class="text-md-text-hint shrink-0"
          />
        </template>
      </SettingRow>

      <!-- 导出课表 -->
      <SettingRow
        title="导出课表"
        icon="download"
        :clickable="true"
        @click="onExportIcs"
      />
    </div>

    <!-- 订阅面板（展开时才渲染，避免进设置页就发请求）：落画布，不套卡片 -->
    <div v-if="subscriptionOpen" class="px-1">
      <div class="md-section-title mb-2">
        <Icon name="rss" size="sm" class="text-md-text-medium shrink-0" />
        <span>订阅设置</span>
      </div>
      <TimetableSubscription />
    </div>

    <!-- 导出结果提示 -->
    <p
      v-if="exportMessage"
      :class="['px-1 text-md2-caption', exportOk ? 'text-md-success' : 'text-md-danger']"
      role="status"
    >
      {{ exportMessage }}
    </p>

    <p class="text-md2-caption text-md-text-disabled px-1">
      未设置时按学期月份自动推算
    </p>

    <!-- 关闭自动同步的二次确认 -->
    <div
      v-if="confirmOpen"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="confirmOpen = false"
    >
      <div class="md-dialog max-w-md">
        <div class="md-dialog-header">
          <h3 class="md-dialog-title">关闭自动同步？</h3>
          <button class="md-icon-btn-sm -mr-2 shrink-0" title="关闭" @click="confirmOpen = false">
            <Icon name="close" size="sm" />
          </button>
        </div>
        <div class="md-dialog-body">
          关闭后将删除本地课表，调课规则会保留。
        </div>
        <div class="md-dialog-actions">
          <button class="md-btn-text" @click="confirmOpen = false">取消</button>
          <button class="md-btn-filled" @click="confirmDisable">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Icon from '@/components/Icon.vue';
import SettingRow from '@/components/ui/SettingRow.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import TimetableSubscription from '@/components/timetable/TimetableSubscription.vue';
import { settings, settingsActions } from '@/stores/settings';
import { timetableStorage } from '@/utils/storage';
import { exportTimetableIcs } from '@/utils/ics-export';

const confirmOpen = ref(false);
/** 课表订阅面板展开态（原版是独立页面，网页端原地展开更省一次跳转） */
const subscriptionOpen = ref(false);

const exportMessage = ref('');
const exportOk = ref(true);
let exportTimer: ReturnType<typeof setTimeout> | null = null;

/** 关闭前二次确认；开启直接生效并立即从教务同步（与原版 App 一致） */
function onToggleAutoSync(next: boolean) {
  if (!next) {
    confirmOpen.value = true;
    return;
  }
  settingsActions.setTimetableAutoSync(true);
  window.dispatchEvent(new CustomEvent('chilleast:timetable-sync-requested'));
}

function confirmDisable() {
  confirmOpen.value = false;
  settingsActions.setTimetableAutoSync(false);
  // 删除本地课表缓存，调课规则保留（对齐原版 TimetableStorage.deleteTimetable / deleteCourseList）
  timetableStorage.deleteLocalTimetable();
  window.dispatchEvent(new CustomEvent('chilleast:timetable-cleared'));
}

/** 所选日期归一到当周周一后保存（与 App 的归一口径一致） */
function onPickMonday(raw: string) {
  if (!raw) {
    settingsActions.setManualFirstWeekMonday(null);
    return;
  }
  const picked = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(picked.getTime())) return;
  const offset = (picked.getDay() + 6) % 7; // 周一 = 0
  picked.setDate(picked.getDate() - offset);
  const y = picked.getFullYear();
  const m = String(picked.getMonth() + 1).padStart(2, '0');
  const d = String(picked.getDate()).padStart(2, '0');
  settingsActions.setManualFirstWeekMonday(`${y}-${m}-${d}`);
}

/** 导出课表：与课表页工具栏共用同一份实现（web/src/utils/ics-export.ts） */
function onExportIcs() {
  const result = exportTimetableIcs();
  exportOk.value = result.ok;
  exportMessage.value = result.message;

  if (exportTimer) clearTimeout(exportTimer);
  exportTimer = setTimeout(() => {
    exportMessage.value = '';
  }, 3000);
}
</script>
