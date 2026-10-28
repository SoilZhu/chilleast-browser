# ChillEast Browser · MD2 视觉规范

> 目标：把 Web 版从「Tailwind 通用 SaaS 风」改造成 **Google Material Design 2** 风格。
> 参考对象是 Google Keep / Gmail 的**风格语言**，不是 1:1 复刻截图。
> 品牌主色与原版 App 对齐为 `#09C489`，不换成 Google 蓝。

---

## 0. 四条铁律

1. **不许再用 `rounded-3xl` / `rounded-2xl` 当卡片圆角。** MD2 卡片圆角是 **8px**（`rounded-md2-md`），对话框 8px，悬浮菜单 4px，药丸 9999px。`rounded-3xl`(24px) 是 MD3/通用 SaaS 风格，不属于 MD2。
2. **不许再用 `shadow-sm` / `shadow-xs` 当默认卡片阴影。** MD2 静止卡片**没有阴影**，只有 `1px` 描边。阴影只出现在 hover（`shadow-dp1`）、浮层（`shadow-dp8`）、对话框（`shadow-dp24`）。
3. **不许再用 `font-black` / `font-extrabold` 当标题。** MD2 字重只用 **400 / 500 / 700**。标题默认 `font-medium`(500)，正文 `font-normal`(400)，只有极少数强调才 `font-bold`(700)。
4. **不许什么都包到卡片里，更不许卡片套卡片。** 表面分三层（见 §1.5）：画布 / 分组 / 卡片。同一层的东西不互相套；**卡片里永远不再放卡片**。判断标准：这一块能不能被单独拖走、单独点击、单独删除？能，才是卡片；不能，用分组或裸标题。
5. **同一个交互意图，全站只能有一套外观。** 切换视图 = `.md-tabs`；列表内筛选 = `.md-chip-filter`；页内搜索 = `.md-search-inline`；空状态 = `<EmptyState>`；卡片 = `<NoteCard>`。禁止「这页用 chip、那页用 tab」这类同类不同形（见 §1.6）。

---

## 1.5 表面层级（本次改版的核心）

改版前的通病是「凡是区块都包一层 `md-card`」：白底 + 1px 描边 + 8px 圆角，
页面上每个东西都是一个盒子，盒子里面又是盒子（功能页最典型：外层卡片里放
一排带描边的功能卡），视觉上像表格而不是 Google 的界面。

Google Keep / Gmail 的真实做法是**分三层**，同一层不互相套：

| 层 | 类 | 长相 | 用在哪 |
|---|---|---|---|
| ① 画布 | 无 | 白底、无边框 | 页面主体。标题、指标、表格、列表都直接落在这里 |
| ② 分组 | `.md-group` | 浅灰底 `#f8f9fa` + 12px 圆角、**无描边** | 把同类内容框成一组（功能分组、设置分组、便签墙） |
| ③ 卡片 | `.md-card` | 白底 + 1px `#e0e0e0` 描边 + 8px 圆角 | **只有独立实体**：一张便签、一张工单、一张考试卡 |

配套的行/标题：

| 类 | 用途 |
|---|---|
| `.md-row` | 分组或画布里的**一行**（无描边、无圆角、无白底，hover 才变浅灰） |
| `.md-rows` | 包住若干 `.md-row`，自动在行之间加 1px 分割线 |
| `.md-section-title` | **裸标题**（14px/500），替代「标题也塞进卡片」 |
| `.md-metrics` / `.md-metric` | 一组指标（余额/绩点），竖线分隔，**不各自包卡片** |
| `.md-divider` | 卡片内部分组用分割线，而不是再套一层卡片 |

### 判断流程

```
这块内容要单独点击/拖走/删除吗？
├─ 是 → .md-card（一张便签、一条工单、一个功能入口卡）
└─ 否 → 它和旁边的东西是同一类吗？
        ├─ 是 → 用 .md-group 框成一组，组内用 .md-row + 分割线
        └─ 否 → 直接放画布上，用 .md-section-title 起个标题
```

### 反面例子（改版前真实存在，已改）

| 位置 | 改版前 | 改版后 |
|---|---|---|
| 功能页 | 外层 `md-card` → 分组头 `border-b` → 内层 `md-function-tile` 带描边白卡 | 裸标题分组 → `.md-group` 里放无描边的功能行 |
| 阳光服务/请假/报修列表 | 每一条记录一张 `md-card`，卡片之间还有间距 | 一个 `.md-group`，记录是 `.md-row`，行间 1px 分割线 |
| 成绩/请假/问卷统计 | 4 个数字 = 4 张卡片，每张内部再画一条横线 | 一个 `.md-metrics`，竖线分隔，无外框 |
| 空教室查询 | 表单和结果各一张卡片 | 表单落画布，结果落 `.md-group` |
| 图书馆首页 | 3 个入口各一张卡片 + 预约列表每行一张卡片 | 入口合并成一个 `.md-group`，预约列表一个 `.md-group` |
| 图书馆选择阅览室 | 每间阅览室一张描边卡片 | 裸日期/楼层 chip + 一个 `.md-group`，每间一行 |
| 图书馆快速预约 | 时段、位置、匹配结果各一张描边卡片 | `.md-group` 分组 + 裸标题，匹配结果用分组行 |
| 图书馆座位图 | —（网页端原先没有座位图） | 图例 + 网格落画布，底部动作条不用卡片 |

---

## 1.6 同类元素一致性（跨页统一）

同一个交互意图，全站只允许一种外观。改版前实际存在的分裂：

| 意图 | 改版前（分裂） | 统一为 |
|---|---|---|
| 切换视图/数据集 | 作业页 chip + 作业页下划线 tab + 流水页分段控件 | `.md-tabs` / `.md-tab` / `.md-tab-active` |
| 列表内轻量筛选 | chip（本来就对） | `.md-chip-filter` / `.md-chip-filter-active` |
| 页内搜索框 | 三处各写一遍完整工具类 | `.md-search-inline` + `-input` + `-icon` |
| 空状态 | 8 处手写 `py-12 text-center` | `<EmptyState>` |
| 页面标题 | 3 页带彩色图标 / 15 页不带 | `<PageHeader>` 一律不带图标 |
| 动作按钮 | 「回到本周」误用 chip | `.md-btn-text` |
| 卡片 | 各自 `md-card`，圆角内边距不一 | `<NoteCard>`（同首页便签卡） |

### Tab 还是 chip？

```
这组切换改变「整个列表展示什么数据集」吗？
├─ 会（作业↔考试、待完成↔已完成、7天↔30天）→ .md-tabs
└─ 不会（楼层、类型等列表内收窄）        → .md-chip-filter
```

**同一页面最多一层 Tab**；出现「Tab 里套 Tab」的观感时，下层改 chip
（作业页 = 主 Tab「作业/考试」+ 次级 chip「待完成/已完成/全部」）。

### 卡片统一形态

```vue
<NoteCard title="近期预约" :meta="`${n} 条`" :flush="true">
  <div class="md-feed-rows">
    <div class="md-feed-row">…</div>
  </div>
</NoteCard>
```

| 参数/类 | 含义 |
|---|---|
| `title` / `meta` / `icon` | 卡头标题、计数徽章、前置图标 |
| `#actions` | 卡头右侧动作（chip、图标按钮） |
| `flush` | 列表型卡片：卡头左右 16px，内容贴边 |
| `.md-feed-rows` | 卡内列表，行间自动 1px 分割线 |
| `.md-feed-row` | 卡内行（无描边/无白底，hover 浮出浅灰） |
| `.md-feed-divider` | 卡内分区线（**替代**再包一层盒子） |
| `.md-feed-block` | 卡内强调块（浅色底，无描边无阴影） |



## 1. 色彩

| 语义 | Token | 值 | 用途 |
|---|---|---|---|
| 主色 | `md-primary` | `#09C489` | 主按钮、选中态、链接 |
| 主色浅 | `brand-50` | `#e6f9f3` | 选中背景、chip 底色 |
| 正文 | `md-text-high` | `#202124` | 标题、正文 |
| 次要文本 | `md-text-medium` | `#5f6368` | 说明、副标题 |
| 禁用文本 | `md-text-disabled` | `#80868b` | placeholder |
| 描边 | `md-card-border` | `#e0e0e0` | 卡片描边 |
| 分割线 | `md-divider` | `#dadce0` | 分割线、输入框边框 |
| 填充底 | `md-surface-2` | `#f1f3f4` | 搜索框、hover 底 |
| 浅底 | `md-surface-1` | `#f8f9fa` | 分组容器 |
| 成功 | `md-success` / `#0f9d58` | | 已完成 |
| 警告 | `md-warning` / `#f29900` | | 待处理 |
| 危险 | `md-danger` / `#d93025` | | 错误、退出 |

**旧色禁用**：`zinc-*`、`slate-*`、`emerald-*` 作为主色一律换成上面的语义 token。
（`dark:` 变体暂时保留可用，但新增代码优先单色浅色主题。）

---


### 1.7 复用件清单（新增元素前必读）

写任何新 UI 前，先查这里能不能复用；**不许再写一遍**。

| 场景 | 用什么 |
|---|---|
| 卡片 | `<NoteCard title meta flush>` |
| 提示条 / 错误 / 成功 | `<Alert kind text title dense>` |
| 切换视图/数据集 | `.md-tabs` + `.md-tab` / `.md-tab-active` |
| 列表内轻量筛选 | `.md-chip-filter` / `.md-chip-filter-active` |
| 页内搜索框 | `.md-search-inline` + `-input` + `-icon` |
| 空状态 | `<EmptyState text icon compact>` |
| 页内控制条（工具栏） | `.md-toolbar`（**不是卡片**） |
| 周次切换 | `<WeekToolbar>` |
| 指标组（余额/绩点/统计） | `<MetricGrid>` 或 `.md-metrics` |
| 分区标题 | `<SectionHeader>` 或 `.md-section-title` |
| 卡内行 / 分区线 / 强调块 | `.md-feed-row` / `.md-feed-divider` / `.md-feed-block` |
| 页面标题 | `<PageHeader>`（不带彩色图标） |
| 按钮 | `.md-btn-filled` / `-outlined` / `-text` / `-danger` |
| 表单 | `.md-label` + `.md-field` / `.md-select` |

### 三条自检（改完必查）

1. **卡片套卡片？** 卡内不应再出现 `md-card` 或 `border border-md-card-border` 的盒子。
2. **同类不同形？** 同一个交互，别处是不是另一个长相？是就收敛。
3. **组件导入了吗？** 跑 `npm run ui:check`——忘 import 的组件会被当成原生标签**静默渲染**，不报错。

---

## 2. 圆角

| Token | 值 | 用途 |
|---|---|---|
| `rounded-md2-xs` | 2px | 小徽章 |
| `rounded-md2-sm` | 4px | 按钮、输入框、菜单项 |
| `rounded-md2-md` | 8px | **卡片、对话框** |
| `rounded-md2-lg` | 12px | 大卡片、底部抽屉 |
| `rounded-md2-xl` | 16px | 分组容器 |
| `rounded-md2-pill` | 9999px | chip、搜索框、导航选中态 |

---

## 3. 阴影（MD2 elevation）

| Token | 用途 |
|---|---|
| 无 | 静止卡片（配 1px 描边） |
| `shadow-dp1` | hover 抬升、FAB 静止 |
| `shadow-dp2` | FAB hover |
| `shadow-dp4` | 下拉菜单 |
| `shadow-dp8` | 弹出面板、Popover |
| `shadow-dp24` | 模态对话框 |

---

## 4. 字阶

| Token | 规格 | 用途 |
|---|---|---|
| `text-md2-h6` | 20px/28 500 | 页面标题 |
| `text-md2-h5` | 24px/32 400 | 大标题 |
| `text-md2-subtitle1` | 16px/24 500 | 卡片标题 |
| `text-md2-subtitle2` | 14px/20 500 | 小标题 |
| `text-md2-body1` | 16px/24 400 | 正文 |
| `text-md2-body2` | 14px/20 400 | 次要正文 |
| `text-md2-button` | 14px/20 500 | 按钮文字 |
| `text-md2-caption` | 12px/16 400 | 辅助说明 |
| `text-md2-overline` | 10px/16 500 tracking 0.8 | 分组标签 |

---

## 5. 现成的 CSS 组件类（`web/src/style.css`）

直接用，不要重写：

```
.md-card                 卡片：白底 + 1px 描边 + 8px 圆角
.md-card-interactive     可点击卡片（hover 抬升）
.md-section              分组容器（浅灰底 + 16px 圆角）
.md-btn-filled           实心主按钮（40px 高）
.md-btn-outlined         描边按钮
.md-btn-text             文字按钮
.md-btn-danger           危险按钮
.md-icon-btn             圆形图标按钮 40dp（工具栏）
.md-icon-btn-sm          圆形图标按钮 32dp（卡片内）
.md-field                输入框（filled 变体）
.md-select               下拉选择器
.md-label                表单标签
.md-chip-success/-warning/-danger/-info/-neutral   徽章
.md-chip-filter(-active) 可点击筛选 chip
.md-nav-item(-active)    抽屉导航项
.md-bottom-nav-item(-active)  底部导航项
.md-list-item            列表行
.md-dialog               对话框容器（含入场动画）
.md-dialog-header/-title/-body/-actions
.md-scrim                遮罩
.md-skeleton             骨架屏
.md-function-tile        功能入口卡片
.keep-grid               Keep 风格瀑布流（column-count 响应式）
.md-grid-auto            自适应网格
.no-scrollbar            隐藏滚动条
```

---

## 5.5 图标（Material Icons，官方字体）

### 5.5.1 铁律

1. **只用 `<Icon>` 组件，不手写 `<svg>`**（品牌标记除外）。图标出自 Google 官方
   Material Icons 字体，不是自绘 path。
2. **写语义名，不写 Material 字形名**：`<Icon name="tasks" />`，不是
   `<Icon name="assignment" />`。语义名到字形的对照在 `components/icon-map.ts`。
3. **选中态用实心变体**：导航/底栏/Tab 选中时图标从 outlined 换成 filled，
   这是 MD2 与 Google Keep 的标志性细节。
4. 颜色永远由父级 `text-*` 决定（`currentColor`），**不要给图标写 `fill=` / `color=`**。

### 5.5.2 用法

```vue
<Icon name="home" />                                  <!-- 20dp，线性（默认） -->
<Icon name="home" variant="filled" />                 <!-- 20dp，实心（选中态） -->
<Icon name="chevron-right" size="sm" class="text-md-text-hint" />
```

### 5.5.3 尺寸档位（24dp 网格，与 MD2 规范对齐）

| `size` | 实际尺寸 | 用途 |
|---|---|---|
| `xs` | 14px | chip / 行内文字旁的小图标 |
| `sm` | 16px | 列表行前缀、按钮内图标 |
| `md` | 20px | **默认**，导航项、工具栏、卡片标题 |
| `lg` | 24px | 空状态、对话框标题 |
| `xl` | 32px | 大空状态占位 |

### 5.5.4 新增图标

1. 在 `components/icon-map.ts` 加一行：`'my-icon': { glyph: 'my_glyph' }`
   （字形名去 https://fonts.google.com/icons 查，选 **Outlined** 变体）
2. 运行 `node scripts/build-icons.mjs` 重新裁剪字体子集
3. 运行 `node scripts/icon-lint.mjs` 确认没有拼错、没有缺字形

字体子集在 `src/assets/material-icons/`，**两个变体加起来约 12 KB**，
只包含 `icon-map.ts` 里声明的字形，不要替换成整份字体（整份 280 KB）。

### 5.5.5 表单控件的 Material 化

- 下拉框：`.md-select` 右侧箭头是 `arrow_drop_down` 字形
- 勾选框：`.md-checkbox`（`check_box_outline_blank` / `check_box`）
- 单选：`.md-radio`（`radio_button_unchecked` / `radio_button_checked`）

---

## 6. 关键视觉母题（照抄风格，别抄内容）

### 6.1 顶部 App Bar（64px 高）
```
[☰]  🟢 自在东湖          [🔍 药丸搜索框 ................]        [⟳] [▦] [☁] [⠿] [头像]
```
- 高 64px，白底，**底部 1px `#dadce0` 分割线**（不是阴影）
- 汉堡按钮 40dp 圆形
- 搜索框：`#f1f3f4` 填充、无边框、8px 圆角、聚焦时变白 + `shadow-dp1`
- 右侧工具图标全部 40dp 圆形，hover 显示 `#f1f3f4` 圆底
- 图标全部用 Material Icons outlined（24dp 网格内 20dp 视觉尺寸）

### 6.2 左侧抽屉（256px，桌面常驻）
```
  [灯泡图标] 记事      ← 选中态：实心图标 + 右侧圆角药丸 + 浅绿底 + 深绿字
  [铃铛]     提醒
  ...
```
- 宽 256px，白底，**右侧 1px 分割线**
- 导航项高 40px，圆角只做**右侧**（`rounded-r-md2-pill`），左侧贴边
- 选中：`bg-brand-50` + `text-md-primary` + `font-semibold` + **图标换实心**

### 6.3 卡片（Keep 便签感）
- 白底、1px `#e0e0e0` 描边、8px 圆角、**无阴影**
- 内边距 16px，标题 `text-md2-subtitle2` + 正文 `text-md2-body2`
- hover：`shadow-dp1` + 描边变 `#dadce0`

### 6.4 数据卡（余额/成绩这类）
- 顶部一行：左侧图标 + 标签，右侧状态 chip
- 中间：大数字用 `text-[28px] font-normal tabular-nums`（**不要 font-black**）
- 底部：1px 分割线 + 小字说明

---

## 7. 改造检查清单

改完每个文件，自查：

- [ ] 没有 `rounded-3xl` / `rounded-2xl`（除非是头像等真圆）
- [ ] 没有 `shadow-sm` / `shadow-xs` / `shadow-lg` / `shadow-md` 当卡片阴影
- [ ] 没有 `font-black` / `font-extrabold`
- [ ] 没有 `zinc-*` / `slate-*` 作为主要配色（`text-zinc-400` 这类可换 `text-md-text-medium`）
- [ ] 主色用 `md-primary` 或 `brand-700`，不是 `emerald-*`
- [ ] 按钮高度 36px（`md-btn-*` 已内置），图标按钮 40dp
- [ ] 图标只用 `<Icon>`，语义名在 `icon-map.ts` 里有声明（跑 `node scripts/icon-lint.mjs`）
- [ ] 导航/底栏/Tab 的选中项用 `variant="filled"` 实心图标
- [ ] 没有残留的自绘 `<svg>` 图标（品牌标记除外）
- [ ] 卡片内边距 ≥ 16px，卡片间距 ≥ 12px
- [ ] 交互元素有 hover 态和 active 态
- [ ] `npm run build` 通过（`cd web && npx vue-tsc -b && npx vite build`）

---

## 8. 功能分类（必须与 App 端对齐）

来源：`/home/soilzhu/code/chilleast/lib/features/profile/models/appearance_state.dart`

| 分组 | 成员（顺序固定） |
|---|---|
| 支付 `groupPayment` | `payment_code` 付款码 · `recharge` 校园卡充值 · `ele_recharge` 电费充值 |
| 学习 `groupStudy` | `library` 图书馆 · `empty_classroom` 空教室 · `score` 成绩查询 · `exam` 考试安排 |
| 生活 `groupLife` | `repairs` 报修平台 · `leave` 请假申请 · `questionnaire` 学工问卷 · `sunshine` 阳光服务 · `dormitory` 我的宿舍 |
| 出行 `groupTravel` | `bus` 实时校车 · `cs_bus` 长沙实时公交 · `campus_bus_route` 校内公交线路 |
| 工具 `groupTools` | `vpn` VPN转换 |
| 小程序 `groupMiniApps` | `info_portal` 更多小程序 · `ehall` 办事大厅 · `xgxt` 学工系统 · `teaching_eval` 教评系统 · `gym` 场馆预约 · `campus_card` 校园卡 |

**五个一级 Tab（与 App 底部导航一致）**：首页 `tabHome` · 课表 `tabTimetable` · 作业 `tabHomework` · 通知 `tabNotice` · 功能 `tabFunctions`。
「我的 / 云同步」不占一级 Tab，收进右上角头像菜单与抽屉底部。


---

## 9. 落地清单（本次改版实际改动）

### 新增文件
| 文件 | 作用 |
|---|---|
| `web/DESIGN.md` | 本规范 |
| `web/src/components/AppSidebar.vue` | MD2 Navigation Drawer（桌面常驻 / 移动临时） |
| `web/src/views/HomeView.vue` | 首页：4 张数据卡 + Keep 瀑布流（快捷/今日课/作业/通知/考试） |
| `web/src/views/FunctionsView.vue` | 功能页：6 分组 × 22 项，支持搜索过滤 |
| `web/src/views/NoticeView.vue` | 通知列表页（独立一级 Tab） |
| `web/src/utils/functions.ts` | 功能分类单一事实来源（与 App `appearance_state.dart` 对齐） |
| `web/src/components/{PaymentCode,Recharge,VpnConverter,BusTransit,Leave,Questionnaire}Modal.vue` | 功能页弹窗 |

### 关键重构
- **导航结构对齐 App**：一级 Tab 由 `课表/成绩/待办/校园/云同步/我的` 改为 `首页/课表/作业/通知/功能`（App 底部 5 Tab），成绩、图书馆、空教室、报修、阳光服务等下沉为抽屉二级入口。
- **付款码接真实接口**：原 `generateMockPayCode()` 生成假码，现由 Worker 新增 `GET /api/campus/card/payment-code` 解析 fin-serv `openVirtualcard` 页面，返回真实 32 位付款码 + base64 二维码 PNG，60s 自动刷新。
- **请假 / 学工问卷做成真实功能**：新增 `worker/src/school/hunau/xgxt.ts`（学工系统 CAS 换票 + 请假/问卷全套接口）与 `worker/src/routes/xgxt.ts`（7 个 REST 端点），前端对应 `LeaveView.vue` / `QuestionnaireView.vue`。协议逐条对齐 App 端 `lib/features/leave/` 与 `lib/features/questionnaire/`：
  - 请假：列表（DataTables `aaData`）、类别字典、**服务端算时长**、提交（urlencoded / multipart 附件）、撤销待审核单。
  - 问卷：列表、详情（9 类题型：单选/多选/填空/日期/电话）、提交（**多选题同 key 重复提交**，与抓包一致）。
- **删掉所有假壳**：原 `LeaveModal.vue`（展示捏造记录、表单不提交）与 `QuestionnaireModal.vue`（纯静态表单）已删除，换成上面的真实页面。
- **校车改为真实内嵌**：原 `BusTransitModal` 的站点列表是硬编码编造的。现改为：实时校车/长沙公交用 iframe 内嵌 App 同源的 H5（`bus.jingzhixx.com` / `xlcxweb.busrise.cn`），校内线路图直接用 App 内置的 `campus_bus_map.webp`。
- **充值去掉假下单**：原 `RechargeModal` 让用户选金额和支付方式，但金额根本没传出去，还写着「2-5 秒到账」。现改为明确说明「网页版无法代发支付订单」+ 跳转学校财务平台，不再假装能直接充值。
- **搜索框全站生效**：功能页过滤、课表高亮命中课程（其余淡出）、作业/考试/通知过滤。
- **课表首屏骨架**：全量课表（20 周 + 云端调课规则）拉取期间展示骨架屏，不再出现空白周。

### 抽屉（导航）结构

抽屉是**导航**，只放独立页面；弹窗和外链归「功能」页，避免两处重复列同一批东西。

```
一级（App 底部 5 Tab）      首页 · 课表 · 作业 · 通知 · 功能
────
学习 4   成绩查询 · 考试安排 · 图书馆 · 空教室
生活 5   一卡通与电费 · 阳光服务 · 报修平台 · 请假申请 · 学工问卷
设置 2   云端同步 · 个人中心
────
底部     用户卡（点击进个人中心）· 退出登录
```

- 分组名沿用 App 端 `groupStudy` / `groupLife`（`app_zh.arb`），「设置」放云同步（App 里属个人中心，不占功能页分组）。
- 三个分组均可点击折叠，当前页所在分组自动展开。
- 一级 Tab 只在「当前就是该一级页」时高亮，二级页不再连带点亮一级，避免双重高亮。
- 「个人中心」不再在分组里重复出现两次（已并入底部用户卡）。

### 验证方式
```bash
cd web && npx vue-tsc -b && npx vite build   # 类型 + 构建
cd ../worker && npx tsc --noEmit             # Worker 类型
cd ../worker && npm test                     # 单元测试
```

---

## 10. 文案规范（2026-10 全站精修）

完整规范见 [`COPY.md`](./COPY.md)，机器校验脚本见 `scripts/copy-lint.mjs`。

### 一句话原则
**界面文案向原版 App 的 l10n 密度看齐**（`lib/l10n/app_zh.arb`）：短、平、直。
不写架构说明、不写营销词、不写「与手机端一致」这类内部对照。

### 硬性上限

| 位置 | 上限 |
|---|---|
| 页面标题 | 8 字 |
| 页面副标题 | 16 字 |
| 按钮 | 6 字 |
| 空状态 | 12 字 |
| 提示 / 错误 | 24 字 |
| 长说明（仅登录页、关于页） | 40–50 字 |

### 必须清除的词
`零状态` `中转` `Worker` `Cloudflare` `AES` `GCM` `对齐` `手机端` `App 端` `原版`
`超星` `融合门户` `直连` `一键` `无缝` `零延迟` `实时连接` `双向互通` `大功告成`
以及 `！` `哦` `啦` `呢` `……` 和写死的统计数字（`47门汇总`、`12门已出成绩`）。

### 句式约定
- 加载中：`加载中…` / `提交中…` / `同步中…`（单省略号，不用 `...`）
- 空状态：`暂无 + 名词`，**不带引导语**
- 成功：`已保存` / `已提交` / `已取消`
- 按钮：动词开头，2–4 字

### 校验

```bash
node scripts/copy-lint.mjs      # 禁用词 + 超长文案，应为 0 / 0
```

### 精修结果
- 用户可见中文字符：约 3578 字（28 个文件）
- 禁用词：39 → **0**
- 超长文案（>24 字）：17 → **0**
- 硬编码统计数字：全部移除，改为真实数据或纯学期名

---

## 11. Keep 观感精修（尺寸对齐，风格不照抄）

参考图是 Google Keep 桌面版（1864×954 @2x，即 932×477 CSS px）与本站 1440×900 同构。
下面每个数字都是从参考图**像素量出来**再换算成 CSS px 的，用来消掉「MD2 是 MD2 了，但一眼不像 Keep」的差距。
**只借骨架，不抄内容**：主色仍是农大绿 `#09C489`，不引入 Keep 的黄色/蓝色。

### 11.1 实测对照表

| 部位 | 参考图实测 | 本站改前 | 结论 |
|---|---|---|---|
| App Bar 高 | 63–64px，底部 1px `#dadce0` 分割线 | 64px + 分割线 | ✅ 已达标 |
| 搜索框 | 高 **39–40px**、宽 715（约 App Bar 一半）、**无边框**、填充 `#eff5f9`、圆角 8px、图标 24px | 44px 高、`#f1f3f4` | ⚠️ 压到 40px，填充改 `#eff5f9`（`.md-searchbar`） |
| 抽屉宽 | 256px，**右侧没有分割线**（颜色从白直接到白） | 256px + 1px 分割线 | ⚠️ 去掉分割线 |
| 导航项 | 高 **48px**；图标左边距 **24px**；图标 24px 与文字间距 **32px**；文字 14px/400 `#5f6368` | 40px / 左 16 / 间距 16 | ⚠️ 全面放大 |
| 选中药丸 | 左贴边、右端全圆角，高 48px，浅色底 | `bg-brand-50` + 右圆角 | ✅ 形状对，高度随行高改 |
| 卡片 | 圆角 **8px**、1px `#e0e0e0` 描边、**无阴影**、内边距 16px | `md-card` | ✅ 已达标 |
| 瀑布流 | 列宽 **236px**，列间距 **20px** | 固定 column-count，列宽被 max-width 拉宽 | ⚠️ 改 `column-width`：1864 宽下 6 列、列宽 267px |
| 正文行高 | 14px 字 / **24px** 行高（1.7 倍，松弛感来源） | 20px | ⚠️ 卡片正文提到 1.6–1.7 |

### 11.2 松弛感的三个来源（比配置更重要的是这三条）

1. **导航所有东西都大一档**：行高 40→48、左内边距 16→24、图标与文字间距 16→32。
   抽屉看起来"松"不是因为字大，而是因为这些留白。
2. **抽屉与内容之间不画线**：Keep 靠留白分隔，不靠 1px 灰线。
3. **内容从 App Bar 下方 32px 才开始**，且左右留白 ≥32px；卡片之间 16–20px，不要挤。

### 11.3 CSS 类变更（`src/style.css`）

| 类 | 变更 |
|---|---|
| `.md-nav-item` | `h-12 pl-6 gap-8 text-[14px] font-normal`；选中态 `bg-brand-50 text-md-primary font-medium` |
| `.md-nav-group` | 新增：分组标题 36px 高、12px `#5f6368`，与导航项同左边距 24px |
| `.keep-grid` | `column-width: 236px`（不再写死 1/2/3/4 列），`column-gap: 20px` |
| `.md-feed-card` | 内边距 16px，正文 `leading-[1.7]` |
| `.md-feed-card-title` | 14px/500 `#202124`（Keep 便签标题不带大写 overline） |
| `.md-feed-section-label` | 新增：卡片内分组小标题 `12px #5f6368` |

### 11.4 自检

- [ ] App Bar 内搜索框高度 ≤ 40px，且左右留白与外层一致
- [ ] 抽屉导航项行高 48px，图标到文字的水平间距视觉上约为图标宽度的 1.3 倍
- [ ] 抽屉右边缘没有 1px 竖线
- [ ] 首页瀑布流列宽 236–270px 之间浮动，列数随窗口增长（1864 宽 = 6 列，2048 宽 = 7 列）
- [ ] **顶栏通栏在抽屉之上**，抽屉从顶栏下沿开始（见 §11.5）
- [ ] 卡片正文行高 ≥ 1.6

### 11.5 骨架修正：顶栏通栏 + 抽屉下移

Keep 的结构是「64px 通栏 App Bar，抽屉从 y=64 开始」，而原实现是「抽屉通栏 100vh，顶栏缩在右侧 1184px 里」，
差别看着小，但一眼就能感到"不是 Google 的壳"。`MainView.vue` 已按此调整：

```
<div class="min-h-screen">                     ← 外层
  <Header/>                                    ← 通栏，sticky top-0，高 64px
  <div class="flex items-start md:pt-4">       ← 两栏行容器
    <aside 256px sticky top-16 h-[calc(100vh-4rem)]>  ← 抽屉从顶栏下方 16px 起
    <div class="flex-1 min-w-0"> <main/> </div>
  </div>
</div>
```

- `main` 的版心：`pt-6 px-8`、`max-w-[1680px]`（原来是 1440，宽屏两侧空太多）。
- 移动端底部导航放在行容器**之外**，避免参与 flex 布局。

### 11.6 踩坑记录

- **自定义 color token 不可靠**：`bg-md-search` 这类自定义调色板类在当前 Tailwind 构建里未必输出，
  首选用**组件类**（`.md-searchbar`）或标准调色板（`bg-surface-*`）。新增颜色先 `vite build` 后 grep 产物确认。
- **`.md-nav-item` 必须显式 `w-full`**：`<button>` 在 block 容器里不会自动撑满，少了它药丸只有 128px 宽。
- **Vite dev 的 CSS 缓存**：改 `tailwind.config.js` / `style.css` 后若样式没生效，`touch` 相关源文件强制重新转换即可。
