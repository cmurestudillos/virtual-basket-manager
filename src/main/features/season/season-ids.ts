/**
 * Ids de temporadas y partidos que salen de lo que son y de la semilla de la
 * partida, no de un sorteo en cada alta.
 *
 * El motor siembra cada partido con su id (`seedFromString(gameId)`), y de los
 * ids de temporada cuelgan los de las series, el draft o la Copa. Con ids
 * aleatorios (`randomUUID`) la misma partida jugaba un curso distinto cada vez
 * que se creaba una temporada: otro campeón, otras lesiones, otras actas, y ni
 * dos arneses sembrados igual daban lo mismo. Con estos, la
 * misma semilla da siempre el mismo curso, que es lo que el motor promete
 * (reproducibilidad, 2026-09-29).
 *
 * Son únicos dentro de una partida: una competición tiene una sola temporada
 * por curso (`findSeasonOf`), y dentro de ella la jornada y el sitio en el
 * calendario, o la serie y el número de partido, no se repiten. Las partidas
 * guardadas antes conservan sus ids viejos; los nuevos no chocan con ellos.
 */

/**
 * La temporada de una competición en un curso: `liga-nacional-t1-3fa92c07`.
 *
 * Lleva la semilla de la partida (`game_state.world_seed`) para que dos
 * partidas nuevas no jueguen calcado el mismo curso: la semilla se tira una vez
 * al crear la partida y, a partir de ahí, todo lo que cuelga de estos ids sale
 * siempre igual. Sin semilla (una partida que aún no ha migrado) queda sin ella.
 */
export function seasonIdFor(
  competitionId: string,
  seasonNumber: number,
  worldSeed: string | null
): string {
  return `${competitionId}-t${seasonNumber}${worldSeed ? `-${worldSeed}` : ''}`;
}

/**
 * Un partido de calendario (fase de liga o de grupos): la jornada y su sitio
 * dentro de ella. `scope` distingue los grupos cuando los hay.
 */
export function scheduledGameId(
  seasonId: string,
  round: number,
  index: number,
  scope?: string
): string {
  return `${seasonId}${scope ? `-${scope}` : ''}-j${round}-p${index}`;
}

/** Un partido de una eliminatoria al mejor de N: la serie y su número. */
export function seriesGameId(seriesId: string, seriesGame: number): string {
  return `${seriesId}-g${seriesGame}`;
}
