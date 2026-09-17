import type { GameIconName } from './components/GameIcon.vue';

/**
 * Las secciones del juego: qué icono sale en la barra lateral y qué pestañas
 * lleva cada una en la barra de sección.
 *
 * Es el único sitio donde se decide la navegación del marco. Añadir una
 * pantalla a una sección es añadir una pestaña aquí; añadir una sección nueva
 * (Calendario, Ranking de entrenadores en la fase 5) es añadir una entrada y su
 * icono en `GameIcon`.
 */

export interface SectionTab {
  /** Nombre de la ruta. */
  route: string;
  label: string;
}

export interface GameSection {
  id: string;
  /** El título de la barra de sección y el `aria-label` del icono. */
  label: string;
  icon: GameIconName;
  /** Pestañas, en orden. La primera es a donde lleva el icono. */
  tabs: readonly SectionTab[];
  /** Rutas sin pestaña que también cuentan como de la sección (la ficha del jugador). */
  also?: readonly string[];
}

export const GAME_SECTIONS: readonly GameSection[] = [
  { id: 'home', label: 'Inicio', icon: 'home', tabs: [{ route: 'dashboard', label: 'Inicio' }] },
  { id: 'inbox', label: 'Correo', icon: 'mail', tabs: [{ route: 'inbox', label: 'Correo' }] },
  {
    id: 'team',
    label: 'Equipo',
    icon: 'team',
    tabs: [
      { route: 'squad', label: 'Plantilla' },
      { route: 'lineup', label: 'Alineación' },
      { route: 'training', label: 'Entrenamiento' },
      { route: 'youth', label: 'Cantera' }
    ],
    also: ['player']
  },
  {
    id: 'competition',
    label: 'Competición',
    icon: 'trophy',
    tabs: [
      { route: 'competition', label: 'Competiciones' },
      { route: 'stats', label: 'Estadísticas' }
    ]
  },
  { id: 'market', label: 'Mercado', icon: 'market', tabs: [{ route: 'market', label: 'Mercado' }] },
  {
    id: 'club',
    label: 'Club',
    icon: 'club',
    tabs: [
      { route: 'finances', label: 'Finanzas' },
      { route: 'history', label: 'Historial' }
    ]
  },
  {
    id: 'national',
    label: 'Selecciones',
    icon: 'national',
    tabs: [{ route: 'national', label: 'Selecciones' }]
  }
];

/** Abajo del todo, separados: salen del marco. */
export const RAIL_EXITS: readonly { route: string; label: string; icon: GameIconName }[] = [
  { route: 'settings', label: 'Ajustes', icon: 'settings' },
  { route: 'main-menu', label: 'Salir al menú', icon: 'exit' }
];

/** La sección de una ruta, o `null` si no es de ninguna. */
export function sectionForRoute(routeName: string | null | undefined): GameSection | null {
  if (!routeName) {
    return null;
  }
  return (
    GAME_SECTIONS.find(
      (section) =>
        section.tabs.some((tab) => tab.route === routeName) || section.also?.includes(routeName)
    ) ?? null
  );
}
