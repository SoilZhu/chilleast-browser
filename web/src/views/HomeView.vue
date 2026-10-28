<template>
  <div class="space-y-5">
    <!-- ============ 页头：问候 + 日期 + 教学周 + 刷新 ============ -->
    <PageHeader :title="`${greeting}，${student?.realName || '同学'}`" :subtitle="todayLabel">
      <template #actions>
        <span v-if="currentWeek > 0" class="md-chip-neutral">第 {{ currentWeek }} 教学周</span>
        <button class="md-btn-outlined" @click="$emit('refresh')">
          <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
          刷新
        </button>
      </template>
    </PageHeader>

    <!-- ============ 信息流：顺序与显隐来自 appearance.feed，空区块整块不渲染 ============ -->
    <div v-if="blocks.length > 0" class="keep-grid">
      <template v-for="block in blocks" :key="block">
        <QuickGrid
          v-if="block === 'feed_quick'"
          :items="quickFunctions"
          @select="$emit('selectFunction', $event)"
          @more="$emit('navigate', 'functions')"
        />

        <LibraryCard
          v-else-if="block === 'feed_library'"
          :reserves="reserves"
          @more="$emit('navigate', 'library')"
        />

        <AgendaCard
          v-else-if="block === 'feed_agenda'"
          :courses="agendaCourses"
          :exams="agendaExams"
          :homework="agendaHomework"
          :title="agendaTitle"
          @more="$emit('navigate', 'timetable')"
        />

        <HomeworkCard
          v-else-if="block === 'feed_homework'"
          :items="pendingHomework"
          @open="$emit('navigate', 'homework')"
          @more="$emit('navigate', 'homework')"
        />

        <LeaveCard
          v-else-if="block === 'feed_leave'"
          :leaves="leaves"
          @open="$emit('navigate', 'leave')"
          @more="$emit('navigate', 'leave')"
        />

        <RepairCard
          v-else-if="block === 'feed_repair'"
          :orders="repairs"
          @open="$emit('navigate', 'repair')"
          @more="$emit('navigate', 'repair')"
        />

        <QuestionnaireCard
          v-else-if="block === 'feed_questionnaire'"
          :items="questionnaires"
          @open="$emit('navigate', 'questionnaire')"
          @more="$emit('navigate', 'questionnaire')"
        />

        <BalanceCard
          v-else-if="block === 'feed_balance'"
          :card-info="cardInfo"
          :ele-balance="eleBalance"
          :dorm-name="dormName"
          :slots="electricitySlots"
          @open-card="$emit('navigate', 'campus')"
          @open-ele="$emit('navigate', 'electricity')"
        />
      </template>
    </div>

    <!-- 首屏骨架：数据还没回来时占位，避免整页空白 -->
    <div v-else-if="loading" class="keep-grid">
      <div v-for="n in 3" :key="n" class="md-feed-card space-y-3">
        <div class="md-skeleton h-4 w-20" />
        <div class="md-skeleton h-3.5 w-full" />
        <div class="md-skeleton h-3.5 w-4/5" />
        <div class="md-skeleton h-3.5 w-2/3" />
      </div>
    </div>

    <!-- 区块全部被隐藏，或今天确实没有内容（空状态不包卡片，直接落画布） -->
    <EmptyState v-else text="暂无内容" icon="home" compact />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import Icon from '../components/Icon.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import EmptyState from '../components/ui/EmptyState.vue';

import QuickGrid from '../components/feed/QuickGrid.vue';
import AgendaCard from '../components/feed/AgendaCard.vue';
import HomeworkCard from '../components/feed/HomeworkCard.vue';
import BalanceCard from '../components/feed/BalanceCard.vue';
import LibraryCard from '../components/feed/LibraryCard.vue';
import LeaveCard from '../components/feed/LeaveCard.vue';
import RepairCard from '../components/feed/RepairCard.vue';
import QuestionnaireCard from '../components/feed/QuestionnaireCard.vue';
import { courseColor, parseTime, periodEndMinutes, periodRange, toAmount } from '../components/feed/format';
import type { AgendaCourse, AgendaExam, AgendaHomework } from '../components/feed/types';

import { visibleFeedIds, visibleHomeFunctions } from '../stores/appearance';
import type { FunctionItemDef } from '../utils/functions';
import type { StudentInfo } from '../utils/storage';
import type { CardInfo, CardTransaction } from '../api/campus';
import type { ElectricitySlotView } from '../composables/useElectricity';
import type { HomeworkItem } from '../api/study';
import type { TimetableWeek } from '../api/academic';
import type { SeatReserveItem } from '../api/library';
import type { LeaveRecord, QuestionnaireItem } from '../api/xgxt';
import type { RepairOrder } from '../api/services';

/** 请假单可能带上服务端拼好的时段文案 */
type LeaveRow = LeaveRecord & { timeRange?: string };

const props = withDefaults(
  defineProps<{
    student: StudentInfo | null;
    cardInfo: CardInfo | null;
    transactions?: CardTransaction[];
    notices: any[];
    homework: HomeworkItem[];
    exams: any[];
    timetable: TimetableWeek | null;
    currentWeek?: number;
    eleBalance?: string | null;
    dormName?: string;
    /** 双宿舍电费槽位（来自 useElectricity）；空数组时余额卡回退单宿舍展示 */
    electricitySlots?: ElectricitySlotView[];
    loading?: boolean;
    /**
     * 图书馆 / 请假 / 报修 / 问卷四类数据目前 MainView 未加载，默认空数组，
     * 对应区块为空时整块不渲染。接线时由 MainView 传同名属性即可，本页无需改动。
     */
    reserves?: SeatReserveItem[];
    leaves?: LeaveRow[];
    repairs?: RepairOrder[];
    questionnaires?: QuestionnaireItem[];
  }>(),
  {
    transactions: () => [],
    currentWeek: 1,
    eleBalance: null,
    dormName: '',
    electricitySlots: () => [],
    loading: false,
    reserves: () => [],
    leaves: () => [],
    repairs: () => [],
    questionnaires: () => [],
  },
);

defineEmits<{
  (e: 'navigate', tab: string): void;
  (e: 'refresh'): void;
  (e: 'selectFunction', item: FunctionItemDef): void;
  (e: 'openNotice', notice: any): void;
}>();

// ---------------------------------------------------------------------------
// 页头
// ---------------------------------------------------------------------------

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

const todayLabel = computed(() => {
  const now = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日 星期${week}`;
});

// ---------------------------------------------------------------------------
// 待完成作业（信息流「作业」区块用）
// ---------------------------------------------------------------------------

/** 待完成作业，按截止时间升序，没有截止时间的排最后 */
const pendingHomework = computed(() => {
  const list = props.homework.filter((h) => h.statusCode === 'pending');
  return list.sort((a, b) => {
    const ta = parseTime(a.endTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const tb = parseTime(b.endTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
});

// ---------------------------------------------------------------------------
// 快捷功能：顺序与显隐来自 appearance.home
// ---------------------------------------------------------------------------

const quickFunctions = computed<FunctionItemDef[]>(() => visibleHomeFunctions.value);

// ---------------------------------------------------------------------------
// 今日日程：22 点后预览明天；当天只留还没下课的课
// ---------------------------------------------------------------------------

const isAfterTenPM = new Date().getHours() >= 22;

const agendaTitle = computed(() => (isAfterTenPM ? '明日日程' : '今日日程'));

/** 预览目标日期：22 点后顺延到明天 */
const previewDate = computed(() => {
  const now = new Date();
  return isAfterTenPM ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : now;
});

const agendaCourses = computed<AgendaCourse[]>(() => {
  const courses = props.timetable?.courses ?? [];
  const target = previewDate.value;
  const weekday = target.getDay() === 0 ? 7 : target.getDay();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  return courses
    .filter((c) => c.dayOfWeek === weekday)
    .filter((c) => {
      // 明天的课全展示；今天的课已下课就不展示
      if (isAfterTenPM) return true;
      const endMinutes = periodEndMinutes(c.endPeriod);
      return endMinutes === null || endMinutes > nowMinutes;
    })
    .sort((a, b) => a.startPeriod - b.startPeriod)
    .map((c) => ({
      name: c.name,
      classroom: c.classroom ?? '',
      time: periodRange(c.startPeriod, c.endPeriod),
      color: courseColor(c.name),
    }));
});

const agendaExams = computed<AgendaExam[]>(() => {
  const list = Array.isArray(props.exams) ? props.exams : [];
  const target = previewDate.value;
  const pad2 = (n: number) => String(n).padStart(2, '0');

  return list
    .map((e) => ({ exam: e, time: parseTime(e.timeLocal || e.time) }))
    .filter(({ time }) => {
      // 服务端已只返回未开考的考试，这里按日期筛「今日/明日」即可
      if (!time) return false;
      return (
        time.getFullYear() === target.getFullYear() &&
        time.getMonth() === target.getMonth() &&
        time.getDate() === target.getDate()
      );
    })
    .sort((a, b) => (a.time?.getTime() ?? 0) - (b.time?.getTime() ?? 0))
    .map(({ exam, time }) => ({
      title: [exam.courseName, exam.title].filter(Boolean).join(' · ') || '考试',
      location: exam.location || '',
      time: time ? `${pad2(time.getHours())}:${pad2(time.getMinutes())}` : '',
      status: exam.status && exam.status !== '待考' ? String(exam.status) : '',
    }));
});

/**
 * 当天截止的作业（日程卡要展示作业，对齐原版 _buildDayHomeworkItems）。
 * 只放「未完成 + 有截止时间 + 截止时间就在今天/明天」的。
 */
const agendaHomework = computed<AgendaHomework[]>(() => {
  const target = previewDate.value;
  const pad2 = (n: number) => String(n).padStart(2, '0');

  return props.homework
    .filter((h) => h.statusCode === 'pending')
    .map((h) => ({ item: h, time: parseTime(h.endTime) }))
    .filter(({ time }) => {
      if (!time) return false;
      return (
        time.getFullYear() === target.getFullYear() &&
        time.getMonth() === target.getMonth() &&
        time.getDate() === target.getDate()
      );
    })
    .sort((a, b) => (a.time?.getTime() ?? 0) - (b.time?.getTime() ?? 0))
    .map(({ item, time }) => {
      const deadline = `截止 ${time ? `${pad2(time.getHours())}:${pad2(time.getMinutes())}` : ''}`;
      const course = (item.courseName || '').trim();
      return {
        id: item.id,
        title: item.title,
        subtitle: course ? `${course} · ${deadline}` : deadline,
      };
    });
});

// ---------------------------------------------------------------------------
// 信息流区块顺序：先按 appearance.feed 排，再剔除没内容的区块
// （对应 App 的 _isNonEmptyWidget：空区块直接不渲染，不留「暂无数据」大块）
// ---------------------------------------------------------------------------

const blocks = computed<string[]>(() =>
  visibleFeedIds.value.filter((id) => {
    switch (id) {
      case 'feed_quick':
        return quickFunctions.value.length > 0;
      case 'feed_library':
        return props.reserves.length > 0;
      case 'feed_agenda':
        return (
          agendaCourses.value.length > 0 ||
          agendaExams.value.length > 0 ||
          agendaHomework.value.length > 0
        );
      case 'feed_homework':
        return pendingHomework.value.length > 0;
      case 'feed_leave':
        return props.leaves.length > 0;
      case 'feed_repair':
        return props.repairs.length > 0;
      case 'feed_questionnaire':
        return props.questionnaires.some((q) => !q.isSubmitted && !q.isExpired);
      case 'feed_balance':
        return (
          props.cardInfo !== null ||
          toAmount(props.eleBalance) !== null ||
          props.electricitySlots.some((s) => s.room !== null)
        );
      default:
        return false;
    }
  }),
);
</script>
