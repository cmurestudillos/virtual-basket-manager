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
  SourceStats,
  SourceTeam
} from '../lib/source-types';
import { plainName } from './aba-parse';
import {
  aggregateBnxtBoxScores,
  bnxtName,
  bnxtNationality,
  bnxtPosition,
  parseBnxtBoxScore,
  parseBnxtRoster,
  parseBnxtSchedule,
  parseBnxtStandings,
  parseBnxtTeams,
  type BnxtBoxLine,
  type BnxtGame,
  type BnxtPerson,
  type BnxtPlayerStats,
  type BnxtRosterPlayer
} from './bnxt-parse';

/**
 * Extractor de la BNXT League, la liga conjunta de Bélgica y los Países Bajos
 * (`bnxt-1`).
 *
 *   pnpm real:bnxt            usa la caché de descargas
 *   pnpm real:bnxt --force    lo vuelve a descargar todo
 *
 * - La 2025-26 tuvo 18 equipos (10 belgas y 8 neerlandeses), los mismos que la
 *   liga del juego: entran todos.
 * - Liga regular: la fase conjunta, todos contra todos a doble vuelta (34
 *   partidos por club, fase 169 de la API). Los playoffs nacionales que vienen
 *   después no cuentan. El puesto final es el de esa clasificación.
 * - Estadísticas: la suma de las actas. Un partido dado por perdido no tiene
 *   acta (Rotterdam–Den Helder, 0-40): cuenta en la clasificación, no en las
 *   estadísticas.
 * - Quien jugó en dos equipos (un fichaje de mitad de temporada dentro de la
 *   liga) se queda sólo en el que más minutos jugó: el id de la API es el de la
 *   persona.
 * - Entrenadores: a mano (`bnxt-entrenadores.json`); la API sólo tiene el del
 *   final de la temporada y las actas no lo traen.
 * - Cada club lleva su país (`SourceTeam.country`, BEL o NED), que da la API.
 *
 * Un segundo y medio entre peticiones; la primera vez, unas 345.
 */

const SEASON_START_YEAR = 2025;
const API = 'https://bnxt.sportpress.info/api/v1';
/** La temporada en la API es el año en que acaba: 2026 es la 2025-26. */
const API_SEASON = '2026';
/** «BNXT League 2025 - 2026». */
const COMPETITION = '24';
/** «Regular Season 2025-26». */
const REGULAR_PHASE = '169';
const GAMES_PER_TEAM = 34;
/**
 * La clave que la web manda en cada petición a su API (`X-Authorization`). Es
 * pública: va escrita en el JavaScript de bnxtleague.com (`/js/app.<hash>.js`).
 * Si deja de valer (la API contesta 401), se copia de ahí.
 */
const API_KEY = 'BWSyE7sgg9QAurh2JX9cpjzjGc652BWLuNUS';

interface TeamInfo {
  name: string;
  shortName: string;
  city: string;
  pavilion: string;
  capacity: number;
}

/**
 * Los clubes, por id de club de la API (`uu_team_id`, el mismo todas las
 * temporadas): nombre sin patrocinador (se quedan Landstede Hammers y Heroes
 * Den Bosch, que son nombres del club), abreviatura de la API, ciudad (con su
 * nombre en español si lo tiene) y el pabellón con el aforo de la Wikipedia
 * inglesa («2025–26 BNXT League»).
 */
const BNXT_TEAMS: Record<string, TeamInfo> = {
  '3': club('Antwerp Giants', 'ANT', 'Amberes', 'Lotto Arena', 5_218),
  '2': club('BC Oostende', 'OOS', 'Ostende', 'COREtec Dôme', 5_000),
  '19': club('Okapi Aalst', 'AAL', 'Aalst', 'Okapi Forum', 2_800),
  '32': club('Kortrijk Spurs', 'KOR', 'Kortrijk', 'Sportcampus Lange Munte', 2_400),
  '5': club('Limburg United', 'LIM', 'Hasselt', 'Alverberg Sporthal', 1_730),
  '18': club('Heroes Den Bosch', 'DBO', "'s-Hertogenbosch", 'Maaspoort', 2_800),
  '7': club('Donar', 'GRO', 'Groninga', 'MartiniPlaza', 4_350),
  '22': club('Kangoeroes Mechelen', 'MEC', 'Malinas', 'Winketkaai', 1_500),
  '21': club(
    'Brussels Basketball',
    'BRU',
    'Bruselas',
    'Complexe sportif de Neder-Over-Heembeek',
    1_200
  ),
  '12': club('ZZ Leiden', 'LEI', 'Leiden', 'Vijf Meihal', 2_000),
  '1': club('Spirou Charleroi', 'CHA', 'Charleroi', 'Spiroudome', 6_200),
  '20': club('Leuven Bears', 'LEU', 'Lovaina', 'Sportoase', 3_400),
  '14': club('Den Helder Suns', 'DHE', 'Den Helder', 'Sporthal Quelderduijn', 1_250),
  '9': club('Landstede Hammers', 'ZWO', 'Zwolle', 'Landstede Sportcentrum', 1_200),
  '11': club('LWD Basket', 'LWD', 'Leeuwarden', 'Kalverdijkje', 1_700),
  '4': club('Mons-Hainaut', 'MON', 'Mons', 'Mons.Arena', 4_000),
  '10': club('Rotterdam City', 'RCB', 'Róterdam', 'Topsportcentrum Rotterdam', 2_500),
  '8': club('BAL Weert', 'BAL', 'Weert', 'Sporthal Boshoven', 1_000)
};

function club(
  name: string,
  shortName: string,
  city: string,
  pavilion: string,
  capacity: number
): TeamInfo {
  return { name, shortName, city, pavilion, capacity };
}

/* ------------------------------------------------------------ a mano */

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `bnxt-entrenadores.json`: `inicio`, por id de club de la API
 *   (`uu_team_id`), el primer entrenador de la temporada (nombre de uso con sus
 *   tildes, nacimiento como la FEB «dd/mm/aaaa», `nationality`, la fuente y
 *   `despues`, quién le sustituyó), y `enApi` si la API escribe de otra forma
 *   al primer entrenador del final («Dennis Wucherer»). Sin fecha, el juego se
 *   lo inventa.
 * - `bnxt-jugadores.json`: `jugadores`, por id de jugador de la API, lo que la
 *   API da mal o no da: nombre de uso o con sus diacríticos (`firstName`,
 *   `lastName`) y, si hace falta, `birthDate` (AAAA-MM-DD), `nationality`
 *   (COI), `heightCm` o `position`.
 */
type CoachEntry = ManualCoach & { despues?: string; enApi?: string };

interface CoachesManual {
  inicio: Record<string, CoachEntry>;
}

interface PlayerFix {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  nationality?: string;
  heightCm?: number;
  position?: SourcePosition;
}

const PLAYERS = loadManualJson<{ jugadores: Record<string, PlayerFix> }>('bnxt-jugadores.json', {
  jugadores: {}
});
const COACHES = loadManualJson<CoachesManual>('bnxt-entrenadores.json', { inicio: {} });

type Log = (message: string) => void;

/* ---------------------------------------------------------- descargas */

function api(client: HttpClient, path: string): Promise<string> {
  const url = `${API}/${path}${path.includes('?') ? '&' : '?'}lang=en`;
  return client.get(url, {
    headers: {
      'X-Authorization': API_KEY,
      'X-Localization': 'en',
      Accept: 'application/json'
    },
    accept: (body) => body.trimStart().startsWith('{"data"')
  });
}

/* ------------------------------------------------------ entrenadores */

function manualCoach(
  clubId: string,
  teamName: string,
  finalCoaches: readonly string[],
  warn: Log,
  log: Log
): SourceCoach | null {
  const entry = COACHES.inicio[clubId];
  if (!entry) {
    warn(
      `${teamName}: sin entrenador a mano (el del final: ${finalCoaches.join(', ')}); se inventa`
    );
    return null;
  }
  // El del final tiene que ser el del inicio o uno de los que vinieron después.
  const known = [`${entry.firstName} ${entry.lastName}`, entry.enApi ?? '', entry.despues ?? '']
    .map(plainName)
    .filter(Boolean);
  for (const name of finalCoaches) {
    if (!known.some((text) => text.includes(plainName(name)))) {
      warn(
        `${teamName}: el entrenador del final en la API es ${name} y a mano está ${entry.firstName} ${entry.lastName}`
      );
    }
  }
  if (entry.despues)
    log(`  ${teamName}: empezó ${entry.firstName} ${entry.lastName}; después, ${entry.despues}`);
  const coach = coachFromManual(entry, `club-${clubId}`);
  if (!coach.birthDate && coach.age === null) {
    log(
      `  ${teamName}: ${entry.firstName} ${entry.lastName} sin fecha; el juego se inventa el entrenador`
    );
  }
  if (!coach.nationality) warn(`${teamName}: entrenador sin nacionalidad`);
  return coach;
}

/* -------------------------------------------------------- extracción */

async function extract(client: HttpClient, log: Log): Promise<SourceLeague> {
  const warnings: string[] = [];
  const warn: Log = (message) => {
    warnings.push(message);
    log(`  aviso BNXT: ${message}`);
  };

  log('BNXT 2025-26: fases, equipos y clasificación…');
  const phases = JSON.parse(await api(client, `phase/season/${API_SEASON}`)) as {
    data: { competition: { id: number }; phases: { id: number; name: string }[] }[];
  };
  const regular = phases.data
    .find((entry) => String(entry.competition.id) === COMPETITION)
    ?.phases.find((phase) => String(phase.id) === REGULAR_PHASE);
  if (!regular || !/regular season/i.test(regular.name)) {
    throw new Error(
      `BNXT: la fase ${REGULAR_PHASE} no es la liga regular de la competición ${COMPETITION}.`
    );
  }
  const apiTeams = parseBnxtTeams(
    await api(client, `competition-team/all?competition_id=${COMPETITION}`)
  );
  const clubOf = new Map(apiTeams.map((team) => [team.teamId, team]));
  const standings = parseBnxtStandings(
    await api(client, `standings/competition/${COMPETITION}/phase/${REGULAR_PHASE}`)
  );
  if (standings.length !== Object.keys(BNXT_TEAMS).length) {
    throw new Error(`BNXT: la clasificación trae ${standings.length} equipos.`);
  }

  log('BNXT: calendarios y plantillas…');
  const games = new Map<string, BnxtGame>();
  const rosters = new Map<string, BnxtRosterPlayer[]>();
  for (const standing of standings) {
    const schedule = parseBnxtSchedule(
      await api(
        client,
        `schedule/club/${API_SEASON}?clubs%5B0%5D=1&clubs%5B1%5D=2&competition_team_id=${standing.teamId}&month=-1`
      )
    );
    for (const game of schedule) {
      if (game.phaseId === REGULAR_PHASE) games.set(game.gameId, game);
    }
    rosters.set(
      standing.teamId,
      parseBnxtRoster(await api(client, `roster/team-players/${standing.teamId}`))
    );
  }
  const regularGames = [...games.values()].sort(
    (a, b) => a.time.localeCompare(b.time) || Number(a.gameId) - Number(b.gameId)
  );
  const expected = (standings.length * GAMES_PER_TEAM) / 2;
  if (regularGames.length !== expected) {
    warn(
      `${regularGames.length} partidos de liga regular en los calendarios y deberían ser ${expected}`
    );
  }

  log(`BNXT: ${regularGames.length} actas de liga regular…`);
  const lines: BnxtBoxLine[] = [];
  const boxGames = new Map<string, number>();
  for (const game of regularGames) {
    const sides = parseBnxtBoxScore(
      await api(client, `boxscore/game/${COMPETITION}/${game.gameId}`),
      game.gameId
    );
    if (sides.length === 0) {
      warn(
        `partido ${game.gameId} (${game.time.slice(0, 10)}, ${game.home.score}-${game.away.score}) sin acta: ` +
          'dado por perdido; cuenta en la clasificación, no en las estadísticas'
      );
      continue;
    }
    for (const side of sides) {
      const score = side.teamId === game.home.teamId ? game.home.score : game.away.score;
      const points = side.lines.reduce((sum, line) => sum + line.points, 0);
      const name = clubOf.get(side.teamId)?.name ?? side.teamId;
      if (points !== score)
        warn(`acta ${game.gameId}: ${name} suma ${points} y el tanteo es ${score}`);
      const starters = side.lines.filter((line) => line.starter).length;
      if (starters !== 5) warn(`acta ${game.gameId}: ${name} con ${starters} titulares`);
      boxGames.set(side.teamId, (boxGames.get(side.teamId) ?? 0) + 1);
      lines.push(...side.lines);
    }
  }

  // Quien jugó en dos equipos se queda en el que más minutos jugó.
  const aggregated = aggregateBnxtBoxScores(lines);
  const keptTeam = new Map<string, BnxtPlayerStats>();
  for (const entry of aggregated) {
    const current = keptTeam.get(entry.playerId);
    if (!current || entry.stats.seconds > current.stats.seconds)
      keptTeam.set(entry.playerId, entry);
  }
  for (const entry of aggregated) {
    const kept = keptTeam.get(entry.playerId)!;
    if (kept !== entry) {
      log(
        `  ${entry.line.person.firstName} ${entry.line.person.lastName} jugó en ${clubOf.get(entry.teamId)?.name} ` +
          `(${entry.stats.games} p.) y en ${clubOf.get(kept.teamId)?.name} (${kept.stats.games} p.): se queda en el segundo`
      );
    }
  }
  const rosterOf = new Map<string, BnxtRosterPlayer>();
  for (const roster of rosters.values()) {
    for (const player of roster)
      if (!rosterOf.has(player.playerId)) rosterOf.set(player.playerId, player);
  }

  const teams: SourceTeam[] = [];
  for (const standing of standings) {
    const apiTeam = clubOf.get(standing.teamId);
    const clubId = apiTeam?.clubId ?? '';
    const info = BNXT_TEAMS[clubId];
    if (!info) throw new Error(`BNXT: club desconocido ${clubId} (${standing.name})`);
    if (!standing.country) throw new Error(`BNXT: ${standing.name} sin país en la API.`);
    log(`BNXT ${standing.position}. ${info.name}`);

    const teamGames = regularGames.filter(
      (game) => game.home.teamId === standing.teamId || game.away.teamId === standing.teamId
    );
    const wins = teamGames.filter((game) =>
      game.home.teamId === standing.teamId
        ? game.home.score > game.away.score
        : game.away.score > game.home.score
    ).length;
    if (wins !== standing.wins) {
      warn(
        `${info.name}: ${wins} victorias en el calendario y ${standing.wins} en la clasificación`
      );
    }
    const withBox = boxGames.get(standing.teamId) ?? 0;
    if (teamGames.length !== GAMES_PER_TEAM) {
      warn(`${info.name}: ${teamGames.length} partidos y deberían ser ${GAMES_PER_TEAM}`);
    }
    if (withBox !== teamGames.length)
      log(`  ${info.name}: ${withBox} actas de ${teamGames.length} partidos`);

    // La plantilla del final y los que jugaron aquí y ya no están en ella.
    const people = new Map<string, { person: BnxtPerson; listed: BnxtRosterPlayer | null }>();
    for (const listed of rosters.get(standing.teamId) ?? []) {
      people.set(listed.playerId, { person: listed, listed });
    }
    for (const entry of aggregated.filter((item) => item.teamId === standing.teamId)) {
      if (!people.has(entry.playerId)) {
        log(
          `  ${info.name}: ${entry.line.person.firstName} ${entry.line.person.lastName} jugó y ya no está en la plantilla`
        );
        people.set(entry.playerId, {
          person: entry.line.person,
          listed: rosterOf.get(entry.playerId) ?? null
        });
      }
    }
    const players: SourcePlayer[] = [];
    for (const [playerId, { person, listed }] of people) {
      const kept = keptTeam.get(playerId);
      // Jugó más en otro equipo: allí se queda.
      if (kept && kept.teamId !== standing.teamId) continue;
      players.push(bnxtPlayer(person, listed, kept ?? null, info.name, warn));
    }

    teams.push({
      sourceId: clubId,
      name: info.name,
      shortName: info.shortName,
      city: info.city,
      pavilionName: info.pavilion,
      pavilionCapacity: info.capacity,
      finalPosition: standing.position,
      players,
      coach: manualCoach(clubId, info.name, apiTeam?.headCoaches ?? [], warn, log),
      country: standing.country
    });
  }

  return {
    competitionId: 'bnxt-1',
    name: 'BNXT League',
    shortName: 'BNXT',
    country: 'BNL',
    seasonStartYear: SEASON_START_YEAR,
    source: 'https://bnxtleague.com',
    extractedAt: new Date().toISOString(),
    teams,
    warnings
  };
}

/** Un jugador con lo de la plantilla (o el acta, si se fue), sus actas y lo puesto a mano. */
function bnxtPlayer(
  person: BnxtPerson,
  listed: BnxtRosterPlayer | null,
  played: BnxtPlayerStats | null,
  teamName: string,
  warn: Log
): SourcePlayer {
  const fix = PLAYERS.jugadores[person.playerId];
  const nationality =
    (fix?.nationality ? toNationCode(fix.nationality) : null) ??
    bnxtNationality(person.nationalityRaw);
  const named = bnxtName(person.firstName, person.lastName, nationality);
  const firstName = fix?.firstName ?? named.firstName;
  const lastName = fix?.lastName ?? named.lastName;
  const label = `${teamName}: ${firstName} ${lastName} (${person.playerId})`;
  if (!nationality)
    warn(`${label}: nacionalidad «${person.nationalityRaw ?? ''}» (se pone la del club)`);
  const heightCm = fix?.heightCm ?? listed?.heightCm ?? null;
  const positionRaw = listed?.positionRaw ?? played?.line.positionRaw ?? null;
  const position = fix?.position ?? bnxtPosition(positionRaw, heightCm);
  if (!position) warn(`${label}: sin puesto${positionRaw ? ` («${positionRaw}»)` : ''}`);
  const stats: SourceStats | null = played?.stats ?? null;
  const rawBirth = fix?.birthDate ?? person.birthDate;
  const birthDate = plausibleBirthDate(rawBirth, SEASON_START_YEAR);
  if (!birthDate && stats) {
    warn(
      `${label}: sin fecha de nacimiento${rawBirth ? ` («${rawBirth}»)` : ''} (${Math.round(stats.seconds / 60)} min)`
    );
  }
  return {
    sourceId: person.playerId,
    firstName,
    lastName,
    nickname: null,
    birthDate,
    age: null,
    nationality,
    nationalityRaw: person.nationalityRaw,
    position,
    positionRaw,
    heightCm,
    weightKg: listed?.weightKg ?? null,
    shirtNumber: listed?.shirtNumber ?? played?.line.shirtNumber ?? null,
    licence: null,
    stats
  };
}

const log: Log = (message) => console.log(message);

async function main(): Promise<void> {
  const { force } = cliOptions();
  const started = Date.now();
  const client = createHttpClient({ minDelayMs: 1_500, force, log });
  const league = await extract(client, log);
  const file = sourceFile('bnxt', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(file);
  log(
    `\n${client.networkRequests} peticiones a la red, ${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
