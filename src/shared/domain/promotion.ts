/**
 * Ascensos y descensos entre divisiones.
 *
 * Es lo que hace que la mitad de abajo de la tabla importe tanto como la de
 * arriba: sin descenso, una temporada perdida en noviembre no tiene ya nada que
 * jugarse hasta junio. Y es también la razón de que exista una segunda
 * división: si el que baja desaparece del mundo, bajar no significa nada.
 *
 * Funciones puras: ni base de datos ni azar.
 */

/** Cuántos suben de cada división y cuántos bajan de la de arriba. */
export const PROMOTION_SLOTS = 2;
export const RELEGATION_SLOTS = 2;

/**
 * Lo que la reputación de un club se mueve al cambiar de categoría.
 *
 * Sin esto, subir no cambiaría nada: el club ascendido seguiría teniendo la
 * misma televisión, el mismo patrocinio y el mismo objetivo del consejo que
 * cuando jugaba en plata.
 */
export const DIVISION_REPUTATION_STEP = 7;

/** Cómo se pinta una plaza en la clasificación. */
export type StandingZone = 'playoffs' | 'promotion' | 'relegation' | null;

export const STANDING_ZONE_LABELS: Record<Exclude<StandingZone, null>, string> = {
  playoffs: 'Playoffs',
  promotion: 'Ascenso',
  relegation: 'Descenso'
};

export interface DivisionRules {
  /** Equipos en la división. */
  teams: number;
  /** Los que juegan playoff; 0 si la liga no los tiene. */
  playoffTeams: number;
  /** Si por encima hay otra categoría a la que se pueda subir. */
  promotes: boolean;
  /** Y si por debajo hay otra a la que se pueda caer. */
  relegates: boolean;
}

/**
 * En qué zona de la tabla cae un puesto.
 *
 * El descenso gana al playoff si por algún motivo se solapan: el aviso de que
 * te vas abajo es siempre lo más urgente que la tabla tiene que contar.
 */
export function zoneFor(position: number, rules: DivisionRules): StandingZone {
  if (rules.relegates && position > rules.teams - RELEGATION_SLOTS) {
    return 'relegation';
  }
  if (rules.promotes && position <= PROMOTION_SLOTS) {
    return 'promotion';
  }
  if (rules.playoffTeams >= 2 && position <= rules.playoffTeams) {
    return 'playoffs';
  }
  return null;
}

/** Los que suben: los primeros de la división de abajo. */
export function promotedTeamIds(
  standings: readonly { teamId: string }[],
  slots = PROMOTION_SLOTS
): string[] {
  return standings.slice(0, slots).map((row) => row.teamId);
}

/** Y los que bajan: los últimos de la de arriba. */
export function relegatedTeamIds(
  standings: readonly { teamId: string }[],
  slots = RELEGATION_SLOTS
): string[] {
  return slots <= 0 ? [] : standings.slice(-slots).map((row) => row.teamId);
}

/**
 * El intercambio completo entre dos divisiones vecinas.
 *
 * Suben y bajan los mismos, siempre: se ajusta al menor de los dos cupos para
 * que ninguna división acabe con un equipo de más o de menos, que rompería el
 * calendario de la temporada siguiente.
 */
export function divisionSwap(input: {
  upper: readonly { teamId: string }[];
  lower: readonly { teamId: string }[];
}): { promoted: string[]; relegated: string[] } {
  const slots = Math.min(PROMOTION_SLOTS, RELEGATION_SLOTS, input.upper.length, input.lower.length);

  return {
    promoted: promotedTeamIds(input.lower, slots),
    relegated: relegatedTeamIds(input.upper, slots)
  };
}
