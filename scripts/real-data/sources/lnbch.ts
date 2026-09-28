import { createHttpClient, sleep, type HttpClient } from '../lib/http';
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
  parseWikiRoster,
  positionFromStats,
  wikiNationality,
  wikiPosition,
  type WikiRosterEntry
} from './adc-parse';
import {
  aggregateGeniusBoxScores,
  applyLiveStats,
  chileanName,
  chileanPosition,
  geniusHtml,
  parseGeniusBoxScore,
  parseGeniusRoster,
  parseGeniusSchedule,
  parseGeniusStaff,
  parseGeniusTeams,
  parseLiveStats,
  parseWikiForeigners,
  parseWikiTableRoster,
  sameChileanPlayer,
  sameLivePlayer,
  sharesSurname,
  type GeniusBoxLine,
  type GeniusGame,
  type GeniusPlayerStats,
  type GeniusRosterEntry,
  type WikiForeigner
} from './lnbch-parse';

/**
 * Extractor de la Liga Nacional de Básquetbol de Chile (`chile-1`), la «Liga
 * UNO» (Liga Chery by Cecinas Llanquihue).
 *
 *   pnpm real:lnbch            usa la caché de descargas
 *   pnpm real:lnbch --force    lo vuelve a descargar todo
 *
 * - La liga chilena ya no se juega por años: en la 2025-26 hubo dos torneos,
 *   la **Transición 2025** (25-09 al 20-12-2025, 12 equipos) y el **Apertura
 *   2026** (25-03 al 13-06-2026, 14). Juntos son justo la temporada del
 *   juego: se suman sus fases regulares (conferencias Centro y Sur a doble
 *   vuelta: 10 + 12 partidos por club). Entran los 12 de la Transición, que
 *   son los del juego; Puerto Montt y Castro, que sólo jugaron el Apertura, se
 *   quedan fuera, pero sus partidos contra los 12 cuentan.
 * - La clasificación es la suma de las dos fases regulares (victorias y
 *   diferencia, el desempate de la liga). Va fija aquí y se comprueba con las
 *   actas.
 * - Fuente: Genius Sports (la web «hosted» de FEBACHILE) para los
 *   calendarios, las plantillas y las actas (con el id de persona, el mismo
 *   en los dos torneos), y el `data.json` de FIBA LiveStats de cada partido
 *   para los titulares, las faltas recibidas, el nombre legal y el
 *   entrenador. La web se atraganta a ratos con un 404: se reintenta.
 * - Quien cambió de club entre torneos se queda en el que más minutos jugó;
 *   quien se fue a Puerto Montt o a Castro, en su club de los 12.
 * - Genius no da ni la altura ni un puesto fiable: salen de las fichas de los
 *   clubes en la Wikipedia en español (varias versiones) y, si no, el puesto
 *   de las estadísticas (`positionFromStats`; la altura la pone el montaje).
 *   Los ala-pívots de menos de 198 cm, aleros (`chileanPosition`).
 *   La nacionalidad es la de Genius corregida con la Wikipedia; los
 *   nacionalizados y los que la traen vacía, chilenos.
 * - Entrenadores: el del `data.json` del primer partido de cada club, con el
 *   nombre de uso, la fecha y la nacionalidad a mano (`lnbch-entrenadores.json`).
 */

const SEASON_START_YEAR = 2025;
const HOSTED = 'https://hosted.dcd.shared.geniussports.com/embednf/FDBCH/es';
const LIVESTATS = 'https://fibalivestats.dcd.shared.geniussports.com/data';
const WIKI_API = 'https://es.wikipedia.org/w/api.php';
/** Las versiones de las fichas de los clubes en la Wikipedia que se leen. */
const WIKI_DATES = ['2025-11-15', '2026-01-15', '2026-05-15', '2026-07-01', '2026-09-25'];
/** Los artículos de los dos torneos: su tabla de extranjeros (con los cortados). */
const WIKI_TOURNAMENTS = [
  'Liga Nacional de Básquetbol Transición 2025 (Chile)',
  'Liga Nacional de Básquetbol Apertura 2026 (Chile)'
];

type Tournament = 'transicion' | 'apertura';

interface TournamentSpec {
  key: Tournament;
  /** Id de la competición en Genius. */
  competitionId: string;
  label: string;
  /** Partidos de fase regular (las dos conferencias). */
  games: number;
}

const TOURNAMENTS: TournamentSpec[] = [
  { key: 'transicion', competitionId: '42131', label: 'Transición 2025', games: 60 },
  { key: 'apertura', competitionId: '48076', label: 'Apertura 2026', games: 84 }
];

/** Las fases de la fase regular en Genius. */
const PHASES = ['Conferencia centro', 'Conferencia sur'];

/** Partidos por club entre los dos torneos. */
const GAMES_PER_TEAM = 22;

interface ClubInfo {
  /** Id del equipo en Genius en cada torneo (cambia en dos clubes). */
  ids: Record<Tournament, string>;
  /** Puesto en la suma de las dos fases regulares. */
  position: number;
  wins: number;
  name: string;
  shortName: string;
  city: string;
  pavilion: string;
  capacity: number;
  /** Título de la ficha del club en la Wikipedia en español. */
  wiki: string;
}

function club(
  transicion: string,
  apertura: string,
  position: number,
  wins: number,
  name: string,
  shortName: string,
  city: string,
  pavilion: string,
  capacity: number,
  wiki: string
): ClubInfo {
  return {
    ids: { transicion, apertura },
    position,
    wins,
    name,
    shortName,
    city,
    pavilion,
    capacity,
    wiki
  };
}

/**
 * Los 12, por id de Genius en la Transición (su `sourceId`): puesto y
 * victorias de la suma de las dos fases regulares, nombre de uso, abreviatura
 * propia (las de Genius chocan con códigos de país: ESP, COL), ciudad,
 * pabellón y aforo (de la Wikipedia).
 */
const CLUBS: Record<string, ClubInfo> = {
  '23013': club(
    '23013',
    '23013',
    1,
    18,
    'Universidad de Concepción',
    'UDC',
    'Concepción',
    'Casa del Deporte',
    2_000,
    'Club Deportivo Universidad de Concepción (baloncesto)'
  ),
  '23015': club(
    '23015',
    '23015',
    2,
    18,
    'Colegio Los Leones',
    'LEO',
    'Quilpué',
    'Gimnasio Colegio Los Leones',
    800,
    'Club Deportivo Colegio Los Leones de Quilpué'
  ),
  '23113': club(
    '23113',
    '23113',
    3,
    15,
    'Español de Osorno',
    'ESO',
    'Osorno',
    'Gimnasio Monumental María Gallardo',
    5_500,
    'Club Deportivo Español de Osorno'
  ),
  '23017': club(
    '23017',
    '69206',
    4,
    14,
    'Municipal Puente Alto',
    'MPA',
    'Puente Alto',
    'Gimnasio Municipal Irene Velásquez',
    3_000,
    'Municipal Puente Alto'
  ),
  '23010': club(
    '23010',
    '29521',
    5,
    14,
    'Las Ánimas',
    'ANI',
    'Valdivia',
    'Coliseo Antonio Azurmendy',
    5_000,
    'Club de Deportes Las Ánimas'
  ),
  '23019': club(
    '23019',
    '23019',
    6,
    13,
    'CD Valdivia',
    'CDV',
    'Valdivia',
    'Coliseo Antonio Azurmendy',
    5_000,
    'Club Deportivo Valdivia'
  ),
  '86192': club(
    '86192',
    '86192',
    7,
    11,
    'Puerto Varas Basket',
    'APV',
    'Puerto Varas',
    'Gimnasio Fiscal de Puerto Varas',
    1_300,
    'Atlético Puerto Varas'
  ),
  '23016': club(
    '23016',
    '23016',
    8,
    9,
    'Colo-Colo',
    'CCO',
    'Santiago',
    'Centro de Entrenamiento Olímpico',
    3_000,
    'Club Social y Deportivo Colo-Colo (baloncesto)'
  ),
  '23012': club(
    '23012',
    '23012',
    9,
    8,
    'Universidad Católica',
    'UCA',
    'Santiago',
    'Edificio de Deportes UC',
    1_500,
    'Club Deportivo Universidad Católica (baloncesto)'
  ),
  '23020': club(
    '23020',
    '23020',
    10,
    7,
    'ABA Ancud',
    'ABA',
    'Ancud',
    'Gimnasio Fiscal Luis «Caco» Suárez',
    2_500,
    'Asociación de Básquetbol Ancud'
  ),
  '141436': club(
    '141436',
    '141436',
    11,
    7,
    'Boston College',
    'BOS',
    'Santiago',
    'Gimnasio Boston College',
    3_000,
    'Club Deportivo Boston College (baloncesto)'
  ),
  '23021': club(
    '23021',
    '23021',
    12,
    4,
    'Español de Talca',
    'EST',
    'Talca',
    'Gimnasio Cendyr Sur',
    1_500,
    'Club Deportivo Español de Talca'
  )
};

/**
 * Partidos que se jugaron pero se dieron por perdidos en los despachos: el
 * resultado oficial (el del calendario) no es el de la pista (el del acta).
 * Cuentan las estadísticas de la pista y la victoria oficial.
 */
const FORFEITS: Record<string, string> = {
  // Apertura, 29-04-2026: se jugó 88-97; Los Leones, 0-20 por alinear a un
  // jugador mal inscrito.
  '2844286':
    'Colegio Los Leones–Universidad de Concepción, 0-20 en los despachos (88-97 en la pista)'
};

/** Los dos que sólo jugaron el Apertura: sus partidos cuentan, ellos no entran. */
const OUTSIDERS: Record<string, string> = {
  '183589': 'Puerto Montt Básquetbol',
  '171989': 'Deportes Castro'
};

/* ------------------------------------------------------------ a mano */

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `lnbch-entrenadores.json`: `inicio`, por id de club (el de la
 *   Transición), el primer entrenador: nombre de uso con sus tildes,
 *   nacimiento como la FEB («dd/mm/aaaa Ciudad (País)») o, sin fecha, la edad
 *   (`age`, regla del 1 de julio), `nationality`, la fuente, `despues` y
 *   `enActa`, cómo le escribe el `data.json`. Sin fecha ni edad, el juego se
 *   lo inventa.
 * - `lnbch-jugadores.json`: `jugadores`, por id de persona de Genius, lo que
 *   la fuente no da o da mal: `nationality`, nombre de uso (`firstName`,
 *   `lastName`), `birthDate`, `heightCm` o `position`.
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

const PLAYERS = loadManualJson<{ jugadores: Record<string, PlayerFix> }>('lnbch-jugadores.json', {
  jugadores: {}
});
const COACHES = loadManualJson<{ inicio: Record<string, CoachEntry> }>('lnbch-entrenadores.json', {
  inicio: {}
});

type Log = (message: string) => void;

/* ---------------------------------------------------------- descargas */

/**
 * Una página de la web «hosted». Contesta a veces un 404 suelto que se
 * arregla solo al rato: se reintenta con calma antes de rendirse.
 */
async function hosted(
  client: HttpClient,
  path: string,
  log: Log,
  accept: (html: string) => boolean = () => true
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const body = await client.get(`${HOSTED}/${path}`, {
        accept: (text) => {
          const html = geniusHtml(text);
          return html !== null && accept(html);
        }
      });
      return geniusHtml(body)!;
    } catch (error) {
      if (attempt >= 5 || !/HTTP 404/.test((error as Error).message)) throw error;
      log(`  ${path}: 404; reintento ${attempt + 1}/5 en ${20 * (attempt + 1)} s`);
      await sleep(20_000 * (attempt + 1));
    }
  }
}

function liveStats(client: HttpClient, gameId: string): Promise<string> {
  return client.get(`${LIVESTATS}/${gameId}/data.json`, {
    accept: (body) => body.trimStart().startsWith('{') && body.includes('"tm"')
  });
}

async function wikiContent(client: HttpClient, title: string, date: string): Promise<string> {
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
      // La Wikipedia pide un agente que diga quién es.
      headers: { 'User-Agent': 'triple-manager-real-data/1.0 (extractor privado de datos)' },
      accept: (body) => body.includes('"pages"')
    })
  ) as { query: { pages: { revisions?: { slots: { main: { content: string } } }[] }[] } };
  return json.query.pages[0]?.revisions?.[0]?.slots.main.content ?? '';
}

/** Las plantillas de la ficha de un club, de la versión más reciente a la más antigua. */
async function wikiRosters(client: HttpClient, title: string): Promise<WikiRosterEntry[][]> {
  const out: WikiRosterEntry[][] = [];
  for (const date of WIKI_DATES) {
    const content = await wikiContent(client, title, date);
    out.push([...parseWikiTableRoster(content), ...parseWikiRoster(content)]);
  }
  return out.reverse();
}

/* ------------------------------------------------------------- torneos */

interface Played {
  /** Todas las líneas de acta (con el equipo ya traducido al id del club). */
  lines: GeniusBoxLine[];
  /** Los nombres del `data.json` de cada persona, con cuántas veces salen. */
  names: Map<string, Map<string, { firstName: string; familyName: string; count: number }>>;
  /** Entrenador del `data.json` de cada club, por fecha. */
  coaches: Map<string, { date: string; name: string }[]>;
  /** Victorias y partidos de cada club. */
  record: Map<string, { wins: number; games: number }>;
  /** Plantillas: la ficha de cada persona en cada club. */
  rosters: Map<string, { club: string; entry: GeniusRosterEntry }[]>;
  /** Primer entrenador del cuerpo técnico de cada club, por torneo. */
  staff: Map<string, string[]>;
}

/** El id de club (el de la Transición, o el de fuera) de un id de equipo de Genius. */
const clubOfTeam = new Map<string, string>();
for (const [clubId, info] of Object.entries(CLUBS)) {
  clubOfTeam.set(info.ids.transicion, clubId);
  clubOfTeam.set(info.ids.apertura, clubId);
}
for (const teamId of Object.keys(OUTSIDERS)) clubOfTeam.set(teamId, teamId);

function clubName(clubId: string): string {
  return CLUBS[clubId]?.name ?? OUTSIDERS[clubId] ?? clubId;
}

async function readTournament(
  client: HttpClient,
  spec: TournamentSpec,
  played: Played,
  warn: Log,
  log: Log
): Promise<void> {
  const base = `competition/${spec.competitionId}`;
  const teams = parseGeniusTeams(
    await hosted(client, `${base}/teams`, log, (html) => html.includes('/team/'))
  );
  for (const team of teams) {
    if (!clubOfTeam.has(team.teamId))
      warn(`${spec.label}: equipo desconocido ${team.name} (${team.teamId})`);
  }
  for (const info of Object.values(CLUBS)) {
    if (!teams.some((team) => team.teamId === info.ids[spec.key]))
      warn(`${spec.label}: falta ${info.name} (${info.ids[spec.key]})`);
  }

  log(`${spec.label}: plantillas…`);
  for (const team of teams) {
    const clubId = clubOfTeam.get(team.teamId);
    if (!clubId) continue;
    const roster = parseGeniusRoster(
      await hosted(client, `${base}/team/${team.teamId}/roster`, log, (html) =>
        html.includes('Lista de Jugadores')
      )
    );
    for (const entry of roster) {
      const list = played.rosters.get(entry.personId) ?? [];
      list.push({ club: clubId, entry });
      played.rosters.set(entry.personId, list);
    }
    const staff = parseGeniusStaff(
      await hosted(client, `${base}/team/${team.teamId}/staff`, log, (html) =>
        html.includes('Entrenadores')
      )
    );
    if (CLUBS[clubId]) played.staff.set(`${clubId}|${spec.key}`, staff);
  }

  const games: GeniusGame[] = [];
  for (const phase of PHASES) {
    games.push(
      ...parseGeniusSchedule(
        await hosted(
          client,
          `${base}/schedule?phaseName=${encodeURIComponent(phase)}`,
          log,
          (html) => html.includes('extfix_')
        )
      )
    );
  }
  games.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  if (games.length !== spec.games)
    warn(`${spec.label}: ${games.length} partidos de fase regular y deberían ser ${spec.games}`);

  log(`${spec.label}: ${games.length} actas…`);
  for (const game of games) {
    const label = `${spec.label} ${game.date} ${clubName(clubOfTeam.get(game.homeId) ?? game.homeId)}–${clubName(clubOfTeam.get(game.awayId) ?? game.awayId)}`;
    const box = parseGeniusBoxScore(
      await hosted(client, `${base}/match/${game.gameId}/boxscore`, log, (html) =>
        html.includes('<h4>')
      )
    );
    if (!box) {
      warn(`${label}: sin acta`);
      continue;
    }
    if (FORFEITS[game.gameId]) log(`  ${FORFEITS[game.gameId]}`);
    const live = parseLiveStats(await liveStats(client, game.gameId));
    const scores = [game.homeScore, game.awayScore];
    for (const [index, side] of box.teams.entries()) {
      const clubId = clubOfTeam.get(side.teamId);
      const expectedTeam = index === 0 ? game.homeId : game.awayId;
      if (!clubId || side.teamId !== expectedTeam) {
        warn(`${label}: el acta no casa con el calendario (${side.name})`);
        continue;
      }
      const points = side.lines.reduce((sum, line) => sum + line.points, 0);
      if (points !== scores[index] && !FORFEITS[game.gameId])
        warn(`${label}: ${side.name} suma ${points} y el tanteo es ${scores[index]}`);
      const liveTeam = live?.teams[index];
      if (live?.complete && liveTeam && liveTeam.score === points) {
        const matched = applyLiveStats(side.lines, liveTeam);
        const starters = side.lines.filter((line) => line.starter).length;
        if (starters !== 5)
          warn(
            `${label}: ${side.name} con ${starters} titulares (${matched} casados con LiveStats)`
          );
        for (const line of side.lines) {
          const player = liveTeam.players.find((entry) => sameLivePlayer(line, entry));
          if (!player || !player.firstName) continue;
          const byName = played.names.get(line.personId) ?? new Map();
          const key = `${player.firstName}|${player.familyName}`;
          const current = byName.get(key) ?? { ...player, count: 0 };
          current.count++;
          byName.set(key, current);
          played.names.set(line.personId, byName);
        }
        if (liveTeam.coach && CLUBS[clubId]) {
          const list = played.coaches.get(clubId) ?? [];
          list.push({ date: game.date ?? '', name: liveTeam.coach });
          played.coaches.set(clubId, list);
        }
      } else {
        warn(
          `${label}: ${side.name} sin titulares ni faltas recibidas (el data.json de LiveStats ${live ? 'viene incompleto' : 'no está'})`
        );
      }
      for (const line of side.lines) played.lines.push({ ...line, teamId: clubId });
    }
    // Victorias, del calendario.
    if (game.homeScore !== null && game.awayScore !== null) {
      for (const [teamId, won] of [
        [game.homeId, game.homeScore > game.awayScore],
        [game.awayId, game.awayScore > game.homeScore]
      ] as const) {
        const clubId = clubOfTeam.get(teamId);
        if (!clubId) continue;
        const record = played.record.get(clubId) ?? { wins: 0, games: 0 };
        record.games++;
        if (won) record.wins++;
        played.record.set(clubId, record);
      }
    }
  }
}

/* ------------------------------------------------------ entrenadores */

/** El entrenador sin tildes ni segundo apellido: la mesa lo escribe de varias maneras. */
function coachKey(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(plainName).join(' ');
}

function coachSequence(
  list: readonly { date: string; name: string }[]
): { date: string; name: string }[] {
  const out: { date: string; name: string }[] = [];
  for (const entry of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
    const last = out.at(-1);
    if (!last || coachKey(last.name) !== coachKey(entry.name)) out.push(entry);
  }
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
      `${teamName}: sin entrenador a mano (en el primer partido: ${first ?? 'nadie'}); se inventa`
    );
    return null;
  }
  if (first && entry.enActa && coachKey(entry.enActa) !== coachKey(first)) {
    warn(
      `${teamName}: en el primer partido está ${first} y a mano ${entry.firstName} ${entry.lastName} (${entry.enActa})`
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

interface WikiSources {
  /** Por club: sus versiones, la más reciente primero. */
  rosters: Map<string, WikiRosterEntry[][]>;
  foreigners: WikiForeigner[];
}

/**
 * El jugador en la ficha de su club en la Wikipedia (cualquier versión) y,
 * si no está, en las de los demás clubes: allí sólo si es uno. Si trae fecha,
 * tiene que ser la suya.
 */
function wikiMatch(
  wiki: WikiSources,
  clubId: string,
  firstName: string,
  familyName: string,
  birthDate: string | null
): WikiRosterEntry | null {
  const fits = (entry: WikiRosterEntry): boolean =>
    sameChileanPlayer(firstName, familyName, entry.name) &&
    (!entry.birthDate || !birthDate || entry.birthDate === birthDate);
  for (const roster of wiki.rosters.get(clubId) ?? []) {
    const found = roster.find(fits);
    if (found) return found;
  }
  const others = [...wiki.rosters]
    .filter(([id]) => id !== clubId)
    .flatMap(([, rosters]) => rosters.flat())
    .filter(fits);
  const names = new Set(others.map((entry) => entry.name));
  if (names.size === 1) return others[0]!;
  // Sin el nombre (un apodo: «TJ»), por la fecha y un apellido.
  if (!birthDate) return null;
  const surnames = new Set(
    familyName
      .split(/[\s-]+/)
      .map(plainName)
      .filter(Boolean)
  );
  const byDate = [...wiki.rosters.values()]
    .flatMap((rosters) => rosters.flat())
    .filter(
      (entry) =>
        entry.birthDate === birthDate &&
        entry.name.split(/[\s-]+/).some((word) => surnames.has(plainName(word)))
    );
  return new Set(byDate.map((entry) => entry.name)).size === 1 ? byDate[0]! : null;
}

/** La nacionalidad: la de Genius, corregida con la Wikipedia; chilena si es de aquí o viene vacía. */
function nationalityOf(
  genius: string | null,
  wikiRaw: string | null,
  foreignerRaw: string | null
): { nationality: string; raw: string | null; conflict: string | null } {
  // Dos banderas («VEN/CHI») o la plantilla de doble bandera («Argentina Chile»).
  const wikiCodes = (wikiRaw ?? foreignerRaw ?? '')
    .split('/')
    .flatMap((raw) => {
      const code = wikiNationality(raw);
      return code ? [code] : raw.split(/\s+/).map((word) => wikiNationality(word));
    })
    .filter((code): code is string => code !== null);
  const fromGenius = genius ? (toNationCode(genius) ?? genius) : null;
  const raw = [genius, wikiRaw ?? foreignerRaw].filter(Boolean).join(' · ') || null;
  // Los nacionalizados juegan como chilenos.
  if (fromGenius === 'CHI' || wikiCodes.includes('CHI'))
    return { nationality: 'CHI', raw, conflict: null };
  if (wikiCodes.length > 0) {
    const nationality = wikiCodes[0]!;
    return {
      nationality,
      raw,
      conflict: fromGenius && fromGenius !== nationality ? `Genius ${fromGenius}` : null
    };
  }
  return { nationality: fromGenius ?? 'CHI', raw, conflict: null };
}

/**
 * El nombre legal del `data.json` que más se repite, de entre los que tienen
 * algún apellido del nombre corto del acta (la mesa a veces los teclea al
 * revés o mal).
 */
function mostFrequentName(
  names: Map<string, { firstName: string; familyName: string; count: number }> | undefined,
  shortName: string
): { firstName: string; familyName: string } | null {
  if (!names || names.size === 0) return null;
  const all = [...names.values()].sort((a, b) => b.count - a.count);
  return all.find((name) => sharesSurname(shortName, name.familyName)) ?? null;
}

function chilePlayer(
  entry: GeniusPlayerStats,
  played: Played,
  wiki: WikiSources,
  teamName: string,
  warn: Log
): SourcePlayer {
  const fix = PLAYERS.jugadores[entry.personId];
  const rosterEntries = played.rosters.get(entry.personId) ?? [];
  const roster =
    rosterEntries.find((item) => item.club === entry.teamId)?.entry ?? rosterEntries[0]?.entry;
  const birthDate = rosterEntries.map((item) => item.entry.birthDate).find(Boolean) ?? null;
  const geniusNation = rosterEntries.map((item) => item.entry.nationality).find(Boolean) ?? null;
  const minutes = Math.round(entry.stats.seconds / 60);

  let legal = mostFrequentName(played.names.get(entry.personId), entry.line.shortName);
  if (!legal) {
    // Sin un nombre del data.json que cuadre: el corto del acta («B. Herrera
    // Alvarez»), si no está a mano.
    const [initial = '', ...rest] = entry.line.shortName.split(' ');
    legal = { firstName: initial, familyName: rest.join(' ') };
    if (!fix?.firstName)
      warn(
        `${teamName}: ${entry.line.shortName} (${entry.personId}) sin nombre completo en LiveStats`
      );
  }
  const wikiEntry = wikiMatch(wiki, entry.teamId, legal.firstName, legal.familyName, birthDate);
  const foreigner =
    wiki.foreigners.find((item) =>
      sameChileanPlayer(legal.firstName, legal.familyName, item.name)
    ) ?? null;
  const nation = nationalityOf(
    geniusNation,
    wikiEntry?.nationalityRaw ?? null,
    foreigner?.nationalityRaw ?? null
  );
  const manualNation = fix?.nationality ? toNationCode(fix.nationality) : null;
  const nationality = manualNation ?? nation.nationality;
  const named = chileanName(
    legal.firstName,
    legal.familyName,
    wikiEntry?.name ?? null,
    nationality
  );
  const firstName = fix?.firstName ?? named.firstName;
  const lastName = fix?.lastName ?? named.lastName;
  const label = `${teamName}: ${firstName} ${lastName} (${entry.personId}, ${minutes} min)`;
  const unknown = (wikiEntry?.nationalityRaw ?? foreigner?.nationalityRaw ?? '')
    .split('/')
    .filter((raw) => raw && !wikiNationality(raw) && !raw.split(/\s+/).every(wikiNationality));
  if (!manualNation && unknown.length > 0)
    warn(`${label}: bandera de la Wikipedia «${unknown.join(', ')}» sin reconocer`);
  if (!manualNation && nation.conflict)
    warn(`${label}: ${nation.conflict} y la Wikipedia ${nationality}; manda la Wikipedia`);
  if (!geniusNation && !wikiEntry?.nationalityRaw && !foreigner && !manualNation && minutes >= 100)
    warn(`${label}: sin nacionalidad en ninguna fuente; chileno`);

  const heightCm = fix?.heightCm ?? wikiEntry?.heightCm ?? roster?.heightCm ?? null;
  const fromWiki = wikiPosition(wikiEntry?.positionRaw);
  let position: SourcePosition | null = fix?.position ?? null;
  let positionRaw = wikiEntry?.positionRaw ?? null;
  if (!position) {
    if (fromWiki === 'G' || fromWiki === 'F') position = positionFromStats(entry.stats, fromWiki);
    else if (fromWiki) position = fromWiki;
    // Sin puesto pero con altura, el montaje decide por la altura.
    else if (heightCm === null) {
      position = positionFromStats(entry.stats);
      positionRaw = position ? 'por estadísticas' : null;
    }
    position = chileanPosition(position, heightCm);
  }
  const rawBirth = fix?.birthDate ?? birthDate ?? wikiEntry?.birthDate ?? null;
  const birth = plausibleBirthDate(rawBirth, SEASON_START_YEAR);
  if (!birth) warn(`${label}: sin fecha de nacimiento${rawBirth ? ` («${rawBirth}»)` : ''}`);
  return {
    sourceId: entry.personId,
    firstName,
    lastName,
    nickname: null,
    birthDate: birth,
    age: null,
    nationality,
    nationalityRaw: fix?.nationality ?? nation.raw,
    position,
    positionRaw,
    heightCm,
    weightKg: null,
    shirtNumber: entry.line.shirtNumber ?? roster?.shirtNumber ?? null,
    licence: null,
    stats: entry.stats
  };
}

/* -------------------------------------------------------- extracción */

const log: Log = (message) => console.log(message);

async function main(): Promise<void> {
  const { force } = cliOptions();
  const started = Date.now();
  const client = createHttpClient({ minDelayMs: 2_500, force, log, retries: 6 });
  const warnings: string[] = [];
  const warn: Log = (message) => {
    warnings.push(message);
    log(`  aviso: ${message}`);
  };

  const played: Played = {
    lines: [],
    names: new Map(),
    coaches: new Map(),
    record: new Map(),
    rosters: new Map(),
    staff: new Map()
  };
  for (const spec of TOURNAMENTS) await readTournament(client, spec, played, warn, log);

  log('Wikipedia…');
  const wiki: WikiSources = { rosters: new Map(), foreigners: [] };
  for (const [clubId, info] of Object.entries(CLUBS))
    wiki.rosters.set(clubId, await wikiRosters(client, info.wiki));
  for (const title of WIKI_TOURNAMENTS)
    wiki.foreigners.push(...parseWikiForeigners(await wikiContent(client, title, '2026-09-25')));

  // Cada persona en su club de los 12 donde más minutos jugó; lo jugado en
  // Puerto Montt o Castro no cuenta (no entran en el juego).
  const all = aggregateGeniusBoxScores(played.lines);
  const kept = new Map<string, GeniusPlayerStats>();
  for (const entry of all) {
    if (!CLUBS[entry.teamId]) continue;
    const current = kept.get(entry.personId);
    if (!current || entry.stats.seconds > current.stats.seconds) kept.set(entry.personId, entry);
  }
  for (const entry of all) {
    const winner = kept.get(entry.personId);
    if (!winner || winner === entry) continue;
    log(
      `  ${entry.line.shortName} jugó en ${clubName(entry.teamId)} (${Math.round(entry.stats.seconds / 60)} min) ` +
        `y en ${clubName(winner.teamId)} (${Math.round(winner.stats.seconds / 60)} min): se queda en el segundo`
    );
  }

  const teams: SourceTeam[] = [];
  const ordered = Object.entries(CLUBS).sort(([, a], [, b]) => a.position - b.position);
  for (const [clubId, info] of ordered) {
    const record = played.record.get(clubId) ?? { wins: 0, games: 0 };
    if (record.games !== GAMES_PER_TEAM)
      warn(`${info.name}: ${record.games} partidos y deberían ser ${GAMES_PER_TEAM}`);
    if (record.wins !== info.wins)
      warn(
        `${info.name}: ${record.wins} victorias en las actas y ${info.wins} en la clasificación`
      );
    const players = [...kept.values()]
      .filter((entry) => entry.teamId === clubId)
      .map((entry) => chilePlayer(entry, played, wiki, info.name, warn));
    const staff = [
      ...(played.staff.get(`${clubId}|transicion`) ?? []),
      ...(played.staff.get(`${clubId}|apertura`) ?? [])
    ];
    log(
      `${info.position}. ${info.name}: ${record.wins}-${record.games - record.wins}, ${players.length} jugadores` +
        (staff.length ? ` (cuerpo técnico: ${[...new Set(staff)].join(' / ')})` : '')
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
      coach: teamCoach(clubId, info.name, played.coaches.get(clubId) ?? [], warn, log)
    });
  }

  const league: SourceLeague = {
    competitionId: 'chile-1',
    name: 'Liga Nacional de Básquetbol',
    shortName: 'LNB',
    country: 'CHI',
    seasonStartYear: SEASON_START_YEAR,
    source: 'https://clnb.web.geniussports.com',
    extractedAt: new Date().toISOString(),
    teams,
    warnings
  };
  const file = sourceFile('lnbch', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(file);
  log(
    `\n${client.networkRequests} peticiones a la red, ${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
