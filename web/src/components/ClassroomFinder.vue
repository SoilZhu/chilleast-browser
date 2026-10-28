<template>
  <div class="space-y-5">
    <!-- 查询条件：直接落画布，不包卡片 -->
    <section class="space-y-4">
      <SectionHeader title="空教室" icon="campus">
        <template #actions>
          <span
            v-if="optionsLoading"
            class="flex items-center gap-1.5 text-md2-caption text-md-text-medium shrink-0"
          >
            <Icon name="refresh" size="sm" class="animate-spin" />
            <span>同步中…</span>
          </span>
        </template>
      </SectionHeader>

      <!-- 查询条件栅格 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label class="md-label">教学楼</label>
          <select v-model="building" class="md-select">
            <option v-for="b in buildingsList" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>

        <div>
          <label class="md-label">周次</label>
          <select v-model="week" class="md-select">
            <option v-for="w in weeksList" :key="w" :value="w">第 {{ w }} 周</option>
          </select>
        </div>

        <div>
          <label class="md-label">星期</label>
          <select v-model="day" class="md-select">
            <option v-for="d in daysList" :key="d.value" :value="d.value">{{ d.label }}</option>
          </select>
        </div>

        <div>
          <label class="md-label">节次时段</label>
          <select v-model="section" class="md-select">
            <option v-for="s in sectionsList" :key="s" :value="s">{{ formatSection(s) }}</option>
          </select>
        </div>
      </div>

      <button type="button" class="md-btn-filled w-full sm:w-auto" :disabled="loading" @click="search">
        <Icon v-if="loading" name="refresh" size="sm" class="animate-spin" />
        <span>{{ loading ? '查询中…' : '查询' }}</span>
      </button>
    </section>

    <!-- 查询结果：一张便签卡，每间空教室一行（标题由卡头承担） -->
    <section class="space-y-3">
      <div v-if="results.length > 0" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <!-- 快速过滤搜索框 -->
        <div class="md-search-inline ml-auto">
          <Icon
            name="search"
            size="sm"
            class="md-search-inline-icon"
          />
          <input
            v-model="filterKeyword"
            type="text"
            placeholder="筛选教室号，如 101…"
            class="md-search-inline-input"
          />
        </div>
      </div>

      <EmptyState v-if="!searched" text="选择条件后查询" icon="search" compact />

      <EmptyState
        v-else-if="filteredResults.length === 0"
        :text="results.length > 0 ? '无匹配教室' : '本时段该楼栋暂无空教室'"
        icon="classroom"
        compact
      />

      <NoteCard v-else title="空教室" :meta="`${filteredResults.length} 间`" :flush="true">
        <div class="md-feed-list">
        <div
          v-for="(r, idx) in filteredResults"
          :key="idx"
          class="md-feed-row"
        >
          <span
            class="w-8 h-8 rounded-full bg-md-surface-2 text-md-text-medium flex items-center justify-center shrink-0"
          >
            <Icon name="classroom" size="sm" />
          </span>

          <div class="min-w-0 flex-1">
            <div class="text-md2-body2 text-md-text-high truncate">
              {{ r.name || r.JSMC || r.roomName || '课室' }}
            </div>
            <div
              class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-md2-caption text-md-text-medium tabular-nums"
            >
              <span>座位 {{ (r.capacity || r.ZWS) ? `${r.capacity || r.ZWS}` : '—' }}</span>
              <span>{{ formatSection(section) }}</span>
            </div>
          </div>

          <span class="md-chip-success shrink-0">空闲</span>
        </div>
        </div>
      </NoteCard>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import SectionHeader from './ui/SectionHeader.vue';
import NoteCard from './ui/NoteCard.vue';
import EmptyState from './ui/EmptyState.vue';
import Icon from './Icon.vue';
import { fetchClassrooms } from '../api/academic';

const buildingsList = ref<string[]>([
  '第九教学楼',
  '第十教学楼',
  '第十一教学楼',
  '第十二教学楼',
  '第七教学楼',
  '第二教学楼',
  '修业学堂',
  '第一教学楼',
  '第三教学楼',
  '第五教学楼',
  '第六教学楼',
]);
const weeksList = ref<string[]>(Array.from({ length: 25 }, (_, i) => String(i + 1)));
const daysList = ref<Array<{ label: string; value: string }>>([
  { label: '星期一', value: '1' },
  { label: '星期二', value: '2' },
  { label: '星期三', value: '3' },
  { label: '星期四', value: '4' },
  { label: '星期五', value: '5' },
  { label: '星期六', value: '6' },
  { label: '星期日', value: '7' },
]);
const sectionsList = ref<string[]>(['0102', '0304', '0506', '0708', '0910']);

const building = ref('第九教学楼');
const week = ref('1');
const day = ref(String(new Date().getDay() || 7));
const section = ref('0102');
const filterKeyword = ref('');

const optionsLoading = ref(false);
const loading = ref(false);
const searched = ref(false);
const results = ref<any[]>([]);

const filteredResults = computed(() => {
  const kw = filterKeyword.value.trim().toLowerCase();
  if (!kw) return results.value;
  return results.value.filter((r) => {
    const name = String(r.name || r.JSMC || r.roomName || '').toLowerCase();
    return name.includes(kw);
  });
});

onMounted(() => {
  loadOptions();
});

async function loadOptions() {
  optionsLoading.value = true;
  try {
    const res = await fetchClassrooms();
    if (res && res.isOptions) {
      if (Array.isArray(res.buildings) && res.buildings.length) {
        buildingsList.value = res.buildings;
        if (!buildingsList.value.includes(building.value)) {
          building.value = buildingsList.value[0];
        }
      }
      if (Array.isArray(res.sections) && res.sections.length) {
        sectionsList.value = res.sections;
        if (!sectionsList.value.includes(section.value)) {
          section.value = sectionsList.value[0];
        }
      }
      if (Array.isArray(res.weeks) && res.weeks.length) {
        weeksList.value = res.weeks;
      }
      if (Array.isArray(res.days) && res.days.length) {
        daysList.value = res.days;
      }
    }
  } catch (e) {
    console.warn('获取空教室选项失败，使用默认备选项:', e);
  } finally {
    optionsLoading.value = false;
  }
}

function formatSection(sec: string): string {
  switch (sec) {
    case '0102':
    case '1':
      return '第 1 节 / 1-2节 (上午)';
    case '0304':
    case '2':
      return '第 2 节 / 3-4节 (上午)';
    case '0506':
    case '3':
      return '第 3 节 / 5-6节 (下午)';
    case '0708':
    case '4':
      return '第 4 节 / 7-8节 (下午)';
    case '0910':
    case '5':
      return '第 5 节 / 9-10节 (晚间)';
    default:
      return `第 ${sec} 节`;
  }
}

async function search() {
  loading.value = true;
  searched.value = true;
  try {
    const res = await fetchClassrooms({
      building: building.value,
      week: week.value,
      day: day.value,
      section: section.value,
    });
    if (Array.isArray(res?.classrooms)) {
      results.value = res.classrooms;
    } else if (Array.isArray(res?.data)) {
      results.value = res.data;
    } else if (Array.isArray(res)) {
      results.value = res;
    } else if (res && Array.isArray(res.list)) {
      results.value = res.list;
    } else {
      results.value = [];
    }
  } catch (e) {
    console.error('查询空教室失败:', e);
    results.value = [];
  } finally {
    loading.value = false;
  }
}
</script>
