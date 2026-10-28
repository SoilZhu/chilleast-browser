<template>
  <div class="space-y-4 max-w-3xl">
    <!-- PC 端标题（手机端在全局返回顶栏展示） -->
    <div class="hidden md:block">
      <PageHeader
        title="VPN 转换"
        subtitle="校外访问校内站点"
        icon="vpn"
        icon-color="#607d8b"
      />
    </div>

    <div class="bg-white rounded-md2-lg md:border md:border-md-card-border p-4 sm:p-6 space-y-5">
      <!-- 说明横幅 -->
      <div class="md-feed-block flex items-start gap-2.5 p-3 text-md2-caption text-md-text-medium">
        <Icon name="shield" size="sm" class="shrink-0 text-md-primary mt-0.5" />
        <p class="leading-relaxed">粘贴校内网址，自动生成校外可访问的 WebVPN 地址</p>
      </div>

      <!-- 原始链接输入框 -->
      <div>
        <label class="md-label" for="vpn-view-url">校内网址</label>
        <div class="relative">
          <input
            id="vpn-view-url"
            v-model="inputUrl"
            type="text"
            placeholder="例如：https://jwxt.hunau.edu.cn/jsxsd/"
            class="md-field pr-9 font-mono"
            @input="handleConvert"
          />
          <button
            v-if="inputUrl"
            class="md-icon-btn-sm absolute right-1 top-1/2 -translate-y-1/2"
            title="清空"
            @click="inputUrl = ''; convertedUrl = ''"
          >
            <Icon name="close" size="xs" />
          </button>
        </div>
      </div>

      <!-- 常用校内快捷预设 -->
      <div>
        <span class="md-label">常用站点</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="p in presets"
            :key="p.name"
            :class="inputUrl === p.url ? 'md-chip-filter-active' : 'md-chip-filter'"
            @click="applyPreset(p.url)"
          >
            {{ p.name }}
          </button>
        </div>
      </div>

      <!-- 转换后结果 -->
      <div v-if="convertedUrl" class="space-y-2">
        <span class="md-label">转换结果</span>
        <div
          class="md-field font-mono break-all select-all cursor-text bg-md-surface-1"
          tabindex="0"
        >
          {{ convertedUrl }}
        </div>
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <button class="md-btn-outlined" @click="copyUrl">
            <Icon :name="copied ? 'check' : 'copy'" size="sm" />
            <span>{{ copied ? '已复制到剪贴板' : '复制网址' }}</span>
          </button>
          <a
            :href="convertedUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="md-btn-filled"
          >
            <Icon name="external-link" size="sm" />
            <span>在新标签页打开</span>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { convertToWebVpnUrl } from '../utils/vpn';

const inputUrl = ref('https://jwxt.hunau.edu.cn/jsxsd/');
const convertedUrl = ref(convertToWebVpnUrl(inputUrl.value));
const copied = ref(false);

const presets = [
  { name: '新版教务系统', url: 'https://jwxt.hunau.edu.cn/jsxsd/' },
  { name: '办事大厅', url: 'https://ehall.hunau.edu.cn/' },
  { name: '财务综合平台', url: 'http://fin-serv.hunau.edu.cn/' },
  { name: '数字图书馆', url: 'http://lib.hunau.edu.cn/' },
  { name: '学工系统 (WAP)', url: 'https://xgxt.hunau.edu.cn/wap/main/welcome' },
];

function handleConvert() {
  if (!inputUrl.value) {
    convertedUrl.value = '';
    return;
  }
  convertedUrl.value = convertToWebVpnUrl(inputUrl.value);
}

function applyPreset(url: string) {
  inputUrl.value = url;
  handleConvert();
}

async function copyUrl() {
  if (!convertedUrl.value) return;
  try {
    await navigator.clipboard.writeText(convertedUrl.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('复制失败', err);
  }
}
</script>
