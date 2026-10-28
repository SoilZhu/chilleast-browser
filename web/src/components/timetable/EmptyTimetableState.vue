<template>
  <!-- ===================================================================
       课表空状态组件（对应原版 App 的 empty_timetable_state.dart）
       - 自动同步中：显示日历图标 + "正在同步全学期课表..." + 进度环
       - 自动同步关闭：显示断开图标 + "暂无本地课表" + 提示点击手动同步
       - 自动同步开启但未同步/失败：显示 "暂无本地课表" + 手动同步按钮
       =================================================================== -->
  <div class="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div
      class="w-24 h-24 rounded-full flex items-center justify-center mb-6 bg-md-primary/10 text-md-primary transition-colors"
    >
      <Icon
        :name="showLoading ? 'calendar' : (autoSyncEnabled ? 'calendar' : 'cloud')"
        size="xl"
        class="text-4xl text-md-primary"
      />
    </div>

    <h3 class="text-xl font-bold text-md-text-primary mb-2">
      {{ showLoading ? '正在同步全学期课表...' : '暂无本地课表' }}
    </h3>

    <p class="text-sm text-md-text-secondary max-w-sm mb-6 leading-relaxed">
      {{
        showLoading
          ? '课程安排正在从教务系统导入并校准，请稍候...'
          : autoSyncEnabled
          ? '检测到本地暂无缓存课表。点击下方按钮从教务系统同步课表。'
          : '自动同步已关闭。点击下方按钮可手动同步课表并保存在本地。'
      }}
    </p>

    <!-- 加载转圈 -->
    <div v-if="showLoading" class="flex items-center justify-center my-2">
      <div
        class="w-6 h-6 border-2 border-md-primary border-t-transparent rounded-full animate-spin"
        role="status"
        aria-label="正在同步"
      />
    </div>

    <!-- 手动同步操作按钮 -->
    <button
      v-else
      type="button"
      class="md-btn-filled inline-flex items-center gap-2 px-5 py-2.5 rounded-full"
      @click="emit('refresh')"
    >
      <Icon name="refresh" size="sm" />
      <span>{{ autoSyncEnabled ? '从教务同步课表' : '手动同步课表' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@/components/Icon.vue';

const props = withDefaults(
  defineProps<{
    autoSyncEnabled?: boolean;
    isSyncing?: boolean;
  }>(),
  {
    autoSyncEnabled: true,
    isSyncing: false,
  },
);

const emit = defineEmits<{
  (e: 'refresh'): void;
}>();

const showLoading = computed(() => props.autoSyncEnabled && props.isSyncing);
</script>
