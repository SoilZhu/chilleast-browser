<template>
  <div class="space-y-4">
    <!-- 工具栏：标题 + 学期选择 + 刷新 -->
    <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <h2 class="flex items-center gap-2 text-md2-h6 text-md-text-high">
        <Icon name="scores" size="sm" class="text-md-primary" />
        <span>成绩与绩点</span>
      </h2>

      <div class="flex items-center gap-2">
        <div class="w-[200px] sm:w-[260px]">
          <select
            :value="selectedSemester || scoresData?.semester || '2025-2026-2'"
            @change="$emit('update:selectedSemester', ($event.target as HTMLSelectElement).value)"
            class="md-select"
          >
            <option value="all">全部学期</option>
            <option v-for="sem in semesters" :key="sem.semester" :value="sem.semester">
              {{ formatSemesterLabel(sem.semester, sem.name) }}
            </option>
          </select>
        </div>
        <button
          @click="$emit('refresh')"
          class="md-icon-btn shrink-0"
          title="刷新教务成绩"
        >
          <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
        </button>
      </div>
    </div>

    <!-- 概览指标组：一组数字并排、竖线分隔，不再各自包一张卡片；不带彩色 chip -->
    <MetricGrid :items="overviewMetrics" :columns="4" />

    <!-- 正在加载状态（落画布，不包卡片） -->
    <div v-if="loading && courses.length === 0" class="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Icon name="refresh" size="lg" class="animate-spin text-md-primary" />
      <div class="text-md2-body2 text-md-text-medium">加载中…</div>
    </div>

    <!-- 暂无成绩状态 + 快捷切换按钮 -->
    <div
      v-else-if="courses.length === 0"
      class="flex flex-col items-center gap-3 px-6 py-16 text-center"
    >
      <Icon name="scores" size="xl" class="text-md-text-disabled" />
      <div class="text-md2-subtitle1 text-md-text-high">
        {{ selectedSemester || scoresData?.semester || '所选学期' }} 暂无成绩记录
      </div>
      <p class="max-w-md text-md2-body2 leading-relaxed text-md-text-medium">
        成绩尚未发布
      </p>
      <div class="flex flex-wrap items-center justify-center gap-2 pt-2">
        <button class="md-btn-outlined" @click="$emit('update:selectedSemester', 'all')">
          查看全部学期
        </button>
      </div>
    </div>

    <!-- 成绩明细：一门课一张卡，卡内不画任何横线，卡片之间靠 10px 留白分隔 -->
    <template v-else>
      <SectionHeader title="课程成绩明细" :count="`${courses.length} 门`" />

      <div class="space-y-2.5">
        <NoteCard v-for="(course, idx) in courses" :key="idx">
          <div class="flex items-start justify-between gap-4">
            <!-- 左侧：课程名 / 课程性质 / 学分·绩点 -->
            <div class="min-w-0 space-y-2">
              <div class="truncate text-[15px] font-semibold leading-5 text-md-text-high">
                {{ course.name }}
              </div>
              <div v-if="course.nature" class="truncate text-[13px] leading-4 text-md-text-medium">
                {{ course.nature }}
              </div>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-md2-caption text-md-text-medium">
                <span>
                  学分
                  <span class="tabular-nums text-md-text-high">{{ course.credit }}</span>
                </span>
                <span>
                  绩点
                  <span class="tabular-nums text-md-text-high">{{ course.gpa }}</span>
                </span>
                <!-- 「全部学期」下同一门课可能重复，补学期用于区分 -->
                <span v-if="selectedSemester === 'all' && course.term" class="truncate">
                  {{ course.term }}
                </span>
              </div>
            </div>

            <!-- 右侧只有成绩：单色、大字号，不按分数段着色、不显示通过与否 -->
            <div class="shrink-0 font-mono text-[20px] leading-7 font-bold tabular-nums text-md-text-high">
              {{ course.score }}
            </div>
          </div>
        </NoteCard>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
import MetricGrid, { type MetricItem } from './ui/MetricGrid.vue';
import SectionHeader from './ui/SectionHeader.vue';
import NoteCard from './ui/NoteCard.vue';
import type { SemesterItem } from '../api/academic';

const props = defineProps<{
  scoresData: any;
  semesters: SemesterItem[];
  selectedSemester: string;
  loading?: boolean;
}>();

defineEmits<{
  (e: 'update:selectedSemester', semester: string): void;
  (e: 'refresh'): void;
}>();

function formatSemesterLabel(semId: string, name: string): string {
  return name || semId;
}

function parseScoreToNumber(scoreStr: string): number | null {
  const num = parseFloat(scoreStr);
  if (!isNaN(num)) return num;
  switch (scoreStr) {
    case '优秀':
      return 95;
    case '良好':
      return 85;
    case '中等':
      return 75;
    case '及格':
    case '合格':
    case '通过':
      return 65;
    case '不及格':
    case '不通过':
      return 50;
    default:
      return null;
  }
}

function calculateGpa(scoreStr: string): string {
  const num = parseFloat(scoreStr);
  if (!isNaN(num)) {
    return num >= 60 ? ((num - 50) / 10).toFixed(1) : '0.0';
  }
  switch (scoreStr) {
    case '优秀':
      return '4.5';
    case '良好':
      return '3.5';
    case '中等':
      return '2.5';
    case '及格':
    case '合格':
    case '通过':
      return '1.5';
    default:
      return '0.0';
  }
}

// 解析教务成绩返回格式（支持 ydjwxt 嵌套 achievement、后端归一化 courses、以及原始数组）
const courses = computed(() => {
  if (!props.scoresData) return [];

  let list: any[] = [];
  if (Array.isArray(props.scoresData)) {
    list = props.scoresData;
  } else if (Array.isArray(props.scoresData.courses)) {
    list = props.scoresData.courses;
  } else if (Array.isArray(props.scoresData.list)) {
    list = props.scoresData.list;
  } else if (props.scoresData.achievement && Array.isArray(props.scoresData.achievement)) {
    list = props.scoresData.achievement;
  } else if (Array.isArray(props.scoresData.data)) {
    const first = props.scoresData.data[0];
    if (first && Array.isArray(first.achievement)) {
      list = first.achievement;
    }
  }

  // 严格排除学生自身档案对象，仅提取合法课程
  return list
    .filter((item: any) => {
      if (!item || typeof item !== 'object') return false;
      const isStudent = item.studentID !== undefined && item.achievement !== undefined;
      const hasCourseField = Boolean(
        item.name ||
        item.courseName ||
        item.kcmc ||
        item.kcbh ||
        item.courseCode ||
        item.score !== undefined ||
        item.fraction !== undefined ||
        item.examinationNature ||
        item.examType,
      );
      return hasCourseField && !isStudent;
    })
    .map((item: any) => {
      const name = item.courseName || item.kcmc || item.name || '未知课程';
      const score = String(item.fraction || item.score || item.cj || item.cjmc || '--').trim();
      const credit = String(item.credit || item.xf || '0').trim();
      const nature = String(item.courseNature || item.curriculumAttributes || item.kcxz || '').trim();
      const term = String(item.term || item.semester || item.xqmc || '').trim();

      let gpa = String(item.gpa || item.jd || '').trim();
      if (!gpa || gpa === '--' || isNaN(parseFloat(gpa))) {
        gpa = calculateGpa(score);
      }

      return {
        name,
        score,
        credit,
        gpa,
        nature,
        term,
      };
    });
});

const overview = computed(() => {
  const summary = props.scoresData?.summary;
  const cList = courses.value;
  if (!cList.length && !summary?.pjxfjd) return { gpa: '', avgScore: '', totalCredits: '' };

  let totalCredit = 0;
  let totalScoreWeight = 0;
  let totalGpaWeight = 0;
  let validCreditCount = 0;

  for (const c of cList) {
    const credit = parseFloat(c.credit);
    const scoreNum = parseScoreToNumber(c.score);
    const gpa = parseFloat(c.gpa);

    if (!isNaN(credit) && credit > 0) {
      totalCredit += credit;
      if (scoreNum !== null) {
        totalScoreWeight += scoreNum * credit;
        validCreditCount += credit;
      }
      if (!isNaN(gpa)) {
        totalGpaWeight += gpa * credit;
      }
    }
  }

  const calcGpa = validCreditCount > 0 ? (totalGpaWeight / validCreditCount).toFixed(2) : '--';
  const avgScore = validCreditCount > 0 ? (totalScoreWeight / validCreditCount).toFixed(1) : '--';
  const gpa = summary?.pjxfjd ? String(summary.pjxfjd) : calcGpa;
  const credits = summary?.totalCredits && props.selectedSemester === 'all'
    ? String(summary.totalCredits)
    : totalCredit.toFixed(1);

  return {
    gpa,
    avgScore: avgScore,
    totalCredits: credits,
  };
});

/** 概览指标组（一组指标、竖线分隔、无外框；不带彩色 chip，不用颜色区分成绩好坏） */
const overviewMetrics = computed<MetricItem[]>(() => [
  {
    label: '平均绩点',
    value: overview.value.gpa || '--',
    hint: '加权绩点 (GPA)',
    icon: 'scores',
    iconClass: 'text-md-primary',
  },
  {
    label: '加权平均分',
    value: overview.value.avgScore || '--',
    hint: '按学分加权计算',
    icon: 'check',
    iconClass: 'text-md-accent',
  },
  {
    label: '获得学分',
    value: overview.value.totalCredits || '--',
    hint: '累计修读学分',
    icon: 'book',
    iconClass: 'text-md-warning',
  },
  {
    label: '修读门数',
    value: courses.value.length,
    hint: '已归档课程记录',
    icon: 'list',
    iconClass: 'text-md-text-medium',
  },
]);
</script>
