<template>
  <!-- ===================================================================
       周次工具栏（课表周视图 / 日程视图共用，全站唯一实现）
       -------------------------------------------------------------------
       工具栏不是「独立实体」，不该是卡片——它是一条控制条，
       落在画布上、用 1px 底边与内容分隔即可。

       结构： 第 N 周  ·  回到本周  ‖  1-20 周快速切换

       「第 X 周」左右两侧的 ‹ › 按钮已去掉：右栏的 1–20 周快速切换条
       已经把全部周次摊开，再放一对步进箭头是重复的导航。
       云端调课「已生效 N 条」的提示也去掉了 —— 规则生效是默认行为，
       不该每周都在工具栏上提示一遍。

       布局：左侧「第 N 周 / 回到本周」不收缩，右侧周次条吃掉剩余宽度并
       自己横向滚动 —— 20 个周次按钮在 620px 栏宽里放不下，必须能滚。
       =================================================================== -->
  <div class="md-toolbar">
    <div class="flex shrink-0 items-center gap-2">
      <span class="min-w-[64px] text-md2-subtitle1 tabular-nums text-md-text-high">
        第 {{ currentWeek }} 周
      </span>

      <!-- 回到今天 -->
      <button
        v-if="realWeek && currentWeek !== realWeek"
        class="md-btn-text"
        title="回到今天所在自然周"
        @click="$emit('change-week', realWeek)"
      >
        <Icon name="calendar" size="sm" />
        <span>回到今天</span>
      </button>

      <slot name="leading" />
    </div>

    <div class="flex min-w-0 flex-1 items-center justify-end gap-2">
      <slot name="actions" />

      <!-- 1-N 周快速切换：轨道自身横向滚动 -->
      <div class="md-week-strip min-w-0">
        <button
          v-for="w in maxWeek"
          :key="w"
          :class="[
            'md-week-chip',
            currentWeek === w ? 'md-week-chip-active' : '',
            realWeek === w && currentWeek !== w ? 'md-week-chip-current' : '',
          ]"
          :title="`第 ${w} 周`"
          @click="$emit('change-week', w)"
        >
          {{ w }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '../Icon.vue';

withDefaults(
  defineProps<{
    currentWeek: number;
    /** 当前自然周；与 currentWeek 不同时显示「回到本周」 */
    realWeek?: number | null;
    /** 总周数（默认 20） */
    maxWeek?: number;
    /** 保留入参以兼容旧调用方；工具栏不再展示「云端调课已生效」提示 */
    rulesApplied?: number;
  }>(),
  {
    realWeek: null,
    maxWeek: 20,
    rulesApplied: 0,
  },
);

defineEmits<{ (e: 'change-week', week: number): void }>();
</script>
