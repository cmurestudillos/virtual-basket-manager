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
