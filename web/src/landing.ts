import { createApp } from 'vue';
import LandingView from './views/LandingView.vue';
import './style.css';
import { registerServiceWorker } from './registerSW';
import { initTheme } from './stores/appearance';

initTheme();
registerServiceWorker();

/**
 * 官网介绍页入口（`home.html` → 由 Worker 在站点根路径返回）。
 *
 * 独立入口而不是挂在 App.vue 的路由里：介绍页面向未登录访客，
 * 不需要 `App.vue` 里的登录态判断、云端同步与提醒服务，
 * 单独挂载可以让首屏只加载介绍页自身的代码。
 */
createApp(LandingView).mount('#app');
