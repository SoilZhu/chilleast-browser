<template>
  <!-- ===================================================================
       课表订阅（对应原版 App 的 timetable_subscription_screen.dart）
       - 开关「自动上传课表」：开启即生成/复用 UUID 并立刻上传最新 ICS
       - 展示订阅地址（只读、可复制）+「在日历中订阅」（webcal://）
       - 「重置订阅链接」二次确认后作废旧链接
       =================================================================== -->
  <div class="space-y-3">
    <!-- 开关行 -->
    <div class="flex items-start gap-3">
      <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-md-text-medium">
        <Icon name="upload" size="md" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="text-md2-body1 leading-tight text-md-text-high">自动上传课表</div>
        <div class="mt-1 text-md2-caption leading-snug text-md-text-medium">
          上传后可用日历订阅课表
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <span v-if="busy" class="text-md2-caption text-md-text-disabled">…</span>
        <SwitchToggle v-else :model-value="enabled" @update:model-value="onToggle" />
      </div>
    </div>

    <!-- 状态提示 -->
    <p
      v-if="statusMessage"
      :class="[
        'text-md2-caption leading-snug',
        statusKind === 'error' ? 'text-md-danger' : 'text-md-success',
      ]"
      role="status"
    >
      {{ statusMessage }}
    </p>

    <!-- 订阅地址区（开启且已有 UUID 时展示） -->
    <div v-if="enabled && subscriptionUrl" class="space-y-2 pt-1">
      <div class="md-label mb-0">订阅地址</div>
      <div
        class="w-full select-all break-all rounded-md2-sm border border-md-divider bg-white px-3 py-2.5 font-mono text-md2-caption text-md-accent"
      >
        {{ subscriptionUrl }}
      </div>

      <div class="flex flex-wrap items-center justify-end gap-1">
        <button class="md-btn-text" type="button" @click="copyUrl">
          <Icon name="copy" size="sm" />
          复制链接
        </button>
        <button
          class="md-btn-text"
          type="button"
          :disabled="resetting"
          @click="confirmResetOpen = true"
        >
          <Icon name="refresh" size="sm" />
          重置链接
        </button>
      </div>

      <button class="md-btn-outlined w-full" type="button" @click="openWebcal">
        <Icon name="calendar" size="sm" />
        在日历中订阅
      </button>
      <p class="text-md2-caption leading-snug text-md-text-disabled">
        日历不支持时可复制地址手动添加
      </p>
    </div>

    <!-- 重置链接二次确认 -->
    <div
      v-if="confirmResetOpen"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="confirmResetOpen = false"
    >
      <div class="md-dialog max-w-md">
        <div class="md-dialog-header">
          <h3 class="md-dialog-title">重置订阅链接？</h3>
          <button
            class="md-icon-btn-sm -mr-2 shrink-0"
            title="关闭"
            type="button"
            @click="confirmResetOpen = false"
          >
            <Icon name="close" size="sm" />
          </button>
        </div>
        <div class="md-dialog-body">旧链接将失效，已订阅的日历需要重新添加。</div>
        <div class="md-dialog-actions">
          <button class="md-btn-text" type="button" @click="confirmResetOpen = false">取消</button>
          <button class="md-btn-filled" type="button" :disabled="resetting" @click="doReset">
            确定
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import { publishTimetableSubscription, deleteTimetableSubscription } from '@/api/academic';
import { markDirty } from '@/services/cloudSync';
import { generateIcs } from '@/utils/ics';
import {
  collectCourses,
  readCachedFullTimetable,
  resolveFirstWeekMonday,
} from '@/utils/ics-export';

// ---------------------------------------------------------------------------
// 持久化键（与原版 TimetableSubscriptionService 完全一致，云备份互通）
// ---------------------------------------------------------------------------

const ENABLED_KEY = 'timetable_subscription_enabled';
const UUID_KEY = 'timetable_subscription_uuid';

/** 订阅服务地址（与原版 TimetableSubscriptionService.baseUrl 一致） */
const BASE_URL = 'https://ics.chilleast.soilzhu.su';

function readEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === 'true';
}

function readUuid(): string {
  return (localStorage.getItem(UUID_KEY) ?? '').trim();
}

/**
 * 生成标准 RFC4122 v4 UUID（对齐原版 `generateUuid`）。
 * 第 7 个字节高 4 位置 0100（version 4），第 9 个字节高 2 位置 10（variant）。
 */
function generateUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function getOrCreateUuid(): string {
  const existing = readUuid();
  if (existing !== '') return existing;
  const created = generateUuid();
  localStorage.setItem(UUID_KEY, created);
  return created;
}

/** 订阅地址（原版 buildSubscriptionUrl） */
function buildSubscriptionUrl(uuid: string): string {
  return `${BASE_URL}/${uuid}/timetable.ics`;
}

/** webcal:// 地址（原版 buildWebcalUrl：只换协议，不带查询串） */
function buildWebcalUrl(uuid: string): string {
  return `webcal://${BASE_URL.replace(/^https?:\/\//, '')}/${uuid}/timetable.ics`;
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

const enabled = ref(readEnabled());
const uuid = ref(readUuid());
const busy = ref(false);
const resetting = ref(false);
const confirmResetOpen = ref(false);
const statusMessage = ref('');
const statusKind = ref<'success' | 'error'>('success');

const subscriptionUrl = computed(() => (uuid.value ? buildSubscriptionUrl(uuid.value) : ''));

function setStatus(kind: 'success' | 'error', message: string) {
  statusKind.value = kind;
  statusMessage.value = message;
}

/**
 * 用本地课表缓存生成最新 ICS。
 * 没有课表数据时返回 null（调用方给文案提示，不视为异常）。
 */
function buildIcsFromCache(): string | null {
  const full = readCachedFullTimetable();
  const courses = collectCourses(full);
  if (courses.length === 0) return null;

  const firstWeekMonday = resolveFirstWeekMonday(full);
  if (!firstWeekMonday) return null;

  return generateIcs(courses, firstWeekMonday);
}

/** 上传最新 ICS 到云端订阅地址（对齐原版 uploadTimetable） */
async function uploadCurrent(): Promise<boolean> {
  const ics = buildIcsFromCache();
  if (!ics) {
    setStatus('error', '暂无课表数据，请先同步课表');
    return false;
  }

  try {
    const result = await publishTimetableSubscription(getOrCreateUuid(), ics);
    uuid.value = readUuid();
    if (result?.success) {
      setStatus('success', '已上传');
      return true;
    }
    setStatus('error', result?.message || '上传失败，请稍后重试');
    return false;
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '上传失败，请稍后重试');
    return false;
  }
}

/** 开关切换：开启即上传，关闭即删除云端文件 */
async function onToggle(next: boolean) {
  if (busy.value) return;
  busy.value = true;
  statusMessage.value = '';

  // 开关状态先落地：即使上传失败，用户的意图也要保住（下次进页面仍显示已开启）
  enabled.value = next;
  localStorage.setItem(ENABLED_KEY, String(next));
  markDirty();

  try {
    if (next) {
      getOrCreateUuid();
      uuid.value = readUuid();
      await uploadCurrent();
    } else {
      const current = readUuid();
      if (current !== '') {
        try {
          const deleted = await deleteTimetableSubscription(current);
          setStatus(deleted ? 'success' : 'error', deleted ? '已关闭订阅' : '删除失败，请稍后重试');
        } catch (error) {
          setStatus('error', error instanceof Error ? error.message : '删除失败，请稍后重试');
        }
      }
    }
  } finally {
    busy.value = false;
  }
}

/** 复制订阅地址 */
async function copyUrl() {
  if (!subscriptionUrl.value) return;
  try {
    await navigator.clipboard.writeText(subscriptionUrl.value);
    setStatus('success', '已复制');
  } catch {
    setStatus('error', '复制失败，请手动选择地址');
  }
}

/** 调起系统日历订阅（webcal://） */
function openWebcal() {
  if (!uuid.value) return;
  window.location.href = buildWebcalUrl(uuid.value);
}

/** 重置订阅 UUID：先删旧文件，再生成新链接并重新上传 */
async function doReset() {
  if (resetting.value) return;
  resetting.value = true;
  statusMessage.value = '';

  try {
    const oldUuid = readUuid();
    if (oldUuid !== '') {
      try {
        await deleteTimetableSubscription(oldUuid);
      } catch {
        // 旧链接删不掉也要继续换新链接，否则用户被卡死
      }
    }

    const nextUuid = generateUuid();
    localStorage.setItem(UUID_KEY, nextUuid);
    uuid.value = nextUuid;
    markDirty();
    confirmResetOpen.value = false;

    if (enabled.value) {
      await uploadCurrent();
    } else {
      setStatus('success', '已重置');
    }
  } finally {
    resetting.value = false;
  }
}
</script>
