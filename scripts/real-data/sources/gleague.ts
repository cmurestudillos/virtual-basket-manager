import { createHttpClient, type HttpClient } from '../lib/http';
import { coachFromManual, loadManualJson, type ManualCoach } from '../lib/manual';
import { toNationCode } from '../lib/nationalities';
import { plausibleBirthDate } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type { SourceCoach, SourceLeague, SourcePlayer, SourceTeam } from '../lib/source-types';
import {
  apiRows,
  gleaguePosition,
  leagueOrder,
  mergePerson,
  parseApiPlayerIndex,
  parseApiPlayerInfo,
  parseApiRoster,
  parseApiStandings,
  parseApiTotals,
  splitUsaName,
  sumStats,
  usaNationality,
  type ApiPerson,
  type ApiTotalsRow,
  type UsaPlayerFix
} from './usa-parse';

/**
 * Extractor de la G League (`usa-2`), temporada 2025-26.
 *
 *   pnpm real:gleague            usa la caché de descargas
 *   pnpm real:gleague --force    lo vuelve a descargar todo
 *
 * - Sólo la fase regular: 36 partidos por club (diciembre-marzo). El Tip-Off
 *   Tournament de noviembre (con su Winter Showcase Cup) y los playoffs, no.
 * - La liga real tiene 31 clubes y la del juego 16: entran los 16 mejores de
 *   la fase regular (porcentaje de victorias y diferencia de puntos) que son
 *   de EE. UU.; el de México y el de Canadá no. Los demás se valoran con la
 *   liga entera y se quedan fuera (`excluded`).
 * - Fuente: la API oficial de estadísticas (`stats.gleague.nba.com`,
 *   `LeagueID=20`): totales y titulares por club, plantilla final, índice de
 *   jugadores y la ficha de quien ya no estaba en ninguna plantilla.
 * - El puesto sale de la altura y el juego (`gleaguePosition`): la API sólo
 *   da G, F y C.
 * - La escala sube un tercio de escalón hacia la NBA (`SCALE`): con la de la
 *   liga ficticia, los mismos jugadores salían bastante más bajos que en las
 *   ligas europeas a las que se fueron.
 * - Entrenadores: la API no los da. El del inicio, a mano
 *   (`gleague-entrenadores.json`); sin fecha, se inventa.
 */

const SEASON_START_YEAR = 2025;
const API = 'https://stats.gleague.nba.com/stats';
const API_HEADERS = {
  Referer: 'https://gleague.nba.com/',
  Origin: 'https://gleague.nba.com',
  Accept: 'application/json, text/plain, */*'
};
const SEASON = '2025-26';
const GAMES_PER_TEAM = 36;
/** Plazas de la G League en el juego (`usa-2`). */
const TEAMS_IN_GAME = 16;
/** Un tercio de escalón hacia la NBA ficticia. */
const SCALE = { league: 'usa-2', stepsDown: -1 / 3 };

interface Club {
  /** Abreviatura de la API. */
  code: string;
  name: string;
  city: string;
  pavilion: string;
  capacity: number;
  /** País si no es EE. UU.: no entra en el juego. */
  country?: string;
}

/**
 * Los 31, por `TeamID` de la API: nombre, ciudad, pabellón y aforo de la
 * Wikipedia al empezar la temporada (en 2026-27 dos cambian de nombre).
 */
const CLUBS: Record<string, Club> = {
  '1612709905': club('SBL', 'South Bay Lakers', 'El Segundo', 'UCLA Health Training Center', 750),
  '1612709925': club('OSC', 'Osceola Magic', 'Kissimmee', 'Silver Spurs Arena', 8_000),
  '1612709922': club('GBO', 'Greensboro Swarm', 'Greensboro', 'Novant Health Fieldhouse', 2_500),
  '1612709931': {
    ...club('MXC', 'Mexico City Capitanes', 'Ciudad de México', 'Mexico City Arena', 22_300),
    country: 'MEX'
  },
  '1612709893': club('CLC', 'Cleveland Charge', 'Cleveland', 'Public Auditorium', 10_000),
  '1612709914': club('STO', 'Stockton Kings', 'Stockton', 'Adventist Health Arena', 11_193),
  '1612709908': club('RGV', 'Rio Grande Valley Vipers', 'Edinburg', 'Bert Ogden Arena', 9_000),
  '1612709920': {
    ...club('RAP', 'Raptors 905', 'Mississauga', 'Paramount Fine Foods Centre', 5_000),
    country: 'CAN'
  },
  '1612709932': club('MCC', 'Motor City Cruise', 'Detroit', 'Wayne State Fieldhouse', 3_000),
  '1612709890': club('AUS', 'Austin Spurs', 'Cedar Park', 'H-E-B Center at Cedar Park', 7_200),
  '1612709911': club('IWA', 'Iowa Wolves', 'Des Moines', "Casey's Center", 16_110),
  '1612709928': club('CCG', 'Capital City Go-Go', 'Washington', 'CareFirst Arena', 4_200),
  '1612709933': club('RCR', 'Rip City Remix', 'Portland', 'Chiles Center', 4_852),
  '1612709915': club(
    'MNE',
    'Maine Celtics',
    'Portland (Maine)',
    'Portland Exposition Building',
    3_100
  ),
  '1612709924': club('SDC', 'San Diego Clippers', 'Oceanside', 'Frontwave Arena', 7_500),
  '1612709921': club('LIN', 'Long Island Nets', 'Uniondale', 'Nassau Coliseum', 13_500),
  '1612709904': club('SXF', 'Sioux Falls Skyforce', 'Sioux Falls', 'Sanford Pentagon', 3_250),
  '1612709909': club('DEL', 'Delaware Blue Coats', 'Wilmington', 'Chase Fieldhouse', 2_500),
  '1612709910': club(
    'NOB',
    'Noblesville Boom',
    'Noblesville',
    'The Arena at Innovation Mile',
    3_400
  ),
  '1612709918': club('TEX', 'Texas Legends', 'Frisco', 'Comerica Center', 4_500),
  '1612709903': club('SLC', 'Salt Lake City Stars', 'West Valley City', 'Maverik Center', 12_500),
  '1612709913': club('BHM', 'Birmingham Squadron', 'Birmingham', 'Legacy Arena', 17_654),
  '1612709902': club('SCW', 'Santa Cruz Warriors', 'Santa Cruz', 'Kaiser Permanente Arena', 2_505),
  '1612709923': club('WCB', 'Windy City Bulls', 'Hoffman Estates', 'Now Arena', 10_000),
  '1612709929': club('CPS', 'College Park Skyhawks', 'College Park', 'Gateway Center Arena', 3_500),
  '1612709889': club('OKL', 'Oklahoma City Blue', 'Oklahoma City', 'Paycom Center', 18_203),
  '1612709919': club(
    'WES',
    'Westchester Knicks',
    'White Plains',
    'Westchester County Center',
    5_000
  ),
  '1612709934': club('VAL', 'Valley Suns', 'Tempe', 'Mullett Arena', 5_000),
  '1612709926': club('MHU', 'Memphis Hustle', 'Southaven', 'Landers Center', 8_362),
  '1612709917': club('GRG', 'Grand Rapids Gold', 'Grand Rapids', 'Van Andel Arena', 11_500),
  '1612709927': club('WIS', 'Wisconsin Herd', 'Oshkosh', 'Oshkosh Arena', 3_500)
};

function club(code: string, name: string, city: string, pavilion: string, capacity: number): Club {
  return { code, name, city, pavilion, capacity };
}

/* ------------------------------------------------------------ a mano */

/**
 * - `gleague-entrenadores.json`: `inicio`, por abreviatura de la API, el
 *   primer entrenador (nombre, `birth` o `age`, `nationality`, fuente). Sólo
 *   los que tienen fecha: los demás se inventan.
 * - `nba-jugadores.json`: las correcciones de jugadores, por `PERSON_ID` (el
 *   mismo en la NBA y la G League).
 */
type CoachEntry = ManualCoach & { despues?: string; fuente?: string };

const PLAYERS = loadManualJson<{ jugadores: Record<string, UsaPlayerFix> }>('nba-jugadores.json', {
  jugadores: {}
});
const COACHES = loadManualJson<{ inicio: Record<string, CoachEntry> }>(
  'gleague-entrenadores.json',
  {
    inicio: {}
  }
);

type Log = (message: string) => void;
const log: Log = (message) => console.log(message);

async function api(client: HttpClient, path: string): Promise<string> {
  return client.get(`${API}/${path}`, {
    headers: API_HEADERS,
    accept: (body) => apiRows(body) !== null
  });
}

const TOTALS_QUERY =
  'LastNGames=0&MeasureType=Base&Month=0&OpponentTeamID=0&PORound=0&PaceAdjust=N&PerMode=Totals' +
  `&Period=0&PlusMinus=N&Rank=N&Season=${SEASON}&SeasonType=Regular%20Season&LeagueID=20`;

function teamCoach(info: Club, warn: Log): SourceCoach | null {
  const entry = COACHES.inicio[info.code];
  if (!entry) {
    log(`  ${info.name}: sin entrenador con fecha; se inventa`);
    return null;
  }
  if (entry.despues) log(`  ${info.name}: después, ${entry.despues}`);
  const coach = coachFromManual(entry, `gleague-${info.code}`);
  if (!coach.birthDate && coach.age === null)
    warn(`${info.name}: ${entry.firstName} ${entry.lastName} sin fecha ni edad; se inventa`);
  return coach;
}

/* -------------------------------------------------------- extracción */

async function main(): Promise<void> {
  const { force } = cliOptions();
  const started = Date.now();
  const client = createHttpClient({ minDelayMs: 1_500, force, log, retries: 6, timeoutMs: 90_000 });
  const warnings: string[] = [];
  const warn: Log = (message) => {
    warnings.push(message);
    log(`  aviso: ${message}`);
  };

  const standings = parseApiStandings(
    await api(client, `leaguestandingsv3?LeagueID=20&Season=${SEASON}&SeasonType=Regular%20Season`)
  );
  if (standings.length !== Object.keys(CLUBS).length)
    warn(`${standings.length} clubes en la clasificación y aquí hay ${Object.keys(CLUBS).length}`);
  const rank = leagueOrder(standings);
  const ordered = [...standings].sort(
    (a, b) => (rank.get(a.teamId) ?? 99) - (rank.get(b.teamId) ?? 99)
  );
  const inGame = ordered
    .filter((row) => CLUBS[row.teamId] && !CLUBS[row.teamId]?.country)
    .slice(0, TEAMS_IN_GAME)
    .map((row) => row.teamId);
  const last = ordered.find((row) => row.teamId === inGame[inGame.length - 1]);
  const next = ordered.find(
    (row) => CLUBS[row.teamId] && !CLUBS[row.teamId]?.country && !inGame.includes(row.teamId)
  );
  if (last && next && last.wins === next.wins)
    warn(`el corte de los ${TEAMS_IN_GAME} cae en un empate (${last.name} y ${next.name})`);

  log('Totales, titulares y plantillas…');
  const rows: ApiTotalsRow[] = [];
  const people = new Map<string, ApiPerson>();
  for (const standing of ordered) {
    const teamId = standing.teamId;
    const teamRows = parseApiTotals(
      await api(client, `leaguedashplayerstats?TeamID=${teamId}&${TOTALS_QUERY}`)
    );
    const starts = new Map(
      parseApiTotals(
        await api(
          client,
          `leaguedashplayerstats?TeamID=${teamId}&StarterBench=Starters&${TOTALS_QUERY}`
        )
      ).map((row) => [row.personId, row.stats.games])
    );
    for (const row of teamRows) {
      row.stats.starts = starts.get(row.personId) ?? 0;
      rows.push(row);
    }
    for (const person of parseApiRoster(
      await api(client, `commonteamroster?LeagueID=20&Season=${SEASON}&TeamID=${teamId}`)
    ))
      if (!people.has(person.personId)) people.set(person.personId, person);
  }
  const index = new Map(
    parseApiPlayerIndex(
      await api(client, `playerindex?LeagueID=20&Season=${SEASON}&Historical=0`)
    ).map((person) => [person.personId, person])
  );

  // Cada persona, con sus clubes sumados y en el que más minutos jugó.
  const byPerson = new Map<string, ApiTotalsRow[]>();
  for (const row of rows) byPerson.set(row.personId, [...(byPerson.get(row.personId) ?? []), row]);

  log(`${byPerson.size} jugadores; fichas de los que no están en ninguna plantilla…`);
  for (const personId of byPerson.keys()) {
    const base = people.get(personId) ?? index.get(personId);
    let person: ApiPerson | null = base ? mergePerson(base, index.get(personId)) : null;
    if (!person || !person.birthDate || person.heightCm === null || !person.country) {
      const info = parseApiPlayerInfo(
        await api(client, `commonplayerinfo?LeagueID=20&PlayerID=${personId}`)
      );
      person = person ? mergePerson(person, info) : info;
    }
    if (person) people.set(personId, person);
  }

  const teams: SourceTeam[] = [];
  const excluded: string[] = [];
  for (const standing of ordered) {
    const info = CLUBS[standing.teamId];
    if (!info) {
      warn(`club desconocido en la clasificación: ${standing.name} (${standing.teamId})`);
      continue;
    }
    const position = rank.get(standing.teamId) as number;
    if (standing.wins + standing.losses !== GAMES_PER_TEAM)
      warn(
        `${info.name}: ${standing.wins + standing.losses} partidos y deberían ser ${GAMES_PER_TEAM}`
      );
    const plays = inGame.includes(standing.teamId);
    if (!plays) excluded.push(standing.teamId);
    const players: SourcePlayer[] = [];
    for (const [personId, list] of byPerson) {
      const home = list.reduce((best, row) =>
        row.stats.seconds > best.stats.seconds ? row : best
      );
      if (home.teamId !== standing.teamId) continue;
      const stats = sumStats(list.map((row) => row.stats));
      const person = people.get(personId);
      const fix = PLAYERS.jugadores[personId];
      const named =
        person && person.lastName
          ? { firstName: person.firstName, lastName: person.lastName }
          : splitUsaName(home.name);
      const firstName = fix?.firstName ?? named.firstName;
      const lastName = fix?.lastName ?? named.lastName;
      const minutes = Math.round(stats.seconds / 60);
      const label = `${info.name}: ${firstName} ${lastName} (${minutes} min)`;
      if (list.length > 1)
        log(
          `  ${firstName} ${lastName}: ${list.map((row) => `${CLUBS[row.teamId]?.code ?? row.teamCode} ${Math.round(row.stats.seconds / 60)}`).join(', ')} min → ${info.code}`
        );
      const manualNation = fix?.nationality ? toNationCode(fix.nationality) : null;
      const fromApi = usaNationality(person?.country);
      const nationality = manualNation ?? fromApi ?? 'USA';
      if (!manualNation && !fromApi && plays)
        warn(`${label}: nacionalidad «${person?.country ?? 'vacía'}» sin reconocer; se pone USA`);
      const birthDate = plausibleBirthDate(
        fix?.birthDate ?? person?.birthDate ?? null,
        SEASON_START_YEAR
      );
      if (!birthDate && plays) warn(`${label}: sin fecha de nacimiento`);
      const heightCm = fix?.heightCm ?? person?.heightCm ?? null;
      if (heightCm === null && plays && minutes >= 100) warn(`${label}: sin altura`);
      players.push({
        sourceId: personId,
        firstName,
        lastName,
        nickname: null,
        birthDate,
        age: null,
        nationality,
        nationalityRaw: fix?.nationality ?? person?.country ?? null,
        position: gleaguePosition(person?.position, heightCm, stats),
        positionRaw: person?.position ?? null,
        heightCm,
        weightKg: person?.weightKg ?? null,
        shirtNumber: person?.shirtNumber ?? null,
        licence: null,
        stats
      });
    }
    players.sort((a, b) => (b.stats?.seconds ?? 0) - (a.stats?.seconds ?? 0));
    log(
      `${position}. ${info.name}: ${standing.wins}-${standing.losses}, ${players.length} jugadores` +
        (plays ? '' : info.country ? ` (fuera: ${info.country})` : ' (fuera)')
    );
    teams.push({
      sourceId: standing.teamId,
      name: info.name,
      shortName: info.code,
      city: info.city,
      pavilionName: info.pavilion,
      pavilionCapacity: info.capacity,
      finalPosition: position,
      players,
      coach: plays ? teamCoach(info, warn) : null,
      ...(info.country ? { country: info.country } : {})
    });
  }

  const league: SourceLeague = {
    competitionId: 'usa-2',
    name: 'NBA G League',
    shortName: 'G League',
    country: 'USA',
    seasonStartYear: SEASON_START_YEAR,
    source: 'https://gleague.nba.com',
    extractedAt: new Date().toISOString(),
    teams,
    warnings,
    excluded,
    scale: SCALE
  };
  const file = sourceFile('gleague', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(`fuera del juego: ${excluded.map((id) => CLUBS[id]?.code ?? id).join(', ')}`);
  log(file);
  log(
    `\n${client.networkRequests} peticiones a la red, ${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
