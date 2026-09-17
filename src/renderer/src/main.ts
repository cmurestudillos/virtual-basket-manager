import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
// La letra del juego, empaquetada: la app carga sin conexión. Sólo latín y
// latín extendido (Kozłowski, Pavić, Nagy), en los tres pesos que se usan.
import '@fontsource/signika/latin-400.css';
import '@fontsource/signika/latin-ext-400.css';
import '@fontsource/signika/latin-600.css';
import '@fontsource/signika/latin-ext-600.css';
import '@fontsource/signika/latin-700.css';
import '@fontsource/signika/latin-ext-700.css';
import './assets/main.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');
