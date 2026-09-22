import { createHttpClient, type HttpClient } from '../lib/http';
import { coachFromManual, loadManualJson, type ManualCoach } from '../lib/manual';
import { toNationCode } from '../lib/nationalities';
import { plausibleBirthDate } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type {
  SourceCoach,
  SourceLeague,
  SourcePlayer,
  SourcePosition,
  SourceTeam
} from '../lib/source-types';
import {
  aggregateWinnerBoxScores,
  parseWinnerGame,
  parseWinnerPlayerPage,
  parseWinnerStandings,
  parseWinnerTeamPage,
  splitWinnerFullName,
  unifyTransferred,
  winnerNationality,
  winnerPosition,
  type WinnerGame,
  type WinnerPlayerPage,
  type WinnerPlayerStats,
  type WinnerRosterPlayer
} from './winner-parse';

/**
 * Extractor de la liga israelí, la Ligat Winner (`israel-1`), desde su web
 * oficial, basket.co.il, en inglés.
 *
 *   pnpm real:winner            usa la caché de descargas
 *   pnpm real:winner --force    lo vuelve a descargar todo
 *
 * - La 2025-26 tuvo 14 equipos y la liga del juego tiene 12: los dos que
 *   bajaron a la Liga Leumit se valoran con su liga pero no entran
 *   (`excluded`).
 * - Liga regular: 26 jornadas, las actas 26389 a 26570 (ids seguidos, siete
 *   por jornada). Los cuatro últimos jugaron después un playout de seis
 *   partidos más que la web suma a la «liga regular»; aquí no cuenta: las
 *   estadísticas son la suma de esas 182 actas, iguales para todos.
 * - De la página de cada equipo, la plantilla (puesto, altura, fecha) y el
 *   aforo del pabellón; de la ficha de cada jugador, la nacionalidad.
 * - El entrenador es el del acta del primer partido de liga de cada club (por
 *   fecha: hubo jornadas aplazadas), con fecha y nacionalidad a mano
 *   (`winner-entrenadores.json`).
 * - Tres segundos entre peticiones.
 */

const SITE = 'https://basket.co.il';
const SEASON_START_YEAR = 2025;
/** La temporada 2025-26 en la web. */
const C_YEAR = 2026;
/** Las actas de liga regular: 26 jornadas de 7. El playout va de 26610 a 26621. */
const FIRST_GAME = 26389;
const LAST_GAME = 26570;
const ROUNDS = 26;

interface TeamInfo {
  name: string;
  shortName: string;
  city: string;
  pavilion: string;
  /** El aforo de la Wikipedia inglesa, para cuando la web oficial no lo da. */
  capacity: number;
}

/**
 * Los clubes, por `TeamId` de la 2025-26: nombre sin patrocinador (la web da
 * el comercial, «Club Patrocinador Ciudad»), ciudad y el pabellón de casa
 * (no las sedes neutrales en las que se jugó durante la guerra), según la
 * Wikipedia inglesa («2025–26 Israeli Basketball Premier League»).
 */
const TEAMS: Record<string, TeamInfo> = {
  '1109': {
    name: 'Maccabi Tel Aviv',
    shortName: 'MTA',
    city: 'Tel Aviv',
    pavilion: 'Menora Mivtachim Arena',
    capacity: 10_383
  },
  '1110': {
    name: 'Hapoel Tel Aviv',
    shortName: 'HTA',
    city: 'Tel Aviv',
    pavilion: 'Menora Mivtachim Arena',
    capacity: 10_383
  },
  '1112': {
    name: 'Hapoel Jerusalem',
    shortName: 'HJE',
    city: 'Jerusalén',
    pavilion: 'Pais Arena',
    capacity: 11_000
  },
  '1118': {
    name: 'Bnei Herzliya',
    shortName: 'BNH',
    city: 'Herzliya',
    pavilion: 'HaYovel Herzliya',
    capacity: 1_500
  },
  '1113': {
    name: 'Hapoel Holon',
    shortName: 'HHO',
    city: 'Holon',
    pavilion: 'Toto Arena Holon',
    capacity: 5_500
  },
  '1122': {
    name: 'Hapoel HaEmek',
    shortName: 'HAM',
    city: 'Gan Ner',
    pavilion: 'Gan Ner Sports Hall',
    capacity: 2_057
  },
  '1123': {
    name: 'Maccabi Rishon LeZion',
    shortName: 'MRL',
    city: 'Rishon LeZion',
    pavilion: 'Beit Maccabi Rishon',
    capacity: 2_500
  },
  '1120': {
    name: "Hapoel Be'er Sheva/Dimona",
    shortName: 'HBS',
    city: 'Beerseba',
    pavilion: 'The Shell Arena',
    capacity: 3_000
  },
  '1111': {
    name: 'Maccabi Ironi Ramat Gan',
    shortName: 'MRG',
    city: 'Ramat Gan',
    pavilion: 'Zisman Hall',
    capacity: 1_500
  },
  '1114': {
    name: 'Ironi Kiryat Ata',
    shortName: 'IKA',
    city: 'Kiryat Ata',
    pavilion: 'Remez Hall',
    capacity: 1_200
  },
  '1116': {
    name: 'Ironi Ness Ziona',
    shortName: 'INZ',
    city: 'Ness Ziona',
    pavilion: 'Lev Hamoshava',
    capacity: 1_300
  },
  '1119': {
    name: 'Hapoel Galil Elyon',
    shortName: 'HGE',
    city: 'Kfar Blum',
    pavilion: 'HaPais Kfar Blum',
    capacity: 2_000
  },
  '2109': {
    name: 'Elitzur Netanya',
    shortName: 'ENE',
    city: 'Netanya',
    pavilion: 'Netanya Arena',
    capacity: 2_500
  },
  '1124': {
    name: "Maccabi Ironi Ra'anana",
    shortName: 'IRA',
    city: "Ra'anana",
    pavilion: 'Metro West',
    capacity: 1_668
  }
};

/** Los dos que bajaron a la Liga Leumit: se valoran con la liga, pero no entran en el juego. */
const EXCLUDED = ['2109', '1124'];

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `winner-entrenadores.json`: `inicio`, por `TeamId`, el entrenador del
 *   acta del primer partido, con nombre de uso, nacimiento como la FEB
 *   («dd/mm/aaaa Ciudad (País)», la ciudad puede faltar) o `age`,
 *   `nationality` (COI), `coachId` (el id de entrenador de la web, para
 *   comprobar que es el del acta aunque se escriba de otra forma), la fuente
 *   y `despues`. Sin fecha ni edad, el club se queda sin entrenador real.
 * - `winner-jugadores.json`: `jugadores`, por `PlayerId`, lo que la web da
 *   mal o no da: nombre (`firstName`, `lastName`: erratas, canteranos sin
 *   nombre en inglés) y, si hace falta, `birthDate` (AAAA-MM-DD),
 *   `nationality` (COI), `heightCm` o `position`.
 */
interface CoachesManual {
  inicio: Record<string, ManualCoach & { coachId?: string; despues?: string }>;
}

interface PlayerFix {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  nationality?: string;
  heightCm?: number;
  position?: SourcePosition;
}

interface PlayersManual {
  jugadores: Record<string, PlayerFix>;
}

const COACHES = loadManualJson<CoachesManual>('winner-entrenadores.json', { inicio: {} });
const PLAYERS = loadManualJson<PlayersManual>('winner-jugadores.json', { jugadores: {} });

const log = (message: string): void => console.log(message);

type Warn = (message: string) => void;

function plainName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function winnerGet(client: HttpClient, path: string, marker: string): Promise<string> {
  return client.get(`${SITE}/${path}`, { accept: (body) => body.includes(marker) });
}

async function main(): Promise<void> {
  const { force } = cliOptions();
  const client = createHttpClient({ minDelayMs: 3_000, force, log });
  const started = Date.now();
  const warnings: string[] = [];
  const warn: Warn = (message) => {
    warnings.push(message);
    log(`  aviso: ${message}`);
  };

  log('Ligat Winner 2025-26: clasificación…');
  const standings = parseWinnerStandings(
    await winnerGet(client, `table.asp?cYear=${C_YEAR}&lang=en`, 'team.asp?TeamId=')
  );
  if (standings.length !== Object.keys(TEAMS).length) {
    throw new Error(`La clasificación trae ${standings.length} equipos.`);
  }
  for (const row of standings) {
    if (!TEAMS[row.teamId]) warn(`${row.name} (${row.teamId}): sin datos de club en TEAMS`);
  }

  log(`${LAST_GAME - FIRST_GAME + 1} actas de liga regular…`);
  const games: WinnerGame[] = [];
  for (let id = FIRST_GAME; id <= LAST_GAME; id++) {
    const game = parseWinnerGame(
      await winnerGet(client, `game-zone.asp?GameId=${id}&lang=en`, 'stats_tbl'),
      String(id)
    );
    if (!game) {
      warn(`acta ${id}: no se ha podido leer`);
      continue;
    }
    if (game.round === null || game.round > ROUNDS) {
      warn(`acta ${id}: no es de liga regular (jornada ${game.round ?? '?'})`);
      continue;
    }
    for (const [teamId, score] of [
      [game.homeId, game.homeScore],
      [game.awayId, game.awayScore]
    ] as const) {
      const points = game.lines
        .filter((line) => line.teamId === teamId)
        .reduce((sum, line) => sum + line.points, 0);
      if (score !== null && points !== score) {
        warn(
          `acta ${id} (jornada ${game.round}): ${teamId} suma ${points} y el tanteo es ${score}`
        );
      }
    }
    games.push(game);
  }
  const statsByTeam = new Map<string, WinnerPlayerStats[]>();
  for (const entry of aggregateWinnerBoxScores(games.flatMap((game) => game.lines))) {
    statsByTeam.set(entry.teamId, [...(statsByTeam.get(entry.teamId) ?? []), entry]);
  }

  const teams: SourceTeam[] = [];
  for (const standing of standings) {
    const info = TEAMS[standing.teamId];
    const label = info?.name ?? standing.name;
    log(`${standing.rank}. ${label}`);
    const teamGames = games.filter(
      (game) => game.homeId === standing.teamId || game.awayId === standing.teamId
    );
    if (teamGames.length !== ROUNDS) {
      warn(`${label}: ${teamGames.length} actas de liga regular y deberían ser ${ROUNDS}`);
    }
    const wins = teamGames.filter((game) => {
      const home = game.homeId === standing.teamId;
      const [own, other] = home
        ? [game.homeScore, game.awayScore]
        : [game.awayScore, game.homeScore];
      return own !== null && other !== null && own > other;
    }).length;
    // Con el playout, la tabla de la web ya no es la de la liga regular.
    if (standing.games === ROUNDS && wins !== standing.wins) {
      warn(`${label}: ${wins} victorias en las actas y ${standing.wins} en la clasificación`);
    }

    const page = parseWinnerTeamPage(
      await winnerGet(client, `team.asp?TeamId=${standing.teamId}&lang=en`, 'box_role')
    );
    const teamStats = statsByTeam.get(standing.teamId) ?? [];
    const statsById = new Map(teamStats.map((entry) => [entry.playerId, entry]));

    // La plantilla entera y, de los que se fueron o no están activos, los que
    // jugaron; quien jugó y no sale en ninguna lista, de su ficha.
    const roster: (WinnerRosterPlayer | null)[] = [];
    const ids: string[] = [];
    for (const player of page.players) {
      if (ids.includes(player.playerId)) continue;
      if (player.section !== 'plantilla' && !statsById.has(player.playerId)) continue;
      roster.push(player);
      ids.push(player.playerId);
    }
    for (const entry of teamStats) {
      if (ids.includes(entry.playerId)) continue;
      roster.push(null);
      ids.push(entry.playerId);
    }

    const players: SourcePlayer[] = [];
    for (const [index, playerId] of ids.entries()) {
      const listed = roster[index] ?? null;
      const entry = statsById.get(playerId);
      const bio = parseWinnerPlayerPage(
        await winnerGet(client, `player.asp?PlayerId=${playerId}&lang=en`, 'p_info')
      );
      const player = playerFrom(playerId, listed, bio, entry, label, warn);
      // Canteranos sin nombre en inglés que no jugaron: fuera.
      if (player.lastName === '' && !entry) continue;
      players.push(player);
    }

    const capacity = page.arena.capacity ?? info?.capacity ?? null;
    teams.push({
      sourceId: standing.teamId,
      name: label,
      shortName: info?.shortName ?? null,
      city: info?.city ?? null,
      pavilionName: info?.pavilion ?? page.arena.name,
      pavilionCapacity: capacity,
      finalPosition: standing.rank,
      players,
      coach: coachOf(standing.teamId, teamGames, warn, label)
    });
  }

  unifyTransferred(teams, warn);
  for (const team of teams) {
    for (const player of team.players.filter((entry) => !entry.nationality)) {
      warn(
        `${team.name}: ${player.firstName} ${player.lastName} (${player.sourceId}): ` +
          `sin nacionalidad (se pone la del club)`
      );
    }
  }

  const league: SourceLeague = {
    competitionId: 'israel-1',
    name: 'Ligat Winner',
    shortName: 'Winner',
    country: 'ISR',
    seasonStartYear: SEASON_START_YEAR,
    source: SITE,
    extractedAt: new Date().toISOString(),
    teams,
    warnings,
    excluded: EXCLUDED
  };
  const file = sourceFile('winner', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(file);
  log(
    `\n${client.networkRequests} peticiones a la red, ` +
      `${Math.round((Date.now() - started) / 1000)} s`
  );
}

/** Un jugador con lo de la plantilla, su ficha, sus actas y lo puesto a mano. */
function playerFrom(
  playerId: string,
  listed: WinnerRosterPlayer | null,
  bio: WinnerPlayerPage | null,
  entry: WinnerPlayerStats | undefined,
  team: string,
  warn: Warn
): SourcePlayer {
  const fix = PLAYERS.jugadores[playerId];
  const fromBox = entry ? splitWinnerFullName(`${entry.firstName} ${entry.lastName}`) : null;
  const pick = (value: string | undefined): string | undefined => value?.trim() || undefined;
  const firstName =
    fix?.firstName ??
    pick(listed?.firstName) ??
    pick(bio?.firstName) ??
    pick(fromBox?.firstName) ??
    '';
  const lastName =
    fix?.lastName ?? pick(listed?.lastName) ?? pick(bio?.lastName) ?? pick(fromBox?.lastName) ?? '';
  const label = `${team}: ${firstName} ${lastName} (${playerId})`;
  if (lastName === '' && entry)
    warn(`${team}: jugador ${playerId} jugó y no tiene nombre en inglés`);
  if (!bio) warn(`${label}: sin ficha`);

  const nationality =
    (fix?.nationality ? toNationCode(fix.nationality) : null) ??
    winnerNationality(bio?.nationalityCodes ?? []);
  if ((bio?.nationalityCodes.length ?? 0) > 1) {
    log(`  revisar: ${label}: ${bio?.nationalityRaw ?? ''}; se toma ${nationality ?? '?'}`);
  }
  const heightCm = fix?.heightCm ?? listed?.heightCm ?? bio?.heightCm ?? null;
  const positionRaw = listed?.positionRaw ?? bio?.positionRaw ?? null;
  const position = fix?.position ?? winnerPosition(positionRaw, heightCm);
  if (positionRaw && !position) warn(`${label}: puesto no reconocido «${positionRaw}»`);
  const rawBirth = fix?.birthDate ?? listed?.birthDate ?? bio?.birthDate ?? null;
  const birthDate = plausibleBirthDate(rawBirth, SEASON_START_YEAR);
  if (rawBirth && !birthDate) warn(`${label}: fecha de nacimiento imposible «${rawBirth}»`);
  return {
    sourceId: playerId,
    firstName,
    lastName,
    nickname: listed?.nickname ?? bio?.nickname ?? null,
    birthDate,
    age: null,
    nationality,
    nationalityRaw: bio?.nationalityRaw ?? null,
    position,
    positionRaw,
    heightCm,
    weightKg: null,
    shirtNumber: listed?.shirtNumber ?? bio?.shirtNumber ?? null,
    licence: null,
    stats: entry?.stats ?? null
  };
}

/**
 * El entrenador del acta del primer partido de liga regular del club (por
 * fecha), con la fecha y la nacionalidad del fichero a mano. Sin fecha ni
 * edad a mano, se queda sin entrenador real (el montaje lo descarta y el
 * juego se inventa uno). Avisa de cada cambio.
 */
function coachOf(
  teamId: string,
  teamGames: readonly WinnerGame[],
  warn: Warn,
  label: string
): SourceCoach | null {
  const sequence: { date: string; name: string; coachId: string | null }[] = [];
  const byDate = [...teamGames].sort(
    (a, b) => (a.date ?? '').localeCompare(b.date ?? '') || Number(a.gameId) - Number(b.gameId)
  );
  for (const game of byDate) {
    const coach = game.homeId === teamId ? game.homeCoach : game.awayCoach;
    if (coach && sequence[sequence.length - 1]?.name !== coach.name) {
      sequence.push({ date: game.date ?? '?', ...coach });
    }
  }
  if (sequence.length > 1) {
    warn(
      `${label}: entrenadores en las actas: ` +
        sequence.map((entry) => `${entry.name} (desde ${entry.date})`).join(', ')
    );
  }
  const first = sequence[0];
  if (!first) {
    warn(`${label}: sin entrenador en las actas`);
    return null;
  }
  const manual = COACHES.inicio[teamId];
  if (!manual) {
    const name = splitWinnerFullName(first.name);
    warn(`${label}: entrenador ${first.name} sin fecha ni nacionalidad a mano; se inventa`);
    return {
      sourceId: first.coachId ? `entrenador-${first.coachId}` : `equipo-${teamId}`,
      firstName: name.firstName,
      lastName: name.lastName,
      birthDate: null,
      age: null,
      nationality: null,
      nationalityRaw: null
    };
  }
  // La web translitera a su manera: se comprueba por el id de entrenador y,
  // si no está a mano, por el apellido.
  const sameCoach = manual.coachId
    ? manual.coachId === first.coachId
    : plainName(manual.lastName) === plainName(splitWinnerFullName(first.name).lastName);
  if (!sameCoach) {
    warn(
      `${label}: el acta da a ${first.name} (${first.coachId ?? '?'}) y a mano está ` +
        `${manual.firstName} ${manual.lastName} (${manual.coachId ?? '?'})`
    );
  }
  const coach = coachFromManual(
    manual,
    first.coachId ? `entrenador-${first.coachId}` : `equipo-${teamId}`
  );
  if (!coach.birthDate && coach.age === null) warn(`${label}: entrenador ${first.name} sin fecha`);
  if (!coach.nationality) warn(`${label}: entrenador ${first.name} sin nacionalidad`);
  return coach;
}

await main();
