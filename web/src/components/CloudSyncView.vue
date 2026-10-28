<template>
  <!-- ===================================================================
       云端同步（对应原版 App 的 cloud_backup_manager + data_sync_settings）
       - 自动同步开关：开启时先拉取云端最新，云端没有才推本地
       - 增量同步：本地数据变更去抖 10 秒后自动上传，旧快照云端收敛
       =================================================================== -->
  <div class="space-y-6">
    <PageHeader title="云端同步" subtitle="课表、作业与设置跨端同步">
      <template #actions>
        <span :class="phaseChipClass">{{ phaseLabel }}</span>
      </template>
    </PageHeader>

    <!-- ================= 状态：裸标题 + 分组行，不包卡片 ================= -->
    <section class="space-y-3">
      <SectionHeader title="云端备份" icon="cloud" />

      <div class="flex flex-wrap items-center gap-2">
        <span v-if="syncState.enabled" class="md-chip-success">自动同步已开启</span>
        <span v-else class="md-chip-neutral">自动同步已关闭</span>
        <span v-if="syncState.dirty" class="md-chip-warning">有未同步改动</span>
      </div>

      <p class="text-md2-body2 text-md-text-medium leading-relaxed">{{ syncHint }}</p>

      <div class="flex flex-wrap items-center gap-2">
        <button class="md-btn-outlined" :disabled="isSyncing" @click="pullNow">
          <Icon name="download" size="sm" :class="{ 'animate-spin': syncState.phase === 'pulling' }" />
          拉取云端
        </button>
        <button class="md-btn-filled" :disabled="isSyncing" @click="pushNow">
          <Icon name="upload" size="sm" />
          立即同步
        </button>
      </div>

      <NoteCard title="同步设置" :flush="true">
        <div class="md-feed-list">
        <!-- 自动同步开关行 -->
        <div class="md-feed-row justify-between gap-4 py-3.5">
          <div class="min-w-0">
            <div class="text-md2-body1 text-md-text-high">自动同步</div>
            <div class="text-md2-caption text-md-text-medium mt-0.5">
              本地有改动后自动备份，换机不丢
            </div>
          </div>
          <SwitchToggle :model-value="syncState.enabled" @update:model-value="onToggleAuto" />
        </div>

        <!-- 明细行 -->
        <div class="md-feed-row justify-between gap-4 py-3">
          <span class="text-md2-caption text-md-text-medium shrink-0">云端文件</span>
          <span
            class="text-md2-body2 text-md-text-high font-mono truncate"
            :title="syncState.cloudFileName || ''"
          >
            {{ syncState.cloudFileName || '暂无备份' }}
          </span>
        </div>
        <div class="md-feed-row justify-between gap-4 py-3">
          <span class="text-md2-caption text-md-text-medium shrink-0">最后同步</span>
          <span class="text-md2-body2 text-md-text-high font-mono tabular-nums">
            {{ formatTime(syncState.lastSyncAt) }}
          </span>
        </div>
        <div class="md-feed-row justify-between gap-4 py-3">
          <span class="text-md2-caption text-md-text-medium shrink-0">最后拉取</span>
          <span class="text-md2-body2 text-md-text-high font-mono tabular-nums">
            {{ formatTime(syncState.lastPullAt) }}
          </span>
        </div>
        <div class="md-feed-row justify-between gap-4 py-3">
          <span class="text-md2-caption text-md-text-medium shrink-0">上次同步内容</span>
          <span class="text-md2-body2 text-md-text-high truncate">{{ appliedText }}</span>
        </div>
        </div>
      </NoteCard>

      <!-- 错误提示 -->
      <Alert v-if="syncState.error" kind="error" :text="syncState.error" />
    </section>

    <!-- ================= 同步内容：一张便签卡，模块是卡内行 ================= -->
    <NoteCard title="同步内容" :meta="`${moduleCards.length} 项`">
      <div class="md-feed-list">
        <div
          v-for="card in moduleCards"
          :key="card.id"
          class="md-feed-row items-start gap-3 py-3.5"
        >
          <span
            class="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            :style="{ backgroundColor: card.color + '18', color: card.color }"
          >
            <Icon :name="card.icon" size="sm" />
          </span>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-md2-subtitle2 text-md-text-high truncate">{{ card.title }}</span>
              <span :class="card.count > 0 ? 'md-chip-success' : 'md-chip-neutral'" class="shrink-0">
                {{ card.count }} 项
              </span>
            </div>

            <p class="text-md2-caption text-md-text-medium mt-0.5 leading-relaxed">
              {{ card.desc }}
            </p>

            <div
              v-if="card.details.length > 0"
              class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-md2-caption text-md-text-medium"
            >
              <span v-for="(d, i) in card.details" :key="i" class="truncate">{{ d }}</span>
            </div>
            <div v-else class="mt-1.5 text-md2-caption text-md-text-disabled">
              {{ card.empty }}
            </div>
          </div>
        </div>
      </div>
    </NoteCard>

    <p class="text-md2-caption text-md-text-disabled">
      开启后先拉取云端最新备份；本地改动会在 10 秒后自动上传。
      云端按「现代轨 / 兼容轨」分开收敛，每轨各保留最近 3 份。
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
import SectionHeader from './ui/SectionHeader.vue';
import NoteCard from './ui/NoteCard.vue';
import Alert from './ui/Alert.vue';
import PageHeader from './ui/PageHeader.vue';
import SwitchToggle from './ui/SwitchToggle.vue';
import {
  syncState,
  isSyncing,
  setAutoSync,
  pullNow as pullNowAction,
  pushNow as pushNowAction,
} from '../services/cloudSync';
import { readTimetableRules } from '../services/backup';

defineProps<{ backupInfo?: any }>();

const emit = defineEmits<{ (e: 'refresh-sync'): void }>();

// ---------------------------------------------------------------------------
// 状态展示
// ---------------------------------------------------------------------------

const phaseLabel = computed(() => {
  switch (syncState.value.phase) {
    case 'pulling':
      return '拉取中…';
    case 'pushing':
      return '上传中…';
    case 'syncing':
      return '同步中…';
    case 'error':
      return '同步失败';
    default:
      return syncState.value.enabled ? '已开启' : '未开启';
  }
});

const phaseChipClass = computed(() =>
  syncState.value.phase === 'error'
    ? 'md-chip-danger'
    : syncState.value.enabled
      ? 'md-chip-success'
      : 'md-chip-neutral',
);

const syncHint = computed(() => {
  if (syncState.value.phase === 'error') return syncState.value.error || '同步失败，请稍后重试';
  if (syncState.value.enabled) {
    return syncState.value.dirty ? '本地有改动，稍后自动上传' : '本地与云端已一致';
  }
  return '开启后自动备份课表、作业与设置';
});

function formatTime(iso: string | null): string {
  if (!iso) return '未同步';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '未同步';
  return d.toLocaleString('zh-CN', { hour12: false });
}

const appliedText = computed(() => {
  const list = syncState.value.lastApplied;
  if (!list.length) return '—';
  return list.slice(0, 3).join('、') + (list.length > 3 ? ` 等 ${list.length} 项` : '');
});

// ---------------------------------------------------------------------------
// 同步内容卡片（数据全部来自真实本地状态）
// ---------------------------------------------------------------------------

function readJson(key: string): any[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** 读某个宿舍槽位的显示名（与 backup.ts 读写的是同一组键） */
function dormNameOf(slot: 0 | 1): string {
  const key = slot === 0 ? 'saved_electricity_room' : 'saved_electricity_room_2';
  try {
    const raw = localStorage.getItem(key) || (slot === 0 ? localStorage.getItem('chilleast_dorm') : null);
    if (!raw) return '';
    const room = JSON.parse(raw) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
    return (
      text(room.fullName) ||
      [text(room.areaName) || text(room.area), text(room.buildingName) || text(room.building), text(room.roomName) || text(room.room)]
        .filter(Boolean)
        .join(' ')
    );
  } catch {
    return '';
  }
}

const moduleCards = computed(() => {
  const rules = readTimetableRules();
  const manualHw = readJson('chilleast_manual_homework');
  const manualExam = readJson('chilleast_manual_exam');
  // 双宿舍：两间都展示（与备份里 electricityRoom / electricityRoom2 对应）
  const dorms = [dormNameOf(0), dormNameOf(1)].filter(Boolean);
  const memories = readJson('ai_memory_items');
  const lang = localStorage.getItem('app_language_code') || 'system';

  return [
    {
      id: 'rules',
      title: '调课规则',
      icon: 'calendar',
      color: '#0f9d58',
      desc: '调课、停课与加课已应用到课表',
      count: rules.length,
      empty: '暂无调课规则',
      details: rules.slice(0, 4).map((r: any) => r?.description || r?.type || '课表调整'),
    },
    {
      id: 'dorm',
      title: '宿舍绑定',
      icon: 'zap',
      color: '#f29900',
      desc: '电费查询与首页余额共用',
      count: dorms.length,
      empty: '未绑定宿舍',
      details: dorms,
    },
    {
      id: 'homework',
      title: '手工作业',
      icon: 'tasks',
      color: '#1a73e8',
      desc: '手工添加的作业与备忘',
      count: manualHw.length,
      empty: '暂无手工作业',
      details: manualHw.slice(0, 4).map((h: any) => h?.title || '手工作业'),
    },
    {
      id: 'exam',
      title: '手工考试',
      icon: 'exam',
      color: '#5c6bc0',
      desc: '手工添加的考试安排',
      count: manualExam.length,
      empty: '暂无手工考试',
      details: manualExam.slice(0, 4).map((e: any) => e?.courseName || e?.title || '考试'),
    },
    {
      id: 'appearance',
      title: '界面布局',
      icon: 'palette',
      color: '#e63476',
      desc: '按钮顺序、显隐与信息流布局',
      count: 1,
      empty: '使用默认布局',
      details: [`当前语言：${lang}`],
    },
    {
      id: 'ai',
      title: 'Agent 记忆',
      icon: 'database',
      color: '#607d8b',
      desc: 'Agent 配置与记忆条目',
      count: memories.length,
      empty: '暂无记忆条目',
      details: memories.slice(0, 3).map((m: any) => (typeof m === 'string' ? m : m?.content || '')),
    },
  ];
});

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

async function onToggleAuto(next: boolean) {
  if (next) {
    const outcome = await setAutoSync(true);
    if (outcome === 'pulled') {
      // 拉取后配置变了，通知父级刷新
      emit('refresh-sync');
    }
  } else {
    await setAutoSync(false);
  }
}

async function pullNow() {
  // 拉取 + 应用 + 刷新 store 都在引擎内部完成（对应原版 pullLatestOnStartup），
  // 这里不能再 applyBackup 一次，否则同一份备份会被写两遍（且第二遍会触发额外刷新）。
  const doc = await pullNowAction();
  if (doc) emit('refresh-sync');
}

async function pushNow() {
  await pushNowAction();
}
</script>
