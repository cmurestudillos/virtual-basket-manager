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
import { plainName } from './aba-parse';
import {
  adcName,
  aggregateAdcBoxScores,
  looksForeign,
  parseAdcBoxScore,
  parseAdcCalendar,
  parseAdcPlayerPage,
  parseWikiRoster,
  positionFromStats,
  sameWikiPlayer,
  SPANISH_SPEAKING,
  wikiNationality,
  wikiPosition,
  type AdcBoxLine,
  type AdcGame,
  type AdcPlayerStats,
  type WikiRosterEntry
} from './adc-parse';

/**
 * Extractor de la Liga Nacional de Básquet argentina (`argentina-1`) y de la
 * Conferencia Sur de La Liga Argentina, su segunda división, de la que sale
 * el equipo invitado. Las dos las organiza la Asociación de Clubes (AdC) y
 * están en la misma web, laliganacional.com.ar.
 *
 *   pnpm real:adc            usa la caché de descargas
 *   pnpm real:adc --force    lo vuelve a descargar todo
 *
 * - La Liga Nacional 2025-26 tuvo 19 equipos (Riachuelo se retiró antes de
 *   empezar) y la del juego tiene 20: la plaza que falta es para Lanús,
 *   campeón de La Liga Argentina y el que subió de verdad (`guest`). Para
 *   valorarle hace falta su liga: se extrae su conferencia entera (17
 *   equipos, 32 partidos cada uno) y se traduce con la escala de la Liga
 *   Plata ficticia.
 * - Sólo cuenta la fase regular: todos contra todos a doble vuelta, 36
 *   partidos por club, del 24-09-2025 al 21-04-2026. La web ya está en la
 *   2026-27 y no sirve la clasificación de la 2025-26: el orden va fijo aquí
 *   (el de la Wikipedia, con sus desempates) y se comprueba con las victorias
 *   que salen de las actas.
 * - Los calendarios de los clubes mezclan la liga con la Supercopa, la Copa
 *   Islas Malvinas y los playoffs, sin decir cuál es cuál: la liga son los
 *   partidos entre equipos de la liga antes del final de la fase regular,
 *   menos los cuatro de copa (`CUP_GAMES`).
 * - Estadísticas: la suma de las actas.
 * - La web no da ni altura, ni puesto, ni nacionalidad: salen de las fichas de
 *   los clubes en la Wikipedia en español (cinco versiones a lo largo de la
 *   temporada) y, si no están, el puesto sale de las estadísticas
 *   (`positionFromStats`; la altura la pone el montaje por el puesto) y la
 *   nacionalidad es la argentina salvo que esté a mano (`adc-jugadores.json`).
 *   El extractor avisa de los que parecen extranjeros y siguen como
 *   argentinos.
 * - El id de jugador es el de la inscripción en un club: quien cambió de club
 *   a mitad de temporada sale con dos ids. Se queda en el que más minutos jugó
 *   (misma persona: mismo nombre legal y fecha de nacimiento).
 * - Entrenadores: el del acta del primer partido de cada club, con el nombre de
 *   uso, la fecha y la nacionalidad a mano (`adc-entrenadores.json`).
 *
 * Los ids de los partidos van cifrados y cambian en cada visita: el acta se
 * guarda en caché por local, visitante y fecha. La web se cae a ratos: se
 * reintenta con paciencia. Tres segundos entre peticiones.
 */

const SEASON_START_YEAR = 2025;
const BASE = 'https://www.laliganacional.com.ar';
const WIKI_API = 'https://es.wikipedia.org/w/api.php';
/** Las versiones de las fichas de los clubes en la Wikipedia que se leen. */
const WIKI_DATES = ['2025-10-20', '2025-12-20', '2026-02-20', '2026-04-25', '2026-06-25'];

interface LeagueSpec {
  /** La sección de la web: `laliga` o `laligaargentina`. */
  section: string;
  label: string;
  gamesPerTeam: number;
  /** Último día de la fase regular (los partidos de después son de playoffs). */
  lastDay: string;
  teams: Record<string, TeamInfo>;
}

interface TeamInfo {
  /** Id del equipo en la 2025-26. */
  teamId: string;
  slug: string;
  name: string;
  shortName: string | null;
  city: string | null;
  pavilion: string | null;
  capacity: number | null;
  /** Puesto en la fase regular. */
  position: number;
  wins: number;
  /** Título de la ficha del club en la Wikipedia en español. */
  wiki?: string;
}

function team(
  teamId: string,
  slug: string,
  position: number,
  wins: number,
  name: string,
  shortName: string | null = null,
  city: string | null = null,
  pavilion: string | null = null,
  capacity: number | null = null,
  wiki?: string
): TeamInfo {
  return { teamId, slug, position, wins, name, shortName, city, pavilion, capacity, wiki };
}

/**
 * La Liga Nacional, por id de club de la web (el mismo todas las temporadas):
 * el equipo de la 2025-26, el puesto y las victorias de la fase regular, el
 * nombre de uso (con la ciudad cuando hace falta distinguirlo), una
 * abreviatura propia (la web no las tiene), la ciudad, el pabellón y su aforo
 * (de la Wikipedia) y la ficha del club en la Wikipedia.
 */
const LNB: LeagueSpec = {
  section: 'laliga',
  label: 'Liga Nacional',
  gamesPerTeam: 36,
  lastDay: '2026-04-21',
  teams: {
    '1869': team(
      '89416',
      'quimsa',
      1,
      24,
      'Quimsa',
      'QUI',
      'Santiago del Estero',
      'Estadio Ciudad',
      5_000,
      'Asociación Atlética Quimsa'
    ),
    '1474': team(
      '88693',
      'gimnasia-cr',
      2,
      24,
      'Gimnasia Comodoro',
      'GIM',
      'Comodoro Rivadavia',
      'Estadio Socios Fundadores',
      1_453,
      'Club Gimnasia y Esgrima (Comodoro Rivadavia)'
    ),
    '1424': team(
      '89517',
      'regatas-c',
      3,
      23,
      'Regatas Corrientes',
      'REG',
      'Corrientes',
      'Estadio José Jorge Contte',
      3_400,
      'Club de Regatas Corrientes'
    ),
    '2305': team(
      '89125',
      'obera',
      4,
      23,
      'Oberá Tenis Club',
      'OBE',
      'Oberá',
      'Estadio Dr. Luis Augusto Derna',
      2_000,
      'Oberá Tenis Club'
    ),
    '19': team(
      '88922',
      'boca',
      5,
      22,
      'Boca Juniors',
      'BOC',
      'Buenos Aires',
      'Estadio Luis Conde',
      2_000,
      'Club Atlético Boca Juniors (baloncesto)'
    ),
    '46': team(
      '88969',
      'ferro',
      6,
      21,
      'Ferro Carril Oeste',
      'FER',
      'Buenos Aires',
      'Estadio Héctor Etchart',
      4_500,
      'Club Ferro Carril Oeste (básquetbol)'
    ),
    '76': team(
      '89434',
      'obras',
      7,
      21,
      'Obras',
      'OBR',
      'Buenos Aires',
      'Estadio Obras Sanitarias',
      3_000,
      'Club Atlético Obras Sanitarias de la Nación'
    ),
    '1541': team(
      '89128',
      'la-union-fsa',
      8,
      20,
      'La Unión de Formosa',
      'LUF',
      'Formosa',
      'Estadio Cincuentenario',
      4_500,
      'La Unión de Formosa'
    ),
    '2025': team(
      '89515',
      'independiente-o',
      9,
      20,
      'Independiente de Oliva',
      'IND',
      'Oliva',
      'El Gigante de la Ruta 9',
      1_800,
      'Independiente Deportivo Social Club'
    ),
    '1790': team(
      '89036',
      'instituto',
      10,
      20,
      'Instituto',
      'INS',
      'Córdoba',
      'Estadio Ángel Sandrín',
      3_500,
      'Instituto Atlético Central Córdoba (baloncesto)'
    ),
    '2376': team(
      '89254',
      'penarol-mdp',
      11,
      19,
      'Peñarol de Mar del Plata',
      'PEN',
      'Mar del Plata',
      'Polideportivo Islas Malvinas',
      8_000,
      'Club Atlético Peñarol (Mar del Plata)'
    ),
    '1426': team(
      '88964',
      'san-martin-c',
      12,
      17,
      'San Martín de Corrientes',
      'SMC',
      'Corrientes',
      'Estadio Raúl Argentino Ortiz',
      2_500,
      'Club San Martín de Corrientes'
    ),
    '1882': team(
      '89207',
      'olimpico-lb',
      13,
      15,
      'Olímpico de La Banda',
      'OLI',
      'La Banda',
      'Estadio Vicente Rosales',
      3_400,
      'Club Ciclista Olímpico'
    ),
    '1992': team(
      '89551',
      'racing-ch',
      14,
      14,
      'Racing de Chivilcoy',
      'RAC',
      'Chivilcoy',
      'Grilon Arena',
      1_200,
      'Racing Club Chivilcoy'
    ),
    '88': team(
      '89192',
      'san-lorenzo',
      15,
      13,
      'San Lorenzo',
      'SLO',
      'Buenos Aires',
      'Polideportivo Roberto Pando',
      2_200,
      'Club Atlético San Lorenzo de Almagro (baloncesto)'
    ),
    '1913': team(
      '89177',
      'union-sf',
      16,
      13,
      'Unión de Santa Fe',
      'UNI',
      'Santa Fe',
      'Estadio Ángel P. Malvicino',
      4_500,
      'Club Atlético Unión (baloncesto)'
    ),
    '80': team(
      '89148',
      'platense',
      17,
      13,
      'Platense',
      'PLA',
      'Vicente López',
      'Microestadio Ciudad de Vicente López',
      1_200,
      'Club Atlético Platense (baloncesto)'
    ),
    '1498': team(
      '89552',
      'atenas-c',
      18,
      13,
      'Atenas',
      'ATE',
      'Córdoba',
      'Estadio Atenas',
      4_278,
      'Asociación Deportiva Atenas'
    ),
    '1932': team(
      '88917',
      'argentino-j',
      19,
      7,
      'Argentino de Junín',
      'AJU',
      'Junín',
      'El Fortín de las Morochas',
      1_500,
      'Club Atlético Argentino (Junín)'
    )
  }
};

/** Club de Lanús, el invitado. */
const LANUS = '63';

/**
 * La Conferencia Sur de La Liga Argentina 2025-26: 17 equipos a doble vuelta.
 * Sólo Lanús entra en el juego; los demás son la escala de sus jugadores.
 */
const LLA_SUR: LeagueSpec = {
  section: 'laligaargentina',
  label: 'La Liga Argentina (Sur)',
  gamesPerTeam: 32,
  lastDay: '2026-03-31',
  teams: {
    '1761': team('88912', 'provincial-r', 1, 24, 'Provincial de Rosario'),
    '1458': team('90004', 'central-entrerriano', 2, 23, 'Central Entrerriano'),
    [LANUS]: team(
      '89430',
      'lanus',
      3,
      21,
      'Lanús',
      'LAN',
      'Lanús',
      'Microestadio Antonio Rotili',
      3_000,
      'Club Atlético Lanús (baloncesto)'
    ),
    '1420': team('89534', 'la-union-c', 4, 21, 'La Unión de Colón'),
    '1503': team('89514', 'pico-f-c', 5, 21, 'Pico Football Club'),
    '2377': team('88991', 'quilmes-mdp', 6, 20, 'Quilmes de Mar del Plata'),
    '2420': team('89448', 'gimnasia-lp', 7, 19, 'Gimnasia de La Plata'),
    '2173': team('89141', 'dep-viedma', 8, 18, 'Deportivo Viedma'),
    '1926': team('88731', 'centenario-vt', 9, 16, 'Centenario de Venado Tuerto'),
    '83': team('88998', 'racing-a', 10, 16, 'Racing de Avellaneda'),
    '2371': team('88950', 'villa-mitre-bb', 11, 14, 'Villa Mitre'),
    '44': team('89166', 'el-talar', 12, 13, 'El Talar'),
    '2378': team('89306', 'union-mdp', 13, 11, 'Unión de Mar del Plata'),
    '1937': team('89802', 'ciclista-j', 14, 10, 'Ciclista Juninense'),
    '1385': team('88713', 'rocamora', 15, 9, 'Rocamora'),
    '1640': team('89000', 'dep-norte', 16, 9, 'Deportivo Norte'),
    '2254': team('89216', 'pergamino-basquet', 17, 7, 'Pergamino Básquet')
  }
};

/**
 * Los partidos de copa que caen entre los de liga en los calendarios (local,
 * visitante y día): la Supercopa (Boca–Instituto, en Córdoba) y la Copa Islas
 * Malvinas (tres en Formosa).
 */
const CUP_GAMES = new Set([
  '88922-89036-2026-03-05',
  '89515-89434-2026-04-01',
  '89128-88969-2026-04-01',
  '88969-89434-2026-04-02'
]);

/* ------------------------------------------------------------ a mano */

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `adc-entrenadores.json`: `inicio`, por id de club, el primer entrenador de
 *   la temporada: nombre de uso con sus tildes, nacimiento como la FEB
 *   («dd/mm/aaaa») o, sin fecha, la edad (`age`, regla del 1 de julio),
 *   `nationality`, la fuente, `despues` (quién vino después) y `enActa`, cómo
 *   le escribe el acta («BURTIN CALIO, SEBASTIAN CARLOS»). Sin fecha ni edad,
 *   el juego se lo inventa.
 * - `adc-jugadores.json`: `jugadores`, por id de jugador de la web, lo que la
 *   web no da o da mal: `nationality` (COI; la de los extranjeros), nombre de
 *   uso (`firstName`, `lastName`), `birthDate`, `heightCm` o `position`.
 */
type CoachEntry = ManualCoach & { despues?: string; enActa?: string; fuente?: string };

interface PlayerFix {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  nationality?: string;
  heightCm?: number;
  position?: SourcePosition;
}

const PLAYERS = loadManualJson<{ jugadores: Record<string, PlayerFix> }>('adc-jugadores.json', {
  jugadores: {}
});
const COACHES = loadManualJson<{ inicio: Record<string, CoachEntry> }>('adc-entrenadores.json', {
  inicio: {}
});

type Log = (message: string) => void;

/* ---------------------------------------------------------- descargas */

function calendar(client: HttpClient, spec: LeagueSpec, clubId: string): Promise<string> {
  const info = spec.teams[clubId]!;
  return client.get(
    `${BASE}/${spec.section}/equipo/${clubId}/${info.teamId}/${info.slug}/inicio?handler=CargarSubPagina&aux=calendario`,
    {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      accept: (body) => body.includes('fila-tabla-calendarios')
    }
  );
}

/** La clave de un partido: local, visitante y día (el id de la web cambia en cada visita). */
function gameKey(game: AdcGame): string {
  return `${game.home.teamId}-${game.away.teamId}-${game.date}`;
}

function boxScore(client: HttpClient, spec: LeagueSpec, game: AdcGame): Promise<string> {
  return client.get(`${BASE}${game.link}`, {
    cacheKey: `adc:${spec.section}:partido:${gameKey(game)}`,
    accept: (body) => body.includes('EstadisticasComponente(')
  });
}

function playerPage(client: HttpClient, spec: LeagueSpec, line: AdcBoxLine): Promise<string> {
  return client.get(
    `${BASE}/${spec.section}/jugador/${line.clubId}/${line.teamId}/${line.playerId}/${line.slug ?? 'jugador'}`,
    { accept: (body) => body.includes('datos-jugador') }
  );
}

/** Las plantillas de la ficha de un club en la Wikipedia, en varias fechas de la temporada. */
async function wikiRosters(client: HttpClient, title: string): Promise<WikiRosterEntry[][]> {
  const out: WikiRosterEntry[][] = [];
  for (const date of WIKI_DATES) {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content|timestamp',
      rvslots: 'main',
      rvstart: `${date}T00:00:00Z`,
      rvdir: 'older',
      rvlimit: '1',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      titles: title
    });
    const json = JSON.parse(
      await client.get(`${WIKI_API}?${params}`, {
        // La Wikipedia pide un agente que diga quién es (con el de un navegador
        // contesta a menudo 429).
        headers: { 'User-Agent': 'triple-manager-real-data/1.0 (extractor privado de datos)' },
        accept: (body) => body.includes('"pages"')
      })
    ) as {
      query: { pages: { revisions?: { slots: { main: { content: string } } }[] }[] };
    };
    const content = json.query.pages[0]?.revisions?.[0]?.slots.main.content ?? '';
    out.push(parseWikiRoster(content));
  }
  // La más reciente, la primera.
  return out.reverse();
}

/* -------------------------------------------------------- una liga */

interface LeagueData {
  games: AdcGame[];
  /** Estadísticas por jugador y equipo (sólo quien jugó). */
  played: AdcPlayerStats[];
  /** Entrenadores del acta de cada equipo, en orden de fecha. */
  coachesByTeam: Map<string, { date: string; name: string }[]>;
  birthDates: Map<string, string | null>;
}

async function readLeague(
  client: HttpClient,
  spec: LeagueSpec,
  warn: Log,
  log: Log
): Promise<LeagueData> {
  const teamIds = new Map(
    Object.entries(spec.teams).map(([clubId, info]) => [info.teamId, clubId])
  );
  log(`${spec.label}: calendarios…`);
  const byKey = new Map<string, AdcGame>();
  for (const clubId of Object.keys(spec.teams)) {
    for (const game of parseAdcCalendar(await calendar(client, spec, clubId))) {
      if (!game.date || game.date > spec.lastDay) continue;
      if (!teamIds.has(game.home.teamId) || !teamIds.has(game.away.teamId)) continue;
      if (CUP_GAMES.has(gameKey(game))) continue;
      byKey.set(gameKey(game), game);
    }
  }
  const games = [...byKey.values()].sort(
    (a, b) =>
      (a.date ?? '').localeCompare(b.date ?? '') || (a.time ?? '').localeCompare(b.time ?? '')
  );
  const teams = Object.keys(spec.teams).length;
  const expected = (teams * spec.gamesPerTeam) / 2;
  if (games.length !== expected) {
    warn(`${spec.label}: ${games.length} partidos de liga y deberían ser ${expected}`);
  }

  log(`${spec.label}: ${games.length} actas…`);
  const lines: AdcBoxLine[] = [];
  const coachesByTeam = new Map<string, { date: string; name: string }[]>();
  for (const game of games) {
    if (!game.link) {
      warn(`${spec.label}: ${gameKey(game)} sin enlace al acta`);
      continue;
    }
    const box = parseAdcBoxScore(await boxScore(client, spec, game));
    if (!box) {
      warn(`${spec.label}: ${gameKey(game)} sin acta`);
      continue;
    }
    for (const [teamId, score] of [
      [game.home.teamId, game.homeScore],
      [game.away.teamId, game.awayScore]
    ] as const) {
      const side = box.lines.filter((line) => line.teamId === teamId);
      const points = side.reduce((sum, line) => sum + line.points, 0);
      const name = spec.teams[teamIds.get(teamId)!]!.name;
      if (points !== score)
        warn(`acta ${gameKey(game)}: ${name} suma ${points} y el tanteo es ${score}`);
      const starters = side.filter((line) => line.starter).length;
      if (starters !== 5) warn(`acta ${gameKey(game)}: ${name} con ${starters} titulares`);
      const coach = box.coaches.get(teamId);
      if (coach) {
        const list = coachesByTeam.get(teamId) ?? [];
        list.push({ date: game.date!, name: coach });
        coachesByTeam.set(teamId, list);
      }
      lines.push(...side);
    }
  }
  const played = aggregateAdcBoxScores(lines);

  log(`${spec.label}: ${played.length} fichas de jugador…`);
  const birthDates = new Map<string, string | null>();
  for (const entry of played) {
    birthDates.set(
      `${entry.playerId}|${entry.teamId}`,
      parseAdcPlayerPage(await playerPage(client, spec, entry.line))
    );
  }
  return { games, played, coachesByTeam, birthDates };
}

/* ------------------------------------------------------ entrenadores */

/** Cómo cambió el banquillo según las actas: «A (desde el 25/09), B (desde el 23/03)». */
function coachSequence(
  list: readonly { date: string; name: string }[]
): { date: string; name: string }[] {
  const out: { date: string; name: string }[] = [];
  for (const entry of list) if (out.at(-1)?.name !== entry.name) out.push(entry);
  return out;
}

function teamCoach(
  clubId: string,
  teamName: string,
  fromBoxScores: readonly { date: string; name: string }[],
  warn: Log,
  log: Log
): SourceCoach | null {
  const sequence = coachSequence(fromBoxScores);
  if (sequence.length > 1) {
    log(
      `  ${teamName}: en el banquillo, ${sequence.map((entry) => `${entry.name} (desde el ${entry.date})`).join(', ')}`
    );
  }
  const entry = COACHES.inicio[clubId];
  const first = sequence[0]?.name ?? null;
  if (!entry) {
    warn(
      `${teamName}: sin entrenador a mano (en la primera acta: ${first ?? 'nadie'}); se inventa`
    );
    return null;
  }
  if (first && entry.enActa && plainName(entry.enActa) !== plainName(first)) {
    warn(
      `${teamName}: en la primera acta está ${first} y a mano ${entry.firstName} ${entry.lastName} (${entry.enActa})`
    );
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

/* ---------------------------------------------------------- jugadores */

/**
 * El jugador en la ficha de su club en la Wikipedia y, si no está (la ficha
 * del club que le fichó no se actualizó y sigue en la del que dejó), en las
 * de los demás clubes de la liga: allí sólo si es uno solo y no tiene otra
 * fecha de nacimiento.
 */
function wikiMatch(
  own: readonly WikiRosterEntry[][],
  others: readonly WikiRosterEntry[],
  fullName: string,
  birthDate: string | null
): WikiRosterEntry | null {
  for (const roster of own) {
    const found = roster.find((entry) => sameWikiPlayer(fullName, entry.name));
    if (found) return found;
  }
  const candidates = others.filter(
    (entry) =>
      sameWikiPlayer(fullName, entry.name) &&
      (!entry.birthDate || !birthDate || entry.birthDate === birthDate)
  );
  const names = new Set(candidates.map((entry) => entry.name));
  return names.size === 1 ? candidates[0]! : null;
}

function adcPlayer(
  entry: AdcPlayerStats,
  birthDate: string | null,
  wiki: WikiRosterEntry | null,
  teamName: string,
  warn: Log
): SourcePlayer {
  const fix = PLAYERS.jugadores[entry.playerId];
  const line = entry.line;
  const fromWiki = wikiNationality(wiki?.nationalityRaw);
  const manualNation = fix?.nationality ? toNationCode(fix.nationality) : null;
  const nationality = manualNation ?? fromWiki ?? 'ARG';
  const named = adcName(
    line.shortName,
    line.fullName,
    wiki?.name ?? null,
    SPANISH_SPEAKING.has(nationality)
  );
  const firstName = fix?.firstName ?? named.firstName;
  const lastName = fix?.lastName ?? named.lastName;
  const minutes = Math.round(entry.stats.seconds / 60);
  const label = `${teamName}: ${firstName} ${lastName} (${entry.playerId}, ${minutes} min)`;
  if (!manualNation && !fromWiki && looksForeign(line.fullName)) {
    warn(`${label}: ¿extranjero? «${line.fullName}» sigue como argentino`);
  }
  if (wiki?.nationalityRaw && !fromWiki) {
    warn(`${label}: nacionalidad de la Wikipedia «${wiki.nationalityRaw}» sin reconocer`);
  }
  const heightCm = fix?.heightCm ?? wiki?.heightCm ?? null;
  const fromWikiPosition = wikiPosition(wiki?.positionRaw);
  let position: SourcePosition | null = fix?.position ?? null;
  let positionRaw = wiki?.positionRaw ?? null;
  if (!position) {
    if (fromWikiPosition === 'G' || fromWikiPosition === 'F') {
      position = positionFromStats(entry.stats, fromWikiPosition);
    } else if (fromWikiPosition) position = fromWikiPosition;
    // Sin puesto pero con altura, el montaje decide por la altura.
    else if (heightCm === null) {
      position = positionFromStats(entry.stats);
      positionRaw = position ? 'por estadísticas' : null;
    }
  }
  const rawBirth = fix?.birthDate ?? birthDate;
  const birth = plausibleBirthDate(rawBirth, SEASON_START_YEAR);
  if (!birth) warn(`${label}: sin fecha de nacimiento${rawBirth ? ` («${rawBirth}»)` : ''}`);
  return {
    sourceId: entry.playerId,
    firstName,
    lastName,
    nickname: null,
    birthDate: birth,
    age: null,
    nationality,
    nationalityRaw: fix?.nationality ?? wiki?.nationalityRaw ?? null,
    position,
    positionRaw,
    heightCm,
    weightKg: null,
    shirtNumber: line.shirtNumber,
    licence: null,
    stats: entry.stats
  };
}

/* -------------------------------------------------------- extracción */

async function extractLeague(
  client: HttpClient,
  spec: LeagueSpec,
  invited: ReadonlySet<string>,
  log: Log
): Promise<{ teams: SourceTeam[]; warnings: string[] }> {
  const warnings: string[] = [];
  const warn: Log = (message) => {
    warnings.push(message);
    log(`  aviso ${spec.label}: ${message}`);
  };
  const data = await readLeague(client, spec, warn, log);
  const clubOfTeam = new Map(
    Object.entries(spec.teams).map(([clubId, info]) => [info.teamId, clubId])
  );

  // Una persona (nombre legal y fecha) que jugó en dos equipos se queda en
  // el que más minutos jugó: la web le da otro id en cada club.
  const person = (entry: AdcPlayerStats): string =>
    `${plainName(entry.line.fullName)}|${data.birthDates.get(`${entry.playerId}|${entry.teamId}`) ?? entry.playerId}`;
  const kept = new Map<string, AdcPlayerStats>();
  for (const entry of data.played) {
    const current = kept.get(person(entry));
    if (!current || entry.stats.seconds > current.stats.seconds) kept.set(person(entry), entry);
  }
  for (const entry of data.played) {
    const winner = kept.get(person(entry))!;
    if (winner !== entry) {
      log(
        `  ${entry.line.fullName} jugó en ${spec.teams[clubOfTeam.get(entry.teamId)!]!.name} ` +
          `(${Math.round(entry.stats.seconds / 60)} min) y en ${spec.teams[clubOfTeam.get(winner.teamId)!]!.name} ` +
          `(${Math.round(winner.stats.seconds / 60)} min): se queda en el segundo`
      );
    }
  }

  const teams: SourceTeam[] = [];
  const ordered = Object.entries(spec.teams).sort(([, a], [, b]) => a.position - b.position);
  // Del invitado y de la Liga Nacional interesa todo; del resto de la
  // conferencia, sólo los números (son la escala).
  const detailedClubs = new Set(
    ordered.map(([clubId]) => clubId).filter((clubId) => spec === LNB || invited.has(clubId))
  );
  const wiki = new Map<string, WikiRosterEntry[][]>();
  for (const [clubId, info] of ordered) {
    if (detailedClubs.has(clubId) && info.wiki)
      wiki.set(clubId, await wikiRosters(client, info.wiki));
  }
  for (const [clubId, info] of ordered) {
    const teamGames = data.games.filter(
      (game) => game.home.teamId === info.teamId || game.away.teamId === info.teamId
    );
    const wins = teamGames.filter((game) =>
      game.home.teamId === info.teamId
        ? game.homeScore > game.awayScore
        : game.awayScore > game.homeScore
    ).length;
    if (teamGames.length !== spec.gamesPerTeam) {
      warn(`${info.name}: ${teamGames.length} partidos y deberían ser ${spec.gamesPerTeam}`);
    }
    if (wins !== info.wins)
      warn(`${info.name}: ${wins} victorias en las actas y ${info.wins} en la clasificación`);

    const detailed = detailedClubs.has(clubId);
    const own = wiki.get(clubId) ?? [];
    const others = [...wiki]
      .filter(([id]) => id !== clubId)
      .flatMap(([, rosters]) => rosters.flat());
    const players = data.played
      .filter((entry) => entry.teamId === info.teamId && kept.get(person(entry)) === entry)
      .map((entry) =>
        adcPlayer(
          entry,
          data.birthDates.get(`${entry.playerId}|${entry.teamId}`) ?? null,
          wikiMatch(
            own,
            others,
            entry.line.fullName,
            data.birthDates.get(`${entry.playerId}|${entry.teamId}`) ?? null
          ),
          info.name,
          detailed ? warn : () => {}
        )
      );
    log(
      `${spec.label} ${info.position}. ${info.name}: ${wins}-${teamGames.length - wins}, ${players.length} jugadores`
    );
    teams.push({
      sourceId: clubId,
      name: info.name,
      shortName: info.shortName,
      city: info.city,
      pavilionName: info.pavilion,
      pavilionCapacity: info.capacity,
      finalPosition: info.position,
      players,
      coach: detailed
        ? teamCoach(clubId, info.name, data.coachesByTeam.get(info.teamId) ?? [], warn, log)
        : null
    });
  }
  return { teams, warnings };
}

const log: Log = (message) => console.log(message);

async function main(): Promise<void> {
  const { force } = cliOptions();
  const started = Date.now();
  // La web se cae a ratos (hasta media hora): reintentos largos.
  const client = createHttpClient({
    minDelayMs: 3_000,
    force,
    log,
    retries: 9,
    timeoutMs: 150_000
  });

  const lnb = await extractLeague(client, LNB, new Set(), log);
  const league: SourceLeague = {
    competitionId: 'argentina-1',
    name: 'Liga Nacional de Básquet',
    shortName: 'LNB',
    country: 'ARG',
    seasonStartYear: SEASON_START_YEAR,
    source: `${BASE}/laliga`,
    extractedAt: new Date().toISOString(),
    teams: lnb.teams,
    warnings: lnb.warnings
  };
  const lnbFile = sourceFile('adc-lnb', SEASON_START_YEAR);
  writeSourceLeague(lnbFile, league);

  const sur = await extractLeague(client, LLA_SUR, new Set([LANUS]), log);
  const guest: SourceLeague = {
    competitionId: 'argentina-lla',
    name: 'La Liga Argentina (Conferencia Sur)',
    shortName: 'LLA',
    country: 'ARG',
    seasonStartYear: SEASON_START_YEAR,
    source: `${BASE}/laligaargentina`,
    extractedAt: new Date().toISOString(),
    teams: sur.teams,
    warnings: sur.warnings,
    guest: { into: 'argentina-1', teamIds: [LANUS], scale: { league: 'liga-plata' } }
  };
  const surFile = sourceFile('adc-lla-sur', SEASON_START_YEAR);
  writeSourceLeague(surFile, guest);

  for (const [entry, file] of [
    [league, lnbFile],
    [guest, surFile]
  ] as const) {
    log('');
    log(summarizeLeague(entry));
    log(file);
  }
  log(
    `\n${client.networkRequests} peticiones a la red, ${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
