<template>
  <!-- ===================================================================
       MD2 Top App Bar（64px）：汉堡菜单 + 品牌 + 药丸搜索框 + 工具图标 + 头像
       参考 Google Keep / Gmail 的 app bar 语言，非 1:1 复刻。
       Keep 实测：条高 64px、底边 1px #dadce0；搜索框高 40px、无边框、
       填充 #eff5f9；右侧图标按钮 40dp 圆形。
       =================================================================== -->
  <header
    class="sticky top-0 z-40 flex h-12 md:h-16 bg-md-background border-b-0 md:border-b md:border-md-divider items-center gap-0.5 sm:gap-1 px-3 md:px-0 pr-3"
  >
    <!-- ---------- 左：汉堡菜单 + 品牌（手机端隐藏）---------- -->
    <div class="hidden md:flex items-center shrink-0">
      <div class="w-12 h-12 md:w-[72px] flex items-center justify-center shrink-0">
        <button
          class="md-icon-btn"
          :title="sidebarCollapsed ? '展开主菜单' : '收起主菜单'"
          :aria-label="sidebarCollapsed ? '展开主菜单' : '收起主菜单'"
          @click="$emit('toggle-sidebar')"
        >
          <Icon name="menu" size="md" />
        </button>
      </div>

      <button
        class="flex items-center gap-2.5 pl-1 pr-2 rounded-md2-sm hover:bg-md-surface-1 transition-colors duration-md2-short"
        title="回到首页"
        @click="$emit('navigate', 'home')"
      >
        <!-- 品牌标记：Logo（透明版，随页面底色自适应） -->
        <img
          src="/brand/mark-light.png"
          alt=""
          class="h-[22px] w-auto shrink-0 select-none"
          draggable="false"
          aria-hidden="true"
        />
        <span class="hidden sm:block text-[22px] leading-none text-md-text-medium font-normal tracking-tight">
          自在东湖
        </span>
      </button>
    </div>

    <!-- ---------- 中：药丸搜索框（Keep：40px 高、#eff5f9 填充、无边框；手机端隐藏）---------- -->
    <div class="hidden md:block flex-1 min-w-0 max-w-2xl mx-1 sm:mx-3">
      <div
        :class="['md-searchbar', searchFocused ? 'md-searchbar-active' : '']"
      >
        <Icon name="search" size="md" class="text-md-text-medium shrink-0" />
        <input
          ref="searchInput"
          :value="searchQuery"
          type="text"
          :placeholder="searchPlaceholder"
          class="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] leading-6 text-md-text-high placeholder-md-text-medium"
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          @focus="searchFocused = true"
          @blur="searchFocused = false"
        />
        <button
          v-if="searchQuery"
          class="md-icon-btn-sm shrink-0"
          title="清空搜索"
          @click="$emit('update:searchQuery', '')"
        >
          <Icon name="close" size="sm" />
        </button>
      </div>
    </div>

    <!-- ---------- 右：工具图标 + 头像（保留在顶栏右侧）---------- -->
    <div class="ml-auto flex items-center gap-0.5 shrink-0 relative">
      <button
        class="md-icon-btn"
        :title="isDone ? '同步成功' : '刷新当前页数据'"
        :aria-label="isDone ? '同步成功' : '刷新'"
        @click="onRefreshClick"
      >
        <Icon
          v-if="isDone && !loading"
          name="done"
          size="md"
          class="text-md-primary"
        />
        <Icon
          v-else
          name="refresh"
          size="md"
          :class="{ 'animate-spin': loading }"
        />
      </button>

      <!-- 头像：圆形，Google 账号位 -->
      <button
        class="ml-1 w-8 h-8 rounded-full bg-md-primary text-white text-[13px] font-medium flex items-center justify-center shrink-0 ring-2 ring-transparent hover:ring-md-divider transition-all duration-md2-short"
        title="账户菜单"
        aria-label="账户菜单"
        @click="toggleAccount"
      >
        {{ avatarLetter }}
      </button>

      <!-- 应用中心（跳站外小程序）已移除：网页端不露出站外跳转入口 -->

      <!-- ---------- 弹出：账户卡片 ---------- -->
      <transition
        enter-active-class="transition duration-md2-short ease-md2-decelerate"
        enter-from-class="opacity-0 -translate-y-1"
        leave-active-class="transition duration-md2-short ease-md2-accelerate"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="accountOpen"
          class="absolute right-0 top-12 md:top-14 w-[300px] sm:w-[320px] bg-md-surface-overlay rounded-md2-lg shadow-dp8 border border-md-card-border z-50 overflow-hidden"
        >
          <!-- 账号头部 -->
          <div class="px-5 pt-5 pb-4 text-center border-b border-md-card-border">
            <div
              class="w-16 h-16 rounded-full bg-md-primary text-white text-2xl font-normal flex items-center justify-center mx-auto"
            >
              {{ avatarLetter }}
            </div>
            <div class="mt-3 text-md2-subtitle1 text-md-text-high">
              {{ student?.realName || '同学' }}
            </div>
            <div class="text-md2-caption text-md-text-medium font-mono mt-0.5">
              {{ student?.username || '未登录' }}
            </div>
            <span class="md-chip-success mt-2.5">
              <Icon name="check" size="xs" />
              已登录
            </span>
          </div>

          <!-- 快捷入口 -->
          <div class="py-1">
            <button class="md-list-item w-full text-left" @click="go('profile')">
              <Icon name="user" size="md" class="text-md-text-medium" />
              <span class="text-md2-body2 text-md-text-high">个人中心</span>
            </button>
            <button
              class="md-list-item w-full text-left"
              @click="$emit('clear-cache'); accountOpen = false"
            >
              <Icon name="database" size="md" class="text-md-text-medium" />
              <span class="text-md2-body2 text-md-text-high">清除缓存</span>
            </button>
          </div>

          <div class="px-3 py-2.5 border-t border-md-card-border">
            <button class="md-btn-danger w-full" @click="$emit('logout'); accountOpen = false">
              <Icon name="logout" size="sm" />
              退出登录
            </button>
          </div>
        </div>
      </transition>
    </div>
  </header>

  <!-- 点击空白关闭弹出层 -->
  <div
    v-if="accountOpen"
    class="fixed inset-0 z-30"
    @click="closeAll"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Icon from './Icon.vue';
import type { StudentInfo } from '../utils/storage';

const props = withDefaults(
  defineProps<{
    student: StudentInfo | null;
    loading?: boolean;
    searchQuery?: string;
    searchPlaceholder?: string;
    isGridView?: boolean;
    sidebarCollapsed?: boolean;
  }>(),
  {
    loading: false,
    searchQuery: '',
    searchPlaceholder: '搜索…',
    isGridView: true,
    sidebarCollapsed: false,
  },
);

const emit = defineEmits<{
  (e: 'refresh'): void;
  (e: 'logout'): void;
  (e: 'toggle-sidebar'): void;
  (e: 'navigate', tab: string): void;
  (e: 'clear-cache'): void;
  (e: 'update:searchQuery', val: string): void;
}>();

const searchInput = ref<HTMLInputElement | null>(null);
const searchFocused = ref(false);
const accountOpen = ref(false);
const isDone = ref(false);
let doneTimer: number | null = null;

function handleSyncSuccess() {
  isDone.value = true;
  if (doneTimer !== null) {
    window.clearTimeout(doneTimer);
  }
  doneTimer = window.setTimeout(() => {
    isDone.value = false;
    doneTimer = null;
  }, 5000);
}

function onRefreshClick() {
  if (isDone.value) {
    isDone.value = false;
    if (doneTimer !== null) {
      window.clearTimeout(doneTimer);
      doneTimer = null;
    }
  }
  emit('refresh');
}

onMounted(() => {
  window.addEventListener('chilleast:sync-success', handleSyncSuccess);
});

onUnmounted(() => {
  window.removeEventListener('chilleast:sync-success', handleSyncSuccess);
  if (doneTimer !== null) {
    window.clearTimeout(doneTimer);
  }
});

const avatarLetter = computed(() => props.student?.realName?.slice(0, 1) || '农');

function toggleAccount() {
  accountOpen.value = !accountOpen.value;
}
function closeAll() {
  accountOpen.value = false;
}

function go(tab: string) {
  closeAll();
  emit('navigate', tab);
}
</script>
