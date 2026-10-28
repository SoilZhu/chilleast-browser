<template>
  <!-- ===================================================================
       我的宿舍（直接从学生公寓服务平台 gy.hunau.edu.cn 真实拉取，对齐原版 DormitoryService）
       四行信息卡：宿舍楼 / 楼层 / 宿舍 / 床位，点击行复制值
       =================================================================== -->
  <div class="space-y-5">
    <PageHeader title="我的宿舍">
      <template #actions>
        <span class="hidden text-md2-caption text-md-text-disabled sm:inline">点按行复制</span>
        <button
          class="md-btn-outlined"
          :disabled="loading || refreshing"
          @click="loadData(true)"
          title="刷新宿舍数据"
        >
          <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading || refreshing }" />
          刷新
        </button>
      </template>
    </PageHeader>

    <!-- 加载中（无缓存数据时展示骨架屏） -->
    <div v-if="loading && !info" class="md-rows">
      <div v-for="i in 4" :key="i" class="py-4 space-y-2">
        <div class="md-skeleton h-4 w-24" />
        <div class="md-skeleton h-3 w-48" />
      </div>
    </div>

    <!-- 错误状态（无缓存数据时展示重试） -->
    <div v-else-if="error && !info" class="flex flex-col items-center gap-3 py-10 text-center">
      <span
        class="w-12 h-12 rounded-full bg-md-danger-surface text-md-danger flex items-center justify-center"
      >
        <Icon name="error" size="lg" />
      </span>
      <p class="text-md2-body2 text-md-text-high">宿舍信息加载失败</p>
      <p class="text-md2-caption text-md-text-medium max-w-sm leading-relaxed">{{ error }}</p>
      <button class="md-btn-filled mt-1" @click="loadData(true)">
        <Icon name="refresh" size="sm" />
        重试
      </button>
    </div>

    <!-- 未分配：空状态直接落画布，不包卡片 -->
    <EmptyState v-else-if="info && !info.isAssigned" text="暂未分配" icon="dormitory" />

    <!-- 宿舍信息卡片 -->
    <div v-else-if="info" class="space-y-3">
      <!-- 学年学期标签（若有） -->
      <div
        v-if="info.academicYear || info.termName"
        class="flex items-center gap-2 text-md2-caption text-md-text-medium px-1"
      >
        <Icon name="calendar" size="xs" />
        <span>{{ [info.academicYear ? `${info.academicYear}学年` : '', info.termName].filter(Boolean).join(' · ') }}</span>
      </div>

      <div class="md-card overflow-hidden">
        <button
          v-for="row in rows"
          :key="row.label"
          type="button"
          class="md-row py-3.5 active:bg-md-surface-2"
          @click="copyValue(row)"
        >
          <span class="flex h-6 w-6 shrink-0 items-center justify-center text-md-text-medium">
            <Icon :name="row.icon" size="md" />
          </span>
          <span class="text-md2-body1 text-md-text-medium">{{ row.label }}</span>
          <span class="ml-auto text-md2-body1 font-medium text-md-text-high">{{ row.value }}</span>
          <Icon
            name="copy"
            size="sm"
            class="shrink-0"
            :class="row.value === '--' ? 'text-md-text-hint opacity-40' : 'text-md-text-hint'"
          />
        </button>
      </div>
    </div>

    <!-- 复制轻提示 -->
    <transition name="md-toast">
      <div v-if="toast" class="md-toast" role="status">
        <Icon name="check" size="xs" />
        {{ toast }}
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { fetchDormitoryInfo, type DormitoryInfo } from '@/api/campus';

const CACHE_KEY = 'cached_dormitory_info_v1';

interface InfoRow {
  label: string;
  value: string;
  icon: string;
}

const info = ref<DormitoryInfo | null>(null);
const loading = ref(true);
const refreshing = ref(false);
const error = ref('');

const rows = computed<InfoRow[]>(() => {
  const d = info.value;
  if (!d) return [];

  const list: InfoRow[] = [
    {
      label: '宿舍楼',
      value: d.building || (!d.isAssigned ? '未安排床位' : '--'),
      icon: 'building',
    },
  ];

  if (d.unit) {
    list.push({
      label: '单元',
      value: d.unit,
      icon: 'layout-grid',
    });
  }

  list.push(
    {
      label: '楼层',
      value: d.floor || '--',
      icon: 'layout-grid',
    },
    {
      label: '宿舍',
      value: d.room ? (d.room.endsWith('室') ? d.room : `${d.room}室`) : '--',
      icon: 'home',
    },
    {
      label: '床位',
      value: d.formattedBed || d.bed || '--',
      icon: 'user',
    },
  );

  return list;
});

async function loadData(force = false) {
  if (info.value === null) {
    loading.value = true;
    error.value = '';
  } else {
    refreshing.value = true;
  }

  try {
    const fresh = await fetchDormitoryInfo(force);
    info.value = fresh;
    error.value = '';
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
    } catch {
      // Ignore cache write errors
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (info.value === null) {
      error.value = msg || '获取宿舍信息失败';
    } else {
      showToast(msg || '刷新失败');
    }
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

onMounted(() => {
  // 先读缓存秒开首帧（对齐原版 DormitoryScreen）
  try {
    const cachedStr = localStorage.getItem(CACHE_KEY);
    if (cachedStr) {
      info.value = JSON.parse(cachedStr);
      loading.value = false;
    }
  } catch {
    // Ignore corrupt cache
  }
  loadData(false);
});

// ---------------------------------------------------------------------------
// 复制 + 轻提示
// ---------------------------------------------------------------------------
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;

async function copyValue(row: InfoRow) {
  if (row.value === '--') return;
  try {
    await navigator.clipboard.writeText(row.value);
    showToast(`${row.label}已复制`);
  } catch {
    showToast('复制失败');
  }
}

function showToast(text: string) {
  toast.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 1500);
}

onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer);
});
</script>

<style scoped>
/* 轻提示：底部居中，1.5 秒后自动消失 */
.md-toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background-color: var(--md-sys-color-inverse-surface, #313033);
  color: var(--md-sys-color-inverse-on-surface, #f4eff4);
  font-size: 14px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  pointer-events: none;
}

.md-toast-enter-active,
.md-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.md-toast-enter-from,
.md-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
