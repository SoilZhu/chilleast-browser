<template>
  <!-- ===================================================================
       作业列表（对齐 App 的 homework_screen.dart）
       - 顶部三档状态 Tab：未完成 / 已完成 / 存档，默认停在「未完成」
       - 未完成：按截止日期分组，无截止时间的单独一组
       - 每项：待办圈 + 标题 + 课程 / 截止时间
         · 圈 = Google Tasks 风格：空心 = 未完成，主色实心带勾 = 已完成
         · 只有手工作业（isManual）的圈可点击，点一下切换完成状态
       =================================================================== -->
  <div class="space-y-4">
    <!-- 状态切换与操作栏：三档数据集（未完成 / 已完成 / 存档） + 右侧添加按钮 -->
    <div class="flex items-center justify-between gap-3">
      <div class="md-tabs min-w-0">
        <button
          v-for="tab in TABS"
          :key="tab.value"
          type="button"
          :class="activeStatus === tab.value ? 'md-tab-active' : 'md-tab'"
          @click="$emit('update:status', tab.value)"
        >
          <Icon :name="tab.icon" size="sm" />
          <span>{{ tab.label }}</span>
          <span class="md-tab-count">{{ countOf(tab.value) }}</span>
        </button>
      </div>

      <button
        type="button"
        class="md-btn-filled shrink-0 flex items-center gap-1.5 h-9 px-3.5 text-md2-button"
        @click="showAddModal = true"
      >
        <Icon name="plus" size="sm" />
        <span>添加作业</span>
      </button>
    </div>

    <!-- 添加手工作业弹窗 -->
    <div
      v-if="showAddModal"
      class="md-scrim flex items-center justify-center p-4 z-50"
      @click.self="showAddModal = false"
    >
      <div class="md-dialog max-w-lg w-full" role="dialog" aria-modal="true">
        <div class="md-dialog-header">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-md2-sm flex items-center justify-center bg-brand-50 text-md-primary">
              <Icon name="plus" size="sm" />
            </span>
            <h3 class="md-dialog-title">添加作业</h3>
          </div>
          <button type="button" class="md-icon-btn-sm" @click="showAddModal = false">
            <Icon name="close" size="sm" />
          </button>
        </div>

        <div class="md-dialog-body space-y-3.5">
          <div>
            <label class="md-label">作业名称 <span class="text-md-danger">*</span></label>
            <input
              v-model="newHwTitle"
              type="text"
              class="md-field"
              placeholder="作业名称"
              autofocus
            />
          </div>

          <div>
            <label class="md-label">所属课程（可选）</label>
            <input
              v-model="newHwCourse"
              type="text"
              class="md-field"
              placeholder="所属课程"
            />
          </div>

          <div>
            <label class="md-label">截止时间（可选）</label>
            <input
              v-model="newHwEndTime"
              type="datetime-local"
              class="md-field"
            />
          </div>

          <div>
            <label class="md-label">备注（可选）</label>
            <textarea
              v-model="newHwRemarks"
              rows="2"
              class="md-field resize-none"
              placeholder="添加备注信息"
            ></textarea>
          </div>
        </div>

        <div class="md-dialog-actions border-t border-md-card-border">
          <button type="button" class="md-btn-text" @click="showAddModal = false">取消</button>
          <button
            type="button"
            class="md-btn-filled"
            :disabled="!newHwTitle.trim()"
            @click="submitAddHomework"
          >
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <EmptyState v-if="sections.length === 0" :text="activeTab.emptyText" :icon="activeTab.icon" />

    <!-- 列表卡：未完成按截止日期分多张卡，已完成 / 存档各一张平铺卡 -->
    <NoteCard
      v-for="section in sections"
      :key="section.key"
      :title="section.title"
      :meta="section.meta"
      :flush="true"
    >
      <div class="md-feed-list">
        <div v-for="item in section.items" :key="item.id" class="md-feed-row items-start">
          <!-- 待办圈：手工作业可点，其余纯展示 -->
          <button
            v-if="item.isManual"
            type="button"
            :class="circleClass(item)"
            :aria-label="isDone(item) ? '标记为未完成' : '标记为已完成'"
            @click.stop="$emit('toggle-manual', item.id)"
          >
            <Icon v-if="isDone(item)" name="check" size="xs" />
          </button>
          <span v-else :class="circleClass(item)">
            <Icon v-if="isDone(item)" name="check" size="xs" />
          </span>

          <div class="min-w-0 flex-1">
            <h3
              :class="[
                'text-md2-body1 text-md-text-high font-medium line-clamp-2 leading-snug',
                isDone(item) ? 'line-through' : '',
              ]"
            >
              {{ item.title }}
            </h3>

            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-md2-caption text-md-text-medium">
              <span class="truncate">{{ item.courseName }}</span>

              <span v-if="timeText(item)" class="flex items-center gap-1 shrink-0">
                <Icon name="clock" size="xs" />
                {{ timeText(item) }}
              </span>

              <span v-if="isChaoxing(item)" class="flex items-center gap-1 shrink-0 text-md-text-hint">
                <Icon name="external-link" size="xs" />
                在学习通完成
              </span>
              <span v-else-if="item.isManual" class="flex items-center gap-1 shrink-0 text-md-text-hint">
                <Icon name="edit" size="xs" />
                手动添加
              </span>
            </div>

            <p v-if="item.remarks" class="text-md2-caption text-md-text-disabled mt-1 line-clamp-2">
              {{ item.remarks }}
            </p>

            <!-- 非手工作业仍保留去提交入口，手工作业支持删除 -->
            <div v-if="!item.isManual && item.dataUrl" class="mt-1.5">
              <a
                :href="item.dataUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="md-btn-text h-8 px-2"
              >
                去提交
                <Icon name="external-link" size="sm" />
              </a>
            </div>
            <div v-else-if="item.isManual" class="mt-1.5 flex justify-end">
              <button
                type="button"
                class="md-btn-text h-7 px-2 text-md2-caption text-md-text-disabled hover:text-md-danger"
                @click.stop="$emit('delete-manual', item.id)"
              >
                <Icon name="trash" size="xs" />
                <span>删除</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </NoteCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import NoteCard from './ui/NoteCard.vue';
import EmptyState from './ui/EmptyState.vue';
import type { HomeworkItem } from '../api/study';

/** 三档状态，取值与 worker 的 HomeworkStatus 对齐 */
type Status = 'pending' | 'completed' | 'archived';

const props = defineProps<{
  homework: HomeworkItem[];
  status: string;
  /** 用于计算各档计数，默认用 homework 自身 */
  allHomework?: HomeworkItem[];
}>();

const emit = defineEmits<{
  (e: 'update:status', status: Status): void;
  (e: 'toggle-manual', id: string): void;
  (e: 'add-manual', item: any): void;
  (e: 'delete-manual', id: string): void;
}>();

const showAddModal = ref(false);
const newHwTitle = ref('');
const newHwCourse = ref('');
const newHwEndTime = ref('');
const newHwRemarks = ref('');

function submitAddHomework() {
  const title = newHwTitle.value.trim();
  if (!title) return;

  const item = {
    id: `manual_${Date.now()}`,
    title,
    courseName: newHwCourse.value.trim() || '手工作业',
    endTime: newHwEndTime.value ? new Date(newHwEndTime.value).toISOString() : null,
    status: 0,
    statusCode: 'pending',
    isManual: true,
    remarks: newHwRemarks.value.trim(),
    createdAt: new Date().toISOString(),
  };

  emit('add-manual', item);

  newHwTitle.value = '';
  newHwCourse.value = '';
  newHwEndTime.value = '';
  newHwRemarks.value = '';
  showAddModal.value = false;
}

/** 三档 Tab：未完成 / 已完成 / 存档（默认未完成，见 activeStatus） */
const TABS = [
  { value: 'pending', label: '未完成', icon: 'tasks', emptyText: '暂无待办作业' },
  { value: 'completed', label: '已完成', icon: 'check-circle', emptyText: '暂无已完成作业' },
  { value: 'archived', label: '存档', icon: 'archive', emptyText: '暂无存档作业' },
] as const;

/** 非法 / 历史遗留值（如已下线的 all）一律落到「未完成」 */
function toStatus(value: string): Status {
  return value === 'completed' || value === 'archived' ? value : 'pending';
}

const activeStatus = computed<Status>(() => toStatus(props.status));

const activeTab = computed(() => TABS.find((t) => t.value === activeStatus.value) ?? TABS[0]);

function countOf(value: Status): number {
  const source = props.allHomework ?? props.homework;
  return source.filter((h) => h.statusCode === value).length;
}

// ---------------------------------------------------------------------------
// 行内小工具
// ---------------------------------------------------------------------------
function isDone(item: HomeworkItem): boolean {
  return item.statusCode === 'completed';
}

/**
 * 有就显示时间，没有就不显示（无截止时间那组不画 clock 图标）。
 * 未完成优先显示「剩余 x 小时」的倒计时（rawTimeStr）更有用；
 * 已完成 / 存档已经截止，倒计时没有意义，优先显示具体截止时间。
 */
function timeText(item: HomeworkItem): string {
  const text =
    isDone(item) || item.statusCode === 'archived'
      ? item.endTimeLocal || item.rawTimeStr || ''
      : item.rawTimeStr || item.endTimeLocal || '';
  // MainView 会给无截止时间的手工作业填 endTimeLocal = '无截止时间'，
  // 这里当空值处理，避免出现「🕐 无截止时间」这种冗余
  return text === '无截止时间' ? '' : text;
}

/** 超星网络作业：提交要去学习通里做（原版的「在学习通完成」提示） */
function isChaoxing(item: HomeworkItem): boolean {
  return !item.isManual && (item.dataUrl ?? '').includes('chaoxing.com');
}

/**
 * 待办圈的类。
 * - 空心灰描边 = 未完成；主色实心 + 白勾 = 已完成
 * - 只有手工作业的圈可点，所以只有它加 md-todo-circle-clickable。
 *   未完成态拿到 hover 主色描边 + 浅绿底 + 按下缩放；已完成态由
 *   style.css 里的 `:not(.md-todo-circle-done)` 限定剥掉浅绿底，
 *   只保留指针手势与按压缩放，避免白勾落在浅底上看不清。
 */
function circleClass(item: HomeworkItem): string[] {
  const classes = ['md-todo-circle', 'mt-0.5'];
  if (isDone(item)) classes.push('md-todo-circle-done');
  if (item.isManual) classes.push('md-todo-circle-clickable');
  return classes;
}

// ---------------------------------------------------------------------------
// 分组：未完成按截止日期分组（对齐 App 的 _buildPendingList）
// ---------------------------------------------------------------------------
interface Section {
  key: string;
  /** 卡头标题：未完成是日期，已完成 / 存档是「已完成作业」「存档作业」 */
  title: string;
  /** 卡头右侧计数徽章 */
  meta: string;
  items: HomeworkItem[];
}

/**
 * 解析截止时间戳。
 * 后端 endTime 可能是毫秒字符串、ISO 字符串，也可能是空串，
 * 直接 Number() 空串会得到 0（1970 年），必须逐层兜底。
 */
function parseEnd(item: HomeworkItem): number | null {
  const raw = item.endTime;
  if (raw != null && String(raw).trim() !== '') {
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    const asDate = new Date(String(raw)).getTime();
    if (Number.isFinite(asDate)) return asDate;
  }
  const local = item.endTimeLocal;
  if (local && String(local).trim() !== '') {
    const t = new Date(local).getTime();
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function dateLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

const pendingSections = computed<Section[]>(() => {
  const items = props.homework.filter((h) => h.statusCode === 'pending');

  const withTime = items
    .filter((h) => parseEnd(h) !== null)
    .sort((a, b) => (parseEnd(a) as number) - (parseEnd(b) as number));
  const noTime = items.filter((h) => parseEnd(h) === null);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 86400000;

  const map = new Map<string, HomeworkItem[]>();
  for (const item of withTime) {
    const key = dateLabel(parseEnd(item) as number);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }

  const sections: Section[] = [...map.entries()].map(([dateKey, groupItems]) => {
    return {
      key: dateKey,
      title: dateKey,
      meta: `${groupItems.length} 项`,
      items: groupItems,
    };
  });

  if (noTime.length > 0) {
    sections.push({
      key: 'no-deadline',
      title: '无截止时间的作业',
      meta: `${noTime.length} 项`,
      items: noTime,
    });
  }
  return sections;
});

const sections = computed<Section[]>(() => {
  if (activeStatus.value === 'pending') return pendingSections.value;

  // 已完成 / 存档是平铺列表（原版 _buildSimpleList），不再按日期分组
  const items = props.homework.filter((h) => h.statusCode === activeStatus.value);
  if (items.length === 0) return [];
  return [
    {
      key: activeStatus.value,
      title: activeStatus.value === 'completed' ? '已完成作业' : '存档作业',
      meta: `${items.length} 项`,
      items,
    },
  ];
});
</script>
