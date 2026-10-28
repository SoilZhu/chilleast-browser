<template>
  <!-- ===================================================================
       小组件设置（对应原版 App 的 widgetSettings / button_reorder_screen 的 widget 类型）
       App 的小组件是 Android 桌面组件，网页版没有对应载体；
       这里只说明它由「首页快捷入口」共用同一份配置，并提供跳转。
       =================================================================== -->
  <div class="space-y-4">
    <!-- 说明区：裸排版，不包卡片 -->
    <div class="flex items-start gap-3 px-1">
      <span
        class="w-9 h-9 rounded-md2-md flex items-center justify-center shrink-0"
        style="background-color: #09C48918; color: #09C489"
      >
        <Icon name="widgets" size="sm" />
      </span>
      <div class="min-w-0">
        <div class="text-md2-subtitle2 text-md-text-high">仅手机端可用</div>
        <p class="text-md2-body2 text-md-text-medium mt-1 leading-relaxed">
          桌面小组件需要从手机桌面添加。网页版的快捷入口与它共用同一份配置。
        </p>
      </div>
    </div>

    <!-- 快捷功能槽位 -->
    <div class="md-settings-group">
      <SettingRow
        title="快捷功能"
        icon="apps"
        :value="`${visibleHomeCount} 个已选`"
        @click="goHomeButtons"
      />
    </div>

    <!-- 添加方式：说明文字落画布，不额外包卡片 -->
    <div class="px-1">
      <div class="text-md2-overline uppercase text-md-text-disabled mb-1.5">手机添加方式</div>
      <p class="text-md2-body2 text-md-text-medium leading-relaxed">
        回到手机桌面，长按空白处添加「今日日程」「快捷功能」「日程 + 快捷」小组件。
      </p>
    </div>

    <p class="text-md2-caption text-md-text-disabled px-1">
      快捷入口的顺序与显隐与「首页按钮排序与隐藏」保持一致
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@/components/Icon.vue';
import SettingRow from '@/components/ui/SettingRow.vue';
import { appearance } from '@/stores/appearance';

const emit = defineEmits<{ (e: 'open-home-buttons'): void }>();

/** 首页当前已勾选的功能数（App 的小组件最多显示 4 个） */
const visibleHomeCount = computed(() => appearance.home.filter((e) => e.visible).length);

function goHomeButtons() {
  emit('open-home-buttons');
}
</script>
