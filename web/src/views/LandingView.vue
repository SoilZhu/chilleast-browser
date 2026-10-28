<template>
  <!-- ===================================================================
       官网介绍页（站点根路径 `/`）
       ------------------------------------------------------------------
       定位：面向「第一次听说自在东湖」的访客 —— 是什么、能做什么、怎么进。
       不是功能页：登录后的功能导航仍在 `/web/`，本页只负责介绍与入口。

       排版约束（见 DESIGN.md）：全部走 MD2 token，画布落标题与正文，
       分组用 .md-group，卡片只用 .md-card。不写死任何统计数字，
       不使用营销词，文案密度向 App 看齐（见 COPY.md）。
       =================================================================== -->
  <div class="min-h-screen min-h-[100dvh] bg-md-background text-md-text-high antialiased">
    <!-- ============ 顶栏：品牌 + 导航 ============ -->
    <header class="sticky top-0 z-30 bg-md-background/95 backdrop-blur border-b border-md-card-border">
      <div class="mx-auto max-w-5xl h-16 px-4 sm:px-6 flex items-center gap-3">
        <a href="./" class="flex items-center gap-2.5 min-w-0">
          <img
            src="/brand/mark-light.png"
            alt=""
            class="h-8 w-auto shrink-0 select-none"
            draggable="false"
            aria-hidden="true"
          />
          <span class="text-md2-subtitle1 text-md-text-high truncate">自在东湖</span>
        </a>

        <nav class="ml-auto flex items-center gap-1" aria-label="页面导航">
          <a href="#features" class="hidden sm:inline-flex md-btn-text">功能</a>
          <a href="#notes" class="hidden sm:inline-flex md-btn-text">说明</a>
          <a href="./web/" class="md-btn-filled h-9">进入网页版</a>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 sm:px-6 pb-16">
      <!-- ============ 首屏 ============ -->
      <section class="pt-12 sm:pt-16">
        <p class="text-md2-overline uppercase text-md-primary tracking-widest">湖南农业大学 · 校园服务</p>

        <h1 class="mt-3 text-md2-h4 text-md-text-high leading-tight">自在东湖</h1>

        <p class="mt-3 max-w-2xl text-md2-body1 text-md-text-medium leading-relaxed">
          把课表、成绩、图书馆、电费这些每天都要用到的东西放在一个地方，
          打开就能看，不用在几个系统之间来回找。
        </p>

        <div class="mt-7 flex flex-wrap items-center gap-3">
          <a href="./web/" class="md-btn-filled h-10 px-6">
            <Icon name="rocket" size="sm" />
            <span>进入网页版</span>
          </a>
          <a href="#features" class="md-btn-outlined h-10 px-5">查看功能</a>
        </div>

        <p class="mt-3 text-md2-caption text-md-text-medium">
          使用统一身份认证账号登录，登录凭证只保存在你自己的浏览器里。
        </p>
      </section>

      <!-- ============ 功能总览 ============ -->
      <section id="features" class="mt-14 scroll-mt-20">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="md-section-title text-md2-subtitle1">
            <Icon name="dashboard" size="sm" class="text-md-primary" />
            <span>功能</span>
          </h2>
          <p class="text-md2-caption text-md-text-medium">按用途分组</p>
        </div>

        <div class="mt-3 grid gap-4 sm:grid-cols-2">
          <div v-for="group in GROUPS" :key="group.name" class="md-card p-4">
            <div class="flex items-center gap-2">
              <!-- 分组色只用于图标与圆点，作为单一强调点，不做色块背景 -->
              <span :style="{ color: group.color }" class="flex items-center">
                <Icon :name="group.icon" size="sm" />
              </span>
              <h3 class="text-md2-subtitle2 text-md-text-high">{{ group.name }}</h3>
            </div>

            <ul class="mt-3 space-y-2.5">
              <li
                v-for="item in group.items"
                :key="item.name"
                class="flex items-start gap-2.5"
              >
                <span
                  class="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                  :style="{ backgroundColor: group.color }"
                  aria-hidden="true"
                />
                <div class="min-w-0">
                  <p class="text-md2-body2 text-md-text-high leading-tight">{{ item.name }}</p>
                  <p class="text-md2-caption text-md-text-medium mt-0.5">{{ item.desc }}</p>
                </div>
              </li>
            </ul>

            <p v-if="group.note" class="mt-3 pt-3 border-t border-md-card-border text-md2-caption text-md-text-medium">
              {{ group.note }}
            </p>
          </div>
        </div>
      </section>

      <!-- ============ 日常使用场景 ============ -->
      <section class="mt-14">
        <h2 class="md-section-title text-md2-subtitle1">
          <Icon name="star" size="sm" class="text-md-primary" />
          <span>日常怎么用</span>
        </h2>

        <div class="md-group mt-3">
          <div v-for="(step, i) in STEPS" :key="step.title" class="flex items-start gap-3.5 px-4 py-3.5">
            <span
              class="mt-0.5 w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[12px] font-medium tabular-nums bg-brand-50 text-md-primary"
            >{{ i + 1 }}</span>
            <div class="min-w-0">
              <p class="text-md2-subtitle2 text-md-text-high">{{ step.title }}</p>
              <p class="text-md2-body2 text-md-text-medium mt-0.5 leading-relaxed">{{ step.desc }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ 说明 ============ -->
      <section id="notes" class="mt-14 scroll-mt-20">
        <h2 class="md-section-title text-md2-subtitle1">
          <Icon name="info" size="sm" class="text-md-primary" />
          <span>说明</span>
        </h2>

        <div class="md-group mt-3">
          <div v-for="note in NOTES" :key="note.title" class="flex items-start gap-3 px-4 py-3.5">
            <Icon :name="note.icon" size="sm" class="mt-0.5 shrink-0 text-md-text-medium" />
            <div class="min-w-0">
              <p class="text-md2-subtitle2 text-md-text-high">{{ note.title }}</p>
              <p class="text-md2-body2 text-md-text-medium mt-0.5 leading-relaxed">{{ note.desc }}</p>
            </div>
          </div>
        </div>

        <!-- 网页版与手机端的取舍，写在页面上而不是藏起来 -->
        <p class="mt-3 text-md2-caption text-md-text-medium leading-relaxed">
          校园卡充值和需要跳转外部站点的入口不在网页版提供。
        </p>
      </section>

      <!-- ============ 结尾入口 ============ -->
      <section class="mt-14">
        <div class="md-group p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div class="min-w-0 flex-1">
            <p class="text-md2-h6 text-md-text-high">准备好就开始用吧</p>
            <p class="text-md2-body2 text-md-text-medium mt-1">
              用统一身份认证账号登录，课表与成绩会自动同步到本机。
            </p>
          </div>
          <a href="./web/" class="md-btn-filled h-10 px-6 shrink-0">进入网页版</a>
        </div>
      </section>
    </main>

    <!-- ============ 页脚 ============ -->
    <footer class="border-t border-md-card-border">
      <div class="mx-auto max-w-5xl px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center gap-2 text-md2-caption text-md-text-medium">
        <p>自在东湖 · 校园服务</p>
        <p class="sm:ml-auto">第三方客户端，与学校官方无关</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';

/**
 * 功能分组与项目 —— 数据源是 `src/utils/functions.ts`（登录后的功能页），
 * 本页只按分组重排成介绍用的两列，不引入新的功能定义。
 * `note` 用于说明该组在网页版的取舍，没有就不写。
 */
interface LandingItem {
  name: string;
  desc: string;
}

interface LandingGroup {
  name: string;
  icon: string;
  /** Material 600 档强调色，与功能页分组色一致 */
  color: string;
  note?: string;
  items: LandingItem[];
}

const GROUPS: LandingGroup[] = [
  {
    name: '学习',
    icon: 'book',
    color: '#1a73e8',
    items: [
      { name: '课表', desc: '周视图与日程视图，可订阅到系统日历' },
      { name: '成绩与考试', desc: '学期成绩、绩点与未开考安排' },
      { name: '图书馆', desc: '选座预约、签到退座与馆藏检索' },
      { name: '空教室', desc: '按节次查当天空闲教室' },
      { name: '作业', desc: '待完成与已完成，带截止倒计时' },
    ],
  },
  {
    name: '生活',
    icon: 'sun',
    color: '#f29900',
    items: [
      { name: '电费充值', desc: '两个宿舍分开记，校园卡余额支付' },
      { name: '校园卡', desc: '余额与交易流水查询' },
      { name: '报修平台', desc: '宿舍与网络报修，进度可查' },
      { name: '请假申请', desc: '事假病假线上申报' },
      { name: '阳光服务', desc: '校务信箱与诉求处理' },
      { name: '学工问卷', desc: '查看并填写全校线上问卷' },
    ],
    note: '校园卡充值不在网页版提供。',
  },
  {
    name: '出行',
    icon: 'bus',
    color: '#1967d2',
    items: [
      { name: '实时校车', desc: '校内班车到站时间' },
      { name: '长沙实时公交', desc: '途经农大的公交线路到站时间' },
      { name: '校内公交线路', desc: '通勤班车线路图' },
    ],
  },
  {
    name: '工具与提醒',
    icon: 'tool',
    color: '#5f6368',
    items: [
      { name: '通知', desc: '学校通知公告，未读标出' },
      { name: '提醒', desc: '上课、作业与图书馆三类提醒' },
      { name: '个人中心', desc: '外观、语言与首页信息流自定义' },
      { name: '数据同步', desc: '课表与设置可导出、导入' },
      { name: 'VPN 转换', desc: '校外访问校内站点' },
    ],
  },
];

/** 使用流程：四步，不写「一键」「极速」这类空话 */
const STEPS: { title: string; desc: string }[] = [
  { title: '登录', desc: '用统一身份认证的学号和密码登录，凭证只存在本机浏览器。' },
  { title: '看首页', desc: '课表、作业、余额、预约合成一页信息流，空的部分自动隐藏。' },
  { title: '按需打开', desc: '图书馆、报修、请假这些入口按用途分组，点开即用。' },
  { title: '记住设置', desc: '首页区块、功能顺序与外观改完会接着生效，换设备也能恢复。' },
];

/** 说明条目：定位、数据、兼容性、风险 —— 讲清楚而不是回避 */
const NOTES: { icon: string; title: string; desc: string }[] = [
  {
    icon: 'shield',
    title: '第三方客户端',
    desc: '由同学独立开发，不是学校官方产品，功能以学校各系统实际开放为准。',
  },
  {
    icon: 'lock',
    title: '不改动你的账号',
    desc: '只读取你本人可见的数据，不会代你提交任何申请或支付。',
  },
  {
    icon: 'cloud',
    title: '换设备也能接着用',
    desc: '课表与设置保存在本机；开启云备份后，另一台设备登录即可恢复。',
  },
  {
    icon: 'moon',
    title: '手机和电脑都能打开',
    desc: '手机上可以添加到桌面全屏使用，电脑上显示完整侧边栏布局。',
  },
  {
    icon: 'warning',
    title: '学校系统调整时可能短暂不可用',
    desc: '上游接口变化会导致某一功能暂时取不到数据，稍后重试即可。',
  },
];
</script>
