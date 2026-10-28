<template>
  <!-- ===================================================================
       校园卡付款码
       - 手机端（< 768px）：全屏页面，展示余额的卡片置底
       - PC 端（>= 768px）：居中弹窗，展示余额的卡片置底
       - 无阴影，统一采用灰框圆角矩形样式
       =================================================================== -->

  <!-- 移动端全屏页面 (< 768px) -->
  <div
    v-if="isMobile"
    class="fixed inset-0 z-50 bg-md-background flex flex-col animate-md2-fade"
    role="dialog"
    aria-modal="true"
    aria-label="校园卡付款码"
  >
    <!-- 移动端顶部应用栏 -->
    <header class="h-14 px-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 shrink-0 bg-md-background">
      <div class="flex items-center gap-1.5">
        <button
          class="md-icon-btn"
          title="返回"
          aria-label="返回"
          @click="$emit('close')"
        >
          <Icon name="chevron-left" size="md" />
        </button>
        <h2 class="text-md2-h6 font-medium text-md-text-high">校园卡付款码</h2>
      </div>
    </header>

    <!-- 移动端主体内容：flex-col，顶部/居中二维码，底部放置余额卡片 -->
    <div class="flex-1 overflow-y-auto px-4 py-5 flex flex-col justify-between max-w-md mx-auto w-full safe-bottom">
      <!-- 二维码主体区域（居中） -->
      <div class="my-auto py-6 flex flex-col items-center gap-5 w-full">
        <!-- 二维码：灰框圆角矩形，无阴影 -->
        <div
          class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white inline-flex items-center justify-center min-w-[240px] min-h-[240px]"
        >
          <div
            v-if="loading && !qrDataUrl"
            class="w-56 h-56 flex flex-col items-center justify-center text-md-text-medium"
          >
            <Icon name="refresh" size="lg" class="animate-spin text-emerald-600 mb-2" />
            <span class="text-xs">付款码生成中…</span>
          </div>
          <div
            v-else-if="errorMsg && !qrDataUrl"
            class="w-56 h-56 flex flex-col items-center justify-center text-center p-2"
          >
            <Icon name="error" size="lg" class="text-md-error mb-2" />
            <span class="text-xs text-md-error">{{ errorMsg }}</span>
            <button class="md-btn-text text-xs mt-2" @click="loadPayment(false)">重试</button>
          </div>
          <img
            v-else-if="qrDataUrl"
            :src="qrDataUrl"
            alt="校园卡付款码"
            class="w-56 h-56 object-contain"
          />
        </div>

        <!-- 刷新与倒计时 -->
        <div class="flex items-center justify-center gap-4 text-xs">
          <div class="flex items-center gap-1.5 text-md-text-medium">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>
              自动刷新
              <strong class="text-md-text-high tabular-nums font-semibold ml-0.5">{{ countdown }}s</strong>
            </span>
          </div>
          <button
            class="md-btn-outlined py-1.5 px-3 text-xs flex items-center gap-1.5 h-8 rounded-lg"
            :disabled="loading"
            @click="loadPayment(false)"
          >
            <Icon name="refresh" size="xs" :class="{ 'animate-spin': loading }" />
            <span>刷新</span>
          </button>
        </div>
      </div>

      <!-- 展示余额的置底卡片：灰框圆角矩形，无阴影 -->
      <div class="w-full border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-zinc-800 flex items-center justify-between shrink-0 mb-2">
        <div class="min-w-0 pr-3">
          <div class="text-base font-medium text-md-text-high truncate">{{ displayName }}</div>
          <div class="text-xs text-md-text-medium tabular-nums mt-0.5 truncate">{{ displayId }}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-xs text-md-text-medium">卡内可用余额</div>
          <div class="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
            ¥ {{ displayBalance }}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- PC 端居中弹窗 (>= 768px) -->
  <div
    v-else
    class="md-scrim flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label="校园卡付款码"
    @click.self="$emit('close')"
  >
    <div class="md-dialog max-w-sm w-full max-h-[calc(100dvh-2rem)] flex flex-col border border-gray-200 dark:border-gray-700 rounded-xl shadow-none">
      <!-- 标题栏 -->
      <div class="md-dialog-header shrink-0 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0"
          >
            <Icon name="qr-code" size="sm" />
          </div>
          <div>
            <h3 class="md-dialog-title text-[18px]">校园卡付款码</h3>
          </div>
        </div>
        <button class="md-icon-btn-sm -mt-1 -mr-1" title="关闭" @click="$emit('close')">
          <Icon name="close" size="sm" />
        </button>
      </div>

      <!-- 主体内容 -->
      <div class="md-dialog-body flex-1 overflow-y-auto no-scrollbar space-y-4 pt-4 pb-5">
        <!-- 二维码区域：灰框圆角矩形，无阴影 -->
        <div class="flex justify-center">
          <div
            class="p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white inline-flex items-center justify-center min-w-[200px] min-h-[200px]"
          >
            <div
              v-if="loading && !qrDataUrl"
              class="w-44 h-44 flex flex-col items-center justify-center text-md-text-medium"
            >
              <Icon name="refresh" size="lg" class="animate-spin text-emerald-600 mb-2" />
              <span class="text-xs">付款码生成中…</span>
            </div>
            <div
              v-else-if="errorMsg && !qrDataUrl"
              class="w-44 h-44 flex flex-col items-center justify-center text-center p-2"
            >
              <Icon name="error" size="lg" class="text-md-error mb-2" />
              <span class="text-xs text-md-error">{{ errorMsg }}</span>
              <button class="md-btn-text text-xs mt-2" @click="loadPayment(false)">重试</button>
            </div>
            <img
              v-else-if="qrDataUrl"
              :src="qrDataUrl"
              alt="校园卡付款码"
              class="w-44 h-44 object-contain"
            />
          </div>
        </div>

        <!-- 倒计时与刷新 -->
        <div class="flex items-center justify-center gap-4 text-xs pt-0.5">
          <div class="flex items-center gap-1.5 text-md-text-medium">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>
              自动刷新
              <strong class="text-md-text-high tabular-nums font-semibold ml-0.5">{{ countdown }}s</strong>
            </span>
          </div>
          <button
            class="md-btn-outlined py-1 px-2.5 text-xs flex items-center gap-1 h-7 rounded-lg"
            :disabled="loading"
            @click="loadPayment(false)"
          >
            <Icon name="refresh" size="xs" :class="{ 'animate-spin': loading }" />
            <span>刷新</span>
          </button>
        </div>

        <!-- 展示余额的置底卡片：灰框圆角矩形，无阴影 -->
        <div class="border border-gray-200 dark:border-gray-700 rounded-xl p-3.5 flex items-center justify-between bg-white dark:bg-zinc-800">
          <div class="min-w-0 pr-2">
            <div class="text-base font-medium text-md-text-high truncate">{{ displayName }}</div>
            <div class="text-xs text-md-text-medium tabular-nums mt-0.5 truncate">{{ displayId }}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-xs text-md-text-medium">卡内可用余额</div>
            <div class="text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
              ¥ {{ displayBalance }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Icon from './Icon.vue';
import { fetchPaymentCode, type CardInfo } from '../api/campus';
import type { StudentInfo } from '../utils/storage';

const props = defineProps<{
  studentInfo?: StudentInfo | null;
  cardInfo?: CardInfo | null;
  isMobile?: boolean;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

/** 手机端与否根据屏幕宽度判断（< 768px 为手机端） */
const windowIsMobile = ref(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

const isMobile = computed(() => {
  return props.isMobile !== undefined ? props.isMobile : windowIsMobile.value;
});

function handleResize() {
  if (typeof window !== 'undefined') {
    windowIsMobile.value = window.innerWidth < 768;
  }
}

const loading = ref(false);
const errorMsg = ref<string | null>(null);
const code = ref('');
const qrDataUrl = ref<string | null>(null);
const cardName = ref('');
const cardIdserial = ref('');
const cardBalance = ref<number | string | null>(null);
const countdown = ref(60);

let timer: ReturnType<typeof setInterval> | null = null;

const displayName = computed(() => {
  return cardName.value || props.studentInfo?.realName || props.cardInfo?.name || '--';
});

const displayId = computed(() => {
  return cardIdserial.value || props.studentInfo?.username || props.cardInfo?.idserial || props.cardInfo?.cardno || '--';
});

const displayBalance = computed(() => {
  const b = cardBalance.value ?? props.cardInfo?.balance;
  if (b === null || b === undefined || b === '') return '--';
  const num = Number(b);
  return Number.isFinite(num) ? num.toFixed(2) : String(b);
});

async function loadPayment(silent = false) {
  if (!silent) {
    loading.value = true;
    errorMsg.value = null;
  }

  try {
    const res = await fetchPaymentCode();
    code.value = res.code;
    qrDataUrl.value = res.qrDataUrl;
    if (res.card) {
      cardName.value = res.card.name;
      cardIdserial.value = res.card.idserial;
      cardBalance.value = res.card.balance;
    }
    countdown.value = 60;
    startCountdown();
  } catch (err) {
    if (!silent) {
      errorMsg.value = err instanceof Error ? err.message : '付款码获取失败';
    }
  } finally {
    if (!silent) {
      loading.value = false;
    }
  }
}

function startCountdown() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (countdown.value > 1) {
      countdown.value--;
    } else {
      countdown.value = 60;
      loadPayment(true);
    }
  }, 1000);
}

onMounted(() => {
  loadPayment(false);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
  }
});
</script>
