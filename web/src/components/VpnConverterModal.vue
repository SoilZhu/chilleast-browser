<template>
  <div class="md-scrim flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="md-dialog max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col">
      <!-- 标题栏 -->
      <div class="md-dialog-header shrink-0">
        <div class="flex items-start gap-3">
          <div
            class="w-10 h-10 rounded-full bg-brand-50 text-md-primary flex items-center justify-center shrink-0"
          >
            <Icon name="vpn" size="sm" />
          </div>
          <div>
            <h3 class="md-dialog-title">VPN 转换</h3>
            <p class="text-md2-caption text-md-text-medium">校外访问校内站点</p>
          </div>
        </div>
        <button class="md-icon-btn-sm -mt-1 -mr-1" @click="$emit('close')">
          <Icon name="close" size="sm" />
        </button>
      </div>

      <!-- 主体内容 -->
      <div class="md-dialog-body flex-1 overflow-y-auto no-scrollbar space-y-4">
        <!-- 说明横幅 -->
        <div
          class="md-feed-block flex items-start gap-2.5 p-3 text-md2-caption text-md-text-medium"
        >
          <Icon name="shield" size="sm" class="shrink-0 text-md-primary mt-0.5" />
          <p class="leading-relaxed">粘贴校内网址，自动生成校外可访问地址</p>
        </div>

        <!-- 原始链接输入框 -->
        <div>
          <label class="md-label" for="vpn-input-url">校内网址</label>
          <div class="relative">
            <input
              id="vpn-input-url"
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
            class="md-field font-mono break-all select-all cursor-text"
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

      <!-- 操作按钮 -->
      <div class="md-dialog-actions shrink-0 border-t border-md-card-border">
        <button class="md-btn-text" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Icon from './Icon.vue';
import { convertToWebVpnUrl } from '../utils/vpn';

defineEmits<{
  (e: 'close'): void;
}>();

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
