![自在东湖](assets/brand/logo-light.png)

# 自在东湖网页版（ChillEast Browser）

访问网页：[web.chilleast.soilzhu.su](https://web.chilleast.soilzhu.su)

不用安装的自在东湖网页版。

> ⚠️ **这不是学校官方服务。** 本项目与湖南农业大学无关。

---

## 这是什么？

自在东湖网页版，使用 Cloudflare Worker 作为零状态中转。

## 功能

**学习**
- **课表**：周视图与日程视图，ICS 订阅或导出，调课
- **成绩与考试**：学期成绩；未开考科目的考场安排
- **图书馆**：选座预约、快速预约、签到退座，馆藏检索
- **空教室**：按节次查当天空闲教室
- **作业**：按截止日期分组

**生活**
- **电费充值**：支持双宿舍（灯光/空调），仅支持校园卡余额支付
- **校园卡**：余额、交易流水与动态付款码
- **报修平台**：宿舍与网络报修
- **请假申请**：事假、病假线上提交
- **阳光服务**：校务信箱与诉求进度
- **学工问卷**：查看并填写线上问卷
- **我的宿舍**：住宿信息

**出行**
- **实时校车**：校内班车到站时间
- **长沙实时公交**：途经农大的公交线路到站时间
- **校内公交线路**：通勤班车线路图

**工具与设置**
- **通知**
- **提醒**：上课、作业截止与图书馆预约提醒
- **数据同步**：课表与设置写入超星云盘备份
- **VPN 转换**：生成校外访问校内站点的链接
- **PWA**：手机添加到主屏幕后全屏使用，断网也能看课表

## 如何使用？

1. 打开 <https://web.chilleast.soilzhu.su>；
2. 用学校统一身份认证的学号和密码登录；
3. 首次登录会进入配置引导；

## 隐私与数据

- 不保存任何用户数据：没有数据库、KV、D1，服务端绝不落盘存储任何 Cookie 或密码。
- 登录成功后，学号密码被 AES-256-GCM 封装成自包含 Token，只存在浏览器 localStorage；每次请求通过 `Authorization: Bearer` 提交。
- **客户端自持有加密 Cookie 凭据（零状态加速）**：登录与子系统建立的 CookieJar 会被 AES-256-GCM 密封后回传客户端（`X-Client-Session`），并在后续请求中自动附带。Worker 解密恢复会话即可直连目标业务接口，彻底免去频繁跨洋重复 8~10 步 SSO 登录的巨大握手延迟；一旦会话过期自动安全重登刷新。
- 清除浏览器站点数据即可退出登录；修改学校密码会让已保存的 Token 失效。
- 开启云备份后，课表与设置会写入超星云盘的备份文件，供手机端 App 同步。

## CI/CD 与多环境部署

项目配置了 GitHub Actions 自动化持续部署工作流（`.github/workflows/deploy.yml`）：

| 分支 | 环境 | 域名 | 说明 |
| :--- | :--- | :--- | :--- |
| **`main`** | 生产环境 (Production) | `web.chilleast.soilzhu.su`<br>`api.chilleast.soilzhu.su` | 生产稳定部署，由 `wrangler deploy` 发布 |
| **`dev`** | 测试环境 (Development) | `dev.web.chilleast.soilzhu.su`<br>`dev.api.chilleast.soilzhu.su` | 特性测试部署，由 `wrangler deploy --env dev` 发布 |

在 GitHub 仓库的 **Settings -> Secrets and variables -> Actions** 中配置以下 Secrets：
- `CLOUDFLARE_API_TOKEN`：拥有 Cloudflare Workers 编辑部署权限的 API Token
- `CLOUDFLARE_ACCOUNT_ID`：（可选）Cloudflare 账户 ID

> **提示**：如果使用自定义域名，请在 Cloudflare 仪表盘或 DNS 中将 `dev.web.chilleast.soilzhu.su` 与 `dev.api.chilleast.soilzhu.su` 解析至该 Worker，并在 Worker 设置中添加对 `chilleast-browser-dev` 的对应 Secret（`SESSION_KEY` 等）。

## 部署

需要 Node.js 20+ 和 Cloudflare 账号。没有自己的域名时，先删掉 `worker/wrangler.jsonc` 里的 `routes`，部署后会得到 `*.workers.dev` 地址；有域名则把 `routes` 里的 `web.chilleast.soilzhu.su`、`api.chilleast.soilzhu.su` 换成自己的。

```bash
# 1. 安装依赖
cd web && npm install && cd ..
cd worker && npm install && cd ..

# 2. 凭据密封主密钥（32 字节 base64，必填）
cd worker
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npx wrangler secret put SESSION_KEY

# 3. 凭据指纹 HMAC 密钥（32 字节 base64，推荐配置）
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npx wrangler secret put ACCOUNT_PEPPER

# 4. 课表 ICS 订阅写入密钥（可选；不配置时订阅接口返回 ics_not_configured）
npx wrangler secret put ICS_API_KEY

# 5. 构建前端并部署 Worker
cd ..
npm run deploy
```

### 部署后健康检查

```bash
curl -s https://api.chilleast.soilzhu.su/health
```

正常返回：

```json
{
  "service": "chilleast-browser-relay",
  "version": "1.0.0",
  "status": "ok",
  "stateless": true,
  "sessionKeyConfigured": true,
  "accountPepperConfigured": true
}
```

### 自定义域名

修改 `worker/wrangler.jsonc` 中的 `routes`，把 `web.chilleast.soilzhu.su`、`api.chilleast.soilzhu.su` 换成你自己的域名，Cloudflare 会自动签发证书并路由请求。

`/api/*`、`/health`、`/`、`/web/*` 需要留在 Worker 里（`run_worker_first`）：API 与健康检查由 Worker 处理，`/web/*` 负责 301 到新路径，静态产物再由 Worker Assets 返回。改路由时别把这些路径直接交给 Assets，否则会命中 SPA 回退、把 `index.html` 当成 JS / CSS 返回。

## 本地开发

```bash
# 依赖（web / worker 各自独立安装）
cd web && npm install && cd ../worker && npm install && cd ..

# 前端：Vite on :5173，/api 自动代理到 :8787
npm run dev:web

# Worker：Wrangler on :8787
npm run dev:worker
```

本地跑 Worker 需要在 `worker/.dev.vars` 里至少配置 `SESSION_KEY`，可选 `ACCOUNT_PEPPER`、`ICS_API_KEY`（该文件已在 `.gitignore` 中，不会提交）。

```bash
npm run build:web          # 前端类型检查 + 生产构建（输出 web/dist）
npm run typecheck:worker   # Worker 类型检查
npm test                   # Worker 单元测试（Vitest）
npm run ui:check           # 图标与组件导入检查
```

站点图标与 Material Icons 字体子集分别由 `npm run logo:icons`（需要 Pillow + numpy）和 `npm run icons`（需要 fonttools）生成，产物已生成在 `web/public/` 与 `web/src/assets/`，日常开发不用跑。

## 项目结构

```
chilleast-browser/
├── assets/brand/               # Logo 原图（浅色 / 深色）
├── docs/images/                # README 配图（官网与登录页截图）
├── scripts/                    # 图标生成、图标 / 组件 / 文案检查
│
├── worker/                     # Cloudflare Worker 零状态中转
│   ├── src/auth/               # AES-GCM Token、CAS / CIMS 登录、会话防抖
│   ├── src/school/hunau/       # 农大各系统协议（教务、一卡通、超星、学工、报修…）
│   ├── src/routes/             # REST API 路由
│   ├── src/index.ts            # Worker 入口（API 分发 + 静态资源托管）
│   ├── test/                   # Vitest 单元测试
│   └── wrangler.jsonc          # Cloudflare 部署配置
│
└── web/                        # Vue 3 + Vite + Tailwind CSS 前端
    ├── src/views/              # 页面（首页 / 课表 / 作业 / 通知 / 功能 / 设置…）
    ├── src/components/         # 业务组件（feed / library / timetable / ui…）
    ├── src/api/                # 请求层（自动带 Bearer Token）
    ├── src/services/           # 云备份、提醒、匿名统计
    ├── src/stores/             # 设置、外观、语言
    ├── src/composables/        # 通知分页、电费槽位、首页附属数据
    ├── src/utils/              # 本地缓存、导航配置、ICS 生成与导出
    ├── public/                 # 图标、PWA 清单、品牌标
    ├── DESIGN.md               # MD2 视觉规范
    ├── COPY.md                 # 界面文案规范
    ├── index.html              # 应用主界面入口
    ├── home.html               # 官网介绍页入口
    └── vite.config.ts          # 多页构建：index.html + home.html
```

## 相关项目

- [ChillEast](https://github.com/SoilZhu/ChillEast)：Flutter 编写的原版 App
- [ChillEast-MCP](https://github.com/SoilZhu/ChillEast-MCP)：同一校园服务的 MCP 版本
- [ChillEast-LLM-relay](https://github.com/SoilZhu/chilleast-llm-relay)：原版 App Agent 功能使用的默认 LLM 转发服务

## 反馈

- 邮件：soilzhu80@gmail.com
- Telegram：[@mintrainy](https://t.me/mintrainy)
- 也可以在 GitHub 提 Issue
