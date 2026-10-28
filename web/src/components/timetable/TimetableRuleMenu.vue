<template>
  <!-- ===================================================================
       调课（对应原版 timetable_rule_dialogs.dart 的 showActionMenu）
       -------------------------------------------------------------------
       底部动作菜单：遮罩 + 贴底白容器，四个动作各一行
       （40dp 圆形浅色图标底 + 标题 15/500）。

       组件自己管理「菜单 + 四个对话框」的开关：
       父级只需 v-if 控制是否渲染，点遮罩/关闭 → emit('close')，
       任一规则保存/删除成功 → emit('changed')（父级据此重新拉课表）。
       =================================================================== -->
  <div
    v-if="!activeDialog"
    class="md-scrim flex items-end justify-center sm:items-center sm:p-4"
    @click.self="emit('close')"
  >
    <div
      class="safe-bottom w-full max-w-md animate-md2-sheet rounded-t-md2-lg bg-white shadow-dp24 sm:animate-md2-dialog sm:rounded-md2-lg"
      role="dialog"
      aria-modal="true"
      aria-label="课表调整"
    >
      <div class="flex items-center justify-between px-5 pt-3 pb-1">
        <span class="text-md2-section text-md-text-high">课表调整</span>
        <button class="md-icon-btn-sm -mr-2" type="button" title="关闭" @click="emit('close')">
          <Icon name="close" size="sm" />
        </button>
      </div>

      <div class="px-5 pb-2 pt-1">
        <button
          v-for="action in ACTIONS"
          :key="action.id"
          class="flex w-full items-center gap-3 rounded-md2-sm py-2.5 text-left transition-colors duration-md2-short ease-md2-standard hover:bg-md-surface-1 active:bg-md-surface-2"
          type="button"
          @click="openDialog(action.id)"
        >
          <span
            :class="[
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              action.bg,
              action.fg,
            ]"
          >
            <Icon :name="action.icon" size="md" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] font-medium leading-5 text-md-text-high">
              {{ action.title }}
            </span>
            <span class="block text-md2-caption leading-4 text-md-text-medium">
              {{ action.hint }}
            </span>
          </span>
          <Icon name="chevron-right" size="sm" class="shrink-0 text-md-text-hint" />
        </button>
      </div>
    </div>
  </div>

  <!-- 四个对话框（调课 / 停课 / 加课 / 我的调整） -->
  <TimetableRuleDialogs
    v-if="activeDialog"
    :mode="activeDialog"
    :courses="courses"
    :rules="localRules"
    :current-week="currentWeek"
    @close="closeDialog"
    @saved="onSaved"
    @cleared="onCleared"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import Icon from '@/components/Icon.vue';
import TimetableRuleDialogs from './TimetableRuleDialogs.vue';
import type { TimetableCourse } from '@/api/academic';
import { resolveRules } from '@/api/timetable-rules';
import type { TimetableRule } from '@/utils/timetable-rules';

/**
 * 底部动作菜单（对应原版 showActionMenu 的四项）
 *
 * 图标颜色按原版给：调课蓝、停课橙、加课绿、我的调整红。
 * 底色一律用 15% 透明度的同色（等价于 Flutter 的 `iconColor.withOpacity(0.15)`），
 * 文字颜色仍走 MD2 token，不新造裸色值。
 */
const props = withDefaults(
  defineProps<{
    /** 全学期课程（调课/停课对话框的课程下拉用它，不受当前周限制） */
    courses: TimetableCourse[];
    /** 云端调课规则（来自全量课表响应的 backup.rules） */
    rules?: TimetableRule[];
    /** 当前自然周，对话框的默认值用它 */
    currentWeek: number;
  }>(),
  {
    rules: () => [],
    currentWeek: 1,
  },
);

const emit = defineEmits<{
  /** 关闭整个调课面板（父级置 v-if = false） */
  (e: 'close'): void;
  /** 规则已变更（新增/删除/清空），父级应重新拉一次课表 */
  (e: 'changed'): void;
}>();

type DialogId = 'reschedule' | 'suspension' | 'custom' | 'list';

interface ActionItem {
  id: DialogId;
  icon: string;
  title: string;
  hint: string;
  /** 图标底（15% 透明度浅色） */
  bg: string;
  /** 图标前景色 */
  fg: string;
}

const ACTIONS: ActionItem[] = [
  {
    id: 'reschedule',
    icon: 'swap',
    title: '调课',
    hint: '把课挪到别的周或星期',
    bg: 'bg-md-accent-surface',
    fg: 'text-md-accent',
  },
  {
    id: 'suspension',
    icon: 'leave',
    title: '停课',
    hint: '一段时间内不上某门课',
    bg: 'bg-md-warning-surface',
    fg: 'text-md-warning',
  },
  {
    id: 'custom',
    icon: 'add-circle',
    title: '加课',
    hint: '手动补一门课进课表',
    bg: 'bg-md-success-surface',
    fg: 'text-md-success',
  },
  {
    id: 'list',
    icon: 'rule',
    title: '我的调整',
    hint: '查看或删除已有调整',
    bg: 'bg-md-danger-surface',
    fg: 'text-md-danger',
  },
];

const activeDialog = ref<DialogId | null>(null);

/**
 * 对话框用的规则列表：云端有就用户云的，没有（或父级没接线）时退到本地镜像。
 * 本地 ref 是为了让「删除/清空」后对话框能立刻回显，而不用等父级重新拉课表。
 */
const localRules = ref<TimetableRule[]>(resolveRules(props.rules));

/**
 * 父级刷新完课表会传来新的 rules（本组件若还挂着就同步过来）。
 * 只在「云端规则非空」时覆盖本地：父级刷新失败传回空数组时，
 * 不能把用户刚保存的列表清空。
 */
watch(
  () => props.rules,
  (next) => {
    if (Array.isArray(next) && next.length > 0) localRules.value = resolveRules(next);
  },
  { deep: false },
);

function openDialog(id: DialogId) {
  // 每次打开都重新取一次，避免父级在别处更新了规则后这里还是旧的
  localRules.value = resolveRules(props.rules);
  activeDialog.value = id;
}

/**
 * 对话框自己关掉了（取消 / 保存成功 / 点关闭）。
 *
 * 父级 `@changed` 会重新拉课表 → 父级重渲染 → 本组件可能被整块卸载，
 * 所以这里只负责把对话框收起来，菜单是否保留由父级 v-if 决定。
 */
function closeDialog() {
  activeDialog.value = null;
}

/**
 * 规则变更（新增 / 删除）。
 *
 * 只通知父级刷新，**不关掉对话框** —— 「我的调整」里删一条后应当继续停在列表上，
 * 与原版一致（原版删完 setState 重新读列表）。父级刷新完成后会传入新的 rules。
 */
function onSaved(nextRules: TimetableRule[]) {
  localRules.value = nextRules;
  emit('changed');
}

/** 清空全部：列表已空，留在列表页显示空状态即可（同样只通知父级） */
function onCleared(nextRules: TimetableRule[]) {
  localRules.value = nextRules;
  emit('changed');
}
</script>
