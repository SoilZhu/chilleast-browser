import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { registerServiceWorker } from './registerSW';
import { initTheme } from './stores/appearance';

initTheme();
registerServiceWorker();

createApp(App).mount('#app');
