<template>
  <!-- ===================================================================
       关于（对应原版 App 的 about_screen.dart）
       - 品牌标记 + 应用名 + 版本号
       - 访问官网 / 检查更新 / 开源许可
       =================================================================== -->
  <div class="max-w-2xl">
    <PageHeader title="关于" subtitle="版本与开源信息" />

    <!-- ============ 品牌区：画布上的排版，不包卡片 ============ -->
    <section class="mt-5 flex items-center gap-5">
      <img
        src="/brand/mark-light.png"
        alt=""
        class="h-20 w-auto shrink-0 select-none"
        draggable="false"
        aria-hidden="true"
      />

      <div class="min-w-0">
        <h2 class="text-md2-h5 text-md-text-high leading-tight">自在东湖</h2>
        <p class="text-md2-body2 text-md-text-medium mt-1 tabular-nums">v{{ VERSION }}</p>
      </div>
    </section>

    <p class="mt-5 text-md2-body2 text-md-text-medium leading-relaxed">
      湖南农业大学校园服务第三方客户端。
    </p>

    <!-- ============ 信息分组 ============ -->
    <nav class="md-settings-group mt-5">
      <!-- PWA 安装入口 -->
      <SettingRow
        v-if="canInstall"
        title="安装为应用"
        subtitle="添加到桌面或主屏幕，离线秒开"
        icon="download"
        @click="triggerInstall"
      />
      <SettingRow
        v-else-if="isInstalled"
        title="应用模式"
        subtitle="当前已作为独立 PWA 应用运行"
        icon="apps"
      />
      <SettingRow
        v-else-if="isIos"
        title="添加到主屏幕"
        subtitle="点击 Safari「分享」按钮选择「添加到主屏幕」"
        icon="download"
        @click="showIosTip"
      />

      <SettingRow title="访问官网" subtitle="chilleast.soilzhu.su" icon="globe" @click="openSite" />
      <SettingRow title="检查更新" subtitle="查看是否有新版本" icon="refresh-cw" @click="checkUpdate" />
      <SettingRow title="开源声明" subtitle="查看第三方组件" icon="code" @click="licensesOpen = true" />
    </nav>

    <!-- 检查更新结果 -->
    <p v-if="updateTip" class="text-md2-caption text-md-text-medium px-1 mt-3">{{ updateTip }}</p>

    <!-- 开源许可 -->
    <div
      v-if="licensesOpen"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="licensesOpen = false"
    >
      <div class="md-dialog max-w-lg max-h-[80vh] flex flex-col">
        <div class="md-dialog-header shrink-0">
          <h3 class="md-dialog-title">开源声明</h3>
          <button class="md-icon-btn-sm -mr-2 shrink-0" title="关闭" @click="licensesOpen = false">
            <Icon name="close" size="sm" />
          </button>
        </div>
        <div class="md-dialog-body flex-1 overflow-y-auto no-scrollbar space-y-2">
          <p v-for="item in LICENSES" :key="item.name" class="flex items-baseline justify-between gap-4">
            <span class="text-md-text-high">{{ item.name }}</span>
            <span class="text-md2-caption text-md-text-medium shrink-0">{{ item.license }}</span>
          </p>
        </div>
        <div class="md-dialog-actions shrink-0 border-t border-md-card-border">
          <button class="md-btn-text" @click="licensesOpen = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Icon from '@/components/Icon.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SettingRow from '@/components/ui/SettingRow.vue';
import { usePwaInstall } from '@/composables/usePwaInstall';

const VERSION = '1.0.0';
const SITE_URL = 'https://chilleast.soilzhu.su';

const { canInstall, isInstalled, isIos, triggerInstall } = usePwaInstall();

/** 直接依赖的第三方组件（与 package.json 一致） */
const LICENSES: { name: string; license: string }[] = [
  { name: 'Vue 3', license: 'MIT' },
  { name: 'Vite', license: 'MIT' },
  { name: 'Tailwind CSS', license: 'MIT' },
  { name: 'TypeScript', license: 'Apache-2.0' },
];

const updateTip = ref('');
const licensesOpen = ref(false);

function showIosTip() {
  updateTip.value = 'iOS Safari 用户请轻触底部「分享」按钮，随后选择「添加到主屏幕」即可安装。';
  window.setTimeout(() => {
    updateTip.value = '';
  }, 5000);
}

function openSite() {
  window.open(SITE_URL, '_blank', 'noopener,noreferrer');
}

/** 网页版随页面刷新自动取最新版本，这里只做版本核对 */
function checkUpdate() {
  updateTip.value = `当前为最新版本 v${VERSION}`;
  window.setTimeout(() => {
    updateTip.value = '';
  }, 3000);
}
</script>
