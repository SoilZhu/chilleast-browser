<template>
  <!-- ===================================================================
       通知设置（对应原版 App 的 notification_settings_screen.dart）
       三行：上课提醒 / 作业截止提醒 / 图书馆预约提醒
       每行 = 开关 + 提前量下拉；开关关闭时下拉禁用（值回落为 0）
       =================================================================== -->
  <div class="space-y-4">
    <div class="md-settings-group">
      <div
        v-for="row in ROWS"
        :key="row.key"
        class="flex items-center gap-3 px-4 py-3"
      >
        <span class="w-6 h-6 shrink-0 flex items-center justify-center text-md-text-medium">
          <Icon :name="row.icon" size="md" />
        </span>

        <span class="min-w-0 flex-1">
          <span class="block text-md2-body1 text-md-text-high leading-tight truncate">
            {{ row.title }}
          </span>
        </span>

        <select
          :class="[
            'md-select w-[120px] shrink-0',
            isOn(row.key) ? '' : 'opacity-55 cursor-not-allowed',
          ]"
          :disabled="!isOn(row.key)"
          :value="String(valueOf(row.key))"
          :aria-label="row.title"
          @change="onPick(row.key, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in row.options" :key="opt" :value="String(opt)">
            {{ row.label(opt) }}
          </option>
        </select>

        <SwitchToggle
          class="ml-1"
          :model-value="isOn(row.key)"
          @update:model-value="onToggle(row.key, $event)"
        />
      </div>
    </div>

    <!-- 系统通知权限：没有权限时提醒降级为页内提示 -->
    <div class="md-group p-4">
      <div class="flex items-start gap-3">
        <span
          class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          :style="{
            backgroundColor: permissionGranted ? '#0f9d5818' : '#f2990018',
            color: permissionGranted ? '#0f9d58' : '#f29900',
          }"
        >
          <Icon :name="permissionGranted ? 'bell' : 'bell-off'" size="sm" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-md2-body1 text-md-text-high">
            {{ permissionGranted ? '系统通知已开启' : '系统通知未开启' }}
          </div>
          <p class="text-md2-caption text-md-text-medium mt-0.5 leading-relaxed">
            {{
              permissionGranted
                ? '到点会弹出系统通知'
                : '提醒将显示在页面内，前往浏览器设置可开启系统通知'
            }}
          </p>
        </div>
        <button
          v-if="!permissionGranted"
          class="md-btn-outlined shrink-0"
          @click="askPermission"
        >
          开启
        </button>
      </div>

      <!-- 已排程的提醒：分组内用分割线（.md-group 自动加），不再套描边盒 -->
      <div v-if="scheduledReminders.length > 0" class="mt-3 pt-3">
        <div class="text-md2-overline uppercase text-md-text-disabled mb-1.5">已排程</div>
        <div class="space-y-1">
          <div
            v-for="r in scheduledReminders.slice(0, 3)"
            :key="r.key"
            class="flex items-center justify-between gap-2 text-md2-caption"
          >
            <span class="text-md-text-medium truncate">{{ r.title }} · {{ r.body }}</span>
            <span class="text-md-text-disabled tabular-nums shrink-0">{{ clockOf(r.at) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import { computed } from 'vue';
import {
  settings,
  settingsActions,
  MINUTE_OPTIONS,
  HOUR_OPTIONS,
  minuteLabel,
  hourLabel,
} from '@/stores/settings';
import {
  notifyPermission,
  requestNotifyPermission,
  scheduledReminders,
} from '@/services/reminders';

const permissionGranted = computed(() => notifyPermission.value === 'granted');

async function askPermission() {
  await requestNotifyPermission();
}

/** 时间戳 → HH:mm */
function clockOf(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type RowKey = 'course' | 'homework' | 'library';

interface RowDef {
  key: RowKey;
  title: string;
  subtitle: string;
  icon: string;
  /** 候选档位（0 = 不通知） */
  options: number[];
  /** 档位 → 文案 */
  label: (v: number) => string;
}

/** 三行提醒（标题与副标题取自 app_zh.arb 的 courseReminder / homeworkReminder / libraryReminder） */
const ROWS: RowDef[] = [
  {
    key: 'course',
    title: '上课提醒',
    subtitle: '上课前提醒',
    icon: 'book',
    options: MINUTE_OPTIONS,
    label: minuteLabel,
  },
  {
    key: 'homework',
    title: '作业截止提醒',
    subtitle: '截止前提醒',
    icon: 'tasks',
    options: HOUR_OPTIONS,
    label: hourLabel,
  },
  {
    key: 'library',
    title: '图书馆预约提醒',
    subtitle: '入馆前提醒',
    icon: 'clock',
    options: MINUTE_OPTIONS,
    label: minuteLabel,
  },
];

function valueOf(key: RowKey): number {
  if (key === 'course') return settings.reminderMinutes;
  if (key === 'homework') return settings.homeworkReminderHours;
  return settings.libraryReminderMinutes;
}

function isOn(key: RowKey): boolean {
  return valueOf(key) > 0;
}

function setValue(key: RowKey, v: number) {
  if (key === 'course') settingsActions.setReminderMinutes(v);
  else if (key === 'homework') settingsActions.setHomeworkReminderHours(v);
  else settingsActions.setLibraryReminderMinutes(v);
}

function onPick(key: RowKey, raw: string) {
  setValue(key, Number(raw));
}

/** 打开开关时给一个默认提前量；关闭时归零 */
function onToggle(key: RowKey, on: boolean) {
  if (!on) {
    setValue(key, 0);
    return;
  }
  const row = ROWS.find((r) => r.key === key);
  const fallback = row?.options.find((v) => v > 0) ?? 0;
  setValue(key, fallback);
}
</script>
