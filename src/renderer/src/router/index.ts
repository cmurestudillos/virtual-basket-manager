import { createRouter, createWebHashHistory } from 'vue-router';
import DefaultLayout from '@renderer/layouts/DefaultLayout.vue';

// Hash history y no createWebHistory(): la aplicación empaquetada carga
// index.html desde `file://`, donde no hay servidor que resuelva rutas.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // Pantallas previas a la partida: van fuera del layout de juego, que en su
    // cabecera muestra datos del equipo dirigido y todavía no hay ninguno.
    {
      path: '/',
      name: 'main-menu',
      component: () => import('@renderer/features/app-shell/pages/MainMenuPage.vue')
    },
    {
      path: '/saves',
      name: 'saves',
      component: () => import('@renderer/features/saves/pages/SavesListPage.vue')
    },
    {
      // La guía de estilo no se enlaza desde el juego: no le sirve de nada al
      // jugador. Existe como ruta para poder abrirla con `#/estilo` y para que
      // el arnés le haga una captura en cada pasada, que es lo que evita que
      // el kit se pudra sin que nadie se entere.
      path: '/estilo',
      name: 'style-guide',
      component: () => import('@renderer/features/app-shell/pages/StyleGuidePage.vue')
    },
    {
      path: '/new-game',
      name: 'new-game',
      component: () => import('@renderer/features/saves/pages/NewGamePage.vue')
    },
    {
      path: '/game',
      component: DefaultLayout,
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@renderer/features/dashboard/pages/DashboardPage.vue')
        },
        {
          path: 'squad',
          name: 'squad',
          component: () => import('@renderer/features/teams/pages/SquadPage.vue')
        },
        {
          path: 'player/:playerId',
          name: 'player',
          component: () => import('@renderer/features/players/pages/PlayerPage.vue')
        },
        {
          path: 'lineup',
          name: 'lineup',
          component: () => import('@renderer/features/lineup/pages/LineupPage.vue')
        },
        {
          path: 'training',
          name: 'training',
          component: () => import('@renderer/features/training/pages/TrainingPage.vue')
        },
        {
          path: 'youth',
          name: 'youth',
          component: () => import('@renderer/features/youth/pages/YouthPage.vue')
        },
        {
          path: 'stats',
          name: 'stats',
          component: () => import('@renderer/features/stats/pages/StatsPage.vue')
        },
        {
          path: 'market',
          name: 'market',
          component: () => import('@renderer/features/market/pages/MarketPage.vue')
        },
        {
          path: 'finances',
          name: 'finances',
          component: () => import('@renderer/features/club/pages/FinancesPage.vue')
        },
        {
          path: 'competition',
          name: 'competition',
          component: () => import('@renderer/features/competition/pages/CompetitionPage.vue')
        },
        {
          path: 'match/:gameId',
          name: 'match',
          component: () => import('@renderer/features/match/pages/MatchPage.vue')
        }
      ]
    }
  ]
});
