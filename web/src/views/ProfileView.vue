<template>
  <!-- ===================================================================
       个人中心（对应 App 的 profile_screen.dart）
       用户信息区 + 设置分组 + 底部退出登录
       =================================================================== -->
  <div class="mx-auto max-w-2xl space-y-5">
    <!-- ============ 账号区：直接落在画布上，不包卡片 ============ -->
    <section class="flex items-center gap-4 pt-1">
      <!-- 大号圆形头像：姓名首字，品牌绿底白字 -->
      <span
        class="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-md-primary text-md2-metric leading-none text-white"
        aria-hidden="true"
      >
        {{ initial }}
      </span>

      <div class="min-w-0 flex-1">
        <h1 class="truncate text-md2-h5 text-md-text-high">{{ displayName }}</h1>
        <p class="mt-0.5 truncate font-mono text-md2-body2 text-md-text-medium">
          {{ student?.username || '未登录' }}
        </p>
        <span v-if="isLoggedIn" class="md-chip-success mt-2">
          <Icon name="check" size="xs" />
          已登录
        </span>
      </div>
    </section>

    <!-- ============ 设置分组：分组是独立单元，行间靠分割线 ============ -->
    <div class="md-settings-group">
      <SettingRow
        title="设置"
        icon="settings"
        clickable
        @click="$emit('navigate', 'settings')"
      />
      <SettingRow
        title="帮助与反馈"
        icon="help-circle"
        clickable
        @click="$emit('navigate', 'help')"
      />
      <SettingRow title="开始引导" icon="rocket" clickable @click="startGuide" />
      <SettingRow
        title="关于"
        icon="info"
        clickable
        @click="$emit('navigate', 'about')"
      />
    </div>

    <!-- 退出登录 -->
    <div class="md-settings-group">
      <SettingRow
        title="退出登录"
        icon="logout"
        danger
        clickable
        :disabled="!isLoggedIn"
        @click="confirmLogout"
      />
    </div>

    <!-- 退出确认（MD2 对话框） -->
    <div v-if="askLogout" class="md-scrim flex items-center justify-center p-4" @click.self="askLogout = false">
      <div class="md-dialog max-w-sm">
        <div class="md-dialog-header">
          <h3 class="md-dialog-title">确认退出</h3>
        </div>
        <div class="md-dialog-body">
          <p class="text-md2-body2 leading-relaxed text-md-text-medium">
            退出后将清除本机登录凭证。
          </p>
        </div>
        <div class="md-dialog-actions">
          <button class="md-btn-text" @click="askLogout = false">取消</button>
          <button class="md-btn-danger" @click="doLogout">退出</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import SettingRow from '@/components/ui/SettingRow.vue';
import type { StudentInfo } from '@/utils/storage';

const props = defineProps<{
  student: StudentInfo | null;
}>();

const emit = defineEmits<{
  (e: 'logout'): void;
  (e: 'navigate', tab: string): void;
}>();

const isLoggedIn = computed(() => Boolean(props.student?.username));

const displayName = computed(() => props.student?.realName?.trim() || '同学');

/** 头像取姓名首字，缺姓名时退到「东」 */
const initial = computed(() => displayName.value.slice(0, 1) || '东');

// ---------------------------------------------------------------------------
// 开始引导：进入 7 步配置向导（App 的 CloudSyncPromptScreen）
// ---------------------------------------------------------------------------
function startGuide() {
  emit('navigate', 'guide');
}

// ---------------------------------------------------------------------------
// 退出登录
// ---------------------------------------------------------------------------
const askLogout = ref(false);

function confirmLogout() {
  if (!isLoggedIn.value) return;
  askLogout.value = true;
}

function doLogout() {
  askLogout.value = false;
  emit('logout');
}
</script>
