<template>
  <main class="login-page">
    <!-- 左：品牌区（墨绿点阵 + 浏阳河 + 标语），窄屏收成顶部横幅 -->
    <LoginBrandPanel />

    <!-- 右：Material 风格登录表单列 -->
    <section class="login-panel" aria-label="登录自在东湖">
      <div class="login-form-col">
        <div class="login-main">
          <h1 class="login-title">登录「自在东湖」网页版</h1>

          <form @submit.prevent="handleSubmit">
            <div class="field">
              <input
                id="login-oa-id"
                v-model="oaId"
                type="text"
                inputmode="numeric"
                autocomplete="username"
                required
              />
              <label for="login-oa-id">学号 / 工号</label>
            </div>

            <div class="field">
              <input
                id="login-oa-key"
                v-model="oaKey"
                type="password"
                autocomplete="current-password"
                required
              />
              <label for="login-oa-key">密码</label>
            </div>

            <!-- 报错：Material error container -->
            <div v-if="errorMsg" class="login-error" role="alert">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2 1 21h22L12 2zm0 6 6.5 11h-13L12 8zm-1 3v4h2v-4h-2zm0 5v2h2v-2h-2z"
                />
              </svg>
              <span>{{ errorMsg }}</span>
            </div>

            <div class="login-meta">
              <label class="login-check">
                <input v-model="rememberId" type="checkbox" />
                <span>记住学号</span>
              </label>
              <a
                class="login-link"
                href="https://sso.hunau.edu.cn"
                target="_blank"
                rel="noopener noreferrer"
              >
                忘记密码？
              </a>
            </div>

            <div class="login-actions">
              <button
                type="submit"
                :disabled="loading"
                :class="{ 'is-submitting': loading }"
              >
                <Icon v-if="loading" name="refresh" size="sm" class="animate-spin" />
                <span>{{ loading ? '验证中…' : '登录' }}</span>
              </button>
            </div>
          </form>

          <!-- 说明块：绝对定位在表单下方，表单块始终垂直居中 -->
          <details class="login-accordion">
            <summary>
              <span>安全说明</span>
              <span class="acc-hint">
                <span class="when-closed">展开</span>
                <span class="when-open">收起</span>
              </span>
              <span class="chev">&#9662;</span>
            </summary>
            <div class="acc-body">
              <p>不存储账号密码，登录凭证仅保存在本机浏览器。</p>
              <p>登录通过学校统一身份认证完成；退出登录后，本机保存的凭证会被清除。</p>
            </div>
          </details>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import LoginBrandPanel from '../components/login/LoginBrandPanel.vue';
import { login } from '../api/auth';

const emit = defineEmits<{
  (e: 'login-success'): void;
}>();

const oaId = ref('');
const oaKey = ref('');
const rememberId = ref(true);
const loading = ref(false);
const errorMsg = ref('');

onMounted(() => {
  const savedId = localStorage.getItem('chilleast_saved_id');
  if (savedId) {
    oaId.value = savedId;
  }
});

async function handleSubmit() {
  if (!oaId.value.trim() || !oaKey.value) return;

  loading.value = true;
  errorMsg.value = '';

  try {
    await login(oaId.value.trim(), oaKey.value);
    if (rememberId.value) {
      localStorage.setItem('chilleast_saved_id', oaId.value.trim());
    } else {
      localStorage.removeItem('chilleast_saved_id');
    }
    emit('login-success');
  } catch (err: any) {
    errorMsg.value = err?.message || '登录失败，请检查账号密码或学校认证服务状态';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/*
 * 视觉层参考 /home/soilzhu/code/chilleast-mcp 的 OAuth 登录页：
 * 整体左右 1:1 分栏，左侧品牌区、右侧 Material outlined 表单列。
 * 表单自身的配色沿用参考实现的 Material 取值（蓝色 accent），
 * 与品牌区的墨绿/蓝河形成同一套视觉语言。
 */
.login-page {
  --login-accent: #2583da;
  --login-accent-strong: #1c6cba;
  --login-accent-soft: rgba(37, 131, 218, 0.32);
  --login-ink: #000;
  --login-muted: #6b6b6b;
  --login-outline: #949494;
  --login-surface: #fff;
  --login-tint: rgba(127, 127, 127, 0.09);
  --login-error-bg: #f9dedc;
  --login-error-ink: #8c1d18;

  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--login-surface);
  color: var(--login-ink);
}

:global(.dark) .login-page {
  --login-ink: #e8eaed;
  --login-muted: #9aa0a6;
  --login-outline: #5f6368;
  --login-surface: #202124;
  --login-tint: rgba(255, 255, 255, 0.08);
  --login-error-bg: #371c1b;
  --login-error-ink: #f28b82;
}

/* ---- 右：表单列 ---- */
.login-panel {
  grid-column: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 48px 34px 66px;
  background: var(--login-surface);
}

.login-form-col {
  width: 100%;
  max-width: 732px;
  margin: 0 auto;
}

/* 说明块绝对定位，因此居中的只有表单这一块 */
.login-main {
  position: relative;
}

.login-title {
  margin: 0;
  font-size: clamp(28px, 2.5vw, 40px);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.02em;
  color: var(--login-ink);
  /* 窄屏折行时均衡分配，不把最后一个字甩到下一行 */
  text-wrap: balance;
}

.login-main > form {
  margin-top: 38px;
}

/* ---- 输入框：外框式（标签恒压在边框上） ---- */
.field {
  position: relative;
}

.field + .field {
  margin-top: 19px;
}

.field input {
  width: 100%;
  height: 52px;
  padding: 0 16px;
  font: inherit;
  font-size: 16px;
  color: var(--login-ink);
  background: var(--login-surface);
  border: 1px solid var(--login-outline);
  border-radius: 8px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.field input:hover {
  border-color: var(--login-ink);
}

.field input:focus {
  outline: none;
  border-color: var(--login-accent);
  box-shadow: inset 0 0 0 1px var(--login-accent);
}

.field label {
  position: absolute;
  top: 0;
  left: 10px;
  transform: translateY(-50%);
  padding: 0 5px;
  background: var(--login-surface);
  color: var(--login-outline);
  font-size: 15px;
  line-height: 1;
  pointer-events: none;
  transition: color 0.15s ease;
}

.field input:focus + label {
  color: var(--login-accent);
}

/* Chrome 自动填充：保持白底黑字，不出现黄底 */
.field input:-webkit-autofill {
  -webkit-text-fill-color: var(--login-ink);
  -webkit-box-shadow: 0 0 0 60px var(--login-surface) inset;
}

/* ---- 报错块 ---- */
.login-error {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--login-error-bg);
  color: var(--login-error-ink);
  font-size: 14px;
  line-height: 1.5;
}

.login-error svg {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  fill: currentColor;
}

/* ---- 记住学号 / 忘记密码 ---- */
.login-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 22px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--login-ink);
}

.login-check {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.login-check input {
  flex: none;
  width: 18px;
  height: 18px;
  margin: 0;
  cursor: pointer;
  accent-color: var(--login-accent);
}

.login-link {
  color: var(--login-accent);
  text-decoration: none;
  transition: color 0.15s ease;
}

.login-link:hover {
  color: var(--login-accent-strong);
  text-decoration: underline;
}

/* ---- 主按钮：右对齐、100×50 实心 ---- */
.login-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 40px;
}

.login-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 100px;
  height: 50px;
  padding: 0 22px;
  font: inherit;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: #fff;
  background: var(--login-accent);
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.login-actions button:hover {
  background: var(--login-accent-strong);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.24);
}

.login-actions button:active {
  box-shadow: none;
}

.login-actions button:focus-visible {
  outline: 3px solid var(--login-accent-soft);
  outline-offset: 2px;
}

.login-actions button:disabled,
.login-actions button.is-submitting {
  background: #949494 !important;
  color: rgba(255, 255, 255, 0.85) !important;
  border-color: transparent !important;
  box-shadow: none !important;
  cursor: not-allowed !important;
}

/* ---- 说明块：淡底折叠容器 ---- */
.login-accordion {
  margin-top: 26px;
  border-radius: 10px;
  background: var(--login-tint);
  font-size: 13px;
  line-height: 1.8;
  color: var(--login-muted);
}

/* 登录页：说明块固定在表单正下方，不参与居中 */
.login-main > .login-accordion {
  position: absolute;
  top: calc(100% + 26px);
  left: 0;
  right: 0;
  margin: 0;
}

.login-accordion > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  cursor: pointer;
  list-style: none;
  font-size: 14px;
  font-weight: 600;
  color: var(--login-ink);
}

.login-accordion > summary::-webkit-details-marker {
  display: none;
}

.login-accordion > summary:focus-visible {
  outline: 3px solid var(--login-accent-soft);
  outline-offset: -3px;
  border-radius: 10px;
}

.acc-hint {
  margin-left: auto;
  font-size: 13px;
  font-weight: 400;
  color: var(--login-muted);
}

.chev {
  display: inline-block;
  font-size: 11px;
  color: var(--login-muted);
  transition: transform 0.15s ease;
}

.login-accordion[open] .chev {
  transform: rotate(180deg);
}

.when-open {
  display: none;
}

.login-accordion[open] .when-open {
  display: inline;
}

.login-accordion[open] .when-closed {
  display: none;
}

.acc-body {
  padding: 0 18px 16px;
}

.acc-body p {
  margin: 0;
}

.acc-body p + p {
  margin-top: 8px;
}

/* ---- 窄屏：品牌区收成顶部一条，表单铺满 ---- */
@media (max-width: 880px) {
  .login-page {
    grid-template-columns: 1fr;
    grid-template-rows: 190px auto;
  }

  .login-panel {
    grid-column: 1;
    justify-content: flex-start;
    padding: 36px 22px 48px;
  }

  .login-actions {
    margin-top: 32px;
  }

  .login-actions button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-page *,
  .login-page *::before,
  .login-page *::after {
    transition: none !important;
  }
}
</style>
