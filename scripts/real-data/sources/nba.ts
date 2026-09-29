import { createHttpClient, type HttpClient } from '../lib/http';
import { coachFromManual, loadManualJson, type ManualCoach } from '../lib/manual';
import { toNationCode } from '../lib/nationalities';
import { plausibleBirthDate } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type { SourceCoach, SourceLeague, SourcePlayer, SourceTeam } from '../lib/source-types';
import {
  apiRows,
  bbrefPosition,
  bbrefSeasons,
  nameKey,
  parseApiPlayerIndex,
  parseApiStandings,
  parseApiTotals,
  parseBbrefArena,
  parseBbrefCoachBirth,
  parseBbrefCoaches,
  parseBbrefDunks,
  parseBbrefRoster,
  parseBbrefStandings,
  parseBbrefTotals,
  splitUsaName,
  surnameKey,
  usaNationality,
  type ApiPerson,
  type ApiTotalsRow,
  type BbrefBio,
  type BbrefSeason,
  type UsaPlayerFix
} from './usa-parse';

/**
 * Extractor de la NBA (`usa-1`), temporada 2025-26.
 *
 *   pnpm real:nba            usa la caché de descargas
 *   pnpm real:nba --force    lo vuelve a descargar todo
 *
 * - Sólo la fase regular: 82 partidos por club. La final de la NBA Cup no
 *   cuenta (tampoco en la liga real), ni el play-in ni los playoffs.
 * - Los treinta clubes, con su conferencia y división reales (las del juego
 *   se llaman igual) y el puesto de la fase regular con los desempates
 *   oficiales. Toronto va con el país de la liga: con el de Canadá, el cupo
 *   de jugadores del país no le dejaría fichar.
 * - Fuentes: basketball-reference (totales por club con la fila que suma a
 *   los traspasados, titulares, puesto, mates, fichas, pabellón y
 *   entrenadores; como mucho veinte peticiones por minuto) y la API oficial
 *   de estadísticas por `stats.gleague.nba.com` (la de `stats.nba.com` no
 *   contesta): nacionalidad, nombre partido, faltas y tapones recibidos.
 * - Quien jugó en varios clubes suma sus números y se queda en el que más
 *   minutos jugó.
 * - En la NBA el puesto del equipo pesa menos en el nivel del jugador
 *   (`TEAM_WEIGHT_NBA`).
 * - Entrenadores: el del inicio, a mano (`nba-entrenadores.json`), con la
 *   fecha de su ficha de basketball-reference.
 */

const SEASON_START_YEAR = 2025;
const BBREF = 'https://www.basketball-reference.com';
const API = 'https://stats.gleague.nba.com/stats';
const API_HEADERS = {
  Referer: 'https://gleague.nba.com/',
  Origin: 'https://gleague.nba.com',
  Accept: 'application/json, text/plain, */*'
};
const SEASON = '2025-26';
const GAMES_PER_TEAM = 82;
/** El peso del puesto del equipo en el nivel del jugador, en la NBA (el de siempre es 0,45). */
const TEAM_WEIGHT_NBA = 0.25;

interface Club {
  /** `TeamID` de la API. */
  apiId: string;
  /** Abreviatura de basketball-reference. */
  bbref: string;
  name: string;
  city: string;
  pavilion: string;
  capacity: number;
  conference: 'east' | 'west';
  division: string;
}

/**
 * Los treinta, por abreviatura oficial (la de la API): nombre completo sin
 * patrocinio, ciudad (en castellano si la tiene), pabellón con el nombre de la
 * 2025-26 y aforo de la Wikipedia (ni la API ni basketball-reference lo dan),
 * conferencia y división con los nombres del juego.
 */
const CLUBS: Record<string, Club> = {
  ATL: club(
    '1610612737',
    'ATL',
    'Atlanta Hawks',
    'Atlanta',
    'State Farm Arena',
    17_044,
    'east',
    'Sudeste'
  ),
  BOS: club(
    '1610612738',
    'BOS',
    'Boston Celtics',
    'Boston',
    'TD Garden',
    18_624,
    'east',
    'Atlántico'
  ),
  BKN: club(
    '1610612751',
    'BRK',
    'Brooklyn Nets',
    'Brooklyn',
    'Barclays Center',
    17_732,
    'east',
    'Atlántico'
  ),
  CHA: club(
    '1610612766',
    'CHO',
    'Charlotte Hornets',
    'Charlotte',
    'Spectrum Center',
    19_077,
    'east',
    'Sudeste'
  ),
  CHI: club(
    '1610612741',
    'CHI',
    'Chicago Bulls',
    'Chicago',
    'United Center',
    20_917,
    'east',
    'Central'
  ),
  CLE: club(
    '1610612739',
    'CLE',
    'Cleveland Cavaliers',
    'Cleveland',
    'Rocket Arena',
    19_432,
    'east',
    'Central'
  ),
  DAL: club(
    '1610612742',
    'DAL',
    'Dallas Mavericks',
    'Dallas',
    'American Airlines Center',
    19_200,
    'west',
    'Suroeste'
  ),
  DEN: club(
    '1610612743',
    'DEN',
    'Denver Nuggets',
    'Denver',
    'Ball Arena',
    19_520,
    'west',
    'Noroeste'
  ),
  DET: club(
    '1610612765',
    'DET',
    'Detroit Pistons',
    'Detroit',
    'Little Caesars Arena',
    20_332,
    'east',
    'Central'
  ),
  GSW: club(
    '1610612744',
    'GSW',
    'Golden State Warriors',
    'San Francisco',
    'Chase Center',
    18_064,
    'west',
    'Pacífico'
  ),
  HOU: club(
    '1610612745',
    'HOU',
    'Houston Rockets',
    'Houston',
    'Toyota Center',
    18_055,
    'west',
    'Suroeste'
  ),
  IND: club(
    '1610612754',
    'IND',
    'Indiana Pacers',
    'Indianápolis',
    'Gainbridge Fieldhouse',
    17_923,
    'east',
    'Central'
  ),
  LAC: club(
    '1610612746',
    'LAC',
    'Los Angeles Clippers',
    'Los Ángeles',
    'Intuit Dome',
    18_000,
    'west',
    'Pacífico'
  ),
  LAL: club(
    '1610612747',
    'LAL',
    'Los Angeles Lakers',
    'Los Ángeles',
    'Crypto.com Arena',
    18_997,
    'west',
    'Pacífico'
  ),
  MEM: club(
    '1610612763',
    'MEM',
    'Memphis Grizzlies',
    'Memphis',
    'FedExForum',
    17_794,
    'west',
    'Suroeste'
  ),
  MIA: club('1610612748', 'MIA', 'Miami Heat', 'Miami', 'Kaseya Center', 19_600, 'east', 'Sudeste'),
  MIL: club(
    '1610612749',
    'MIL',
    'Milwaukee Bucks',
    'Milwaukee',
    'Fiserv Forum',
    17_341,
    'east',
    'Central'
  ),
  MIN: club(
    '1610612750',
    'MIN',
    'Minnesota Timberwolves',
    'Minneapolis',
    'Target Center',
    18_024,
    'west',
    'Noroeste'
  ),
  NOP: club(
    '1610612740',
    'NOP',
    'New Orleans Pelicans',
    'Nueva Orleans',
    'Smoothie King Center',
    16_867,
    'west',
    'Suroeste'
  ),
  NYK: club(
    '1610612752',
    'NYK',
    'New York Knicks',
    'Nueva York',
    'Madison Square Garden',
    19_812,
    'east',
    'Atlántico'
  ),
  OKC: club(
    '1610612760',
    'OKC',
    'Oklahoma City Thunder',
    'Oklahoma City',
    'Paycom Center',
    18_203,
    'west',
    'Noroeste'
  ),
  ORL: club(
    '1610612753',
    'ORL',
    'Orlando Magic',
    'Orlando',
    'Kia Center',
    18_846,
    'east',
    'Sudeste'
  ),
  PHI: club(
    '1610612755',
    'PHI',
    'Philadelphia 76ers',
    'Filadelfia',
    'Xfinity Mobile Arena',
    20_007,
    'east',
    'Atlántico'
  ),
  PHX: club(
    '1610612756',
    'PHO',
    'Phoenix Suns',
    'Phoenix',
    'Mortgage Matchup Center',
    17_071,
    'west',
    'Pacífico'
  ),
  POR: club(
    '1610612757',
    'POR',
    'Portland Trail Blazers',
    'Portland',
    'Moda Center',
    19_411,
    'west',
    'Noroeste'
  ),
  SAC: club(
    '1610612758',
    'SAC',
    'Sacramento Kings',
    'Sacramento',
    'Golden 1 Center',
    17_611,
    'west',
    'Pacífico'
  ),
  SAS: club(
    '1610612759',
    'SAS',
    'San Antonio Spurs',
    'San Antonio',
    'Frost Bank Center',
    18_354,
    'west',
    'Suroeste'
  ),
  TOR: club(
    '1610612761',
    'TOR',
    'Toronto Raptors',
    'Toronto',
    'Scotiabank Arena',
    19_800,
    'east',
    'Atlántico'
  ),
  UTA: club(
    '1610612762',
    'UTA',
    'Utah Jazz',
    'Salt Lake City',
    'Delta Center',
    18_306,
    'west',
    'Noroeste'
  ),
  WAS: club(
    '1610612764',
    'WAS',
    'Washington Wizards',
    'Washington',
    'Capital One Arena',
    20_333,
    'east',
    'Sudeste'
  )
};

function club(
  apiId: string,
  bbref: string,
  name: string,
  city: string,
  pavilion: string,
  capacity: number,
  conference: 'east' | 'west',
  division: string
): Club {
  return { apiId, bbref, name, city, pavilion, capacity, conference, division };
}

/** Las divisiones de la API, con el nombre del juego (`DIVISIONS` de `nba.ts`). */
const DIVISION_NAMES: Record<string, string> = {
  Atlantic: 'Atlántico',
  Central: 'Central',
  Southeast: 'Sudeste',
  Northwest: 'Noroeste',
  Pacific: 'Pacífico',
  Southwest: 'Suroeste'
};

/* ------------------------------------------------------------ a mano */

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `nba-entrenadores.json`: `inicio`, por abreviatura oficial, el primer
 *   entrenador: nombre de uso, `bbrefId` (su ficha en basketball-reference,
 *   de donde sale la fecha), `nationality`, `birth` si hay que corregirla,
 *   fuente, `despues` y, si no es el del primer partido,
 *   `noEsElDelPrimerPartido` (el id del que sí lo fue) y `motivo`.
 * - `nba-jugadores.json`: `jugadores`, por `PERSON_ID` de la API (el mismo en
 *   la G League), lo que la API da mal (`nationality`).
 */
type CoachEntry = ManualCoach & {
  bbrefId: string;
  despues?: string;
  noEsElDelPrimerPartido?: string;
  motivo?: string;
};

const PLAYERS = loadManualJson<{ jugadores: Record<string, UsaPlayerFix> }>('nba-jugadores.json', {
  jugadores: {}
});
const COACHES = loadManualJson<{ inicio: Record<string, CoachEntry> }>('nba-entrenadores.json', {
  inicio: {}
});

type Log = (message: string) => void;
const log: Log = (message) => console.log(message);

/* ---------------------------------------------------------- descargas */

async function bbref(
  client: HttpClient,
  path: string,
  check: (body: string) => boolean
): Promise<string> {
  return client.get(`${BBREF}${path}`, { accept: check });
}

async function api(client: HttpClient, path: string): Promise<string> {
  return client.get(`${API}/${path}`, {
    headers: API_HEADERS,
    accept: (body) => apiRows(body) !== null
  });
}

const TOTALS_QUERY =
  'LastNGames=0&MeasureType=Base&Month=0&OpponentTeamID=0&PORound=0&PaceAdjust=N&PerMode=Totals' +
  `&Period=0&PlusMinus=N&Rank=N&Season=${SEASON}&SeasonType=Regular%20Season`;

/* ------------------------------------------------------ entrenadores */

async function teamCoach(
  client: HttpClient,
  code: string,
  info: Club,
  firstCoach: string | undefined,
  warn: Log
): Promise<SourceCoach | null> {
  const entry = COACHES.inicio[code];
  if (!entry) {
    warn(`${info.name}: sin entrenador a mano; se inventa`);
    return null;
  }
  if (firstCoach && firstCoach !== entry.bbrefId && firstCoach !== entry.noEsElDelPrimerPartido)
    warn(
      `${info.name}: el primer entrenador en basketball-reference es ${firstCoach}, no el de la mano`
    );
  if (entry.motivo) log(`  ${info.name}: ${entry.motivo}`);
  if (entry.despues) log(`  ${info.name}: después, ${entry.despues}`);
  const coach = coachFromManual(entry, `nba-${entry.bbrefId}`);
  const born = parseBbrefCoachBirth(
    await bbref(client, `/coaches/${entry.bbrefId}.html`, (body) => body.includes('</html>'))
  );
  if (!coach.birthDate) coach.birthDate = born;
  else if (born && born !== coach.birthDate)
    warn(`${info.name}: fecha a mano ${coach.birthDate} y en basketball-reference ${born}`);
  if (!coach.birthDate && coach.age === null)
    warn(`${info.name}: ${entry.firstName} ${entry.lastName} sin fecha; se inventa`);
  if (!coach.nationality) warn(`${info.name}: entrenador sin nacionalidad`);
  return coach;
}

/* ---------------------------------------------------------- jugadores */

/**
 * Casa cada jugador de basketball-reference con su `PERSON_ID` de la API: por
 * el nombre sin tildes ni sufijos y, si no (apodos, «Ron» por «Ronald»), por
 * el apellido y los partidos jugados.
 */
function matchApi(
  seasons: readonly BbrefSeason[],
  index: readonly ApiPerson[],
  totals: ReadonlyMap<string, ApiTotalsRow>
): Map<string, string> {
  const byName = new Map<string, string[]>();
  for (const person of index) {
    const key = nameKey(`${person.firstName} ${person.lastName}`);
    byName.set(key, [...(byName.get(key) ?? []), person.personId]);
  }
  const used = new Set<string>();
  const result = new Map<string, string>();
  const pending: BbrefSeason[] = [];
  for (const season of seasons) {
    const candidates = byName.get(nameKey(season.totals.name)) ?? [];
    const personId =
      candidates.length === 1
        ? candidates[0]
        : candidates.find((id) => totals.get(id)?.stats.games === season.totals.games);
    if (personId && !used.has(personId)) {
      result.set(season.totals.playerId, personId);
      used.add(personId);
    } else pending.push(season);
  }
  for (const season of pending) {
    const surname = surnameKey(season.totals.name);
    const candidates = index.filter(
      (person) =>
        !used.has(person.personId) &&
        surnameKey(person.lastName) === surname &&
        totals.get(person.personId)?.stats.games === season.totals.games
    );
    if (candidates.length === 1) {
      const personId = (candidates[0] as ApiPerson).personId;
      result.set(season.totals.playerId, personId);
      used.add(personId);
    }
  }
  return result;
}

function nbaPlayer(
  season: BbrefSeason,
  bio: BbrefBio | undefined,
  person: ApiPerson | undefined,
  apiTotals: ApiTotalsRow | undefined,
  dunks: number | undefined,
  info: Club,
  warn: Log
): SourcePlayer {
  const row = season.totals;
  const fix = person ? PLAYERS.jugadores[person.personId] : undefined;
  const named = person
    ? { firstName: person.firstName, lastName: person.lastName }
    : splitUsaName(row.name);
  const firstName = fix?.firstName ?? named.firstName;
  const lastName = fix?.lastName ?? named.lastName;
  const label = `${info.name}: ${firstName} ${lastName} (${row.minutes} min)`;
  if (!person) warn(`${label}: no está en la API (sin nacionalidad, faltas ni tapones recibidos)`);

  const manualNation = fix?.nationality ? toNationCode(fix.nationality) : null;
  const fromApi = usaNationality(person?.country);
  const fromBirth = toNationCode(bio?.birthCountry);
  const nationality = manualNation ?? fromApi ?? fromBirth ?? 'USA';
  if (!manualNation && !fromApi)
    warn(
      `${label}: nacionalidad «${person?.country ?? 'vacía'}» sin reconocer; se pone ${nationality}`
    );
  const birthDate = plausibleBirthDate(fix?.birthDate ?? bio?.birthDate ?? null, SEASON_START_YEAR);
  if (!birthDate) warn(`${label}: sin fecha de nacimiento`);
  const heightCm = fix?.heightCm ?? bio?.heightCm ?? person?.heightCm ?? null;
  if (heightCm === null) warn(`${label}: sin altura`);
  return {
    sourceId: person?.personId ?? `bbref-${row.playerId}`,
    firstName,
    lastName,
    nickname: null,
    birthDate,
    age: null,
    nationality,
    nationalityRaw: fix?.nationality ?? person?.country ?? bio?.birthCountry ?? null,
    position: bbrefPosition(row.position) ?? bbrefPosition(bio?.position),
    positionRaw: row.position || null,
    heightCm,
    weightKg: bio?.weightKg ?? person?.weightKg ?? null,
    shirtNumber: bio?.shirtNumber ?? person?.shirtNumber ?? null,
    licence: null,
    stats: {
      games: row.games,
      starts: row.starts,
      seconds: row.minutes * 60,
      points: row.points,
      twoPointMade: row.twoPointMade,
      twoPointAttempted: row.twoPointAttempted,
      threePointMade: row.threePointMade,
      threePointAttempted: row.threePointAttempted,
      freeThrowMade: row.freeThrowMade,
      freeThrowAttempted: row.freeThrowAttempted,
      offensiveRebounds: row.offensiveRebounds,
      defensiveRebounds: row.defensiveRebounds,
      assists: row.assists,
      steals: row.steals,
      turnovers: row.turnovers,
      blocks: row.blocks,
      blocksReceived: apiTotals?.stats.blocksReceived ?? null,
      dunks: dunks ?? null,
      fouls: row.fouls,
      foulsDrawn: apiTotals?.stats.foulsDrawn ?? null,
      rating: null
    }
  };
}

/* -------------------------------------------------------- extracción */

async function main(): Promise<void> {
  const { force } = cliOptions();
  const started = Date.now();
  // basketball-reference corta a quien pasa de veinte peticiones por minuto.
  const bbrefClient = createHttpClient({ minDelayMs: 5_000, force, log, retries: 4 });
  // La API tarda en contestar (5-12 s) y a veces no contesta.
  const apiClient = createHttpClient({
    minDelayMs: 2_000,
    force,
    log,
    retries: 6,
    timeoutMs: 90_000
  });
  const warnings: string[] = [];
  const warn: Log = (message) => {
    warnings.push(message);
    log(`  aviso: ${message}`);
  };
  const byBbref = new Map(Object.entries(CLUBS).map(([code, info]) => [info.bbref, code]));

  log('basketball-reference…');
  const totalsRows = parseBbrefTotals(
    await bbref(
      bbrefClient,
      '/leagues/NBA_2026_totals.html',
      (body) => parseBbrefTotals(body).length > 500
    )
  );
  const seasons = bbrefSeasons(totalsRows);
  log(
    `  ${seasons.length} jugadores, ${seasons.filter((s) => s.clubs.length > 1).length} en varios clubes`
  );
  const dunks = parseBbrefDunks(
    await bbref(
      bbrefClient,
      '/leagues/NBA_2026_shooting.html',
      (body) => parseBbrefDunks(body).size > 500
    )
  );
  const standings = parseBbrefStandings(
    await bbref(
      bbrefClient,
      '/leagues/NBA_2026_standings.html',
      (body) => parseBbrefStandings(body).length === 30
    )
  );
  const coachRows = parseBbrefCoaches(
    await bbref(
      bbrefClient,
      '/leagues/NBA_2026_coaches.html',
      (body) => parseBbrefCoaches(body).length >= 30
    )
  );
  const firstCoach = new Map<string, string>();
  for (const row of coachRows) {
    const code = byBbref.get(row.team);
    if (!code) {
      warn(`entrenador de un club desconocido: ${row.team}`);
      continue;
    }
    if (!firstCoach.has(code)) firstCoach.set(code, row.coachId);
    else log(`  ${CLUBS[code]?.name}: cambió de entrenador (${row.games} partidos del segundo)`);
  }

  const bios = new Map<string, BbrefBio>();
  for (const [code, info] of Object.entries(CLUBS)) {
    const page = await bbref(bbrefClient, `/teams/${info.bbref}/2026.html`, (body) =>
      body.includes('id="roster"')
    );
    for (const bio of parseBbrefRoster(page))
      if (!bios.has(bio.playerId)) bios.set(bio.playerId, bio);
    const arena = parseBbrefArena(page);
    if (arena !== info.pavilion)
      warn(`${code}: pabellón «${arena ?? '?'}» en basketball-reference y «${info.pavilion}» aquí`);
  }

  log('API de la NBA…');
  const index = parseApiPlayerIndex(
    await api(apiClient, `playerindex?LeagueID=00&Season=${SEASON}&Historical=0`)
  );
  const apiTotals = new Map(
    parseApiTotals(
      await api(apiClient, `leaguedashplayerstats?LeagueID=00&TeamID=0&${TOTALS_QUERY}`)
    ).map((row) => [row.personId, row])
  );
  const apiStandings = parseApiStandings(
    await api(
      apiClient,
      `leaguestandingsv3?LeagueID=00&Season=${SEASON}&SeasonType=Regular%20Season`
    )
  );
  log(`  ${index.length} en el índice, ${apiTotals.size} con totales`);
  const people = new Map(index.map((person) => [person.personId, person]));
  const matched = matchApi(seasons, index, apiTotals);

  const teams: SourceTeam[] = [];
  const rankOf = new Map(standings.map((row) => [row.name, row]));
  const ordered = Object.entries(CLUBS).sort(
    ([, a], [, b]) => (rankOf.get(a.name)?.rank ?? 99) - (rankOf.get(b.name)?.rank ?? 99)
  );
  for (const [code, info] of ordered) {
    const standing = rankOf.get(info.name);
    if (!standing) warn(`${info.name}: no está en la clasificación de basketball-reference`);
    else if (standing.wins + standing.losses !== GAMES_PER_TEAM)
      warn(
        `${info.name}: ${standing.wins + standing.losses} partidos y deberían ser ${GAMES_PER_TEAM}`
      );
    const official = apiStandings.find((row) => row.teamId === info.apiId);
    if (!official) warn(`${info.name}: no está en la clasificación de la API`);
    else {
      if (official.wins !== standing?.wins)
        warn(`${info.name}: victorias distintas en la API (${official.wins})`);
      const conference = official.conference.toLowerCase() === 'east' ? 'east' : 'west';
      if (
        conference !== info.conference ||
        DIVISION_NAMES[official.division ?? ''] !== info.division
      )
        warn(`${info.name}: la API lo pone en ${official.conference}/${official.division}`);
    }
    const players = seasons
      .filter((season) => season.team === info.bbref)
      .sort((a, b) => b.totals.minutes - a.totals.minutes)
      .map((season) => {
        const personId = matched.get(season.totals.playerId);
        return nbaPlayer(
          season,
          bios.get(season.totals.playerId),
          personId ? people.get(personId) : undefined,
          personId ? apiTotals.get(personId) : undefined,
          dunks.get(season.totals.playerId),
          info,
          warn
        );
      });
    for (const season of seasons.filter((s) => s.team === info.bbref && s.clubs.length > 1)) {
      log(
        `  ${season.totals.name}: ${season.clubs.map((c) => `${byBbref.get(c.team) ?? c.team} ${c.minutes}`).join(', ')} min → ${code}`
      );
    }
    log(
      `${standing?.rank ?? '?'}. ${info.name}: ${standing?.wins ?? '?'}-${standing?.losses ?? '?'}, ${players.length} jugadores`
    );
    teams.push({
      sourceId: info.apiId,
      name: info.name,
      shortName: code,
      city: info.city,
      pavilionName: info.pavilion,
      pavilionCapacity: info.capacity,
      finalPosition: standing?.rank ?? null,
      players,
      coach: await teamCoach(bbrefClient, code, info, firstCoach.get(code), warn),
      conference: info.conference,
      division: info.division
    });
  }

  const league: SourceLeague = {
    competitionId: 'usa-1',
    name: 'National Basketball Association',
    shortName: 'NBA',
    country: 'USA',
    seasonStartYear: SEASON_START_YEAR,
    source: BBREF,
    extractedAt: new Date().toISOString(),
    teams,
    warnings,
    teamWeight: TEAM_WEIGHT_NBA
  };
  const file = sourceFile('nba', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(file);
  log(
    `\n${bbrefClient.networkRequests + apiClient.networkRequests} peticiones a la red, ` +
      `${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
