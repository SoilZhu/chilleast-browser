<template>
  <!-- ===================================================================
       帮助与反馈（对应原版 App 的 help_feedback_screen.dart）
       - 发送邮件（预填主题）
       - GitHub 主页
       - 开发者署名
       =================================================================== -->
  <div class="max-w-2xl">
    <PageHeader title="帮助与反馈" subtitle="问题反馈与联系方式" />

    <nav class="md-settings-group mt-5">
      <SettingRow title="发送邮件" :subtitle="EMAIL" icon="mail" @click="sendMail" />
      <SettingRow title="GitHub" subtitle="github.com/SoilZhu" icon="github" @click="openGithub" />
    </nav>

    <!-- 开发者：画布上的裸标题 + 内容，不包卡片 -->
    <div class="mt-6 px-1">
      <div class="text-md2-overline uppercase text-md-text-disabled">开发者</div>
      <p class="mt-1.5 text-md2-subtitle2 text-md-text-high">SoilZhu</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/ui/PageHeader.vue';
import SettingRow from '@/components/ui/SettingRow.vue';

const EMAIL = 'soilzhu80@gmail.com';
const GITHUB_URL = 'https://github.com/SoilZhu';

/** 邮件主题沿用 App 的 feedbackEmailSubject */
function sendMail() {
  window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent('自在东湖 App 反馈')}`;
}

function openGithub() {
  window.open(GITHUB_URL, '_blank', 'noopener,noreferrer');
}
</script>
