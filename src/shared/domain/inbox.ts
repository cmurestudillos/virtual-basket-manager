/**
 * La bandeja de avisos: qué ha pasado desde la última vez que miraste.
 *
 * La partida simula muchísimo que el jugador nunca ve —lesiones, fichajes, la
 * paciencia del consejo— y la bandeja es lo que lo saca a la luz. Los avisos no
 * los emite cada servicio al hacer su trabajo: salen de **comparar dos fotos**
 * del club, la de antes y la de ahora. Así ningún servicio sabe que la bandeja
 * existe, y todas las reglas de «esto merece un aviso» viven aquí, juntas.
 *
 * Funciones puras: ni base de datos ni azar.
 */

import { DANGER_CONFIDENCE } from './board';

export type InboxCategory =
  | 'injury'
  | 'recovery'
  | 'squad'
  | 'board'
  | 'title'
  | 'division'
  | 'contract'
  | 'career'
  | 'press'
  | 'national'
  | 'morale';

/** Una lesión vista en la foto. */
export interface SnapshotInjury {
  name: string;
  days: number;
}

/**
 * Lo que la bandeja necesita recordar del club para saber qué ha cambiado.
 *
 * Es deliberadamente pequeña: sólo lo que da lugar a un aviso. Se guarda en la
 * partida como JSON y se compara con la siguiente.
 */
export interface ClubSnapshot {
  teamId: string;
  competitionId: string;
  seasonNumber: number;
  /**
   * Fecha del juego al sacar la foto, en milisegundos. Distingue lo que hizo el
   * usuario de lo que hizo el mundo: ver `squadDrafts`.
   */
  date: number;
  /** Lesionados del primer equipo, por id de jugador. */
  injured: Record<string, SnapshotInjury>;
  /** Plantilla del primer equipo: los juveniles no cuentan. */
  squad: string[];
  confidence: number;
  dismissed: boolean;
  /** Campeón de cada temporada ya decidida, por id de temporada. */
  champions: Record<string, string>;
  /**
   * Último partido jugado del club. No da avisos por sí mismo: es lo que dice
   * que hay un partido nuevo y, con él, quizá una rueda de prensa.
   */
  lastGameId: string | null;
  /**
   * Jugadores del club convocados para la ventana que toca, con la selección
   * que los llama. Opcional: las fotos de antes de las selecciones no lo traen.
   */
  calledUp?: Record<string, string>;
  /** Jugadores del club descontentos. Opcional por las fotos de antes. */
  unhappy?: string[];
}

/** A dónde lleva un aviso al pulsarlo. */
export interface InboxRoute {
  name: string;
  params?: Record<string, string>;
}

export interface InboxDraft {
  category: InboxCategory;
  title: string;
  body: string;
  route: InboxRoute | null;
}

/** Lo que hace falta para escribir los avisos con nombres y no con ids. */
export interface InboxNames {
  player: (playerId: string) => string;
  team: (teamId: string) => string;
  competition: (competitionId: string) => string;
  /** Categoría de una competición: 1 la máxima. Decide si fue ascenso o descenso. */
  tier: (competitionId: string) => number;
  /** Competición a la que pertenece una temporada. */
  seasonCompetition: (seasonId: string) => string;
}

/**
 * Los avisos que salen de pasar de una foto a otra.
 *
 * Si entre las dos fotos el entrenador ha cambiado de club —en carrera pasa—,
 * no se compara la plantilla: saldrían doce «deja el club» y doce «llega al
 * club» que no son noticia. Se cuenta el cambio de banquillo y nada más.
 */
export function diffSnapshots(
  before: ClubSnapshot,
  after: ClubSnapshot,
  names: InboxNames
): InboxDraft[] {
  if (before.teamId !== after.teamId) {
    return [
      {
        category: 'career',
        title: `Nuevo banquillo: ${names.team(after.teamId)}`,
        body: `Empiezas una etapa nueva en ${names.competition(after.competitionId)}. El consejo ya ha puesto su objetivo.`,
        route: { name: 'dashboard' }
      }
    ];
  }

  return [
    ...injuryDrafts(before, after, names),
    ...squadDrafts(before, after, names),
    ...boardDrafts(before, after),
    ...titleDrafts(before, after, names),
    ...divisionDrafts(before, after, names),
    ...callupDrafts(before, after, names),
    ...unhappyDrafts(before, after, names)
  ];
}

/**
 * Un jugador que se hunde lo dice, una vez: al cruzar la raya del descontento.
 * Seguir descontento no es noticia, y volver a estar bien tampoco lo avisa.
 */
function unhappyDrafts(before: ClubSnapshot, after: ClubSnapshot, names: InboxNames): InboxDraft[] {
  const previous = new Set(before.unhappy ?? []);
  return (after.unhappy ?? [])
    .filter((playerId) => !previous.has(playerId) && after.squad.includes(playerId))
    .map((playerId) => ({
      category: 'morale' as const,
      title: `${names.player(playerId)} está descontento`,
      body: 'No está a gusto con su papel en el equipo. Si no cambia nada, rendirá por debajo de lo que vale y pedirá más para renovar.',
      route: { name: 'player', params: { playerId } }
    }));
}

/**
 * Los internacionales que se van con su selección, en un solo aviso: una
 * ventana puede llevarse a cuatro del mismo club y cuatro avisos serían ruido.
 * Se avisa al dar la lista, no al volver.
 */
function callupDrafts(before: ClubSnapshot, after: ClubSnapshot, names: InboxNames): InboxDraft[] {
  const previous = before.calledUp ?? {};
  const fresh = Object.entries(after.calledUp ?? {}).filter(([playerId]) => !previous[playerId]);
  if (fresh.length === 0) {
    return [];
  }

  const list = fresh
    .map(([playerId, teamId]) => `${names.player(playerId)} (${names.team(teamId)})`)
    .join(', ');
  return [
    {
      category: 'national',
      title:
        fresh.length === 1
          ? `${names.player(fresh[0]![0])}, convocado con su selección`
          : `${fresh.length} jugadores convocados con sus selecciones`,
      body: `${list}. Se perderán los partidos del club durante la ventana.`,
      route: { name: 'squad' }
    }
  ];
}

function injuryDrafts(before: ClubSnapshot, after: ClubSnapshot, names: InboxNames): InboxDraft[] {
  const drafts: InboxDraft[] = [];

  for (const [playerId, injury] of Object.entries(after.injured)) {
    const previous = before.injured[playerId];
    // Una lesión nueva, o una recaída distinta de la que ya tenía.
    if (!previous || previous.name !== injury.name) {
      drafts.push({
        category: 'injury',
        title: `${names.player(playerId)}, lesionado`,
        body: `${injury.name}. Estará de baja ${injuryLength(injury.days)}.`,
        route: { name: 'player', params: { playerId } }
      });
    }
  }

  for (const playerId of Object.keys(before.injured)) {
    // Sólo cuenta el alta si sigue en el club: si se ha ido, eso es otra noticia.
    if (!after.injured[playerId] && after.squad.includes(playerId)) {
      drafts.push({
        category: 'recovery',
        title: `${names.player(playerId)} recibe el alta`,
        body: 'Vuelve a estar disponible para jugar.',
        route: { name: 'player', params: { playerId } }
      });
    }
  }

  return drafts;
}

/**
 * Quién llega y quién se va — pero sólo si no lo has hecho tú.
 *
 * En este juego nada mueve la plantilla sin que corra el reloj **salvo el
 * usuario**: la IA ficha, las cesiones vuelven y los contratos vencen al
 * avanzar días, mientras que fichar, ceder o subir a un juvenil pasa sin que
 * cambie la fecha. Así que si entre las dos fotos no ha pasado el tiempo, los
 * cambios son suyos y no se le cuentan: avisarle de que ha llegado el jugador
 * que acaba de fichar sería ruido. Las lesiones no siguen esta regla, porque un
 * partido lesiona sin mover el calendario y eso sí es noticia.
 */
function squadDrafts(before: ClubSnapshot, after: ClubSnapshot, names: InboxNames): InboxDraft[] {
  if (after.date <= before.date) {
    return [];
  }
  const was = new Set(before.squad);
  const is = new Set(after.squad);
  const drafts: InboxDraft[] = [];

  for (const playerId of after.squad) {
    if (!was.has(playerId)) {
      drafts.push({
        category: 'squad',
        title: `${names.player(playerId)} llega al club`,
        body: 'Ya forma parte de la plantilla.',
        route: { name: 'player', params: { playerId } }
      });
    }
  }
  for (const playerId of before.squad) {
    if (!is.has(playerId)) {
      drafts.push({
        category: 'squad',
        title: `${names.player(playerId)} deja el club`,
        body: 'Ya no forma parte de la plantilla.',
        route: { name: 'squad' }
      });
    }
  }

  return drafts;
}

/**
 * El consejo sólo avisa al cruzar una raya, no en cada vaivén: un aviso por
 * partido diciendo «la confianza ha bajado dos puntos» sería ruido.
 */
function boardDrafts(before: ClubSnapshot, after: ClubSnapshot): InboxDraft[] {
  if (!before.dismissed && after.dismissed) {
    return [
      {
        category: 'board',
        title: 'Destituido',
        body: 'El consejo ha perdido la paciencia y prescinde de tus servicios.',
        route: { name: 'dashboard' }
      }
    ];
  }
  if (before.confidence >= DANGER_CONFIDENCE && after.confidence < DANGER_CONFIDENCE) {
    return [
      {
        category: 'board',
        title: 'El consejo se impacienta',
        body: 'La directiva ya está mirando otros nombres. Hacen falta resultados.',
        route: { name: 'finances' }
      }
    ];
  }
  if (before.confidence < DANGER_CONFIDENCE && after.confidence >= DANGER_CONFIDENCE) {
    return [
      {
        category: 'board',
        title: 'El consejo respira',
        body: 'Los resultados han devuelto algo de calma a la directiva.',
        route: { name: 'finances' }
      }
    ];
  }
  return [];
}

function titleDrafts(before: ClubSnapshot, after: ClubSnapshot, names: InboxNames): InboxDraft[] {
  const drafts: InboxDraft[] = [];

  for (const [seasonId, championId] of Object.entries(after.champions)) {
    if (before.champions[seasonId]) {
      continue;
    }
    const competition = names.competition(names.seasonCompetition(seasonId));
    if (championId === after.teamId) {
      drafts.push({
        category: 'title',
        title: `¡Campeones de ${competition}!`,
        body: 'El título ya está en la vitrina del club.',
        route: { name: 'history' }
      });
    } else {
      drafts.push({
        category: 'title',
        title: `${names.team(championId)} gana ${competition}`,
        body: 'Se decide el campeón de la temporada.',
        route: { name: 'competition' }
      });
    }
  }

  return drafts;
}

function divisionDrafts(
  before: ClubSnapshot,
  after: ClubSnapshot,
  names: InboxNames
): InboxDraft[] {
  if (before.competitionId === after.competitionId) {
    return [];
  }
  const up = names.tier(after.competitionId) < names.tier(before.competitionId);
  return [
    {
      category: 'division',
      title: up
        ? `¡Ascenso a ${names.competition(after.competitionId)}!`
        : `Descenso a ${names.competition(after.competitionId)}`,
      body: up
        ? 'El club juega la próxima temporada en la categoría de arriba.'
        : 'El club juega la próxima temporada una categoría por debajo.',
      route: { name: 'competition' }
    }
  ];
}

/**
 * Contratos que acaban esta temporada. Se avisa al empezarla, no el último día:
 * enterarse en junio de que se te va el base titular no deja decidir nada.
 */
export function expiringContractDrafts(
  players: readonly { playerId: string; name: string }[],
  seasonNumber: number
): InboxDraft[] {
  if (players.length === 0) {
    return [];
  }
  const list = players.map((player) => player.name).join(', ');
  return [
    {
      category: 'contract',
      title:
        players.length === 1
          ? `Temporada ${seasonNumber}: un contrato acaba este año`
          : `Temporada ${seasonNumber}: ${players.length} contratos acaban este año`,
      body: `${list}. Si no se renuevan, se irán libres en verano.`,
      route: { name: 'market' }
    }
  ];
}

/** «3 días», «2 semanas», «un mes»: como lo diría un parte médico. */
function injuryLength(days: number): string {
  if (days < 7) return `${days} ${days === 1 ? 'día' : 'días'}`;
  if (days < 45) {
    const weeks = Math.round(days / 7);
    return `${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
  }
  const months = Math.round(days / 30);
  return months === 1 ? 'un mes' : `${months} meses`;
}
