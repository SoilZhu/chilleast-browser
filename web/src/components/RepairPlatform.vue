<template>
  <div class="space-y-4">
    <PageHeader title="报修">
      <template #actions>
        <button type="button" class="md-icon-btn" title="刷新" @click="loadOrders">
          <Icon name="refresh" size="md" :class="{ 'animate-spin': loading }" />
        </button>
      </template>
    </PageHeader>

    <!-- ============ 1. 四大报修分类（每个报修单独一个卡片）============ -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <button
        v-for="cat in CATALOGS"
        :key="cat.id"
        type="button"
        class="md-card-interactive flex items-center justify-between p-4 w-full text-left"
        @click="openSubmit(cat)"
      >
        <div class="flex items-center gap-3 min-w-0">
          <span
            class="w-6 h-6 shrink-0 flex items-center justify-center"
            :style="{ color: cat.color }"
          >
            <Icon :name="cat.icon" size="md" />
          </span>
          <span class="text-md2-body1 text-md-text-high font-medium truncate">{{ cat.title }}</span>
        </div>
        <Icon name="chevron-right" size="sm" class="text-md-text-hint shrink-0" />
      </button>
    </div>

    <!-- ============ 2. 我的工单（标题与状态筛选在卡片外侧上方左对齐）============ -->
    <div v-if="orders.length > 0" class="break-inside-avoid">
      <div class="flex items-center gap-3 mb-2">
        <h2 class="text-[14px] leading-5 font-medium text-md-text-high">我的工单</h2>
        <div class="flex items-center gap-1">
          <button
            type="button"
            :class="isOngoing ? 'md-chip-filter-active' : 'md-chip-filter'"
            @click="isOngoing = true"
          >
            <span>处理中</span>
            <span class="tabular-nums opacity-70">{{ ongoingCount }}</span>
          </button>
          <button
            type="button"
            :class="!isOngoing ? 'md-chip-filter-active' : 'md-chip-filter'"
            @click="isOngoing = false"
          >
            <span>已完成</span>
            <span class="tabular-nums opacity-70">{{ finishedCount }}</span>
          </button>
        </div>
      </div>

      <div class="md-card p-0 overflow-hidden">
        <div class="md-feed-list">
          <article
            v-for="order in orders"
            :key="order.id"
            class="md-feed-row items-start cursor-pointer"
            @click="viewDetail(order)"
          >
            <div class="min-w-0 flex-1 space-y-2.5">
              <div class="flex items-start justify-between gap-3">
                <div class="space-y-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="md-chip-info">{{ order.catalog || '报修服务' }}</span>
                    <span class="text-md2-caption text-md-text-medium font-mono">{{ order.code }}</span>
                  </div>
                  <h3 class="text-md2-subtitle2 text-md-text-high">{{ order.title || order.description }}</h3>
                </div>

                <span :class="statusChip(order.status)" class="shrink-0">{{ order.status }}</span>
              </div>

              <div class="flex items-center justify-between gap-3 text-md2-caption text-md-text-medium">
                <span>受理部门 {{ order.department || '后勤保卫部' }}</span>
                <span v-if="order.createdAt" class="tabular-nums shrink-0">{{ order.createdAt }}</span>
              </div>
            </div>
            <Icon name="chevron-right" size="sm" class="text-md-text-hint shrink-0 mt-0.5" />
          </article>
        </div>
      </div>
    </div>

    <!-- 空状态：仍提供状态切换 -->
    <section v-else class="space-y-3">
      <div class="md-tabs">
        <button
          type="button"
          :class="isOngoing ? 'md-tab-active' : 'md-tab'"
          @click="isOngoing = true"
        >
          <span>处理中</span>
          <span class="md-tab-count">{{ ongoingCount }}</span>
        </button>
        <button
          type="button"
          :class="!isOngoing ? 'md-tab-active' : 'md-tab'"
          @click="isOngoing = false"
        >
          <span>已完成</span>
          <span class="md-tab-count">{{ finishedCount }}</span>
        </button>
      </div>
      <EmptyState
        :text="isOngoing ? '暂无处理中的工单' : '暂无已完成工单'"
        icon="tool"
        compact
      />
    </section>

    <!-- 工单流转详情对话框 -->
    <div
      v-if="selectedOrder"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="selectedOrder = null"
    >
      <div class="md-dialog rounded-md2-md max-w-md max-h-[85vh] flex flex-col">
        <div class="md-dialog-header">
          <div class="min-w-0">
            <span class="text-md2-caption text-md-primary font-mono">{{ selectedOrder.code }}</span>
            <h3 class="md-dialog-title mt-0.5">{{ selectedOrder.title || '工单详情' }}</h3>
          </div>
          <button
            type="button"
            class="md-icon-btn-sm -mr-2 shrink-0"
            @click="selectedOrder = null"
          >
            <Icon name="close" size="sm" />
          </button>
        </div>

        <div class="md-dialog-body overflow-y-auto border-t border-md-card-border pt-4">
          <dl class="divide-y divide-md-card-border text-md2-body2">
            <div class="flex gap-3 py-2">
              <dt class="w-20 shrink-0 text-md-text-medium">报修类型</dt>
              <dd class="text-md-text-high">{{ selectedOrder.catalog }}</dd>
            </div>
            <div class="flex gap-3 py-2">
              <dt class="w-20 shrink-0 text-md-text-medium">流转状态</dt>
              <dd>
                <span :class="statusChip(selectedOrder.status)">{{ selectedOrder.status }}</span>
              </dd>
            </div>
            <div class="flex gap-3 py-2">
              <dt class="w-20 shrink-0 text-md-text-medium">问题描述</dt>
              <dd class="text-md-text-high whitespace-pre-wrap">
                {{ selectedOrder.description || '无具体文字描述' }}
              </dd>
            </div>
          </dl>
        </div>

        <div class="md-dialog-actions border-t border-md-card-border">
          <button type="button" class="md-btn-danger" @click="handleCancel(selectedOrder.id)">
            申请取消工单
          </button>
          <button type="button" class="md-btn-text" @click="selectedOrder = null">关闭</button>
        </div>
      </div>
    </div>

    <!-- 发起新报修对话框 -->
    <div
      v-if="showSubmitModal"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="showSubmitModal = false"
    >
      <div class="md-dialog rounded-md2-md max-w-lg max-h-[90vh] flex flex-col">
        <div class="md-dialog-header">
          <div class="min-w-0">
            <span class="text-md2-caption text-md-primary">新建服务工单</span>
            <h3 class="md-dialog-title mt-0.5">发起报修申请</h3>
          </div>
          <button
            type="button"
            class="md-icon-btn-sm -mr-2 shrink-0"
            @click="showSubmitModal = false"
          >
            <Icon name="close" size="sm" />
          </button>
        </div>

        <div class="md-dialog-body overflow-y-auto border-t border-md-card-border pt-4 space-y-3">
          <div>
            <label class="md-label">报修服务类型 *</label>
            <select v-model="formCatalog" class="md-select">
              <option value="后勤报修">后勤报修</option>
              <option value="校园网络故障报修">校园网络</option>
              <option value="一校通报修">一校通</option>
              <option value="业务系统故障">业务系统</option>
            </select>
          </div>

          <div>
            <label class="md-label">故障具体地点 / 宿舍房间 *</label>
            <input v-model="formLocation" type="text" placeholder="例如：金岸1栋 629" class="md-field" />
          </div>

          <div>
            <label class="md-label">联系电话</label>
            <input
              v-model="formPhone"
              type="tel"
              placeholder="留空则使用学校绑定手机号"
              class="md-field font-mono"
            />
          </div>

          <div>
            <label class="md-label">故障详细描述 *</label>
            <textarea
              v-model="formDescription"
              rows="3"
              placeholder="请详细描述故障现象与具体设施…"
              class="md-field resize-y"
            ></textarea>
          </div>

          <div>
            <label class="md-label">
              现场照片 {{ formCatalog === '后勤报修' ? '（必填）' : '（选填）' }}
            </label>
            <div class="flex items-center gap-3">
              <label class="md-btn-outlined cursor-pointer">
                <Icon name="camera" size="sm" />
                <span>{{ imageBase64 ? '更换照片' : '选择图片上传' }}</span>
                <input type="file" accept="image/*" class="hidden" @change="onImageSelected" />
              </label>
              <span v-if="imageName" class="text-md2-caption text-md-text-medium truncate max-w-[200px]">
                {{ imageName }}
              </span>
            </div>
            <div
              v-if="imageBase64"
              class="mt-2 relative w-24 h-24 rounded-md2-md overflow-hidden border border-md-card-border"
            >
              <img :src="imageBase64" class="w-full h-full object-cover" />
              <button
                type="button"
                class="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center"
                @click="clearImage"
              >
                <Icon name="close" size="xs" />
              </button>
            </div>
          </div>
        </div>

        <div class="md-dialog-actions border-t border-md-card-border">
          <button type="button" class="md-btn-text" @click="showSubmitModal = false">取消</button>
          <button
            type="button"
            class="md-btn-filled"
            :disabled="submitting || !formDescription.trim() || !formLocation.trim() || (formCatalog === '后勤报修' && !imageBase64)"
            @click="handleSubmit"
          >
            <Icon v-if="submitting" name="refresh" size="sm" class="animate-spin" />
            <span>{{ submitting ? '提交中…' : '确认提交工单' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import Icon from './Icon.vue';
import PageHeader from './ui/PageHeader.vue';
import SectionHeader from './ui/SectionHeader.vue';
import NoteCard from './ui/NoteCard.vue';
import EmptyState from './ui/EmptyState.vue';
import {
  fetchRepairOrders,
  fetchRepairDetail,
  cancelRepairOrder,
  submitRepairOrder,
  type RepairOrder,
} from '../api/services';

/** 四大报修分类（与 App 的 RepairService.catalogs 一一对应） */
const CATALOGS = [
  {
    id: '5bbbaf0a-b7b7-11eb-b305-4bcc6b2984af',
    title: '后勤报修',
    subtitle: '宿舍、公共设施与生活服务',
    color: '#ef6c00',
    icon: 'tool',
  },
  {
    id: 'b4435ca0-99f6-11ec-bf7a-177427586306',
    title: '校园网络报修',
    subtitle: '无线网络、网线与校园网故障',
    color: '#1976d2',
    icon: 'wifi',
  },
  {
    id: 'f11e3e78-9ace-11ec-9f07-f7b2f4ca88d7',
    title: '一校通报修',
    subtitle: '一卡通、数字校园与信息化设备',
    color: '#d84315',
    icon: 'card',
  },
  {
    id: 'ffa62964-9539-11ec-a409-0f7763ad71f7',
    title: '业务系统报修',
    subtitle: '教务、门户及其他业务系统',
    color: '#00897b',
    icon: 'apps',
  },
] as const;

const isOngoing = ref(true);
const loading = ref(false);
const orders = ref<RepairOrder[]>([]);
const selectedOrder = ref<any | null>(null);

// 发起报修相关
const showSubmitModal = ref(false);
const formCatalog = ref('后勤报修');

/** 点击分类卡直接带该类目打开报修表单 */
function openSubmit(cat: { title: string }) {
  formCatalog.value = cat.title;
  showSubmitModal.value = true;
}

/** 两个筛选 chip 的数量（当前列表内统计，避免额外请求） */
const ongoingCount = computed(() => (isOngoing.value ? orders.value.length : 0));
const finishedCount = computed(() => (isOngoing.value ? 0 : orders.value.length));
const formLocation = ref(localStorage.getItem('chilleast_dorm_name') || '');
const formPhone = ref('');
const formDescription = ref('');
const imageBase64 = ref('');
const imageName = ref('');
const submitting = ref(false);

/** 工单状态 → MD2 语义 chip（已办结=成功，待处理=警告，其余=进行中信息色） */
function statusChip(status?: string): string {
  const s = (status || '').trim();
  if (!s) return 'md-chip-neutral';
  if (/已办结|已完成|已关闭|完成|办结/.test(s)) return 'md-chip-success';
  if (/待|未受理|草稿|NEW/.test(s)) return 'md-chip-warning';
  return 'md-chip-info';
}

function onImageSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  imageName.value = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    imageBase64.value = reader.result as string;
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  imageBase64.value = '';
  imageName.value = '';
}

async function handleSubmit() {
  if (!formDescription.value.trim() || !formLocation.value.trim()) return;
  if (formCatalog.value === '后勤报修' && !imageBase64.value) {
    alert('后勤报修需上传现场照片');
    return;
  }
  submitting.value = true;
  try {
    const res = await submitRepairOrder({
      catalog: formCatalog.value,
      location: formLocation.value.trim(),
      description: formDescription.value.trim(),
      phone: formPhone.value.trim() || undefined,
      imageBase64: imageBase64.value || undefined,
      imageName: imageName.value || undefined,
    });
    alert(res?.message || '已提交');
    showSubmitModal.value = false;
    formDescription.value = '';
    clearImage();
    loadOrders();
  } catch (err: any) {
    alert(err?.message || '提交工单失败');
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadOrders();
});

watch(isOngoing, () => {
  loadOrders();
});

async function loadOrders() {
  loading.value = true;
  try {
    orders.value = await fetchRepairOrders(isOngoing.value);
  } catch (e) {
    console.error('加载报修工单失败:', e);
    orders.value = [];
  } finally {
    loading.value = false;
  }
}

async function viewDetail(order: RepairOrder) {
  selectedOrder.value = order;
  try {
    const full = await fetchRepairDetail(order.id);
    if (full) selectedOrder.value = { ...order, ...full };
  } catch {}
}

async function handleCancel(orderId: string) {
  if (!confirm('确认要取消该报修工单吗？')) return;
  try {
    await cancelRepairOrder(orderId);
    alert('已取消');
    selectedOrder.value = null;
    loadOrders();
  } catch (err: any) {
    alert(err?.message || '取消工单失败');
  }
}
</script>
