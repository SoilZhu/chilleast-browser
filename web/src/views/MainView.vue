<template>
  <!-- =====================================================================
       应用主壳：PC 大屏 MD2 布局
       - 桌面：左侧常驻 Navigation Drawer（256px）+ 右侧内容区
       - 移动：临时抽屉 + 底部 5 Tab 导航
       ===================================================================== -->
  <!-- Keep 的骨架是「顶栏通栏 + 左侧抽屉从顶栏下方开始」，不是「抽屉通栏 + 顶栏缩在右侧」。
       把两栏包进一个 padding-top 容器：抽屉从顶栏下沿开始，顶栏用 -mt 拉回顶部并由 sticky 固定。 -->
  <div class="min-h-screen bg-md-background text-md-text-high">

    <!-- ============ 通栏顶栏（与抽屉同处根层级，sticky 固定在页面顶部）============ -->
    <!-- PC 端常驻；手机端仅在五大底栏展示保留的刷新和头像，二级页全屏时不展示 -->
    <Header
      v-if="!isMobile || (isMainTab && !isViewingNoticeDetail)"
      :student="student"
      :loading="loading"
      :search-query="searchQuery"
      :search-placeholder="searchPlaceholder"
      :is-grid-view="isGridView"
      :sidebar-collapsed="sidebarCollapsed"
      @update:search-query="searchQuery = $event"
      @toggle-sidebar="toggleSidebar"
      @navigate="go"
      @refresh="refreshCurrent"
      @clear-cache="clearCache"
      @logout="$emit('logout')"
    />

    <!-- ============ 手机端二级全屏页面顶栏：左上角返回按钮 ============ -->
    <div
      v-if="isMobile && (!isMainTab || isViewingNoticeDetail)"
      class="sticky top-0 z-40 bg-md-background flex items-center h-12 px-2 shrink-0 border-b-0"
    >
      <button
        class="md-icon-btn-sm text-md-text-high"
        title="返回"
        aria-label="返回"
        @click="goBack"
      >
        <Icon name="arrow-left" size="sm" />
      </button>
    </div>

    <!-- 抽屉 + 主区 = Keep 的两栏行容器（抽屉用 sticky 跟随滚动，顶栏通栏在上） -->
    <div class="flex items-start">

    <!-- ============ 桌面常驻抽屉（从顶栏下方开始，与 Keep 一致）============ -->
    <div
      :class="[
        'hidden md:flex sticky top-16 h-[calc(100vh-4rem)] shrink-0 transition-[width] duration-200 ease-in-out',
        sidebarCollapsed ? 'w-[72px]' : 'w-64'
      ]"
    >
      <AppSidebar
        :student="student"
        :current-tab="currentTab"
        :active-nav="activeNav"
        :collapsed="sidebarCollapsed"
        @navigate="go"
        @logout="$emit('logout')"
      />
    </div>

    <!-- ============ 移动端临时抽屉（手机模式隐藏左侧导航栏）============ -->
    <transition
      enter-active-class="transition-opacity duration-md2-short"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-md2-short"
      leave-to-class="opacity-0"
    >
      <div
        v-if="drawerOpen && !isMobile"
        class="md:hidden fixed inset-0 z-50 bg-black/40"
        @click="closeMobileDrawer"
      />
    </transition>
    <transition
      enter-active-class="transition-transform duration-md2-medium ease-md2-decelerate"
      enter-from-class="-translate-x-full"
      leave-active-class="transition-transform duration-md2-short ease-md2-accelerate"
      leave-to-class="-translate-x-full"
    >
      <div v-if="drawerOpen && !isMobile" class="md:hidden fixed inset-y-0 left-0 z-50 shadow-dp16">
        <AppSidebar
          :student="student"
          :current-tab="currentTab"
          :active-nav="activeNav"
          mobile
          @navigate="go"
          @logout="$emit('logout')"
        />
      </div>
    </transition>

    <!-- ============ 右侧主区 ============ -->
    <div class="flex-1 basis-0 min-w-0 flex flex-col">
      <!-- Keep 版心：从顶栏下 24px 开始，左右留白 24–40px；宽屏不再硬性锁 1440 -->
      <main
        :class="[
          'flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 max-w-[1680px]',
          isMobile && (!isMainTab || isViewingNoticeDetail) ? 'pt-4 pb-8' : 'pt-5 sm:pt-6 pb-24 md:pb-10'
        ]"
      >
        <!-- ================= 移动端全屏通知详情 ================= -->
        <div v-if="isViewingNoticeDetail" class="space-y-4 max-w-3xl">
          <div class="md-card p-4 sm:p-6">
            <!-- 详情头：头像 + 发送者 + 时间 -->
            <div class="flex items-start gap-3">
              <span
                class="w-10 h-10 rounded-full text-white text-[15px] font-medium flex items-center justify-center shrink-0 select-none"
                :style="{ backgroundColor: avatarColor(selectedNotice.sender) }"
              >
                {{ avatarLetter(selectedNotice) }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="text-md2-subtitle2 text-md-text-high font-medium">
                  {{ selectedNotice.sender || '学校通知' }}
                </div>
                <div v-if="selectedNotice.date" class="text-md2-caption text-md-text-disabled tabular-nums mt-0.5">
                  {{ selectedNotice.date }}
                </div>
              </div>
            </div>

            <!-- 标题 -->
            <h2 class="text-md2-h6 text-md-text-high font-bold mt-4 leading-snug">
              {{ selectedNotice.title }}
            </h2>

            <!-- 正文 -->
            <div class="mt-4 text-md2-body2 text-md-text-medium whitespace-pre-wrap leading-relaxed select-text">
              {{ stripHtml(selectedNotice.content) || '暂无正文内容' }}
            </div>
          </div>
        </div>

        <div v-show="!isViewingNoticeDetail">
        <!-- ================= 1. 首页（信息流）================= -->
        <HomeView
          v-if="currentTab === 'home'"
          :student="student"
          :card-info="cardInfo"
          :transactions="transactions"
          :notices="notices"
          :homework="homeworkList"
          :exams="examsList"
          :timetable="timetableData"
          :current-week="currentWeek"
          :ele-balance="eleBalance"
          :dorm-name="dormName"
          :electricity-slots="electricitySlots"
          :loading="loading"
          :reserves="libraryReserves"
          :leaves="leaveRecords"
          :repairs="repairOrders"
          :questionnaires="questionnaires"
          @navigate="go"
          @refresh="fullRefresh"
          @select-function="handleFunction"
          @open-notice="openNoticeModal"
        />

        <!-- ================= 2. 课表（日程 / 周视图，宽屏并排）================= -->
        <TimetableView
          v-else-if="currentTab === 'timetable'"
          :timetable="timetableData"
          :current-week="currentWeek"
          :real-week="currentRealWeek"
          :weeks-map="weeksMap"
          :loading="timetableLoading"
          :query="searchQuery"
          :homework="agendaHomework"
          :exams="examsList"
          :first-week-monday="firstWeekMonday"
          :timetable-rules="timetableRules"
          :all-courses="allCourses"
          @update:current-week="currentWeek = $event"
          @synced="onTimetableSynced"
          @rules-changed="onRulesChanged"
          @refresh="loadTimetable(true)"
        />

        <!-- ================= 3. 作业（考试已移到「学习」下的独立页面）================= -->
        <HomeworkList
          v-else-if="currentTab === 'homework'"
          :homework="filteredHomework"
          :all-homework="allHomeworkForCount"
          :status="homeworkStatus"
          @update:status="homeworkStatus = $event"
          @toggle-manual="toggleManualHomework"
          @add-manual="addManualHomework"
          @delete-manual="deleteManualHomework"
        />

        <!-- ================= 4. 通知（无限滚动 + 主从分栏）================= -->
        <NoticeView
          v-else-if="currentTab === 'notice'"
          :query="searchQuery"
          @open="openNoticeModal"
        />

        <!-- ================= 5. 功能 ================= -->
        <FunctionsView
          v-else-if="currentTab === 'functions'"
          v-model:query="searchQuery"
          @select="handleFunction"
        />

        <!-- ================= 二级页面 ================= -->
        <ScoreCard
          v-else-if="currentTab === 'scores'"
          :scores-data="scoresData"
          :semesters="semestersList"
          :loading="loading"
          v-model:selected-semester="selectedSemester"
          @refresh="loadScores"
        />

        <ExamList
          v-else-if="currentTab === 'exams'"
          :exams="filteredExams"
          @add-manual="addManualExam"
          @delete-manual="deleteManualExam"
        />

        <CampusHub
          v-else-if="currentTab === 'campus'"
          :card-info="cardInfo"
          :transactions="transactions"
        />

        <!-- 电费充值（双宿舍 · 校园卡支付） -->
        <ElectricityHub
          v-else-if="currentTab === 'electricity'"
          :card-info="cardInfo"
          @refresh-card="loadCampus"
        />

        <ClassroomFinder v-else-if="currentTab === 'classroom'" />

        <!-- 图书馆（对齐原版 library_*_screen.dart 的四级页面栈）
             首页 → 选择阅览室 → 座位图 / 快速预约 / 馆藏检索 -->
        <div v-else-if="currentTab === 'library'">
          <LibraryHome
            v-if="libPage === 'home'"
            ref="libraryHomeRef"
            @open-book-search="setLibPage('book')"
            @open-room="setLibPage('room')"
            @open-quick="setLibPage('quick')"
          />

          <RoomListView
            v-else-if="libPage === 'room'"
            @back="backLibPage('home')"
            @open-quick="setLibPage('quick')"
            @open-seat="onOpenSeatMap"
          />

          <SeatMapView
            v-else-if="libPage === 'seat' && seatTarget"
            :room="seatTarget.room"
            :day="seatTarget.day"
            :start-time="seatTarget.startTime"
            :end-time="seatTarget.endTime"
            @back="backLibPage('room')"
          />

          <QuickReserveView
            v-else-if="libPage === 'quick'"
            @back="backLibPage('home')"
            @done="onQuickReserveDone"
          />

          <div v-else-if="libPage === 'book'" class="space-y-4">
            <div class="flex items-center gap-1.5">
              <button class="md-btn-text -ml-2" @click="backLibPage('home')">
                <Icon name="chevron-left" size="sm" />
                图书馆
              </button>
              <span class="text-md2-subtitle2 text-md-text-high px-1">馆藏检索</span>
            </div>
            <BookSearch />
          </div>
        </div>

        <SunshineService v-else-if="currentTab === 'sunshine'" />

        <RepairPlatform v-else-if="currentTab === 'repair'" />

        <LeaveView v-else-if="currentTab === 'leave'" />

        <QuestionnaireView v-else-if="currentTab === 'questionnaire'" />

        <DormitoryView v-else-if="currentTab === 'dormitory'" />

        <TransactionsView v-else-if="currentTab === 'transactions'" />

        <!-- 手机端全屏 / PC 端二级页面 -->
        <CampusBusRouteView v-else-if="currentTab === 'campus_bus_route'" />

        <VpnView v-else-if="currentTab === 'vpn'" />

        <!-- ================= 个人中心 / 设置 / 关于 / 帮助 ================= -->
        <ProfileView
          v-else-if="currentTab === 'profile'"
          :student="student"
          @logout="$emit('logout')"
          @navigate="go"
        />

        <SettingsView
          v-else-if="currentTab === 'settings'"
          @logout="$emit('logout')"
          @clear-cache="clearCache"
        />

        <AboutView v-else-if="currentTab === 'about'" />

        <HelpView v-else-if="currentTab === 'help'" />

        <GuideView v-else-if="currentTab === 'guide'" @done="handleGuideDone" />

        <!-- ================= 兜底 ================= -->
        <div v-else class="py-20 text-center text-md-text-disabled text-md2-body1">
          页面不存在
        </div>
        </div>
      </main>
    </div>

    </div>

    <!-- ============ 移动端底部导航（5 Tab：仅在五大底栏展示，打开其他全屏页面时隐藏）============ -->
    <nav
      v-if="!isMobile || (isMainTab && !isViewingNoticeDetail)"
      class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-md-background border-t border-md-divider flex items-stretch safe-bottom"
    >
      <button
        v-for="tab in NAV_TABS"
        :key="tab.id"
        :class="activeNav === tab.id ? 'md-bottom-nav-item-active' : 'md-bottom-nav-item'"
        @click="go(tab.id)"
      >
        <!-- MD2 底部导航：选中项实心图标 + 主色，未选中为线性图标 -->
        <Icon :name="tab.icon" size="md" :variant="activeNav === tab.id ? 'filled' : 'outlined'" />
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <!-- ============ 全局弹窗 ============ -->
    <!-- 开始引导：PC 上半透明黑色遮罩居中弹窗，手机全屏，不引导完不消失 -->
    <GuideView
      v-if="showGuideModal"
      @done="handleGuideDone"
    />

    <!-- 全局功能弹窗 -->
    <PaymentCodeModal
      v-if="activeModal === 'payment'"
      :student-info="student"
      :card-info="cardInfo"
      :is-mobile="isMobile"
      @close="closeActiveModal"
    />
    <VpnConverterModal v-else-if="activeModal === 'vpn'" @close="closeActiveModal" />
    <BusTransitModal
      v-else-if="activeModal === 'bus'"
      :initial-tab="busInitialTab"
      @close="closeActiveModal"
    />

    <!-- 通知详情（PC 端弹窗；手机端全屏页面；宽屏由 NoticeView 内部主从分栏承载） -->
    <div
      v-if="selectedNotice && !isMobile"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="closeNoticeModal"
    >
      <div class="md-dialog max-w-2xl max-h-[85vh] flex flex-col">
        <div class="md-dialog-header shrink-0">
          <div class="min-w-0">
            <div class="text-md2-caption text-md-text-medium">
              {{ selectedNotice.sender || '学校通知' }}
              <span v-if="selectedNotice.date"> · {{ selectedNotice.date }}</span>
            </div>
            <h3 class="md-dialog-title mt-1 leading-snug">{{ selectedNotice.title }}</h3>
          </div>
          <button class="md-icon-btn-sm -mt-1 -mr-1 shrink-0" @click="closeNoticeModal">
            <Icon name="close" size="sm" />
          </button>
        </div>
        <div class="px-6 pb-6 overflow-y-auto text-md2-body2 text-md-text-medium whitespace-pre-wrap leading-relaxed">
          {{ stripHtml(selectedNotice.content) || '暂无正文内容' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';

import Icon from '../components/Icon.vue';
import Header from '../components/Header.vue';
import AppSidebar from '../components/AppSidebar.vue';

// ---- 一级 Tab 页面 ----
import HomeView from './HomeView.vue';
import TimetableView from './TimetableView.vue';
import FunctionsView from './FunctionsView.vue';
import NoticeView from './NoticeView.vue';

// ---- 二级页面 ----
import ScoreCard from '../components/ScoreCard.vue';
import CampusHub from '../components/CampusHub.vue';
import ElectricityHub from '../components/ElectricityHub.vue';
import ExamList from '../components/ExamList.vue';
import HomeworkList from '../components/HomeworkList.vue';
import ClassroomFinder from '../components/ClassroomFinder.vue';
import BookSearch from '../components/BookSearch.vue';
import LibraryHome from '../components/library/LibraryHome.vue';
import RoomListView from '../components/library/RoomListView.vue';
import SeatMapView from '../components/library/SeatMapView.vue';
import QuickReserveView from '../components/library/QuickReserveView.vue';
import SunshineService from '../components/SunshineService.vue';
import RepairPlatform from '../components/RepairPlatform.vue';

import LeaveView from './LeaveView.vue';
import QuestionnaireView from './QuestionnaireView.vue';
import DormitoryView from './DormitoryView.vue';
import TransactionsView from './TransactionsView.vue';
import ProfileView from './ProfileView.vue';
import SettingsView from './SettingsView.vue';
import AboutView from './AboutView.vue';
import HelpView from './HelpView.vue';
import GuideView from './GuideView.vue';
import CampusBusRouteView from './CampusBusRouteView.vue';
import VpnView from './VpnView.vue';

// ---- 全局弹窗 ----
import PaymentCodeModal from '../components/PaymentCodeModal.vue';
import VpnConverterModal from '../components/VpnConverterModal.vue';
import BusTransitModal from '../components/BusTransitModal.vue';

import { NAV_TABS, type FunctionItemDef, type ModalKind } from '../utils/functions';
import type { StudentInfo } from '../utils/storage';
import { storage, timetableStorage } from '../utils/storage';

import {
  fetchFullTimetable,
  fetchScores,
  fetchSemesters,
  fetchExams,
  type FullTimetableResponse,
  type TimetableCourse,
  type TimetableWeek,
  type SemesterItem,
} from '../api/academic';
import {
  fetchCardInfo,
  fetchCardRecords,
  type CardInfo,
  type CardTransaction,
} from '../api/campus';
import { fetchHomework, type HomeworkItem } from '../api/study';
import {
  loadFeedExtras,
  libraryReserves,
  leaveRecords,
  repairOrders,
  questionnaires,
} from '../composables/useFeedExtras';
import {
  notices,
  noticeKey,
  markNoticeRead,
  refreshNotices,
  ensureNoticesLoaded,
  resetNotices,
  avatarLetter,
  avatarColor,
  stripHtml,
} from '../composables/useNotices';
import {
  electricitySlots,
  loadElectricitySlots,
  applyCloudDormitory,
} from '../composables/useElectricity';
import { scheduleReminders } from '../services/reminders';
import { settings } from '../stores/settings';
import { notifySyncSuccess, markDirty } from '../services/cloudSync';

const props = defineProps<{
  student: StudentInfo | null;
  justLoggedIn?: boolean;
}>();

defineEmits<{
  (e: 'logout'): void;
}>();

/** 开始引导弹窗显示状态（PC 半透明黑色遮罩居中弹窗，手机全屏） */
const showGuideModal = ref(false);

function handleGuideDone() {
  showGuideModal.value = false;
  if (currentTab.value === 'guide') {
    go('settings');
  }
}

// ---------------------------------------------------------------------------
// 导航状态
// ---------------------------------------------------------------------------
function getInitialTab(): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) return tabParam;
  }
  return 'home';
}

function getInitialLibPage(): 'home' | 'room' | 'seat' | 'quick' | 'book' {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('libPage');
    if (p && ['home', 'room', 'seat', 'quick', 'book'].includes(p)) {
      return p as any;
    }
  }
  return 'home';
}

const currentTab = ref(getInitialTab());
const drawerOpen = ref(false);
const sidebarCollapsed = ref(
  typeof window !== 'undefined' && localStorage.getItem('chilleast_sidebar_collapsed') === 'true',
);

/** 手机还是 PC 取决于屏幕宽度（< 768px 为手机模式） */
const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
const selectedNotice = ref<any>(null);
const isViewingNoticeDetail = computed(() => Boolean(isMobile.value && selectedNotice.value));

function updateIsMobile() {
  if (typeof window !== 'undefined') {
    isMobile.value = window.innerWidth < 768;
    if (isMobile.value) {
      drawerOpen.value = false;
    }
  }
}

/** 五大底栏页面 */
const MAIN_TABS = ['home', 'timetable', 'homework', 'notice', 'functions'] as const;
const isMainTab = computed(() => MAIN_TABS.includes(currentTab.value as any));

const TAB_TITLES: Record<string, string> = {
  scores: '成绩与绩点',
  exams: '考试安排',
  campus: '校园卡',
  electricity: '电费充值',
  classroom: '空教室',
  library: '图书馆',
  sunshine: '阳光服务',
  repair: '报修平台',
  leave: '请假申请',
  questionnaire: '学工问卷',
  dormitory: '我的宿舍',
  transactions: '交易流水',
  profile: '个人中心',
  settings: '设置',
  about: '关于',
  help: '帮助与反馈',
  guide: '开始引导',
  campus_bus_route: '校内公交线路',
  vpn: 'VPN 转换',
};

const currentTabTitle = computed(() => {
  if (isViewingNoticeDetail.value) {
    return '通知详情';
  }
  if (currentTab.value === 'library') {
    if (libPage.value === 'room') return '选择阅览室';
    if (libPage.value === 'seat') return '阅览室座位';
    if (libPage.value === 'quick') return '快速预约';
    if (libPage.value === 'book') return '馆藏检索';
  }
  return TAB_TITLES[currentTab.value] ?? '';
});

function goBack() {
  if (isViewingNoticeDetail.value) {
    closeNoticeModal();
    return;
  }
  if (currentTab.value === 'library' && libPage.value !== 'home') {
    backLibPage();
    return;
  }
  if (typeof window !== 'undefined' && window.history.length > 1 && window.history.state?.tab) {
    window.history.back();
  } else {
    go(activeNav.value && activeNav.value !== currentTab.value ? activeNav.value : 'functions');
  }
}

function toggleSidebar() {
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    if (!drawerOpen.value) {
      openMobileDrawer();
    } else {
      closeMobileDrawer();
    }
  } else {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    try {
      localStorage.setItem('chilleast_sidebar_collapsed', String(sidebarCollapsed.value));
    } catch {}
  }
}

function openMobileDrawer() {
  drawerOpen.value = true;
  if (typeof window !== 'undefined' && window.history?.pushState) {
    window.history.pushState(
      { ...window.history.state, modal: 'drawer' },
      '',
      window.location.href,
    );
  }
}

function closeMobileDrawer() {
  if (typeof window !== 'undefined' && window.history?.state?.modal === 'drawer') {
    window.history.back();
  } else {
    drawerOpen.value = false;
  }
}
const searchQuery = ref('');
const isGridView = ref(true);
const loading = ref(false);
/** 仅用于课表骨架屏：全量课表首帧拉取中 */
const timetableLoading = ref(true);

/** 抽屉高亮：二级页面归属到对应一级 Tab */
const activeNav = computed(() => {
  const subToMain: Record<string, string> = {
    // 学习：成绩 / 考试 / 图书馆 / 空教室（考试已从「作业」移到这里）
    scores: 'functions',
    exams: 'functions',
    library: 'functions',
    classroom: 'functions',
    campus: 'functions',
    electricity: 'functions',
    sunshine: 'functions',
    repair: 'functions',
    leave: 'functions',
    questionnaire: 'functions',
    dormitory: 'functions',
    transactions: 'functions',
    campus_bus_route: 'functions',
    vpn: 'functions',
    cloud: 'profile',
    profile: 'profile',
    settings: 'profile',
    about: 'profile',
    help: 'profile',
    guide: 'profile',
  };
  return subToMain[currentTab.value] ?? currentTab.value;
});

const searchPlaceholder = computed(() => {
  const map: Record<string, string> = {
    home: '搜索功能、课表、通知…',
    timetable: '搜索课程、教师、教室…',
    homework: '搜索作业或课程…',
    notice: '搜索通知…',
    functions: '搜索功能，如「付款码」…',
    leave: '搜索请假事由…',
    questionnaire: '搜索问卷标题…',
    library: '搜索自习室、书名…',
    settings: '搜索设置项…',
  };
  return map[activeNav.value] ?? '搜索…';
});

function go(tab: string, options?: { replace?: boolean }) {
  if (selectedNotice.value) {
    selectedNotice.value = null;
  }

  if (tab === 'guide') {
    showGuideModal.value = true;
    drawerOpen.value = false;
    return;
  }

  const isTabChanging = currentTab.value !== tab;
  currentTab.value = tab;
  searchQuery.value = '';

  const wasDrawerOpen = drawerOpen.value;
  drawerOpen.value = false;

  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

  if (typeof window !== 'undefined' && window.history) {
    const url = new URL(window.location.href);
    if (tab === 'home') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    if (tab !== 'library') {
      url.searchParams.delete('libPage');
      libPage.value = 'home';
    }

    const state = { tab, libPage: tab === 'library' ? libPage.value : 'home' };

    if (options?.replace || (wasDrawerOpen && window.history.state?.modal === 'drawer')) {
      window.history.replaceState(state, '', url.toString());
    } else if (isTabChanging) {
      window.history.pushState(state, '', url.toString());
    }
  }
}

// ---------------------------------------------------------------------------
// 数据状态
// ---------------------------------------------------------------------------
/** 图书馆内部页面栈：首页 / 选择阅览室 / 座位图 / 快速预约 / 馆藏检索 */
const libPage = ref<'home' | 'room' | 'seat' | 'quick' | 'book'>(getInitialLibPage());
const libraryHomeRef = ref<InstanceType<typeof LibraryHome> | null>(null);
/** 座位图页面需要的目标（阅览室 + 日期 + 时段），由选择阅览室页带过来 */
const seatTarget = ref<{
  room: any;
  day: string;
  startTime: string;
  endTime: string;
} | null>(null);

function setLibPage(page: 'home' | 'room' | 'seat' | 'quick' | 'book', target?: any, replace = false) {
  libPage.value = page;
  if (target !== undefined) seatTarget.value = target;
  if (typeof window !== 'undefined' && window.history) {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'library');
    if (page === 'home') {
      url.searchParams.delete('libPage');
    } else {
      url.searchParams.set('libPage', page);
    }
    const state = { tab: 'library', libPage: page };
    if (replace) {
      window.history.replaceState(state, '', url.toString());
    } else {
      window.history.pushState(state, '', url.toString());
    }
  }
}

function backLibPage(fallback: 'home' | 'room' = 'home') {
  if (typeof window !== 'undefined' && window.history?.state?.libPage) {
    window.history.back();
  } else {
    setLibPage(fallback, undefined, true);
  }
}

function onOpenSeatMap(value: { room: any; day: string; startTime: string; endTime: string }) {
  setLibPage('seat', value);
}

/** 快速预约成功后回到首页并刷新看板 */
async function onQuickReserveDone() {
  backLibPage('home');
  await libraryHomeRef.value?.loadData();
}

/**
 * 计算当前教学周。
 * 用户在「课表设置」里手动指定了第一周周一时，以它为准重算；
 * 否则沿用服务端返回的周次。
 */
function computeRealWeek(serverWeek: number): number {
  const manual = settings.manualFirstWeekMonday;
  if (!manual) return serverWeek;
  const first = new Date(`${manual}T00:00:00`);
  if (Number.isNaN(first.getTime())) return serverWeek;
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((dayStart.getTime() - first.getTime()) / 86_400_000);
  if (diffDays < 0) return 1;
  return Math.min(20, Math.floor(diffDays / 7) + 1);
}

// 本地优先秒开：首帧同步读取本地缓存（与原版 App 一致）
const initialTimetable = timetableStorage.getFullTimetable();
const currentWeek = ref(initialTimetable?.currentWeek ?? 1);
const currentRealWeek = ref(computeRealWeek(initialTimetable?.currentWeek ?? 1));
const weeksMap = ref<Record<number, TimetableWeek>>(initialTimetable?.weeks ?? {});
const timetableData = ref<TimetableWeek | null>(
  initialTimetable?.weeks ? initialTimetable.weeks[currentWeek.value] || null : null
);
/** 云端调课规则（来自全量课表响应的 backup.rules） */
const timetableRules = ref<any[]>(
  Array.isArray(initialTimetable?.backup?.rules) ? initialTimetable!.backup!.rules! : []
);

const cloudSyncData = ref<any>(null);
const savedDormitory = ref<any>(null);

const scoresData = ref<any>(null);
const semestersList = ref<SemesterItem[]>([]);
const selectedSemester = ref('');

const cardInfo = ref<CardInfo | null>(null);
const transactions = ref<CardTransaction[]>([]);

function readManualHomeworkFromStorage(): any[] {
  try {
    const raw = localStorage.getItem('chilleast_manual_homework');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function readManualExamFromStorage(): any[] {
  try {
    const raw = localStorage.getItem('chilleast_manual_exam');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const examsList = ref<any[]>([]);
const rawOnlineExams = ref<any[]>([]);
const manualExamList = ref<any[]>(readManualExamFromStorage());
const homeworkList = ref<HomeworkItem[]>([]);
const rawOnlineHomework = ref<HomeworkItem[]>([]);
const manualHomeworkList = ref<any[]>(readManualHomeworkFromStorage());
const homeworkStatus = ref('pending');

const eleBalance = ref<string | null>(null);
const dormName = ref(localStorage.getItem('chilleast_dorm_name') || '');

// ---------------------------------------------------------------------------
// 搜索过滤：顶部搜索框对各列表页生效
// ---------------------------------------------------------------------------
function matchText(haystack: string): boolean {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

const filteredHomework = computed(() =>
  homeworkList.value.filter((h) => matchText(`${h.title} ${h.courseName} ${h.remarks ?? ''}`)),
);

/** 作业状态 Tab 的计数用未过滤的全量列表 */
const allHomeworkForCount = computed(() => homeworkList.value);

/**
 * 日程视图要展示的作业：只给「未完成 + 有截止时间」的。
 * 日程是按日期挂载的，没有截止时间的作业挂不到任何一天，传过去也没用。
 */
const agendaHomework = computed<HomeworkItem[]>(() =>
  homeworkList.value.filter((h) => h.statusCode === 'pending' && hasDeadline(h)),
);

/** 作业是否有可解析的截止时间 */
function hasDeadline(item: HomeworkItem): boolean {
  const raw = item.endTime;
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return true;
    if (Number.isFinite(new Date(String(raw)).getTime())) return true;
  }
  return Boolean(item.endTimeLocal && String(item.endTimeLocal).trim() !== '');
}

/**
 * 第一周周一（yyyy-mm-dd）。
 * 优先用课表设置里手动指定的值（与原版 resolveFirstWeekMonday 的优先级一致），
 * 否则用当前查看周的真实日期反推：周一日期 = 该周周一 - (currentWeek - 1) 周。
 */
const firstWeekMonday = computed<string | null>(() => {
  const manual = settings.manualFirstWeekMonday;
  if (manual) return manual;

  const monday = weekMondayOf(currentWeek.value);
  return monday ? toIsoDate(monday) : null;
});

/** 第 N 周的周一：用服务端下发的 dates 里 weekday=1 的日期反推 */
function weekMondayOf(week: number): Date | null {
  const weekData = weeksMap.value[week];
  const firstDay = weekData?.dates?.find((d) => String(d.weekday) === '1')?.date;
  if (!firstDay) return null;
  const d = new Date(`${firstDay.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 全学期去重后的课程列表（调课对话框的课程下拉用）。
 * 同一门课在 1-20 周里会重复出现很多次，按「名称+星期+节次+周次」去重。
 */
const allCourses = computed<TimetableCourse[]>(() => {
  const seen = new Set<string>();
  const result: TimetableCourse[] = [];
  for (const week of Object.values(weeksMap.value)) {
    for (const course of week?.courses ?? []) {
      const key = [
        course.name,
        course.dayOfWeek,
        course.startPeriod,
        course.endPeriod,
        course.weeks,
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(course);
    }
  }
  return result;
});

const filteredExams = computed(() => {
  const list = Array.isArray(examsList.value) ? examsList.value : [];
  return list.filter((e) =>
    matchText(`${e.title ?? ''} ${e.courseName ?? ''} ${e.timeLocal ?? e.time ?? ''}`),
  );
});

const activeModal = ref<ModalKind | null>(null);
const busInitialTab = ref<'school_bus' | 'route_map' | 'cs_bus'>('school_bus');
let savedNoticeScrollY = 0;

function openModal(modal: ModalKind) {
  activeModal.value = modal;
  if (typeof window !== 'undefined' && window.history?.pushState) {
    window.history.pushState(
      { ...window.history.state, modal: 'dialog', activeModal: modal },
      '',
      window.location.href,
    );
  }
}

function closeActiveModal() {
  if (typeof window !== 'undefined' && window.history?.state?.modal === 'dialog') {
    window.history.back();
  } else {
    activeModal.value = null;
  }
}

function openNoticeModal(notice: any) {
  const key = noticeKey(notice);
  if (key) {
    markNoticeRead(key);
  }
  selectedNotice.value = notices.value.find((x) => noticeKey(x) === key) ?? notice;

  if (isMobile.value) {
    savedNoticeScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }

  if (typeof window !== 'undefined' && window.history?.pushState) {
    const rawNotice = notice ? JSON.parse(JSON.stringify(notice)) : null;
    window.history.pushState(
      { ...window.history.state, modal: 'notice', noticeData: rawNotice },
      '',
      window.location.href,
    );
  }
}

function closeNoticeModal() {
  if (typeof window !== 'undefined' && window.history?.state?.modal === 'notice') {
    window.history.back();
  } else {
    selectedNotice.value = null;
    if (isMobile.value) {
      void nextTick(() => {
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: savedNoticeScrollY, behavior: 'instant' as ScrollBehavior });
        }
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 功能入口分发（与 App 端 functions_screen.dart 的 _handleFunctionTap 对齐）
// ---------------------------------------------------------------------------
function handleFunction(item: FunctionItemDef) {
  const action = item.action;
  if (action.kind === 'tab') {
    go(action.tab);
    return;
  }
  if (action.kind === 'modal') {
    if (action.modal === 'bus') {
      // 三个出行入口共用同一个弹窗，只是默认 Tab 不同
      busInitialTab.value =
        item.id === 'cs_bus' ? 'cs_bus' : item.id === 'campus_bus_route' ? 'route_map' : 'school_bus';
    }
    openModal(action.modal);
    return;
  }
  window.open(action.url, '_blank', 'noopener,noreferrer');
}

// ---------------------------------------------------------------------------
// 浏览器历史前进/后退事件监听
// ---------------------------------------------------------------------------
function onPopState(event: PopStateEvent) {
  const url = new URL(window.location.href);
  const state = event.state || {};
  const targetTab = state.tab || url.searchParams.get('tab') || 'home';
  currentTab.value = targetTab;
  searchQuery.value = '';

  if (targetTab === 'library') {
    const targetLibPage = state.libPage || url.searchParams.get('libPage') || 'home';
    let validatedLibPage: 'home' | 'room' | 'seat' | 'quick' | 'book' =
      ['home', 'room', 'seat', 'quick', 'book'].includes(targetLibPage) ? targetLibPage : 'home';
    if (validatedLibPage === 'seat' && !seatTarget.value) {
      validatedLibPage = 'room';
    }
    libPage.value = validatedLibPage;
  } else {
    libPage.value = 'home';
  }

  // 弹窗与抽屉状态响应
  if (!state.modal) {
    const wasMobileNotice = isMobile.value && selectedNotice.value;
    activeModal.value = null;
    selectedNotice.value = null;
    drawerOpen.value = false;
    if (wasMobileNotice) {
      void nextTick(() => {
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: savedNoticeScrollY, behavior: 'instant' as ScrollBehavior });
        }
      });
    }
  } else if (state.modal === 'drawer') {
    drawerOpen.value = true;
  } else if (state.modal === 'dialog') {
    activeModal.value = state.activeModal || null;
  } else if (state.modal === 'notice') {
    selectedNotice.value = state.noticeData || null;
    if (isMobile.value && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }
}

// ---------------------------------------------------------------------------
// 数据加载
// ---------------------------------------------------------------------------
onMounted(async () => {
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    const url = new URL(window.location.href);
    window.history.replaceState(
      { tab: currentTab.value, libPage: currentTab.value === 'library' ? libPage.value : 'home' },
      '',
      url.toString(),
    );
  }
  updateIsMobile();
  window.addEventListener('resize', updateIsMobile);
  window.addEventListener('popstate', onPopState);
  window.addEventListener('chilleast:tasks-sync', onTasksSync);
  window.addEventListener('chilleast:timetable-updated', onTimetableUpdated);
  window.addEventListener('chilleast:timetable-cleared', onTimetableCleared);
  window.addEventListener('chilleast:timetable-sync-requested', onTimetableSyncRequested);
  mergeHomeworkLists();
  mergeExamLists();
  loadTimetable();
  loadScores();
  loadCampus();
  loadTasks();
  loadElectricity();
  // 通知走游标分页的独立 store，进首页就先拉一页（首页概览要显示条数）
  ensureNoticesLoaded();
  // 电费槽位（双宿舍）只读本地绑定 + 查余额，不阻塞首屏
  loadElectricitySlots();
  // 信息流附属数据（图书馆预约 / 请假 / 报修 / 问卷）不阻塞首屏
  loadFeedExtras().then(() => refreshReminders());

  // 刚登录或未完成引导时弹出引导向导
  const guideDone = localStorage.getItem('chilleast_guide_done') === 'true';
  if (props.justLoggedIn || !guideDone || currentTab.value === 'guide') {
    showGuideModal.value = true;
    if (currentTab.value === 'guide') {
      currentTab.value = 'home';
    }
  }
});

watch(
  () => props.justLoggedIn,
  (val) => {
    if (val) {
      showGuideModal.value = true;
    }
  },
);

onUnmounted(() => {
  window.removeEventListener('resize', updateIsMobile);
  window.removeEventListener('popstate', onPopState);
  window.removeEventListener('chilleast:tasks-sync', onTasksSync);
  window.removeEventListener('chilleast:timetable-updated', onTimetableUpdated);
  window.removeEventListener('chilleast:timetable-cleared', onTimetableCleared);
  window.removeEventListener('chilleast:timetable-sync-requested', onTimetableSyncRequested);
});

watch(currentTab, (newTab) => {
  if (newTab === 'scores' && !scoresData.value) loadScores();
  if (newTab === 'notice') ensureNoticesLoaded();
  if (newTab === 'electricity') loadElectricitySlots();
});

watch(currentWeek, (newW) => {
  if (weeksMap.value && weeksMap.value[newW]) {
    timetableData.value = weeksMap.value[newW];
  }
});

let updatingSemesterSilently = false;

watch(selectedSemester, () => {
  if (updatingSemesterSilently) return;
  loadScores();
});

// homeworkStatus 只作为 HomeworkList 的 v-model 状态，父级不再据此过滤列表
// （三档筛选在组件内部完成，见 mergeHomeworkLists 的注释）。

/** 把当前课表与作业交给提醒服务排程（对应原版的通知排程） */
function refreshReminders() {
  const week = timetableData.value;
  const weekday = new Date().getDay() === 0 ? 7 : new Date().getDay();
  const todayCourses = (week?.courses ?? [])
    .filter((c) => c.dayOfWeek === weekday)
    .map((c) => ({ name: c.name, classroom: c.classroom, startPeriod: c.startPeriod }));

  const pending = homeworkList.value
    .filter((h) => h.statusCode === 'pending')
    .map((h) => ({
      id: h.id,
      title: h.title,
      endTimeMs: h.endTime ? Number(h.endTime) || null : null,
    }));

  const reserves = (libraryReserves.value ?? []).map((r) => ({
    id: r.id,
    seatNum: r.seatNum,
    roomName: r.secondLevelName || r.firstLevelName || '图书馆',
    startMs: Number(r.startTime) || 0,
  }));

  scheduleReminders({
    todayCourses,
    pendingHomework: pending,
    libraryReserves: reserves.filter((r) => r.startMs > 0),
  });
}

function onTimetableUpdated(ev: Event) {
  const fresh = (ev as CustomEvent<FullTimetableResponse>).detail;
  if (fresh) {
    applyTimetableResponse(fresh);
    refreshReminders();
  }
}

function onTimetableCleared() {
  applyTimetableResponse(null);
  refreshReminders();
}

function onTimetableSyncRequested() {
  loadTimetable(true);
}

async function loadTimetable(forceNetwork = false) {
  timetableLoading.value = true;
  // 「自动同步课表」关闭时，只读本地缓存，不发网络请求（用户手动点刷新才强制拉取）
  const allowNetwork = settings.timetableAutoSyncEnabled || forceNetwork;

  if (!allowNetwork) {
    const cached = timetableStorage.getFullTimetable();
    applyTimetableResponse(cached, forceNetwork);
    timetableLoading.value = false;
    refreshReminders();
    return;
  }

  // 自动同步开启时：若本地已有课表且非强制刷新，优先保留本地课表展示，由 fetchFullTimetable 在后台静默校准
  if (!forceNetwork && timetableStorage.hasLocalTimetable()) {
    const cached = timetableStorage.getFullTimetable();
    if (cached) {
      applyTimetableResponse(cached, false);
    }
  }

  try {
    const res = await fetchFullTimetable(!forceNetwork);
    if (res) {
      applyTimetableResponse(res, forceNetwork);
    }
  } catch (e) {
    console.error('加载全量课表失败:', e);
  } finally {
    loading.value = false;
    timetableLoading.value = false;
    refreshReminders();
  }
}

/**
 * 把一份全量课表响应落到页面状态。
 * 首次加载、手动刷新、以及课表页「进页主动抓云端」后回调都走这里，
 * 保证三处的周次/调课规则/云端备份字段处理完全一致。
 */
function applyTimetableResponse(res: FullTimetableResponse | null, resetWeek = false) {
  if (!res || !res.weeks) {
    weeksMap.value = {};
    timetableData.value = null;
    timetableRules.value = [];
    return;
  }
  weeksMap.value = res.weeks;
  currentRealWeek.value = computeRealWeek(res.currentWeek || 1);
  if (resetWeek || currentWeek.value === 1) {
    currentWeek.value = res.currentWeek || 1;
  }
  timetableData.value = weeksMap.value[currentWeek.value] || null;
  timetableRules.value = Array.isArray(res.backup?.rules) ? res.backup!.rules! : [];

  if (res.backup) {
    cloudSyncData.value = res.backup;
    if (res.backup.dormitory) {
      savedDormitory.value = res.backup.dormitory;
    }
    if (Array.isArray(res.backup.manualHomework)) {
      const localHw = readManualHomeworkFromStorage();
      const mergedHw = mergeTasksById(res.backup.manualHomework, localHw);
      localStorage.setItem('chilleast_manual_homework', JSON.stringify(mergedHw));
      manualHomeworkList.value = mergedHw;
      mergeHomeworkLists();
    }
    if (Array.isArray(res.backup.manualExam)) {
      const localEx = readManualExamFromStorage();
      const mergedEx = mergeTasksById(res.backup.manualExam, localEx);
      localStorage.setItem('chilleast_manual_exam', JSON.stringify(mergedEx));
      manualExamList.value = mergedEx;
      mergeExamLists();
    }
  }
}

/** 课表页进页主动抓云端成功后回调（TimetableView 的 @synced） */
function onTimetableSynced(res: FullTimetableResponse) {
  applyTimetableResponse(res);
  refreshReminders();
  notifySyncSuccess();
}

/**
 * 调课规则变更（TimetableView 的 @rules-changed）：
 * 规则已经写进云端备份，这里强制重新拉一次全量课表，让新规则立刻体现在网格上。
 */
async function onRulesChanged() {
  await loadTimetable(true);
}

async function loadScores() {
  try {
    if (!semestersList.value.length) {
      const sems = await fetchSemesters().catch(() => []);
      if (Array.isArray(sems) && sems.length) {
        semestersList.value = sems;
      }
    }
    const sData = await fetchScores(selectedSemester.value);
    scoresData.value = sData;
    if (sData?.semester && selectedSemester.value !== sData.semester) {
      updatingSemesterSilently = true;
      selectedSemester.value = sData.semester;
      setTimeout(() => {
        updatingSemesterSilently = false;
      }, 50);
    }
  } catch (e) {
    console.error('加载成绩失败:', e);
  }
}

async function loadCampus() {
  try {
    const [c, t] = await Promise.all([
      fetchCardInfo().catch(() => null),
      fetchCardRecords(7).catch(() => []),
    ]);
    if (c) cardInfo.value = c;
    if (Array.isArray(t)) transactions.value = t;
  } catch (e) {
    console.error('加载校园数据失败:', e);
  }
}

async function loadTasks() {
  try {
    const [ex, hw] = await Promise.all([
      fetchExams().catch(() => []),
      fetchHomework('all').catch(() => []),
    ]);
    if (Array.isArray(ex)) {
      rawOnlineExams.value = ex;
      mergeExamLists();
    }
    if (Array.isArray(hw)) {
      rawOnlineHomework.value = hw;
      mergeHomeworkLists();
    }
  } catch (e) {
    console.error('加载待办失败:', e);
  }
}

async function loadElectricity() {
  // 电费余额统一由 useElectricity 的两个槽位管理（双宿舍），这里只把
  // 槽位 0 的余额同步给首页概览格，避免出现两份互相打架的电费状态。
  await loadElectricitySlots();
  syncEleOverview();
}

/** 把电费槽位 0 的余额/宿舍名同步到首页概览（单宿舍兼容视图） */
function syncEleOverview() {
  const slot = electricitySlots.value[0];
  if (!slot) return;
  if (slot.balance?.balance !== undefined) {
    eleBalance.value = String(slot.balance.balance);
  }
  if (slot.room) {
    const name = [slot.room.areaName, slot.room.buildingName, slot.room.roomName]
      .filter(Boolean)
      .join(' ');
    if (name) {
      dormName.value = name;
      localStorage.setItem('chilleast_dorm_name', name);
    }
  }
}

/**
 * 云端备份里的宿舍绑定 → 双宿舍槽位。
 * 原版云备份里只有 electricityRoom / electricityRoom2 两个字段，
 * 统一交给 useElectricity 的 applyCloudDormitory 落到对应槽位。
 */
watch(
  savedDormitory,
  (dorm) => {
    if (!dorm) return;
    applyCloudDormitory(dorm);
    syncEleOverview();
  },
  { immediate: true },
);

/**
 * 合并「学习通网络作业」与「手工作业」成全量列表。
 *
 * ⚠️ 这里**不做状态过滤**：三档（未完成 / 已完成 / 存档）的筛选由
 * HomeworkList 内部按 `statusCode` 自己做。父级先过滤一次会让
 * 「已完成」「存档」两档的计数恒为 0（因为传下去的全量列表已经被裁掉了）。
 * 首页信息流自己会筛 pending，不受影响。
 */
function mergeHomeworkLists() {
  const online = rawOnlineHomework.value || [];
  const manual = (manualHomeworkList.value || []).map((m: any) => ({
    id: m.id,
    courseName: m.courseName || '手工作业',
    title: m.title,
    endTime: m.endTime ?? null,
    endTimeLocal: m.endTime
      ? new Date(m.endTime).toLocaleString('zh-CN', { hour12: false })
      : '无截止时间',
    // 与原版 HomeworkStatus 枚举对齐：0 未完成 / 1 已完成 / 2 已存档
    statusCode: manualStatusCode(m.status),
    status: manualStatusLabel(m.status),
    rawTimeStr: m.rawTimeStr || '',
    isManual: true,
    remarks: m.remarks || '',
  }));

  homeworkList.value = [...online, ...manual];
  refreshReminders();
}

/** 手工作业的 status 数字 → 状态码 */
function manualStatusCode(status: unknown): string {
  const n = Number(status);
  if (n === 1) return 'completed';
  if (n === 2) return 'archived';
  return 'pending';
}

/** 手工作业的 status 数字 → 中文状态 */
function manualStatusLabel(status: unknown): string {
  const n = Number(status);
  if (n === 1) return '已完成';
  if (n === 2) return '已存档';
  return '待完成';
}

function mergeExamLists() {
  const online = rawOnlineExams.value || [];
  const manual = (manualExamList.value || []).map((m: any) => ({
    id: m.id,
    courseName: m.courseName || '',
    title: m.title || m.courseName || '考试',
    time: m.time ?? null,
    endTime: m.endTime ?? null,
    timeLocal: m.time ? new Date(m.time).toLocaleString('zh-CN', { hour12: false }) : '',
    endTimeLocal: m.endTime ? new Date(m.endTime).toLocaleString('zh-CN', { hour12: false }) : '',
    location: m.location || '',
    status: m.status || '待考',
    remarks: m.remarks || '',
    isManual: true,
  }));

  const combined = [...online, ...manual];
  combined.sort((a, b) => {
    const aTime = a.time ? new Date(a.time).getTime() : null;
    const bTime = b.time ? new Date(b.time).getTime() : null;
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return aTime - bTime;
  });

  examsList.value = combined;
}

function addManualHomework(item: any) {
  manualHomeworkList.value = [item, ...manualHomeworkList.value];
  localStorage.setItem('chilleast_manual_homework', JSON.stringify(manualHomeworkList.value));
  mergeHomeworkLists();
  markDirty();
}

function deleteManualHomework(id: string) {
  manualHomeworkList.value = manualHomeworkList.value.filter((m) => m.id !== id);
  localStorage.setItem('chilleast_manual_homework', JSON.stringify(manualHomeworkList.value));
  mergeHomeworkLists();
  markDirty();
}

function toggleManualHomework(id: string) {
  const found = manualHomeworkList.value.find((m) => m.id === id);
  if (found) {
    found.status = found.status === 1 ? 0 : 1;
    localStorage.setItem('chilleast_manual_homework', JSON.stringify(manualHomeworkList.value));
    mergeHomeworkLists();
    markDirty();
  }
}

function addManualExam(item: any) {
  manualExamList.value = [item, ...manualExamList.value];
  localStorage.setItem('chilleast_manual_exam', JSON.stringify(manualExamList.value));
  mergeExamLists();
  markDirty();
}

function deleteManualExam(id: string) {
  manualExamList.value = manualExamList.value.filter((m) => m.id !== id);
  localStorage.setItem('chilleast_manual_exam', JSON.stringify(manualExamList.value));
  mergeExamLists();
  markDirty();
}

function onTasksSync() {
  manualHomeworkList.value = readManualHomeworkFromStorage();
  mergeHomeworkLists();
  manualExamList.value = readManualExamFromStorage();
  mergeExamLists();
}

function mergeTasksById(cloudList: any[], localList: any[]): any[] {
  const merged: any[] = [];
  const addedIds = new Set<string>();
  for (const item of cloudList) {
    const id = item && typeof item === 'object' ? String(item.id ?? '') : '';
    if (id && !addedIds.has(id)) {
      merged.push(item);
      addedIds.add(id);
    }
  }
  for (const item of localList) {
    const id = item && typeof item === 'object' ? String(item.id ?? '') : '';
    if (!id) {
      merged.push(item);
      continue;
    }
    if (!addedIds.has(id)) {
      merged.push(item);
      addedIds.add(id);
    }
  }
  return merged;
}

function fullRefresh() {
  loadTimetable(true);
  loadScores();
  loadCampus();
  loadTasks();
  loadElectricitySlots(true).then(syncEleOverview);
  refreshNotices();
  loadFeedExtras();
}

function refreshCurrent() {
  const tab = currentTab.value;
  if (tab === 'home' || tab === 'timetable' || tab === 'cloud') loadTimetable(true);
  else if (tab === 'scores') loadScores();
  else if (tab === 'campus') loadCampus();
  else if (tab === 'electricity') loadElectricitySlots(true).then(syncEleOverview);
  else if (tab === 'notice') refreshNotices();
  else if (tab === 'homework' || tab === 'exams') loadTasks();
  // leave / questionnaire / library 等自带刷新按钮，由各自组件管理
}

function clearCache() {
  if (!window.confirm('将清除本地缓存，需重新登录。是否继续？')) return;
  storage.clearAll();
  window.location.reload();
}
</script>
