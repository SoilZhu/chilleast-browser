<template>
  <!-- ===================================================================
       快速预约（对应原版 library_quick_reserve_screen.dart）
       -------------------------------------------------------------------
       原版结构：
         1. 预约时段卡片（点开时段选择，右侧显示日期，下面大字时段 + 时长徽章）
         2. 位置偏好卡片（楼层 chip → 选中楼层后再出阅览室 chip）
         3. 「预约」匹配按钮（右对齐）
         4. 匹配结果卡片（座位号 + 阅览室 + 时段 + 换一个/确认）或未匹配提示
       网页端保持同一顺序；匹配结果用分组行而不是描边强调框。
       =================================================================== -->
  <div class="space-y-4">
    <PageHeader title="快速预约" :subtitle="quickReserveTip" back @back="$emit('back')">
      <template #actions>
        <button class="md-icon-btn" title="刷新" :disabled="loadingConfig" @click="reload">
          <Icon name="refresh" size="md" :class="{ 'animate-spin': loadingConfig }" />
        </button>
      </template>
    </PageHeader>

    <div v-if="loadingConfig" class="py-10 flex flex-col items-center gap-2">
      <Icon name="refresh" size="lg" class="animate-spin text-md-text-hint" />
      <p class="text-md2-body2 text-md-text-medium">加载中…</p>
    </div>

    <template v-else>
      <!-- 1. 预约时段 -->
      <section class="space-y-2">
        <SectionHeader title="预约时段" />
        <button
          type="button"
          class="md-group w-full text-left px-4 py-3.5"
          @click="pickingTime = true"
        >
          <div class="flex items-center gap-2">
            <Icon name="clock" size="sm" class="text-md-primary" />
            <span class="text-md2-body2 text-md-text-high">选择预约时段</span>
            <span class="ml-auto text-md2-caption text-md-text-medium tabular-nums">{{ dayLabel }}</span>
            <Icon name="chevron-right" size="sm" class="text-md-text-hint" />
          </div>
          <div class="flex items-baseline gap-2.5 mt-2.5">
            <span class="text-md2-h5 text-md-text-high tabular-nums">{{ startTime }} ~ {{ endTime }}</span>
            <span v-if="duration" class="md-chip-success">{{ duration }}</span>
          </div>
        </button>
      </section>

      <!-- 2. 位置偏好 -->
      <section class="space-y-2">
        <SectionHeader title="位置偏好" subtitle="不选则全馆匹配" />
        <div class="md-group px-4 py-3.5 space-y-3">
          <div>
            <div class="md-label">楼层</div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                :class="selectedFloor === null ? 'md-chip-filter-active' : 'md-chip-filter'"
                @click="pickFloor(null)"
              >
                全部楼层
              </button>
              <button
                v-for="floor in floors"
                :key="floor"
                type="button"
                :class="selectedFloor === floor ? 'md-chip-filter-active' : 'md-chip-filter'"
                @click="pickFloor(floor)"
              >
                {{ floor }}
              </button>
            </div>
          </div>

          <div v-if="selectedFloor !== null">
            <div class="md-label">阅览室</div>
            <div v-if="loadingRooms" class="mt-2 text-md2-caption text-md-text-medium">加载中…</div>
            <div v-else class="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                :class="selectedRoom === null ? 'md-chip-filter-active' : 'md-chip-filter'"
                @click="selectedRoom = null"
              >
                全部阅览室
              </button>
              <button
                v-for="roomName in roomOptions"
                :key="roomName"
                type="button"
                :class="selectedRoom === roomName ? 'md-chip-filter-active' : 'md-chip-filter'"
                @click="selectedRoom = selectedRoom === roomName ? null : roomName"
              >
                {{ roomName }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 3. 匹配按钮 -->
      <div class="flex justify-end">
        <button
          type="button"
          class="md-btn-filled"
          :disabled="matching || submitting"
          @click="match(false)"
        >
          <Icon v-if="matching" name="refresh" size="sm" class="animate-spin" />
          {{ matched ? '重新匹配' : '预约' }}
        </button>
      </div>

      <Alert v-if="submitNotice" :kind="submitNotice.kind" :text="submitNotice.text" />

      <!-- 4a. 匹配结果 -->
      <section v-if="matched" class="space-y-2">
        <SectionHeader title="匹配结果" />
        <div class="md-group">
          <div class="px-4 py-3.5">
            <div class="text-md2-h5 text-md-text-high tabular-nums">座位号 {{ matched.seatNum }}</div>
            <div class="flex items-center gap-1.5 text-md2-body2 text-md-text-medium mt-1.5">
              <Icon name="room" size="xs" />
              <span class="truncate">{{ matchedRoomName }}</span>
            </div>
            <div class="flex items-center gap-1.5 text-md2-caption text-md-text-medium mt-1">
              <Icon name="clock" size="xs" />
              <span class="tabular-nums">{{ day }}　{{ startTime }} ~ {{ endTime }}</span>
            </div>
          </div>
          <div class="px-4 py-3 flex items-center justify-end gap-1.5">
            <button
              type="button"
              class="md-btn-text"
              :disabled="cooldown > 0 || matching || submitting"
              @click="match(true)"
            >
              {{ cooldown > 0 ? `换一个 (${cooldown}s)` : '换一个' }}
            </button>
            <button
              type="button"
              class="md-btn-filled"
              :disabled="submitting"
              @click="confirm"
            >
              <Icon v-if="submitting" name="refresh" size="sm" class="animate-spin" />
              {{ submitting ? '提交中…' : '确认' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 4b. 未匹配到 -->
      <Alert
        v-else-if="matchError"
        kind="warning"
        :text="matchError"
        action-text="重试"
        @action="match(false)"
      />
    </template>

    <LibraryTimeRangePicker
      v-if="pickingTime"
      :day="day"
      :initial-start-time="startTime"
      :initial-end-time="endTime"
      @close="pickingTime = false"
      @confirm="applyTimeRange"
    />

    <!-- 预约成功 -->
    <div v-if="successSeat" class="md-scrim flex items-center justify-center p-4" @click.self="successSeat = null">
      <div class="md-dialog rounded-md2-md w-full max-w-sm">
        <div class="md-dialog-header">
          <h3 class="md-dialog-title flex items-center gap-2">
            <Icon name="check-circle" size="md" class="text-md-success" />
            预约成功
          </h3>
        </div>
        <div class="md-dialog-body border-t border-md-card-border pt-4 space-y-1.5">
          <p class="text-md2-body2 text-md-text-high">阅览室：{{ matchedRoomName }}</p>
          <p class="text-md2-body2 text-md-text-high tabular-nums">座位号：{{ successSeat }}</p>
          <p class="text-md2-body2 text-md-text-high tabular-nums">日期：{{ day }}</p>
          <p class="text-md2-body2 text-md-text-high tabular-nums">时间：{{ startTime }} ~ {{ endTime }}</p>
          <p class="text-md2-caption text-md-text-medium pt-2">
            请在规定时间内完成签到，超时未签到将视为违规。
          </p>
        </div>
        <div class="md-dialog-actions border-t border-md-card-border">
          <button type="button" class="md-btn-filled" @click="finish">完成</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Icon from '../Icon.vue';
import PageHeader from '../ui/PageHeader.vue';
import SectionHeader from '../ui/SectionHeader.vue';
import Alert from '../ui/Alert.vue';
import LibraryTimeRangePicker from './LibraryTimeRangePicker.vue';
import {
  fetchLevels,
  fetchStartEndTime,
  fullRoomName,
  matchSeat,
  reserveLibrarySeat,
  type MatchedSeat,
} from '../../api/library';
import {
  defaultEndTime,
  defaultStartTime,
  durationText,
  formatDayLabel,
  initialReserveDay,
  resolveEffectiveDay,
} from '../../utils/library-time';

const emit = defineEmits<{ (e: 'back'): void; (e: 'done'): void }>();

const quickReserveTip = '按时间与位置偏好自动匹配空闲座位';

// ---------------------------------------------------------------------------
// 时段
// ---------------------------------------------------------------------------

const day = ref(initialReserveDay());
const startTime = ref('08:00');
const endTime = ref('10:00');
const pickingTime = ref(false);
const loadingConfig = ref(true);

const dayLabel = computed(() => formatDayLabel(day.value));
const duration = computed(() => durationText(startTime.value, endTime.value));

function applyTimeRange(value: { startTime: string; endTime: string }) {
  pickingTime.value = false;
  startTime.value = value.startTime;
  endTime.value = value.endTime;
  // 时段变了，之前的匹配结果作废
  matched.value = null;
  matchError.value = '';
}

function resetTimes() {
  const start = defaultStartTime(day.value) ?? '08:00';
  startTime.value = start;
  endTime.value = defaultEndTime(start) ?? '10:00';
}

// ---------------------------------------------------------------------------
// 位置偏好（楼层 → 阅览室）
// ---------------------------------------------------------------------------

const selectedFloor = ref<string | null>(null);
const selectedRoom = ref<string | null>(null);
const floors = ref<string[]>([]);
const roomOptions = ref<string[]>([]);
const loadingRooms = ref(false);
const firstLevel = ref('图书馆');

async function pickFloor(floor: string | null) {
  if (selectedFloor.value === floor) return;
  selectedFloor.value = floor;
  selectedRoom.value = null;
  roomOptions.value = [];
  matched.value = null;
  matchError.value = '';
  if (floor === null) return;

  loadingRooms.value = true;
  try {
    roomOptions.value = await fetchLevels({
      type: 2,
      firstLevelName: firstLevel.value,
      secondLevelName: floor,
    });
  } catch {
    roomOptions.value = [];
  } finally {
    loadingRooms.value = false;
  }
}

async function loadConfig() {
  loadingConfig.value = true;
  matched.value = null;
  matchError.value = '';
  try {
    // 1. 用服务器日期校正「今天」，并顺延已无可约时段的日期
    try {
      const server = await fetchStartEndTime();
      if (server.ymd) {
        const effective = resolveEffectiveDay(server.ymd);
        if (effective !== day.value) {
          day.value = effective;
          resetTimes();
        }
      }
    } catch {
      /* 服务器日期拿不到就沿用本地推算的日期 */
    }

    // 2. 一级分类（通常是「图书馆」）
    try {
      const firsts = await fetchLevels({ type: 0 });
      if (firsts.length > 0) firstLevel.value = firsts[0];
    } catch {
      /* 保持默认 */
    }

    // 3. 二级分类（楼层）
    try {
      floors.value = await fetchLevels({ type: 1, firstLevelName: firstLevel.value });
    } catch {
      floors.value = [];
    }
  } finally {
    loadingConfig.value = false;
  }
}

function reload() {
  selectedFloor.value = null;
  selectedRoom.value = null;
  roomOptions.value = [];
  resetTimes();
  void loadConfig();
}

// ---------------------------------------------------------------------------
// 匹配与确认
// ---------------------------------------------------------------------------

const matched = ref<MatchedSeat | null>(null);
const matchError = ref('');
const matching = ref(false);
const submitting = ref(false);
const submitNotice = ref<{ kind: 'success' | 'error' | 'warning'; text: string } | null>(null);
const successSeat = ref<string | null>(null);
const cooldown = ref(0);
let cooldownTimer: number | undefined;

const matchedRoomName = computed(() => (matched.value ? fullRoomName(matched.value) : ''));

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^.*?:\s*/, '').trim();
}

/** 原版「换一个」有 3 秒冷却，防止把服务器打到风控。 */
function startCooldown() {
  window.clearInterval(cooldownTimer);
  cooldown.value = 3;
  cooldownTimer = window.setInterval(() => {
    cooldown.value -= 1;
    if (cooldown.value <= 0) {
      window.clearInterval(cooldownTimer);
      cooldown.value = 0;
    }
  }, 1000);
}

async function match(isRematch: boolean) {
  if (matching.value || submitting.value) return;
  if (isRematch && cooldown.value > 0) return;

  matching.value = true;
  matchError.value = '';
  submitNotice.value = null;
  if (!isRematch) matched.value = null;

  try {
    const result = await matchSeat({
      startTime: startTime.value,
      endTime: endTime.value,
      firstLevelName: firstLevel.value,
      secondLevelName: selectedFloor.value ?? '',
      thirdLevelName: selectedRoom.value ?? '',
    });
    matched.value = result;
    startCooldown();
  } catch (error) {
    matched.value = null;
    matchError.value = errorText(error) || '暂无符合条件的空闲座位';
  } finally {
    matching.value = false;
  }
}

async function confirm() {
  const seat = matched.value;
  if (!seat) return;
  submitting.value = true;
  submitNotice.value = null;
  try {
    const res = await reserveLibrarySeat({
      roomId: seat.roomId,
      seatNum: seat.seatNum,
      day: day.value,
      startTime: startTime.value,
      endTime: endTime.value,
      isQuick: true,
      firstLevelName: seat.firstLevelName,
      secondLevelName: seat.secondLevelName,
      thirdLevelName: seat.thirdLevelName,
    });
    successSeat.value = res?.reserve?.seatNum || seat.seatNum;
    window.dispatchEvent(new CustomEvent('chilleast:library-changed'));
  } catch (error) {
    submitNotice.value = { kind: 'error', text: `预约失败：${errorText(error)}` };
  } finally {
    submitting.value = false;
  }
}

function finish() {
  successSeat.value = null;
  emit('done');
}

onMounted(() => {
  resetTimes();
  void loadConfig();
});

onUnmounted(() => window.clearInterval(cooldownTimer));
</script>
