<template>
  <!-- ===================================================================
       电费充值（独立整页）
       双宿舍槽位 + 校园卡余额直接扣款，不含任何第三方支付
       =================================================================== -->
  <div class="space-y-5">
    <PageHeader title="电费充值" subtitle="双宿舍 · 校园卡支付">
      <template #actions>
        <span v-if="cardInfo" class="md-chip-neutral tabular-nums">
          校园卡 ¥{{ cardBalanceText }}
        </span>
      </template>
    </PageHeader>

    <!-- 操作结果提示 -->
    <Alert
      v-if="notice"
      :kind="notice.type === 'error' ? 'error' : 'success'"
      :text="notice.text"
      action-text="关闭"
      @action="notice = null"
    />

    <!-- 园区列表拉取失败（提示落画布，不包卡片） -->
    <EmptyState
      v-if="areasFailed"
      text="加载失败"
      icon="warning"
      error
      retry-text="点击重试"
      @retry="loadAreas(true)"
    />

    <template v-else>
      <!-- 两个宿舍槽位 -->
      <div class="space-y-3">
        <NoteCard
          v-for="slot in electricitySlots"
          :key="slot.index"
          :title="slot.label"
          :meta="slot.room ? `¥${slot.balanceText}` : '未绑定'"
          :padded="expandedIndex === slot.index"
        >
          <!-- 折叠态：点整行展开 -->
          <button
            v-if="expandedIndex !== slot.index"
            type="button"
            class="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors duration-md2-short hover:bg-md-surface-1"
            @click="expand(slot.index)"
          >
            <span class="text-md2-caption text-md-text-medium tabular-nums">
              {{ slot.loading ? '…' : slot.room ? '点击展开查看与充值' : '未绑定宿舍' }}
            </span>
            <Icon name="chevron-down" size="sm" class="text-md-text-medium shrink-0" />
          </button>

          <!-- 展开态：余额 + 园区/楼栋/房间 + 清除/刷新（宿舍名已在卡头，不重复） -->
          <div v-else class="space-y-4">
            <div class="flex items-center justify-end gap-1">
                <button
                  type="button"
                  class="md-btn-text h-8 px-2"
                  :disabled="!slot.room || slot.loading"
                  @click="refreshSlot(slot.index)"
                >
                  <Icon name="refresh" size="sm" :class="{ 'animate-spin': slot.loading }" />
                  <span>刷新余额</span>
                </button>
                <button
                  type="button"
                  class="md-btn-text h-8 px-2"
                  :disabled="!slot.room"
                  @click="handleClearSlot(slot.index)"
                >
                  <Icon name="trash" size="sm" />
                  <span>清除</span>
                </button>
            </div>

            <!-- 电费余额 -->
            <div class="md-feed-block p-3.5">
              <div class="text-md2-caption text-md-text-medium">电费余额</div>
              <div class="mt-1 flex items-baseline gap-1.5">
                <span
                  :class="[
                    'text-[28px] leading-none font-normal tabular-nums',
                    lowBalance(slot) ? 'text-md-danger' : 'text-md-text-high',
                  ]"
                >
                  {{ slot.loading ? '…' : slot.balanceText }}
                </span>
                <span class="text-md2-body2 text-md-text-medium">元</span>
              </div>
              <button
                v-if="slot.error && !slot.loading"
                type="button"
                class="mt-1.5 flex items-center gap-1 text-md2-caption text-md-danger"
                @click="refreshSlot(slot.index)"
              >
                <span>{{ slot.error }}</span>
                <Icon name="refresh" size="xs" />
              </button>
            </div>

            <!-- 园区 / 楼栋 / 房间 级联 -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label class="md-label">园区</label>
                <select
                  :value="pickers[slot.index].areaName"
                  class="md-select"
                  @change="onAreaChange(slot.index, $event)"
                >
                  <option value="">选择园区</option>
                  <option v-for="a in electricityAreas" :key="a.id" :value="a.name">{{ a.name }}</option>
                </select>
              </div>

              <div>
                <label class="md-label">楼栋</label>
                <select
                  :value="pickers[slot.index].buildingName"
                  class="md-select disabled:opacity-40"
                  :disabled="!pickers[slot.index].areaName || pickers[slot.index].loadingBuildings"
                  @change="onBuildingChange(slot.index, $event)"
                >
                  <option value="">
                    {{ pickers[slot.index].loadingBuildings ? '…' : '选择楼栋' }}
                  </option>
                  <option v-for="b in pickers[slot.index].buildings" :key="b.id" :value="b.name">
                    {{ b.name }}
                  </option>
                </select>
              </div>

              <div>
                <label class="md-label">房间</label>
                <select
                  :value="pickers[slot.index].roomName"
                  class="md-select disabled:opacity-40"
                  :disabled="!pickers[slot.index].buildingName || pickers[slot.index].loadingRooms"
                  @change="onRoomChange(slot.index, $event)"
                >
                  <option value="">
                    {{ pickers[slot.index].loadingRooms ? '…' : '选择房间' }}
                  </option>
                  <option v-for="r in pickers[slot.index].rooms" :key="r.id" :value="r.name">
                    {{ r.name }}
                  </option>
                </select>
              </div>
            </div>

            <p v-if="pickers[slot.index].error" class="text-md2-caption text-md-danger">
              {{ pickers[slot.index].error }}
            </p>
          </div>
        </NoteCard>
      </div>

      <!-- 充值金额 -->
      <NoteCard
        title="充值金额"
        :meta="activeSlot?.room ? activeSlot.label : '未绑定宿舍'"
      >

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            v-for="preset in PRESET_AMOUNTS"
            :key="preset"
            type="button"
            :class="isPresetActive(preset) ? 'md-btn-filled h-12 w-full' : 'md-btn-outlined h-12 w-full'"
            @click="pickPreset(preset)"
          >
            ¥{{ preset }}
          </button>
        </div>

        <div>
          <label class="md-label" for="ele-amount">自定义金额</label>
          <input
            id="ele-amount"
            :value="amountText"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="1-1000"
            class="md-field tabular-nums"
            @input="onAmountInput"
          />
          <p v-if="amountError" class="text-md2-caption text-md-danger mt-1.5">{{ amountError }}</p>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span class="text-md2-caption text-md-text-medium tabular-nums">
            校园卡余额 ¥{{ cardBalanceText }}
          </span>
          <button
            type="button"
            class="md-btn-filled"
            :disabled="paying || !canPay"
            @click="openConfirm"
          >
            <Icon v-if="paying" name="refresh" size="sm" class="animate-spin" />
            <Icon v-else name="card" size="sm" />
            <span>{{ paying ? '支付中…' : '校园卡支付' }}</span>
          </button>
        </div>
      </NoteCard>
    </template>

    <!-- 支付确认对话框 -->
    <div
      v-if="confirmVisible"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="closeConfirm"
    >
      <div class="md-dialog rounded-md2-md max-w-md flex flex-col">
        <div class="md-dialog-header">
          <div class="min-w-0">
            <h3 class="md-dialog-title">确认充值</h3>
            <p class="text-md2-caption text-md-text-medium mt-0.5">从校园卡余额扣款</p>
          </div>
          <button type="button" class="md-icon-btn-sm -mr-2 shrink-0" @click="closeConfirm">
            <Icon name="close" size="sm" />
          </button>
        </div>

        <div class="md-dialog-body overflow-y-auto border-t border-md-card-border pt-4 space-y-3">
          <div class="flex items-start justify-between gap-3">
            <span class="text-md2-body2 text-md-text-medium shrink-0">充值宿舍</span>
            <span class="text-md2-body2 text-md-text-high text-right">{{ activeSlot?.label || '--' }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-md2-body2 text-md-text-medium">充值金额</span>
            <span class="text-md2-h6 text-md-text-high tabular-nums">¥{{ amountText }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-md2-body2 text-md-text-medium">校园卡余额</span>
            <span class="text-md2-body2 text-md-text-high tabular-nums">¥{{ cardBalanceText }}</span>
          </div>
          <p v-if="cardBalanceInsufficient" class="text-md2-caption text-md-danger">余额可能不足</p>
        </div>

        <div class="md-dialog-actions border-t border-md-card-border">
          <button type="button" class="md-btn-text" :disabled="paying" @click="closeConfirm">
            取消
          </button>
          <button type="button" class="md-btn-filled" :disabled="paying" @click="submitPayment">
            <Icon v-if="paying" name="refresh" size="sm" class="animate-spin" />
            <span>{{ paying ? '支付中…' : '确认支付' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import Icon from './Icon.vue';
import Alert from './ui/Alert.vue';
import NoteCard from './ui/NoteCard.vue';
import PageHeader from './ui/PageHeader.vue';
import EmptyState from './ui/EmptyState.vue';
import {
  createElectricityPreOrder,
  fetchElectricityBuildings,
  fetchElectricityRooms,
  type CardInfo,
  type ElectricityBalance,
  type ElectricityBuilding,
  type ElectricityRoom,
} from '../api/campus';
import {
  clearSlot,
  electricityAreas,
  electricityAreasError,
  electricitySlots,
  loadElectricityAreas,
  loadElectricitySlots,
  refreshSlot,
  selectRoom,
} from '../composables/useElectricity';

const props = withDefaults(
  defineProps<{
    cardInfo?: CardInfo | null;
  }>(),
  {
    cardInfo: null,
  },
);

/**
 * 充值成功后校园卡余额会变，父级需要重新拉一次卡信息。
 * 父级不处理该事件也不影响本页（只是卡余额数字暂时偏旧）。
 */
const emit = defineEmits<{ (e: 'refresh-card'): void }>();

/** 预设金额（与原版一致：10 / 20 / 50 / 100） */
const PRESET_AMOUNTS = [10, 20, 50, 100];
/** 单笔可充值区间（整数元） */
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 1000;
/** 电费余额低于 10 元标红，与首页余额卡一致 */
const LOW_BALANCE = 10;

// ---------------------------------------------------------------------------
// 槽位展开状态
// ---------------------------------------------------------------------------

/**
 * 当前展开的槽位。
 * 与原版一致：始终有一个槽位展开，点折叠卡片即切换。
 */
const expandedIndex = ref(0);

const activeSlot = computed(() => electricitySlots.value[expandedIndex.value] ?? null);

function expand(index: number) {
  expandedIndex.value = index;
  void hydratePicker(index);
}

// ---------------------------------------------------------------------------
// 园区 / 楼栋 / 房间 级联（纯界面状态，绑定关系在 useElectricity 里）
// ---------------------------------------------------------------------------

interface SlotPicker {
  areaName: string;
  buildingName: string;
  roomName: string;
  buildings: ElectricityBuilding[];
  rooms: ElectricityRoom[];
  loadingBuildings: boolean;
  loadingRooms: boolean;
  error: string | null;
}

function createPicker(): SlotPicker {
  return {
    areaName: '',
    buildingName: '',
    roomName: '',
    buildings: [],
    rooms: [],
    loadingBuildings: false,
    loadingRooms: false,
    error: null,
  };
}

const pickers = reactive<SlotPicker[]>([createPicker(), createPicker()]);

const areasFailed = computed(
  () => electricityAreas.value.length === 0 && electricityAreasError.value !== null,
);

async function loadAreas(force = false) {
  await loadElectricityAreas(force);
}

/** 按已绑定宿舍回填下拉框，并加载对应的楼栋/房间列表 */
async function hydratePicker(index: number) {
  const picker = pickers[index];
  const room = electricitySlots.value[index]?.room;
  if (!picker || !room) return;
  if (picker.buildings.length > 0 && picker.areaName === room.areaName) return;

  picker.areaName = room.areaName;
  picker.buildingName = room.buildingName;
  picker.roomName = room.roomName;
  picker.error = null;

  await Promise.all([loadBuildings(index, room.areaName), loadRooms(index, room.areaName, room.buildingName)]);
}

async function loadBuildings(index: number, areaName: string): Promise<void> {
  const picker = pickers[index];
  if (!picker) return;
  picker.loadingBuildings = true;
  try {
    const list = await fetchElectricityBuildings(areaName);
    picker.buildings = Array.isArray(list) ? list : [];
  } catch (e) {
    picker.buildings = [];
    picker.error = (e as Error)?.message || '楼栋加载失败';
  } finally {
    picker.loadingBuildings = false;
  }
}

async function loadRooms(index: number, areaName: string, buildingName: string): Promise<void> {
  const picker = pickers[index];
  if (!picker) return;
  picker.loadingRooms = true;
  try {
    const list = await fetchElectricityRooms(areaName, buildingName);
    picker.rooms = Array.isArray(list) ? list : [];
  } catch (e) {
    picker.rooms = [];
    picker.error = (e as Error)?.message || '房间加载失败';
  } finally {
    picker.loadingRooms = false;
  }
}

/** 选中房间 → 立即保存到槽位并查余额 */
async function bindRoom(index: number, roomName: string): Promise<void> {
  const picker = pickers[index];
  if (!picker) return;
  const room = picker.rooms.find((r) => r.name === roomName);
  if (!room) return;
  await selectRoom(index, {
    areaName: picker.areaName,
    buildingName: picker.buildingName,
    roomId: room.id,
    roomName: room.name,
    mertype: room.mertype,
  });
}

async function onAreaChange(index: number, event: Event) {
  const picker = pickers[index];
  if (!picker) return;
  const areaName = (event.target as HTMLSelectElement).value;

  picker.areaName = areaName;
  picker.buildingName = '';
  picker.roomName = '';
  picker.buildings = [];
  picker.rooms = [];
  picker.error = null;
  if (!areaName) return;

  await loadBuildings(index, areaName);
  // 级联默认值：自动选第一个楼栋，再自动选第一个房间
  const firstBuilding = picker.buildings[0];
  if (firstBuilding) await onBuildingChange(index, firstBuilding.name);
}

async function onBuildingChange(index: number, value: string | Event) {
  const picker = pickers[index];
  if (!picker) return;
  const buildingName = typeof value === 'string' ? value : (value.target as HTMLSelectElement).value;

  picker.buildingName = buildingName;
  picker.roomName = '';
  picker.rooms = [];
  picker.error = null;
  if (!buildingName || !picker.areaName) return;

  await loadRooms(index, picker.areaName, buildingName);
  // 级联默认值：自动选第一个房间并直接绑定
  const firstRoom = picker.rooms[0];
  if (firstRoom) {
    picker.roomName = firstRoom.name;
    await bindRoom(index, firstRoom.name);
  }
}

async function onRoomChange(index: number, event: Event) {
  const picker = pickers[index];
  if (!picker) return;
  const roomName = (event.target as HTMLSelectElement).value;
  picker.roomName = roomName;
  if (roomName) await bindRoom(index, roomName);
}

/** 清除绑定：槽位与下拉框一起复位 */
async function handleClearSlot(index: number) {
  await clearSlot(index);
  const picker = pickers[index];
  if (!picker) return;
  picker.areaName = '';
  picker.buildingName = '';
  picker.roomName = '';
  picker.buildings = [];
  picker.rooms = [];
  picker.error = null;
}

// ---------------------------------------------------------------------------
// 金额
// ---------------------------------------------------------------------------

const amountText = ref('');
const amountError = ref('');

/** 只保留数字，最多 4 位（1000 是上限） */
function onAmountInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  amountText.value = raw.replace(/\D/g, '').slice(0, 4);
  (event.target as HTMLInputElement).value = amountText.value;
  amountError.value = '';
}

function pickPreset(preset: number) {
  amountText.value = String(preset);
  amountError.value = '';
}

function isPresetActive(preset: number): boolean {
  return amountText.value === String(preset);
}

/** 校验通过返回整数金额，否则返回 null 并写入提示 */
function parseAmount(): number | null {
  const text = amountText.value.trim();
  if (text === '') {
    amountError.value = '请输入充值金额';
    return null;
  }
  const amount = Number(text);
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    amountError.value = `请输入 ${MIN_AMOUNT}-${MAX_AMOUNT} 之间的整数`;
    return null;
  }
  amountError.value = '';
  return amount;
}

// ---------------------------------------------------------------------------
// 校园卡余额
// ---------------------------------------------------------------------------

const cardBalance = computed(() => {
  const n = Number(props.cardInfo?.balance);
  return Number.isFinite(n) ? n : null;
});

const cardBalanceText = computed(() =>
  cardBalance.value === null ? '--' : cardBalance.value.toFixed(2),
);

/** 余额不够付这笔钱时给个提示（不拦截，最终以学校平台为准） */
const cardBalanceInsufficient = computed(() => {
  const amount = Number(amountText.value);
  if (cardBalance.value === null || !Number.isFinite(amount)) return false;
  return amount > cardBalance.value;
});

/** 电费余额低于 10 元标红，与首页余额卡同一阈值 */
function lowBalance(slot: { balance: ElectricityBalance | null }): boolean {
  const n = Number(slot.balance?.balance);
  return Number.isFinite(n) && n <= LOW_BALANCE;
}

// ---------------------------------------------------------------------------
// 支付
// ---------------------------------------------------------------------------

const paying = ref(false);
const confirmVisible = ref(false);
const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const canPay = computed(() => {
  const slot = activeSlot.value;
  if (!slot?.room) return false;
  const amount = Number(amountText.value);
  return Number.isInteger(amount) && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;
});

function openConfirm() {
  if (!activeSlot.value?.room) {
    notice.value = { type: 'error', text: '请先绑定宿舍' };
    return;
  }
  if (parseAmount() === null) return;
  notice.value = null;
  confirmVisible.value = true;
}

function closeConfirm() {
  if (paying.value) return;
  confirmVisible.value = false;
}

async function submitPayment() {
  const slot = activeSlot.value;
  const room = slot?.room;
  if (!room) return;
  const amount = parseAmount();
  if (amount === null) return;

  paying.value = true;
  try {
    const res = await createElectricityPreOrder({
      areaName: room.areaName,
      buildingName: room.buildingName,
      roomId: room.roomId,
      roomName: room.roomName,
      mertype: room.mertype,
      amount,
    });
    if (res?.success) {
      confirmVisible.value = false;
      notice.value = { type: 'success', text: `已充值 ¥${amount}` };
      emit('refresh-card');
      await refreshSlot(slot.index);
    } else {
      notice.value = { type: 'error', text: res?.message || '充值失败，请稍后重试' };
    }
  } catch (e) {
    notice.value = { type: 'error', text: (e as Error)?.message || '充值失败，请稍后重试' };
  } finally {
    paying.value = false;
  }
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

onMounted(async () => {
  await Promise.all([loadElectricitySlots(), loadAreas()]);
  // 展开的槽位如果已绑定，把级联下拉框补齐
  await hydratePicker(expandedIndex.value);
});

</script>
