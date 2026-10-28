<template>
  <div class="min-h-screen">
    <!-- 未登录：登录页 -->
    <LoginView
      v-if="!isLoggedIn"
      @login-success="handleLoginSuccess"
    />

    <!-- 已登录：主界面 -->
    <MainView
      v-else
      :student="currentStudent"
      :just-logged-in="justLoggedIn"
      @logout="handleLogout"
    />

    <!-- 登录后首次拉取云端的轻提示 -->
    <transition
      enter-active-class="transition duration-md2-short ease-md2-decelerate"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition duration-md2-short ease-md2-accelerate"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="toast"
        class="fixed left-1/2 -translate-x-1/2 bottom-8 z-[60] px-4 py-2.5 rounded-md2-md bg-[#323639] text-white text-md2-body2 shadow-dp8 flex items-center gap-2 max-w-[88vw]"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-[#81c995] shrink-0" />
        <span class="truncate">{{ toast }}</span>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import LoginView from './views/LoginView.vue';
import MainView from './views/MainView.vue';
import { storage, timetableStorage, type StudentInfo } from './utils/storage';
import { logout } from './api/auth';
import { pullLatestOnStartup, resetOnLogout, syncState } from './services/cloudSync';
import { stopReminders } from './services/reminders';
import { resetNotices } from './composables/useNotices';
import { pingAnalytics } from './services/analytics';

const isLoggedIn = ref(false);
const currentStudent = ref<StudentInfo | null>(null);
const toast = ref('');
const justLoggedIn = ref(false);

let toastTimer: number | null = null;

function showToast(text: string) {
  toast.value = text;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = '';
  }, 3200);
}

function checkAuth() {
  const token = storage.getToken();
  if (token) {
    isLoggedIn.value = true;
    currentStudent.value = storage.getStudent();
  } else {
    isLoggedIn.value = false;
    currentStudent.value = null;
  }
}

/**
 * 登录后拉取云端最新备份（对应原版 pullLatestOnStartup）。
 * 与原版语义一致：只拉不推；若本地存在离线改动，同步引擎会再补推一次。
 * 同步成功后顶栏刷新按钮展示 done 图标，不拉起轻提示条。
 */
async function syncAfterLogin() {
  if (!syncState.value.enabled) return;
  await pullLatestOnStartup();
}

/** 提醒服务在没有系统通知权限时会派发这个事件，用页内提示兜底 */
function onReminder(ev: Event) {
  const detail = (ev as CustomEvent<{ title: string; body: string }>).detail;
  if (detail?.title) showToast(`${detail.title} · ${detail.body}`);
}

onMounted(() => {
  checkAuth();
  window.addEventListener('chilleast:unauthorized', handleUnauthorized);
  window.addEventListener('chilleast:reminder', onReminder);
  if (isLoggedIn.value) void syncAfterLogin();
  void pingAnalytics();
});

onUnmounted(() => {
  window.removeEventListener('chilleast:unauthorized', handleUnauthorized);
  window.removeEventListener('chilleast:reminder', onReminder);
  if (toastTimer !== null) window.clearTimeout(toastTimer);
});

function handleUnauthorized() {
  isLoggedIn.value = false;
  currentStudent.value = null;
  // 通知是跨页面单例，换账号时必须清掉，否则会看到上一个账号的通知
  resetNotices();
  timetableStorage.deleteAll();
}

function handleLoginSuccess() {
  checkAuth();
  justLoggedIn.value = true;
  void syncAfterLogin();
}

async function handleLogout() {
  await logout();
  // 与原版一致：退出登录复位同步状态与提醒排程、清空本地课表缓存
  resetOnLogout();
  stopReminders();
  resetNotices();
  timetableStorage.deleteAll();
  localStorage.removeItem('chilleast_guide_done');
  justLoggedIn.value = false;
  isLoggedIn.value = false;
  currentStudent.value = null;
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    const url = new URL(window.location.href);
    url.searchParams.delete('tab');
    url.searchParams.delete('libPage');
    window.history.replaceState(null, '', url.toString());
  }
}
</script>
