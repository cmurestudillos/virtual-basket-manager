/**
 * El tipo de competición de un partido, que es lo que decide su color: la franja
 * del día en el calendario, la cabecera de la tarjeta, la leyenda.
 *
 * Son cinco y no los `format` de la base porque no coinciden: una liga con
 * eliminatoria al final tiene un solo `format` (`league`) y dos colores —liga y
 * playoffs—, y las selecciones tienen tres (`national`, `national-qualifiers` y
 * `national-tournament`) y un solo color. Vive aquí, y no en cada pantalla,
 * para que un partido de playoffs no salga de un color en el calendario y de
 * otro en el inicio.
 *
 * Función pura: el color de cada tipo está en `shared/ui/competition-colors.ts`.
 */

import { NATIONAL_TEAM_ID_PREFIX } from './national-teams';

export type CompetitionKind = 'league' | 'cup' | 'continental' | 'playoffs' | 'national';

/** En el orden de la leyenda: de lo de cada semana a lo de cada tanto. */
export const COMPETITION_KINDS: readonly CompetitionKind[] = [
  'league',
  'cup',
  'continental',
  'playoffs',
  'national'
];

export const COMPETITION_KIND_LABEL: Record<CompetitionKind, string> = {
  league: 'Liga',
  cup: 'Copa',
  continental: 'Continental',
  playoffs: 'Playoffs',
  national: 'Selecciones'
};

export interface CompetitionKindSource {
  /** El `format` de la competición: `league`, `cup`, `continental`, `national-…`. */
  format: string | null | undefined;
  /** La eliminatoria del partido. En una liga, es que ya son los playoffs. */
  seriesId?: string | null;
  /** El país de uno de los dos equipos, si es una selección (`nationalOf`). */
  nationOf?: string | null;
  /** El id de uno de los dos equipos: el de una selección empieza por `seleccion-`. */
  teamId?: string | null;
}

export function competitionKind(source: CompetitionKindSource): CompetitionKind {
  const format = source.format ?? '';

  // Las selecciones, antes que nada: un amistoso o un partido suelto de una
  // selección puede no traer el `format`, pero sí a sus equipos.
  if (
    format.startsWith('national') ||
    Boolean(source.nationOf) ||
    Boolean(source.teamId?.startsWith(NATIONAL_TEAM_ID_PREFIX))
  ) {
    return 'national';
  }
  // Europa también tiene eliminatorias (cuartos y Final Four) y sigue siendo Europa.
  if (format === 'continental') {
    return 'continental';
  }
  if (format === 'cup') {
    return 'cup';
  }
  // Lo que queda es liga, o un `format` que no se conoce: se pinta como liga,
  // que es lo que se juega cada semana, antes que dejar el día sin color.
  return source.seriesId ? 'playoffs' : 'league';
}
