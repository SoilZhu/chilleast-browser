<template>
  <!-- ===================================================================
       选择阅览室（对应原版 library_room_screen.dart）
       -------------------------------------------------------------------
       原版结构：AppBar（快速预约 + 刷新）→ 日期 chip 栏 → 楼层 chip 栏 → 阅览室卡片列表。
       点一张卡片时先弹出时段选择，再把「日期 + 时段」带进座位图页面。
       网页端保持同一顺序，卡片改为分组里的行（符合 MD2 表面层级）。
       =================================================================== -->
  <div class="space-y-4">
    <PageHeader
      title="选择阅览室"
      :subtitle="rooms.length ? `${rooms.length} 间阅览室` : ''"
      back
      @back="$emit('back')"
    >
      <template #actions>
        <button class="md-icon-btn" title="快速预约" @click="$emit('open-quick')">
          <Icon name="zap" size="md" />
        </button>
        <button class="md-icon-btn" title="刷新" :disabled="loading" @click="reload">
          <Icon name="refresh" size="md" :class="{ 'animate-spin': loading }" />
        </button>
      </template>
    </PageHeader>

    <!-- 1. 日期 chip 栏（22:00 后才会多出「明天」） -->
    <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
      <button
        v-for="day in availableDays"
        :key="day"
        type="button"
        :class="day === selectedDay ? 'md-chip-filter-active' : 'md-chip-filter'"
        class="shrink-0"
        @click="pickDay(day)"
      >
        {{ formatDayLabel(day) }}
      </button>
    </div>

    <!-- 2. 楼层 chip 栏（只有一层时不显示，与原版一致） -->
    <div v-if="floors.length > 1" class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
      <button
        type="button"
        :class="selectedFloor === null ? 'md-chip-filter-active' : 'md-chip-filter'"
        class="shrink-0"
        @click="selectedFloor = null"
      >
        全部
      </button>
      <button
        v-for="floor in floors"
        :key="floor"
        type="button"
        :class="selectedFloor === floor ? 'md-chip-filter-active' : 'md-chip-filter'"
        class="shrink-0"
        @click="selectedFloor = selectedFloor === floor ? null : floor"
      >
        {{ floor }}
      </button>
    </div>

    <!-- 3. 阅览室列表 -->
    <div v-if="loading && rooms.length === 0" class="space-y-3 py-6">
      <div v-for="i in 5" :key="i" class="space-y-1.5">
        <div class="md-skeleton h-4 w-40" />
        <div class="md-skeleton h-3 w-28" />
      </div>
    </div>

    <EmptyState
      v-else-if="loadError"
      :text="loadError"
      icon="room"
      error
      retry-text="重试"
      @retry="reload"
    />

    <EmptyState
      v-else-if="filteredRooms.length === 0"
      text="暂无符合条件的阅览室"
      icon="room"
      compact
    />

    <div v-else class="md-group">
      <button
        v-for="room in filteredRooms"
        :key="room.id"
        type="button"
        class="md-row items-center gap-3 py-3.5 text-left"
        @click="pickRoom(room)"
      >
        <span class="w-10 h-10 rounded-md2-md bg-brand-50 text-md-primary flex items-center justify-center shrink-0">
          <Icon name="room" size="md" />
        </span>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-md2-subtitle2 text-md-text-high truncate">{{ roomDisplayName(room) }}</span>
            <span v-if="room.secondLevelName" class="md-chip-info shrink-0">{{ room.secondLevelName }}</span>
          </div>
          <div class="text-md2-caption text-md-text-medium mt-1 flex items-center gap-1">
            <Icon name="event-seat" size="xs" />
            <span class="tabular-nums">总座位数：{{ room.capacity }}</span>
            <span class="mx-0.5">·</span>
            <Icon name="clock" size="xs" />
            <span class="tabular-nums">{{ OPEN_HOURS }}</span>
          </div>
        </div>

        <Icon name="chevron-right" size="sm" class="text-md-text-hint shrink-0" />
      </button>
    </div>

    <!-- 时段选择（选完才进入座位图） -->
    <LibraryTimeRangePicker
      v-if="pendingRoom"
      :day="selectedDay"
      :initial-start-time="lastStartTime"
      :initial-end-time="lastEndTime"
      @close="pendingRoom = null"
      @confirm="enterSeatMap"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
import PageHeader from '../ui/PageHeader.vue';
import EmptyState from '../ui/EmptyState.vue';
import LibraryTimeRangePicker from './LibraryTimeRangePicker.vue';
import {
  fetchLibraryRooms,
  roomDisplayName,
  type LibraryRoom,
} from '../../api/library';
import {
  OPENING_HOUR,
  CLOSING_HOUR,
  availableReserveDays,
  formatDayLabel,
  initialReserveDay,
} from '../../utils/library-time';

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'open-quick'): void;
  (
    e: 'open-seat',
    value: { room: LibraryRoom; day: string; startTime: string; endTime: string },
  ): void;
}>();

const OPEN_HOURS = `${String(OPENING_HOUR).padStart(2, '0')}:00 - ${String(CLOSING_HOUR).padStart(2, '0')}:00`;

// ---------------------------------------------------------------------------
// 日期
// ---------------------------------------------------------------------------

const availableDays = computed(() => availableReserveDays());
const selectedDay = ref(initialReserveDay());

const rooms = ref<LibraryRoom[]>([]);
const loading = ref(false);
const loadError = ref('');
const selectedFloor = ref<string | null>(null);

/** 记住上一次选的时段，回到列表再点时作为默认值（与原版 _selectedStartTime 一致）。 */
const lastStartTime = ref<string | null>(null);
const lastEndTime = ref<string | null>(null);
const pendingRoom = ref<LibraryRoom | null>(null);

const floors = computed(() => {
  const set = new Set<string>();
  for (const room of rooms.value) {
    if (room.secondLevelName) set.add(room.secondLevelName);
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
});

const filteredRooms = computed(() =>
  selectedFloor.value === null
    ? rooms.value
    : rooms.value.filter((room) => room.secondLevelName === selectedFloor.value),
);

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^.*?:\s*/, '').trim();
}

async function loadRooms() {
  loading.value = true;
  loadError.value = '';
  try {
    rooms.value = await fetchLibraryRooms(selectedDay.value);
  } catch (error) {
    rooms.value = [];
    loadError.value = errorText(error) || '加载失败，请检查网络后重试';
  } finally {
    loading.value = false;
  }
}

function reload() {
  const days = availableReserveDays();
  if (!days.includes(selectedDay.value)) {
    selectedDay.value = initialReserveDay();
    lastStartTime.value = null;
    lastEndTime.value = null;
  }
  void loadRooms();
}

function pickDay(day: string) {
  if (day === selectedDay.value) return;
  selectedDay.value = day;
  lastStartTime.value = null;
  lastEndTime.value = null;
  void loadRooms();
}

function pickRoom(room: LibraryRoom) {
  pendingRoom.value = room;
}

function enterSeatMap(value: { startTime: string; endTime: string }) {
  const room = pendingRoom.value;
  if (!room) return;
  lastStartTime.value = value.startTime;
  lastEndTime.value = value.endTime;
  pendingRoom.value = null;
  emit('open-seat', {
    room,
    day: selectedDay.value,
    startTime: value.startTime,
    endTime: value.endTime,
  });
}

onMounted(loadRooms);
</script>
