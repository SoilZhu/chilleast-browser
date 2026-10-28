<template>
  <!-- ===================================================================
       开始引导（对应原版 App 的 cloud_sync_prompt_screen.dart）
       7 步配置向导：云备份 / 课表自动同步 / 上课提醒 / 作业提醒 /
       图书馆提醒 / 匿名统计 / 完成

       显示模式取决于屏幕宽度：
       - 手机端（< 768px）：全屏显示
       - PC 端（>= 768px）：半透明黑色背景遮罩居中弹窗，不引导完不消失
       =================================================================== -->
  <div
    class="fixed inset-0 z-50 overflow-y-auto bg-white md:bg-black/60 md:backdrop-blur-sm md:flex md:items-center md:justify-center md:p-4 transition-colors"
    role="dialog"
    aria-modal="true"
    aria-label="开始引导"
  >
    <!-- 卡片主体：手机全屏、PC 居中弹窗 -->
    <div
      class="w-full min-h-screen md:min-h-0 md:max-w-xl md:w-full bg-white md:rounded-2xl md:shadow-2xl p-5 md:p-7 flex flex-col justify-between gap-5 my-auto"
      @click.stop
    >
      <!-- 头部：标题与分段指示 -->
      <div class="space-y-3 shrink-0">
        <h1 class="text-md2-h6 font-bold text-md-text-high">开始引导</h1>

        <!-- 步骤指示：分段进度条 -->
        <div
          class="flex items-center gap-1.5"
          role="progressbar"
          :aria-valuenow="step + 1"
          aria-valuemin="1"
          :aria-valuemax="steps.length"
        >
          <span
            v-for="(s, i) in steps"
            :key="s.id"
            :class="[
              'h-1 flex-1 rounded-full transition-colors duration-md2-short',
              i <= step ? 'bg-md-primary' : 'bg-md-surface-3',
            ]"
          />
        </div>
      </div>

      <!-- 当前步骤内容主体 -->
      <section class="flex-1 py-1 space-y-4">
        <div class="flex items-start gap-3.5">
          <span
            class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors"
            :style="{ backgroundColor: current.color + '18', color: current.color }"
          >
            <Icon :name="current.icon" size="md" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-md2-subtitle1 font-bold text-md-text-high">{{ current.title }}</h2>
              <span v-if="current.badge" class="md-chip-info text-xs">{{ current.badge }}</span>
            </div>
            <p v-if="current.message" class="text-md2-body2 text-md-text-medium mt-1 leading-relaxed">
              {{ current.message }}
            </p>
          </div>
        </div>

        <!-- 步骤专属配置：提醒类（下拉框） -->
        <div v-if="current.kind === 'reminder'" class="space-y-4 pt-1">
          <div class="max-w-xs">
            <label class="md-label" :for="`guide-time-${current.id}`">{{ current.timeLabel }}</label>
            <select
              :id="`guide-time-${current.id}`"
              v-model.number="current.value as number"
              class="md-select"
            >
              <option v-for="opt in current.options" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>

        <!-- 步骤专属配置：开关类 -->
        <div v-if="current.kind === 'toggle'" class="md-group mt-2">
          <div class="md-row justify-between gap-4 py-3.5 px-1">
            <div class="min-w-0">
              <div class="text-md2-body2 font-medium text-md-text-high">{{ current.toggleLabel }}</div>
              <div class="text-md2-caption text-md-text-medium mt-0.5">{{ current.toggleHint }}</div>
            </div>
            <SwitchToggle v-model="current.enabled as boolean" />
          </div>
        </div>

        <!-- 步骤专属配置：完成类 -->
        <div
          v-if="current.kind === 'finish'"
          class="p-4 rounded-xl bg-md-surface-2 border border-md-divider text-md2-caption text-md-text-medium"
        >
          配置已就绪，点击「完成」即可进入自在东湖。所有设置后续可在「设置」或「个人中心」中随时修改。
        </div>

        <!-- 步骤专属配置：安卓原生应用下载推荐 -->
        <div v-if="current.kind === 'android-app'" class="space-y-3 pt-3 px-1">
          <ul class="space-y-3">
            <li
              v-for="item in ['极速响应', '离线课表', '及时通知', '桌面小组件', '更多功能']"
              :key="item"
              class="flex items-center gap-2 text-md2-body1 text-md-text-high font-medium"
            >
              <span class="text-md-text-medium">-</span>
              <span>{{ item }}</span>
            </li>
          </ul>
        </div>

        <!-- 步骤专属配置：iOS PWA 添加引导 -->
        <div v-if="current.kind === 'ios-pwa'" class="space-y-3 pt-1">
          <!-- 若已在独立应用模式下运行 -->
          <div
            v-if="isInstalled"
            class="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3"
          >
            <span class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <Icon name="check" size="sm" />
            </span>
            <div class="text-md2-caption min-w-0">
              <div class="font-bold text-emerald-900 text-sm">已作为独立应用运行</div>
              <div class="text-emerald-700 mt-0.5">
                当前已添加至主屏幕，享受全屏沉浸界面与快速启动体验。
              </div>
            </div>
          </div>

          <!-- 未添加时：三步指引（平铺展示，无分割线与外框） -->
          <div v-else class="space-y-4 pt-1">
            <div class="space-y-4">
              <!-- 步骤 1 -->
              <div class="flex items-start gap-3">
                <span class="w-6 h-6 rounded-full bg-md-primary/10 text-md-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div class="flex-1 min-w-0">
                  <div class="text-md2-body2 font-medium text-md-text-high flex items-center gap-1.5 flex-wrap">
                    点击 Safari 底部（或顶部）的
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-xs font-bold text-blue-600">
                      <svg class="w-3.5 h-3.5 inline-block text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </svg>
                      分享
                    </span>
                    按钮
                  </div>
                  <div class="text-md2-caption text-md-text-medium mt-1">
                    在 Safari 浏览器下方的工具栏中找到向上箭头的分享图标（iPad 在右上角）。
                  </div>
                </div>
              </div>

              <!-- 步骤 2 -->
              <div class="flex items-start gap-3">
                <span class="w-6 h-6 rounded-full bg-md-primary/10 text-md-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div class="flex-1 min-w-0">
                  <div class="text-md2-body2 font-medium text-md-text-high flex items-center gap-1.5 flex-wrap">
                    向下滑动选择
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-xs font-bold text-gray-800">
                      <svg class="w-3.5 h-3.5 inline-block text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="12" y1="8" x2="12" y2="16" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                      添加到主屏幕
                    </span>
                  </div>
                  <div class="text-md2-caption text-md-text-medium mt-1">
                    在分享菜单列表中向下滑动，找到「添加到主屏幕」选项并轻触。
                  </div>
                </div>
              </div>

              <!-- 步骤 3 -->
              <div class="flex items-start gap-3">
                <span class="w-6 h-6 rounded-full bg-md-primary/10 text-md-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <div class="flex-1 min-w-0">
                  <div class="text-md2-body2 font-medium text-md-text-high flex items-center gap-1.5 flex-wrap">
                    轻触右上角
                    <span class="px-2 py-0.5 rounded bg-blue-600 text-white text-xs font-bold shadow-sm">
                      添加
                    </span>
                    完成
                  </div>
                  <div class="text-md2-caption text-md-text-medium mt-1">
                    完成后回到桌面，即可看到「自在东湖」图标，点击即可像 App 一样使用！
                  </div>
                </div>
              </div>
            </div>

            <!-- 微信/QQ 提示 -->
            <div class="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-start gap-2">
              <span class="text-amber-600 shrink-0 mt-0.5">
                <Icon name="info" size="xs" />
              </span>
              <div class="text-[11px] text-amber-800 leading-normal">
                提示：若当前在微信或 QQ 内访问，请先点击右上角「···」选择「在 Safari 中打开」，再按上述步骤添加到主屏幕。
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 底部操作栏 -->
      <div class="shrink-0 pt-2">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="md-btn-outlined"
            :disabled="step === 0"
            @click="prev"
          >
            <Icon name="chevron-left" size="sm" />
            上一步
          </button>

          <div class="flex-1" />

          <!-- 跳过：跳过当前项，不是跳过开始引导 -->
          <button
            v-if="!isLast"
            type="button"
            class="md-btn-text"
            @click="skip"
          >
            跳过
          </button>

          <!-- 下一步 / 完成 -->
          <button
            type="button"
            class="md-btn-filled"
            @click="next"
          >
            {{ isLast ? '完成' : (current.kind === 'android-app' ? '前往下载' : '下一步') }}
            <Icon :name="isLast ? 'check' : (current.kind === 'android-app' ? 'external-link' : 'chevron-right')" size="sm" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Icon from '../components/Icon.vue';
import SwitchToggle from '../components/ui/SwitchToggle.vue';
import { settings, settingsActions, minuteLabel } from '../stores/settings';
import { notifyPermission, requestNotifyPermission } from '../services/reminders';
import { usePwaInstall } from '../composables/usePwaInstall';
import { isAnalyticsEnabled, setAnalyticsEnabled } from '../services/analytics';

const emit = defineEmits<{ (e: 'done'): void }>();

/** 引导完成的持久化标记 */
const DONE_KEY = 'chilleast_guide_done';

type StepKind = 'toggle' | 'reminder' | 'ios-pwa' | 'android-app' | 'finish';

interface GuideStep {
  id: string;
  kind: StepKind;
  icon: string;
  color: string;
  title: string;
  message: string;
  badge?: string;
  enabled?: boolean;
  value?: number;
  options?: { label: string; value: number }[];
  timeLabel?: string;
  toggleLabel?: string;
  toggleHint?: string;
}

const { canInstall, isInstalled, isIos, isAndroid, triggerInstall } = usePwaInstall();

const MINUTE_CHOICES = [5, 10, 20, 30, 40, 50, 60];
const HOUR_CHOICES = [0.5, 1, 2, 6, 12, 24, 48];

/** 与 App 的云同步推荐页对应（iOS / PWA 额外追加添加应用引导页） */
const baseSteps: GuideStep[] = [
  {
    id: 'cloud',
    kind: 'toggle',
    icon: 'cloud',
    color: '#1a73e8',
    title: '开启自动同步',
    message: '自动把课表、作业等本地数据同步到学习通网盘，换机也不丢。',
    enabled: settings.cloudBackupAutoSyncEnabled,
    toggleLabel: '自动同步',
    toggleHint: '通过学习通网盘',
  },
  {
    id: 'timetable',
    kind: 'toggle',
    icon: 'calendar',
    color: '#0f9d58',
    title: '课表自动同步',
    message: '自动拉取教务系统，时刻获取最新课表。',
    badge: '推荐开启',
    enabled: settings.timetableAutoSyncEnabled,
    toggleLabel: '自动同步课表',
    toggleHint: '登录后拉取最新课表',
  },
  {
    id: 'course-reminder',
    kind: 'reminder',
    icon: 'bell-ring',
    color: '#f29900',
    title: '上课提醒',
    message: '在课程开始前通知提醒上课教室。',
    value: settings.reminderMinutes || 30,
    timeLabel: '上课提醒时间',
    options: MINUTE_CHOICES.map((v) => ({ label: minuteLabel(v), value: v })),
  },
  {
    id: 'homework-reminder',
    kind: 'reminder',
    icon: 'tasks',
    color: '#e8710a',
    title: '作业截止提醒',
    message: '作业截止前通知提醒，避免错过作业提交。',
    badge: '提前预警',
    value: settings.homeworkReminderHours || 48,
    timeLabel: '作业提醒时间',
    options: HOUR_CHOICES.map((v) => ({
      label: v === 0.5 ? '0.5 小时前' : `${v} 小时前`,
      value: v,
    })),
  },
  {
    id: 'library-reminder',
    kind: 'reminder',
    icon: 'book',
    color: '#795548',
    title: '图书馆座位提醒',
    message: '预约时段开始前发送通知，防止错过预约。',
    badge: '提前提醒',
    value: settings.libraryReminderMinutes || 30,
    timeLabel: '图书馆预约提醒时间',
    options: MINUTE_CHOICES.map((v) => ({ label: minuteLabel(v), value: v })),
  },
  {
    id: 'analytics',
    kind: 'toggle',
    icon: 'activity',
    color: '#5f6368',
    title: '允许匿名统计',
    message: '仅使用绝对匿名方式，统计使用版本。',
    enabled: isAnalyticsEnabled(),
    toggleLabel: '匿名统计',
    toggleHint: '不含任何个人信息',
  },
  ...(isAndroid
    ? [
        {
          id: 'android-app',
          kind: 'android-app' as const,
          icon: 'download',
          color: '#0f9d58',
          title: '推荐下载安卓版',
          message: '',
        },
      ]
    : isIos
      ? [
          {
            id: 'ios-pwa',
            kind: 'ios-pwa' as const,
            icon: 'download',
            color: '#1a73e8',
            title: '添加为应用',
            message: '添加至主屏幕，享受全屏沉浸与极速启动。',
          },
        ]
      : canInstall.value
        ? [
            {
              id: 'ios-pwa',
              kind: 'ios-pwa' as const,
              icon: 'download',
              color: '#1a73e8',
              title: '添加为应用',
              message: '支持离线秒开、独立窗口与全屏沉浸式体验。',
            },
          ]
        : []),
  {
    id: 'finish',
    kind: 'finish',
    icon: 'check-circle',
    color: '#0f9d58',
    title: '配置完成',
    message: '所有设置已保存，可随时在设置里调整。',
  },
];

const steps = reactive<GuideStep[]>(baseSteps);

watch(canInstall, (val) => {
  if (
    val &&
    !isAndroid &&
    !isInstalled.value &&
    !steps.some((s) => s.id === 'ios-pwa' || s.id === 'android-app')
  ) {
    const finishIndex = steps.findIndex((s) => s.id === 'finish');
    const pwaStep: GuideStep = {
      id: 'ios-pwa',
      kind: 'ios-pwa',
      icon: 'download',
      color: '#1a73e8',
      title: '添加为应用',
      message: '支持离线秒开、独立窗口与全屏沉浸式体验。',
    };
    if (finishIndex !== -1) {
      steps.splice(finishIndex, 0, pwaStep);
    } else {
      steps.push(pwaStep);
    }
  }
});

const step = ref(0);
const current = computed(() => steps[step.value]);
const isLast = computed(() => step.value === steps.length - 1);

/** 把当前步骤的选择写进 settings */
function commit(i: number) {
  const s = steps[i];
  switch (s.id) {
    case 'cloud':
      settingsActions.setCloudBackupAutoSync(Boolean(s.enabled));
      break;
    case 'timetable':
      settingsActions.setTimetableAutoSync(Boolean(s.enabled));
      break;
    case 'course-reminder':
      settingsActions.setReminderMinutes(Number(s.value ?? 0));
      break;
    case 'homework-reminder':
      settingsActions.setHomeworkReminderHours(Number(s.value ?? 0));
      break;
    case 'library-reminder':
      settingsActions.setLibraryReminderMinutes(Number(s.value ?? 0));
      break;
    case 'analytics':
      setAnalyticsEnabled(Boolean(s.enabled));
      break;
    default:
      break;
  }
}

async function next() {
  // 通知提醒相关步骤在点击「下一步」时主动索要浏览器的通知权限
  if (current.value.kind === 'reminder' && notifyPermission.value !== 'granted') {
    try {
      await requestNotifyPermission();
    } catch (err) {
      console.warn('通知权限索要失败', err);
    }
  }

  // 安卓端推荐下载步骤：点击「下一步」跳转官网下载
  if (current.value.kind === 'android-app' || current.value.id === 'android-app') {
    jumpToDownload();
  }

  // iOS / PWA 应用安装步骤：点击「下一步」时调用 PWA 安装接口
  if (current.value.kind === 'ios-pwa' || current.value.id === 'ios-pwa') {
    if (canInstall.value) {
      try {
        await triggerInstall();
      } catch (err) {
        console.warn('[PWA] 触发安装引导失败:', err);
      }
    }
  }

  commit(step.value);

  if (isLast.value) {
    finish();
    return;
  }
  step.value += 1;
}

function jumpToDownload() {
  const url = 'https://chilleast.soilzhu.su';
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    window.location.href = url;
  }
}

function skip() {
  // 跳过是跳过这一项，不是跳过开始引导
  if (isLast.value) {
    finish();
    return;
  }
  step.value += 1;
}

function prev() {
  if (step.value > 0) step.value -= 1;
}

function finish() {
  localStorage.setItem(DONE_KEY, 'true');
  emit('done');
}
</script>
