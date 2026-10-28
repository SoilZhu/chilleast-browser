<template>
  <div class="space-y-4">
    <PageHeader title="阳光服务" subtitle="诉求反映与答复">
      <template #actions>
        <button class="md-icon-btn" title="刷新" @click="loadRecentLetters">
          <Icon name="refresh" size="md" :class="{ 'animate-spin': loadingLetters }" />
        </button>
      </template>
    </PageHeader>

    <!-- ============ 1. 填写诉求入口（一张便签卡，卡内是行）============ -->
    <NoteCard title="写信反映">
      <div class="md-feed-list">
        <button class="md-feed-row" @click="activeTab = 'submit'">
          <span class="w-5 h-5 shrink-0 flex items-center justify-center text-md-primary">
            <Icon name="edit" size="md" />
          </span>
          <span class="min-w-0 flex-1 text-md2-body1 text-md-text-high">填写诉求</span>
          <Icon name="chevron-right" size="sm" class="text-md-text-hint shrink-0" />
        </button>
      </div>
    </NoteCard>

    <!-- ============ 写信表单（选中时展开，直接落画布）============ -->
    <section v-if="activeTab === 'submit'">
      <SectionHeader title="填写诉求">
        <template #actions>
          <button class="md-btn-text" @click="activeTab = 'recent'">返回列表</button>
        </template>
      </SectionHeader>
      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="md-label">受理部门</label>
            <select v-model="departmentCode" class="md-select" required>
              <option value="">请选择受理部门单位</option>
              <option v-for="dep in departments" :key="dep.code" :value="dep.code">
                {{ dep.name }}
              </option>
            </select>
          </div>

          <div>
            <label class="md-label">诉求类型</label>
            <select v-model="type" class="md-select">
              <option value="1">咨询</option>
              <option value="2">建议</option>
              <option value="3">投诉</option>
              <option value="4">表扬</option>
            </select>
          </div>
        </div>

        <div>
          <label class="md-label">信件主题</label>
          <input
            v-model="title"
            type="text"
            required
            maxlength="100"
            placeholder="简要概括反映的问题或建议…"
            class="md-field"
          />
        </div>

        <div>
          <label class="md-label">诉求详情内容</label>
          <textarea
            v-model="content"
            rows="5"
            required
            placeholder="请客观详细描述具体事实、时间、地点与诉求期望…"
            class="md-field resize-y"
          ></textarea>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="md-label">联系手机 (选填，便于部门回访)</label>
            <input v-model="phone" type="tel" placeholder="手机号码" class="md-field font-mono" />
          </div>

          <div>
            <label class="md-label">联系邮箱 (选填)</label>
            <input v-model="email" type="email" placeholder="电子邮箱地址" class="md-field font-mono" />
          </div>
        </div>

        <div class="flex justify-end pt-1">
          <button
            type="submit"
            class="md-btn-filled"
            :disabled="submitting || !title.trim() || !content.trim() || !departmentCode"
          >
            <Icon v-if="submitting" name="refresh" size="sm" class="animate-spin" />
            <span>{{ submitting ? '提交中…' : '提交' }}</span>
          </button>
        </div>
      </form>
    </section>

    <!-- ============ 2. 近期公开诉求 ============ -->
    <section v-if="activeTab === 'recent'" class="space-y-3">
      <!-- 状态切换（与全站其它页一致：下划线 tab） -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="md-tabs flex-1 min-w-0">
        <button
          v-for="f in FILTERS"
          :key="f.id"
          :class="activeFilter === f.id ? 'md-tab-active' : 'md-tab'"
          @click="activeFilter = f.id"
        >
          <span>{{ f.label }}</span>
          <span class="md-tab-count">{{ countOf(f.id) }}</span>
        </button>
        </div>

        <div class="md-search-inline ml-auto">
          <Icon
            name="search"
            size="sm"
            class="md-search-inline-icon"
          />
          <input
            v-model="letterFilter"
            type="text"
            placeholder="搜索标题或部门…"
            class="md-search-inline-input"
          />
        </div>
      </div>

      <!-- 加载 / 空 / 列表 -->
      <div
        v-if="loadingLetters"
        class="py-10 text-center text-md2-body2 text-md-text-medium flex items-center justify-center gap-2"
      >
        <Icon name="refresh" size="sm" class="animate-spin" />
        <span>加载中…</span>
      </div>

      <EmptyState v-else-if="filteredLetters.length === 0" text="暂无公开诉求" icon="message" compact />

      <!-- 一张便签卡包住所有诉求，每条诉求是卡内一行（行间 1px 分割线） -->
      <NoteCard v-else title="近期公开诉求" :flush="true">
      <div class="md-feed-list">
        <article
          v-for="ticket in filteredLetters"
          :key="ticket.id"
          class="md-feed-row items-start cursor-pointer"
          @click="openTicketDetail(ticket.id)"
        >
          <div class="min-w-0 flex-1">
            <!-- 标题 + 箭头 -->
            <div class="flex items-start justify-between gap-2">
              <h3 class="text-md2-subtitle2 text-md-text-high leading-snug line-clamp-2">
                {{ ticket.title }}
              </h3>
              <Icon name="chevron-right" size="sm" class="text-md-text-hint shrink-0 mt-0.5" />
            </div>

            <!-- 受理部门 -->
            <div class="text-md2-caption text-md-text-medium mt-1.5">
              {{ ticket.department }}
            </div>

            <!-- 类型 / 日期 / 状态 -->
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-md2-caption">
              <span class="text-md-text-medium">{{ ticket.type || '诉求' }}</span>
              <span class="text-md-text-medium tabular-nums">{{ ticket.date }}</span>
              <span
                :class="ticket.status === '2' || ticket.statusLabel === '已办结'
                  ? 'text-md-success font-medium'
                  : 'text-md-text-medium'"
              >
                {{ ticket.statusLabel }}
              </span>
            </div>
          </div>
        </article>
      </div>
      </NoteCard>
    </section>

    <!-- 诉求详情与部门答复对话框 -->
    <div
      v-if="showDetailModal"
      class="md-scrim flex items-center justify-center p-4"
    >
      <div class="md-dialog rounded-md2-md max-w-lg max-h-[85vh] flex flex-col">
        <div class="md-dialog-header">
          <div class="flex items-start gap-2 min-w-0">
            <span
              :class="ticketDetail?.status === '2' ? 'md-chip-success' : 'md-chip-warning'"
              class="shrink-0 mt-0.5"
            >
              {{ ticketDetail?.status === '2' ? '已办结' : '办理中' }}
            </span>
            <h3 class="md-dialog-title truncate">
              {{ ticketDetail?.title || '诉求工单详情' }}
            </h3>
          </div>
          <button
            type="button"
            class="md-icon-btn-sm -mr-2 shrink-0"
            @click="showDetailModal = false"
          >
            <Icon name="close" size="sm" />
          </button>
        </div>

        <div class="md-dialog-body overflow-y-auto border-t border-md-card-border pt-4 space-y-4">
          <div
            v-if="loadingDetail"
            class="py-16 text-center text-md2-body2 text-md-text-medium flex items-center justify-center gap-2"
          >
            <Icon name="refresh" size="sm" class="animate-spin" />
            <span>加载中…</span>
          </div>

          <template v-else-if="ticketDetail">
            <!-- 元数据 -->
            <div class="md-feed-block p-3 space-y-1.5 text-md2-caption text-md-text-medium">
              <div class="flex justify-between gap-3">
                <span>受理单位 <span class="text-md-text-high">{{ ticketDetail.department }}</span></span>
                <span v-if="ticketDetail.handlingDepartment" class="truncate">
                  转办机构 {{ ticketDetail.handlingDepartment }}
                </span>
              </div>
              <div class="flex justify-between gap-3">
                <span>诉求类型 {{ ticketDetail.type || '业务诉求' }}</span>
                <span v-if="ticketDetail.finishTime" class="tabular-nums">
                  办结时间 {{ ticketDetail.finishTime }}
                </span>
              </div>
            </div>

            <!-- 诉求正文 -->
            <div class="space-y-1.5">
              <h4 class="text-md2-subtitle2 text-md-text-high">诉求反映内容</h4>
              <div
                class="md-feed-block p-3.5 text-md2-body2 text-md-text-high whitespace-pre-wrap"
              >
                {{ ticketDetail.content || '暂无内容记录' }}
              </div>
            </div>

            <!-- 官方回复 -->
            <div class="space-y-1.5">
              <h4 class="text-md2-subtitle2 text-md-primary">答复</h4>
              <div
                :class="[
                  'p-3.5 rounded-md2-sm text-md2-body2 whitespace-pre-wrap',
                  ticketDetail.reply
                    ? 'bg-md-success-surface text-md-success-text'
                    : 'bg-md-surface-1 text-md-text-disabled italic',
                ]"
              >
                {{ ticketDetail.reply || '暂无公开答复' }}
              </div>
            </div>
          </template>
        </div>

        <div class="md-dialog-actions border-t border-md-card-border">
          <button type="button" class="md-btn-text" @click="showDetailModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import Icon from './Icon.vue';
import PageHeader from './ui/PageHeader.vue';
import SectionHeader from './ui/SectionHeader.vue';
import NoteCard from './ui/NoteCard.vue';
import EmptyState from './ui/EmptyState.vue';
import {
  fetchSunshineDepartments,
  fetchSunshineLetters,
  fetchSunshineDetail,
  submitSunshineLetter,
  type SunshineDepartment,
  type SunshineLetter,
  type SunshineStatistics,
  type SunshineTicketDetail,
} from '../api/services';

const activeTab = ref<'recent' | 'submit'>('recent');

// 近期诉求数据
const letters = ref<SunshineLetter[]>([]);
const statistics = ref<SunshineStatistics>({ total: '0', processing: '0', completed: '0' });
const loadingLetters = ref(false);
const letterFilter = ref('');

// 诉求详情弹窗
const showDetailModal = ref(false);
const ticketDetail = ref<SunshineTicketDetail | null>(null);
const loadingDetail = ref(false);

// 提交表单数据
const departments = ref<SunshineDepartment[]>([]);
const departmentCode = ref('');
const type = ref('1');
const title = ref('');
const content = ref('');
const phone = ref('');
const email = ref('');
const submitting = ref(false);

/** 状态筛选（与原版 SunshineFilter 一致：全部 / 办理中 / 已办结） */
const activeFilter = ref<'all' | 'inProgress' | 'resolved'>('all');

const FILTERS: Array<{ id: 'all' | 'inProgress' | 'resolved'; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'inProgress', label: '办理中' },
  { id: 'resolved', label: '已办结' },
];

/** 状态码 0/1 = 办理中，2 = 已办结（与 App 的 matches 逻辑一致） */
function matchesFilter(l: SunshineLetter, f: string): boolean {
  if (f === 'all') return true;
  const resolved = l.status === '2' || l.statusLabel === '已办结';
  return f === 'resolved' ? resolved : !resolved;
}

function countOf(f: string): number {
  return letters.value.filter((l) => {
    if (!matchesFilter(l, f)) return false;
    const kw = letterFilter.value.trim().toLowerCase();
    if (!kw) return true;
    return (
      l.title.toLowerCase().includes(kw) ||
      l.department.toLowerCase().includes(kw) ||
      (l.type && l.type.toLowerCase().includes(kw))
    );
  }).length;
}

const filteredLetters = computed(() => {
  const kw = letterFilter.value.trim().toLowerCase();
  return letters.value.filter((l) => {
    if (!matchesFilter(l, activeFilter.value)) return false;
    if (!kw) return true;
    return (
      l.title.toLowerCase().includes(kw) ||
      l.department.toLowerCase().includes(kw) ||
      (l.type && l.type.toLowerCase().includes(kw))
    );
  });
});

onMounted(() => {
  loadRecentLetters();
  loadDepartments();
});

async function loadRecentLetters() {
  loadingLetters.value = true;
  try {
    const res = await fetchSunshineLetters();
    if (Array.isArray(res?.letters)) {
      letters.value = res.letters;
    }
    if (res?.statistics) {
      statistics.value = res.statistics;
    }
  } catch (e) {
    console.error('加载近期诉求失败:', e);
  } finally {
    loadingLetters.value = false;
  }
}

async function loadDepartments() {
  try {
    const res = await fetchSunshineDepartments();
    if (res?.departments) {
      departments.value = res.departments;
    }
  } catch (e) {
    console.error('加载阳光服务部门失败:', e);
  }
}

async function openTicketDetail(id: string) {
  showDetailModal.value = true;
  ticketDetail.value = null;
  loadingDetail.value = true;
  try {
    const res = await fetchSunshineDetail(id);
    ticketDetail.value = res?.detail || null;
  } catch (e) {
    console.error('获取诉求工单详情失败:', e);
  } finally {
    loadingDetail.value = false;
  }
}

async function handleSubmit() {
  if (!title.value.trim() || !content.value.trim() || !departmentCode.value) return;
  submitting.value = true;
  try {
    await submitSunshineLetter({
      title: title.value.trim(),
      content: content.value.trim(),
      type: type.value,
      departmentCode: departmentCode.value,
      phone: phone.value.trim(),
      email: email.value.trim(),
    });
    alert('已提交');
    title.value = '';
    content.value = '';
    activeTab.value = 'recent';
    loadRecentLetters();
  } catch (err: any) {
    alert(err?.message || '提交失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
}
</script>
