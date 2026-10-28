<template>
  <!-- ===================================================================
       今日日程（对应 App 的 _buildTodayTimetablePreview）
       与课表页的日程视图同一套卡片语言：
         · 考试 → 浅红底 + quiz 图标
         · 作业 → 浅黄底 + assignment_late 图标
         · 课程 → 课程色纯色填充 + 白字，第二行「时间, 教室」用逗号分隔、无 icon
       =================================================================== -->
  <FeedCard
    v-if="exams.length > 0 || homework.length > 0 || courses.length > 0"
    :title="title"
    more-text="课表"
    bare
    @more="$emit('more')"
  >
    <div class="space-y-2">
      <!-- 当天考试 -->
      <div
        v-for="exam in exams"
        :key="exam.title + exam.time"
        class="rounded-md2-md border border-red-500/20 bg-md-danger-surface px-4 py-2.5"
      >
        <div class="flex items-start gap-2.5">
          <Icon name="quiz" size="sm" class="mt-0.5 shrink-0 text-md-danger" />
          <div class="min-w-0 flex-1">
            <div class="flex items-start gap-1.5">
              <span class="min-w-0 flex-1 text-[15px] font-bold leading-tight text-md-text-high line-clamp-2">
                {{ exam.title }}
              </span>
              <span v-if="exam.status" class="md-chip-danger shrink-0">{{ exam.status }}</span>
            </div>
            <div class="mt-1 text-[12px] leading-4 text-md-text-medium line-clamp-1">
              {{ [exam.time, exam.location].filter(Boolean).join(' @ ') }}
            </div>
          </div>
        </div>
      </div>

      <!-- 当天截止的作业 -->
      <div
        v-for="hw in homework"
        :key="hw.id"
        class="rounded-md2-md bg-md-warning-surface px-4 py-2.5"
      >
        <div class="flex items-start gap-2.5">
          <Icon name="assignment-late" size="sm" class="mt-0.5 shrink-0 text-md-warning" />
          <div class="min-w-0 flex-1">
            <div class="text-[15px] font-bold leading-tight text-md-text-high line-clamp-1">
              {{ hw.title }}
            </div>
            <div class="text-[12px] leading-4 text-md-text-medium line-clamp-1">
              {{ hw.subtitle }}
            </div>
          </div>
        </div>
      </div>

      <!-- 课程：纯色填充 + 白字 -->
      <div
        v-for="course in courses"
        :key="course.name + course.time"
        class="rounded-md2-md px-4 py-2.5 text-white"
        :style="{ backgroundColor: course.color }"
      >
        <div class="text-[15px] font-bold leading-tight line-clamp-1">{{ course.name }}</div>
        <div class="mt-0.5 text-[12px] leading-4 text-white/90 line-clamp-1">
          {{ [course.time, course.classroom].filter(Boolean).join(', ') }}
        </div>
      </div>
    </div>
  </FeedCard>
</template>

<script setup lang="ts">
import Icon from '../Icon.vue';
import FeedCard from './FeedCard.vue';
import type { AgendaCourse, AgendaExam, AgendaHomework } from './types';

withDefaults(
  defineProps<{
    courses: AgendaCourse[];
    exams?: AgendaExam[];
    /** 今天截止的作业 */
    homework?: AgendaHomework[];
    title?: string;
  }>(),
  {
    exams: () => [],
    homework: () => [],
    title: '今日日程',
  },
);

defineEmits<{ (e: 'more'): void }>();
</script>
