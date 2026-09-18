import type { CompetitionKind } from '@shared/domain/competition-kind';

/**
 * El color de cada tipo de competición, como clases de Tailwind escritas
 * enteras (Tailwind sólo genera las clases que lee tal cual en el código).
 *
 * Qué tipo es un partido lo decide `competitionKind()`, en el dominio; aquí sólo
 * se pinta. Los dos llevan letra blanca encima.
 */

/** La franja en degradado: cabecera de tarjeta, franja del día, rótulo. */
export const COMPETITION_BAND: Record<CompetitionKind, string> = {
  league: 'bg-linear-to-r from-tv-comp-league to-tv-comp-league-deep text-white',
  cup: 'bg-linear-to-r from-tv-comp-cup to-tv-comp-cup-deep text-white',
  continental: 'bg-linear-to-r from-tv-comp-continental to-tv-comp-continental-deep text-white',
  playoffs: 'bg-linear-to-r from-tv-comp-playoffs to-tv-comp-playoffs-deep text-white',
  national: 'bg-linear-to-r from-tv-comp-national to-tv-comp-national-deep text-white'
};

/** El color liso: el cuadradito de la leyenda, una raya fina. */
export const COMPETITION_FILL: Record<CompetitionKind, string> = {
  league: 'bg-tv-comp-league',
  cup: 'bg-tv-comp-cup',
  continental: 'bg-tv-comp-continental',
  playoffs: 'bg-tv-comp-playoffs',
  national: 'bg-tv-comp-national'
};
