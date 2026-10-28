<template>
  <!-- ===================================================================
       课表页（对应 App 的 timetable_screen.dart）
       -------------------------------------------------------------------
       两个视图：日程 / 周视图。

       · 宽屏（≥1280px）默认**并排**显示：左边日程、右边周视图，
         不再用 Tab 二选一 —— 大屏一次看全两份信息才合理。
       · 窄屏仍是 Tab 切换。
       · 进页主动从云端抓最新课表（成功后 emit('synced') 交给父级写缓存），
         但**不再显示「同步中…」**：同步是后台行为，不该占页面一行。
       · 不再显示「时间冲突，点开查看」与「调课规则已生效」这类提示条。
       =================================================================== -->
  <div class="space-y-4">
    <!-- ============ 工具栏：视图切换（窄屏） / 导出 / 调课 ============ -->
    <div class="flex items-center justify-between gap-2">
      <div class="md-tabs min-w-0 flex-1 lg:hidden">
        <button
          v-for="item in TABS"
          :key="item.id"
          :class="activeTab === item.id ? 'md-tab-active' : 'md-tab'"
          @click="activeTab = item.id"
        >
          <Icon :name="item.icon" size="xs" />
          {{ item.label }}
        </button>
      </div>
      <!-- 宽屏并排时左侧留空，右侧按钮靠右 -->
      <div class="hidden lg:block flex-1" />

      <div class="flex items-center gap-1 shrink-0">
        <button
          class="md-btn-text"
          type="button"
          title="刷新课表"
          :disabled="loading"
          @click="emit('refresh')"
        >
          <Icon name="refresh" size="sm" :class="loading ? 'animate-spin' : ''" />
          <span class="hidden sm:inline">刷新</span>
        </button>
        <button class="md-btn-text" type="button" title="调课、停课与加课" @click="ruleMenuOpen = true">
          <Icon name="swap" size="sm" />
          <span class="hidden sm:inline">调课</span>
        </button>
        <button class="md-btn-text" type="button" title="导出课表 (.ics)" @click="onExportIcs">
          <Icon name="download" size="sm" />
          <span class="hidden sm:inline">导出</span>
        </button>
      </div>
    </div>

    <!-- 导出结果提示 -->
    <p
      v-if="exportMessage"
      :class="['px-1 text-md2-caption', exportOk ? 'text-md-success' : 'text-md-danger']"
      role="status"
    >
      {{ exportMessage }}
    </p>

    <!-- ============ 课表空状态（对齐原版 App EmptyTimetableState） ============ -->
    <EmptyTimetableState
      v-if="!hasLocalTimetable"
      :auto-sync-enabled="settings.timetableAutoSyncEnabled"
      :is-syncing="loading"
      @refresh="emit('refresh')"
    />

    <template v-else>
      <!-- ============ 宽屏：日程与周视图并排 ============ -->
      <div v-if="isWide" class="flex items-start gap-6">
        <!-- 左栏：日程视图（始终展示当前自然周/今天，不受周视图切换影响） -->
        <div class="min-w-0 flex-1 basis-0">
          <TimetableAgenda
            :timetable="agendaTimetable"
            :current-week="agendaWeekNumber"
            :real-week="realWeek"
            :show-end-time="settings.timetableShowEndTime"
            :query="query"
            :loading="loading"
            :homework="homework"
            :exams="exams"
            :first-week-monday="firstWeekMonday"
          />
        </div>

        <!-- 右栏：周视图（周切换仅作用于此处，PC 端展示 WeekToolbar） -->
        <div class="min-w-0 flex-1 basis-0 space-y-3">
          <WeekToolbar
            :current-week="weekViewWeek"
            :real-week="realWeek"
            @change-week="changeWeek"
          />
          <TimetableWeekView
            :timetable="weekViewTimetable"
            :current-week="weekViewWeek"
            :real-week="realWeek"
            :first-week-monday="firstWeekMonday"
            :show-end-time="settings.timetableShowEndTime"
            :is-pc="isPc"
            :query="query"
            :loading="loading"
            @change-week="changeWeek"
            @update:current-week="changeWeek"
          />
        </div>
      </div>

      <!-- ============ 窄屏：Tab 二选一 ============ -->
      <template v-else>
        <!-- 日程视图：纯日程展示，不加左右切换或工具栏，不受周视图切换影响 -->
        <TimetableAgenda
          v-if="activeTab === 'agenda'"
          :timetable="agendaTimetable"
          :current-week="agendaWeekNumber"
          :real-week="realWeek"
          :show-end-time="settings.timetableShowEndTime"
          :query="query"
          :loading="loading"
          :homework="homework"
          :exams="exams"
          :first-week-monday="firstWeekMonday"
        />

        <!-- 周视图：PC 端显示 WeekToolbar，手机端自带手势翻页与第 N 周表头 -->
        <div v-else class="space-y-3">
          <WeekToolbar
            v-if="isPc"
            :current-week="weekViewWeek"
            :real-week="realWeek"
            @change-week="changeWeek"
          />
          <TimetableWeekView
            :timetable="weekViewTimetable"
            :current-week="weekViewWeek"
            :real-week="realWeek"
            :first-week-monday="firstWeekMonday"
            :show-end-time="settings.timetableShowEndTime"
            :is-pc="isPc"
            :query="query"
            :loading="loading"
            @change-week="changeWeek"
            @update:current-week="changeWeek"
          />
        </div>
      </template>
    </template>

    <!-- ============ 调课（底部动作菜单 + 四个对话框）============ -->
    <TimetableRuleMenu
      v-if="ruleMenuOpen"
      :courses="ruleCourses"
      :rules="timetableRules"
      :current-week="currentWeek"
      @close="ruleMenuOpen = false"
      @changed="onRulesChanged"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import Icon from '@/components/Icon.vue';
import TimetableAgenda from '@/components/timetable/TimetableAgenda.vue';
import TimetableWeekView from '@/components/timetable/TimetableWeekView.vue';
import WeekToolbar from '@/components/timetable/WeekToolbar.vue';
import TimetableRuleMenu from '@/components/timetable/TimetableRuleMenu.vue';
import EmptyTimetableState from '@/components/timetable/EmptyTimetableState.vue';
import { settings } from '@/stores/settings';
import { timetableStorage } from '@/utils/storage';
import {
  type FullTimetableResponse,
  type TimetableCourse,
  type TimetableWeek,
} from '@/api/academic';
import { exportTimetableIcs } from '@/utils/ics-export';
import type { HomeworkItem } from '@/api/study';

const props = withDefaults(
  defineProps<{
    timetable: TimetableWeek | null;
    currentWeek: number;
    realWeek?: number;
    /** 全学期 20 周课表映射，用于解耦日程视图（自然周）与周视图（选择周） */
    weeksMap?: Record<number, TimetableWeek>;
    /** 云端调课规则已生效条数（保留入参，界面不再展示提示） */
    rulesApplied?: number;
    loading?: boolean;
    /** 顶部搜索框关键词，命中课程高亮 */
    query?: string;
    /** 日程视图要展示的作业（未完成、有截止时间的） */
    homework?: HomeworkItem[];
    /** 日程视图要展示的考试 */
    exams?: any[];
    /** 第一周周一（yyyy-mm-dd），用于把「第 N 周星期 D」换算成真实日期 */
    firstWeekMonday?: string | null;
    /** 云端调课规则（用于「我的调整」列表与删除） */
    timetableRules?: any[];
    /** 全学期全部课程（调课对话框的课程下拉用它，不受当前周限制） */
    allCourses?: TimetableCourse[];
  }>(),
  {
    realWeek: undefined,
    weeksMap: () => ({}),
    rulesApplied: 0,
    loading: false,
    query: '',
    homework: () => [],
    exams: () => [],
    firstWeekMonday: null,
    timetableRules: () => [],
    allCourses: () => [],
  },
);

const emit = defineEmits<{
  (e: 'update:currentWeek', week: number): void;
  /** 进页主动同步成功：把最新全量课表交给父级写缓存/刷新 */
  (e: 'synced', payload: FullTimetableResponse): void;
  /** 调课规则变化：父级重新拉一次课表 */
  (e: 'rules-changed'): void;
  /** 手动刷新/同步课表 */
  (e: 'refresh'): void;
}>();

/** 检查是否存在本地课表（无本地课表时展示 EmptyTimetableState） */
const hasLocalTimetable = computed(() => {
  if (props.timetable && props.timetable.courses && props.timetable.courses.length > 0) return true;
  if (
    props.weeksMap &&
    Object.values(props.weeksMap).some((w) => w?.courses && w.courses.length > 0)
  ) {
    return true;
  }
  return timetableStorage.hasLocalTimetable();
});

const TABS = [
  { id: 'agenda', label: '日程', icon: 'list' },
  { id: 'week', label: '周视图', icon: 'grid' },
] as const;

/** 窄屏默认停在周视图（与 App 一致：课表首屏即周视图） */
const activeTab = ref<'agenda' | 'week'>('week');

// ---------------------------------------------------------------------------
// 屏幕断点判定：
// - 手机 vs PC：以 768px（md）判定；PC 保留当前周次切换条，手机走翻页手势
// - 宽屏：≥1280px 时日程与周视图并排
// ---------------------------------------------------------------------------
const PC_BREAKPOINT = 768;
const WIDE_BREAKPOINT = 1280;
const isPc = ref(typeof window !== 'undefined' ? window.innerWidth >= PC_BREAKPOINT : true);
const isWide = ref(false);

const updateResponsive = () => {
  if (typeof window !== 'undefined') {
    isPc.value = window.innerWidth >= PC_BREAKPOINT;
    isWide.value = window.innerWidth >= WIDE_BREAKPOINT;
  }
};

// ---------------------------------------------------------------------------
// 进页生命周期（对齐原版 App：优先使用本地缓存秒开，完全无缓存时才触发同步）
// ---------------------------------------------------------------------------

onMounted(() => {
  updateResponsive();
  window.addEventListener('resize', updateResponsive);

  // 仅在本地完全无缓存且开启自动同步时，通知父级拉取
  if (!timetableStorage.hasLocalTimetable() && settings.timetableAutoSyncEnabled) {
    emit('refresh');
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', updateResponsive);
});

// ---------------------------------------------------------------------------
// ICS 导出
// ---------------------------------------------------------------------------

const exportMessage = ref('');
const exportOk = ref(true);
let exportTimer: ReturnType<typeof setTimeout> | null = null;

/** 工具栏「导出」：与设置页共用同一份导出逻辑 */
const onExportIcs = () => {
  const result = exportTimetableIcs();
  exportOk.value = result.ok;
  exportMessage.value = result.message;

  if (exportTimer) clearTimeout(exportTimer);
  exportTimer = setTimeout(() => {
    exportMessage.value = '';
  }, 3000);
};

// ---------------------------------------------------------------------------
// 周视图独立周次状态（周次切换只适用于周视图，不干扰日程视图）
// ---------------------------------------------------------------------------

/** 周视图当前查看的周次，初始对齐外部 currentWeek */
const weekViewWeek = ref(props.currentWeek);

watch(
  () => props.currentWeek,
  (val) => {
    weekViewWeek.value = val;
  },
);

/** 日程视图周次：始终锁定在当前真实自然周（若未知则 fallback 至 currentWeek） */
const agendaWeekNumber = computed(() => props.realWeek ?? props.currentWeek);

/** 日程视图课表数据：始终读取真实自然周课表，不受周视图切换影响 */
const agendaTimetable = computed<TimetableWeek | null>(() => {
  const targetWeek = agendaWeekNumber.value;
  if (props.weeksMap && props.weeksMap[targetWeek]) {
    return props.weeksMap[targetWeek];
  }
  return props.timetable;
});

/** 周视图课表数据：跟随 weekViewWeek 独立切换 */
const weekViewTimetable = computed<TimetableWeek | null>(() => {
  const targetWeek = weekViewWeek.value;
  if (props.weeksMap && props.weeksMap[targetWeek]) {
    return props.weeksMap[targetWeek];
  }
  return props.timetable;
});

const changeWeek = (week: number) => {
  if (week >= 1 && week <= 20 && week !== weekViewWeek.value) {
    weekViewWeek.value = week;
    emit('update:currentWeek', week);
  }
};

// ---------------------------------------------------------------------------
// 调课
// ---------------------------------------------------------------------------

const ruleMenuOpen = ref(false);

/**
 * 调课对话框的课程下拉来源：
 * 优先用父级给的全学期课程；没有时退化成当前周的课程
 * （至少能对本周的课做调整，不会因为父级没接线而整个功能不可用）。
 */
const ruleCourses = computed<TimetableCourse[]>(() => {
  const all = props.allCourses ?? [];
  if (all.length > 0) return all;
  return props.timetable?.courses ?? [];
});

/** 规则变化：关掉菜单，让父级重新拉课表 */
const onRulesChanged = () => {
  ruleMenuOpen.value = false;
  emit('rules-changed');
};
</script>
