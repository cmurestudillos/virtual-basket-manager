/**
 * Historial y palmarés de la partida.
 *
 * Nada de esto se guarda aparte: sale de lo que ya hay en la base —el campeón
 * de cada temporada, los partidos jugados y las actas—. Una tabla de historial
 * sería un segundo sitio donde apuntar lo mismo, y el día que no coincidieran
 * habría que decidir cuál de los dos miente.
 */

/** Un título del club dirigido. */
export interface TrophyEntry {
  competitionId: string;
  competitionName: string;
  /** `league`, `cup` o `continental`. */
  format: string;
  /** Temporadas en las que se ganó, de la más reciente a la más antigua. */
  seasons: number[];
  years: string[];
}

/** Lo que hizo el club en una competición de una temporada concreta. */
export interface HistoryCompetitionResult {
  competitionName: string;
  format: string;
  /** «Campeón», «Semifinales», «3º»… lo que se lee en la fila. */
  outcome: string;
  champion: boolean;
}

/** Una temporada del club, tal y como se cuenta luego. */
export interface HistorySeasonEntry {
  seasonNumber: number;
  /** «2025-26». */
  years: string;
  competitionId: string;
  competitionName: string;
  /** 1 = máxima categoría. Sirve para contar los ascensos. */
  tier: number;
  /** Puesto en la liga regular. `null` si la temporada no llegó a jugarse. */
  position: number | null;
  teams: number;
  won: number;
  lost: number;
  /** Campeón de su liga esa temporada, sea quien sea. */
  championTeamName: string | null;
  /** Lo que hizo en copa y en Europa. */
  others: HistoryCompetitionResult[];
}

/** Una marca de la partida: el mejor registro individual visto hasta ahora. */
export interface RecordEntry {
  label: string;
  playerName: string;
  teamName: string;
  value: number;
  /** «Jornada 12 · 2025-26», para poder situarla. */
  context: string;
  /** Si la firmó alguien del club dirigido. */
  isManaged: boolean;
}

export interface HistoryView {
  teamName: string;
  /** Temporadas jugadas, de la más reciente a la más antigua. */
  seasons: HistorySeasonEntry[];
  trophies: TrophyEntry[];
  /** Cuántos títulos en total, para la cabecera. */
  totalTrophies: number;
  records: RecordEntry[];
}

export interface HistoryApi {
  get: () => Promise<HistoryView>;
}
