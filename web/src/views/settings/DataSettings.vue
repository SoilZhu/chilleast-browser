<template>
  <!-- ===================================================================
       数据设置（对应原版 App 的 data_sync_settings_screen.dart）
       - 自动同步（通过学习通网盘）
       - 数据导出：把设置与布局下载成 JSON
       - 数据导入：选 JSON 文件后覆盖本机数据
       - 清理缓存：确认后清空本机数据并重载
       =================================================================== -->
  <div class="space-y-4">
    <!-- 同步与备份：一个分组，行间靠分割线 -->
    <div class="md-settings-group">
      <!-- 自动同步：网页版强制开启，副标题叫“通过学习通云盘” -->
      <SettingRow
        title="自动同步"
        subtitle="通过学习通云盘"
        icon="cloud"
        :clickable="false"
      >
        <template #trailing>
          <span v-if="isSyncing" class="md-settings-value mr-2">同步中…</span>
          <SwitchToggle :model-value="true" :disabled="true" />
        </template>
      </SettingRow>

      <!-- 数据导出 -->
      <SettingRow title="数据导出" icon="download" :clickable="!busy" @click="exportData" />

      <!-- 数据导入 -->
      <SettingRow title="数据导入" icon="upload" :clickable="!busy" @click="pickFile">
        <template #trailing>
          <span v-if="busy === 'import'" class="md-settings-value">导入中…</span>
          <Icon v-else name="chevron-right" size="sm" class="text-md-text-hint shrink-0" />
        </template>
      </SettingRow>

      <!-- 清理缓存 -->
      <SettingRow title="清理缓存" icon="trash" danger :clickable="!busy" @click="confirmClear = true" />
    </div>

    <!-- 结果提示 -->
    <p v-if="message" :class="['text-md2-caption px-1', messageError ? 'text-md-danger' : 'text-md-success']" role="status">
      {{ message }}
    </p>

    <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onFilePicked" />

    <!-- 导入确认 -->
    <div
      v-if="confirmImport"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="confirmImport = false"
    >
      <div class="md-dialog max-w-md">
        <div class="md-dialog-header">
          <h3 class="md-dialog-title">确认导入？</h3>
          <button class="md-icon-btn-sm -mr-2 shrink-0" title="关闭" @click="confirmImport = false">
            <Icon name="close" size="sm" />
          </button>
        </div>
        <div class="md-dialog-body">导入将覆盖当前设置与本地资料，是否继续？</div>
        <div class="md-dialog-actions">
          <button class="md-btn-text" @click="confirmImport = false">取消</button>
          <button class="md-btn-filled" @click="applyImport">确定</button>
        </div>
      </div>
    </div>

    <!-- 清理确认 -->
    <div
      v-if="confirmClear"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="confirmClear = false"
    >
      <div class="md-dialog max-w-md">
        <div class="md-dialog-header">
          <h3 class="md-dialog-title">确认清理缓存？</h3>
          <button class="md-icon-btn-sm -mr-2 shrink-0" title="关闭" @click="confirmClear = false">
            <Icon name="close" size="sm" />
          </button>
        </div>
        <div class="md-dialog-body">将清除本机缓存数据，不会影响登录状态。</div>
        <div class="md-dialog-actions">
          <button class="md-btn-text" @click="confirmClear = false">取消</button>
          <button class="md-btn-filled" @click="clearCache">确定</button>
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
import { settingsActions } from '@/stores/settings';
import { syncState, isSyncing, setAutoSync } from '@/services/cloudSync';

/** 开启时走 initialSync：云端有备份就拉取，没有才推送 */
async function onToggleSync(next: boolean) {
  const outcome = await setAutoSync(next);
  if (next) {
    if (outcome === 'pulled') {
      // 拉取已在引擎内完成 applyBackup + refreshAfterRestore（界面即时生效），
      // 这里不再整页 reload —— 既不会丢掉当前设置页的位置，也不用定时器硬等。
      settingsActions.setCloudBackupAutoSync(true);
      flash('已拉取云端备份并应用');
      return;
    }
    if (outcome === 'pushed') {
      settingsActions.setCloudBackupAutoSync(true);
      flash('已创建云端备份');
      return;
    }
    flash('云端同步失败，请稍后重试', true);
    return;
  }
  settingsActions.setCloudBackupAutoSync(false);
  flash('已关闭自动同步');
}

/** 需要随备份一起搬走的本机键（设置 + 布局个性化 + 宿舍绑定） */
const BACKUP_KEYS = [
  'course_reminder_minutes',
  'homework_reminder_hours',
  'library_reminder_minutes',
  'timetable_auto_sync_enabled',
  // 与手机端 CloudBackupManager.toggleKey 同名（旧键 _enabled 仅做迁移读取）
  'cloud_backup_auto_sync',
  'timetable_show_end_time',
  'timetable_manual_first_week_monday',
  'app_language_code',
  'home_function_items',
  'function_page_items',
  'home_feed_items',
  'function_group_order',
  'hidden_function_groups',
  'feed_auto_sort',
  // 双宿舍两个槽位都要带上，否则第二间宿舍不同步
  'saved_electricity_room',
  'saved_electricity_room_2',
  'chilleast_dorm_name',
  'chilleast_dorm',
  // 课表云端订阅（网页端与手机端共用同一组键）
  'timetable_subscription_enabled',
  'timetable_subscription_uuid',
] as const;

const fileInput = ref<HTMLInputElement | null>(null);
const busy = ref<'' | 'import'>('');
const message = ref('');
const messageError = ref(false);
const confirmImport = ref(false);
const confirmClear = ref(false);

/** 待导入的数据（选完文件后暂存，确认才落盘） */
let pendingData: Record<string, string> | null = null;

function flash(text: string, error = false) {
  message.value = text;
  messageError.value = error;
  window.setTimeout(() => {
    if (message.value === text) message.value = '';
  }, 3000);
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------
function exportData() {
  const data: Record<string, string | null> = {};
  for (const key of BACKUP_KEYS) data[key] = localStorage.getItem(key);

  const payload = {
    app: 'chilleast',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `chilleast-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  flash('已导出备份');
}

// ---------------------------------------------------------------------------
// 导入
// ---------------------------------------------------------------------------
function pickFile() {
  fileInput.value?.click();
}

async function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const data = parsed?.data;
    if (!data || typeof data !== 'object') {
      flash('文件格式不正确', true);
      return;
    }
    pendingData = {};
    for (const key of BACKUP_KEYS) {
      const v = (data as Record<string, unknown>)[key];
      if (typeof v === 'string') pendingData[key] = v;
    }
    confirmImport.value = true;
  } catch {
    flash('文件格式不正确', true);
  }
}

function applyImport() {
  confirmImport.value = false;
  if (!pendingData) return;
  busy.value = 'import';
  try {
    for (const [key, value] of Object.entries(pendingData)) {
      localStorage.setItem(key, value);
    }
    flash('已导入备份');
    // 状态 store 在模块加载时读 localStorage，重载后才会生效
    window.setTimeout(() => window.location.reload(), 600);
  } catch {
    flash('导入失败，请重试', true);
  } finally {
    pendingData = null;
    busy.value = '';
  }
}

// ---------------------------------------------------------------------------
// 清理缓存
// ---------------------------------------------------------------------------
/** 登录态不参与清理，避免清完缓存被踢回登录页 */
const AUTH_KEYS = ['chilleast_token', 'chilleast_student', 'chilleast_saved_id'];

function clearCache() {
  confirmClear.value = false;
  const keep: Record<string, string> = {};
  for (const key of AUTH_KEYS) {
    const v = localStorage.getItem(key);
    if (v !== null) keep[key] = v;
  }
  localStorage.clear();
  for (const [key, value] of Object.entries(keep)) localStorage.setItem(key, value);
  window.location.reload();
}
</script>
