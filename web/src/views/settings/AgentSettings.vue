<template>
  <!-- ===================================================================
       Agent 设置（对应原版 App 的 ai_settings_screen.dart）
       字段：接口地址 / API Key（可显隐、可粘贴）/ 模型 / 记忆管理
       底部：测试连接（自定义配置时）/ 保存配置 / 恢复默认
       =================================================================== -->
  <div class="space-y-4">
    <div class="md-settings-group p-4 space-y-3.5">
      <!-- 接口地址 -->
      <div>
        <label class="md-label" for="agent-url">接口地址</label>
        <input
          id="agent-url"
          v-model="form.apiUrl"
          type="url"
          class="md-field font-mono text-md2-caption"
          placeholder="https://api.example.com/v1/chat/completions"
          spellcheck="false"
        />
      </div>

      <!-- API Key -->
      <div>
        <label class="md-label" for="agent-key">API Key</label>
        <div class="relative">
          <input
            id="agent-key"
            v-model="form.apiKey"
            :type="keyVisible ? 'text' : 'password'"
            class="md-field font-mono text-md2-caption pr-20"
            placeholder="sk-…"
            spellcheck="false"
            autocomplete="off"
          />
          <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
            <button
              type="button"
              class="md-icon-btn-sm"
              :title="keyVisible ? '隐藏' : '显示'"
              @click="keyVisible = !keyVisible"
            >
              <Icon :name="keyVisible ? 'eye-off' : 'eye'" size="sm" />
            </button>
            <button
              type="button"
              class="md-icon-btn-sm"
              title="粘贴"
              @click="pasteKey"
            >
              <Icon name="clipboard" size="sm" />
            </button>
          </div>
        </div>
      </div>

      <!-- 模型 -->
      <div>
        <label class="md-label" for="agent-model">模型</label>
        <input
          id="agent-model"
          v-model="form.model"
          type="text"
          class="md-field font-mono text-md2-caption"
          placeholder="gpt-4o-mini"
          spellcheck="false"
        />
      </div>
    </div>

    <!-- 记忆管理入口 -->
    <div class="md-settings-group">
      <button
        type="button"
        class="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-md-surface-1 transition-colors duration-md2-short"
        @click="memoryOpen = !memoryOpen"
      >
        <span class="w-6 h-6 shrink-0 flex items-center justify-center text-md-text-medium">
          <Icon name="database" size="md" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-md2-body1 text-md-text-high">记忆管理</span>
          <span class="block text-md2-caption text-md-text-medium mt-0.5">
            {{ memories.length === 0 ? '暂无记忆条目' : `${memories.length} 条记忆` }}
          </span>
        </span>
        <Icon
          name="chevron-down"
          size="sm"
          class="text-md-text-hint shrink-0 transition-transform duration-md2-short"
          :class="memoryOpen ? '' : '-rotate-90'"
        />
      </button>

      <!-- 记忆条目：分组内的行，不再各自套描边盒 -->
      <div v-if="memoryOpen && memories.length > 0" class="px-4 pb-3 space-y-1.5">
        <div
          v-for="(m, i) in memories"
          :key="i"
          class="flex items-start gap-2 px-3 py-2 rounded-md2-sm bg-md-surface-1"
        >
          <span class="min-w-0 flex-1 text-md2-caption text-md-text-medium leading-relaxed break-words">
            {{ m }}
          </span>
          <button
            type="button"
            class="md-icon-btn-sm shrink-0 -my-1"
            title="删除"
            @click="removeMemory(i)"
          >
            <Icon name="trash" size="sm" />
          </button>
        </div>
      </div>
      <p v-else-if="memoryOpen" class="px-4 pb-3 text-md2-caption text-md-text-disabled">
        暂无记忆条目
      </p>
    </div>

    <!-- 操作区 -->
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-if="!isDefaultConfig"
        type="button"
        class="md-btn-outlined"
        :disabled="testing"
        @click="testConnection"
      >
        <Icon name="wifi" size="sm" :class="{ 'animate-pulse': testing }" />
        {{ testing ? '测试中…' : '测试连接' }}
      </button>

      <div class="flex-1" />

      <button type="button" class="md-btn-outlined" @click="resetDefaults">
        <Icon name="refresh" size="sm" />
        恢复默认
      </button>
      <button type="button" class="md-btn-filled" @click="save">
        <Icon name="check" size="sm" />
        保存配置
      </button>
    </div>

    <!-- 结果提示 -->
    <p v-if="hint" :class="['text-md2-caption px-1', hintError ? 'text-md-danger' : 'text-md-success']">
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import Icon from '@/components/Icon.vue';

/** 与 App 共用同一组持久化键 */
const KEY_URL = 'ai_api_url';
const KEY_TOKEN = 'ai_api_key';
const KEY_MODEL = 'ai_model';
const KEY_MEMORY = 'ai_memory_items';

const DEFAULT_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

const form = reactive({
  apiUrl: localStorage.getItem(KEY_URL) || DEFAULT_URL,
  apiKey: localStorage.getItem(KEY_TOKEN) || '',
  model: localStorage.getItem(KEY_MODEL) || DEFAULT_MODEL,
});

const keyVisible = ref(false);
const memoryOpen = ref(false);
const testing = ref(false);
const hint = ref('');
const hintError = ref(false);

const memories = ref<string[]>(readMemories());

function readMemories(): string[] {
  try {
    const raw = localStorage.getItem(KEY_MEMORY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.map((e) => (typeof e === 'string' ? e : String(e?.content ?? ''))).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

const isDefaultConfig = computed(
  () => form.apiUrl === DEFAULT_URL && !form.apiKey && form.model === DEFAULT_MODEL,
);

function flash(text: string, error = false) {
  hint.value = text;
  hintError.value = error;
  window.setTimeout(() => {
    hint.value = '';
  }, 2600);
}

async function pasteKey() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) form.apiKey = text.trim();
  } catch {
    flash('无法读取剪贴板', true);
  }
}

function removeMemory(index: number) {
  memories.value.splice(index, 1);
  localStorage.setItem(KEY_MEMORY, JSON.stringify(memories.value));
}

function save() {
  if (!form.apiKey.trim()) {
    flash('请先填写 API Key', true);
    return;
  }
  localStorage.setItem(KEY_URL, form.apiUrl.trim());
  localStorage.setItem(KEY_TOKEN, form.apiKey.trim());
  localStorage.setItem(KEY_MODEL, form.model.trim());
  flash('配置已保存');
}

function resetDefaults() {
  form.apiUrl = DEFAULT_URL;
  form.apiKey = '';
  form.model = DEFAULT_MODEL;
  localStorage.removeItem(KEY_URL);
  localStorage.removeItem(KEY_TOKEN);
  localStorage.removeItem(KEY_MODEL);
  flash('已恢复默认配置');
}

async function testConnection() {
  if (!form.apiKey.trim()) {
    flash('请先填写 API Key', true);
    return;
  }
  testing.value = true;
  const started = Date.now();
  try {
    const res = await fetch(form.apiUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${form.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: form.model.trim(),
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    flash(`连接正常，耗时 ${Date.now() - started} 毫秒`);
  } catch (e) {
    flash(`连接失败：${(e as Error).message}`, true);
  } finally {
    testing.value = false;
  }
}
</script>
