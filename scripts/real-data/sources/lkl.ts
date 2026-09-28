import { createHttpClient, type HttpClient } from '../lib/http';
import { coachFromManual, loadManualJson, type ManualCoach } from '../lib/manual';
import { toNationCode } from '../lib/nationalities';
import { plausibleBirthDate, usualFirstName } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type {
  SourceCoach,
  SourceLeague,
  SourcePlayer,
  SourcePosition,
  SourceStats,
  SourceTeam
} from '../lib/source-types';
import {
  addLine,
  aggregateLklBoxScores,
  emptyStats,
  findLivewireLazy,
  lklNationality,
  lklPosition,
  parseLivewireUpdate,
  parseLklBoxScore,
  parseLklHistory,
  parseLklPlayerPage,
  parseLklSquad,
  parseLklStandings,
  playedIn,
  type LklGame,
  type LklPlayerPage,
  type LklSquadPlayer
} from './lkl-parse';
import {
  basketnewsNationality,
  nklPosition,
  parseBasketnewsGame,
  parseBasketnewsPlayer,
  parseNklCalendar,
  parseNklStandings,
  type NklBoxLine,
  type NklGame
} from './nkl-parse';

/**
 * Extractor de las dos ligas lituanas.
 *
 *   pnpm real:lkl            usa la caché de descargas
 *   pnpm real:lkl --force    lo vuelve a descargar todo
 *
 * LKL (`lituania-1`), de lkl.lt:
 * - La 2025-26 tuvo 9 equipos y la liga del juego tiene 12: los tres que
 *   faltan suben de la NKL (`promoted` en la NKL, con su escala).
 * - Liga regular: 32 jornadas, las actas 11370 a 11513 (ids seguidos), en
 *   JSON. Las estadísticas son la suma de esas 144 actas.
 * - La plantilla de la temporada, del componente Livewire de la página de
 *   cada club; de la ficha de cada jugador que jugó, lo que falte, y de su
 *   historial, los partidos de titular (las actas de las primeras semanas no
 *   los marcan).
 * - El primer entrenador, a mano (`lkl-entrenadores.json`): las actas de la
 *   web dan el entrenador actual del club, no el de ese partido.
 * - Dos segundos entre peticiones.
 *
 * NKL (`lituania-2`), del calendario de nkl.lt (diez segundos entre
 * peticiones, lo que pide su `robots.txt`) y de las actas y fichas de
 * basketnews.lt (tres segundos):
 * - 17 equipos: los tres primeros que no son filiales suben a la LKL y los
 *   dos últimos no entran (`excluded`); quedan 12.
 * - Liga regular: sólo la primera fase (32 jornadas, todos contra todos dos
 *   veces), la misma para todos. La segunda fase, el minitorneo y los
 *   playoffs no cuentan.
 * - El primer entrenador, el del acta del primer partido del club, con la
 *   fecha y la nacionalidad a mano (`nkl-entrenadores.json`); sin ellas, el
 *   juego se lo inventa.
 * - Los filiales (Žalgiris-2, Rytas-2, Neptūnas-2) comparten jugadores con su
 *   primer equipo: el montaje deja a cada uno donde más minutos jugó
 *   (`sharedPlayerDrops`).
 */

const SEASON_START_YEAR = 2025;

/* --------------------------------------------------------------- LKL */

const LKL_SITE = 'https://lkl.lt';
/** La temporada 2025-26 en las estadísticas, los resultados y las plantillas. */
const LKL_SEASON_ID = 41936;
/** La misma temporada en la clasificación. */
const LKL_STANDINGS_SEASON = 34;
const LKL_FIRST_GAME = 11370;
const LKL_LAST_GAME = 11513;
const LKL_ROUNDS = 32;

interface TeamInfo {
  name: string;
  shortName: string;
  city: string;
  pavilion: string;
  /** Aforo de la Wikipedia (la web oficial no lo da). */
  capacity: number;
}

/**
 * Los clubes de la LKL, por id de la web (que no cambia de una temporada a
 * otra): nombre sin patrocinador («Jonavos Hipocredit» → «Jonava»), la
 * abreviatura de la web, la ciudad y el pabellón de casa, con el aforo de la
 * Wikipedia inglesa («2025–26 LKL season»). El Rytas juega también en el
 * pequeño Active Vilnius Arena, pero su pabellón es el Arena Vilnius.
 */
const LKL_TEAMS: Record<string, TeamInfo & { slug: string }> = {
  '3': {
    slug: 'zalgiris',
    name: 'Žalgiris',
    shortName: 'ŽAL',
    city: 'Kaunas',
    pavilion: 'Žalgirio arena',
    capacity: 15_415
  },
  '6': {
    slug: 'rytas',
    name: 'Rytas',
    shortName: 'RYT',
    city: 'Vilnius',
    pavilion: 'Arena Vilnius',
    capacity: 10_000
  },
  '5': {
    slug: 'neptunas',
    name: 'Neptūnas',
    shortName: 'NEP',
    city: 'Klaipėda',
    pavilion: 'Švyturio arena',
    capacity: 6_200
  },
  '12': {
    slug: 'siauliai',
    name: 'Šiauliai',
    shortName: 'ŠIA',
    city: 'Šiauliai',
    pavilion: 'Šiaulių arena',
    capacity: 5_700
  },
  '10': {
    slug: 'lietkabelis',
    name: 'Lietkabelis',
    shortName: 'LIE',
    city: 'Panevėžys',
    pavilion: 'Kalnapilio arena',
    capacity: 5_950
  },
  '60': {
    slug: 'gargzdai',
    name: 'Gargždai',
    shortName: 'GAR',
    city: 'Gargždai',
    pavilion: 'Gargždų SC arena',
    capacity: 1_400
  },
  '4': {
    slug: 'juventus',
    name: 'Juventus',
    shortName: 'JUV',
    city: 'Utena',
    pavilion: 'Utenos daugiafunkcis sporto centras',
    capacity: 2_500
  },
  '41': {
    slug: 'hipocredit',
    name: 'Jonava',
    shortName: 'JON',
    city: 'Jonava',
    pavilion: 'Jonavos sporto arena',
    capacity: 2_200
  },
  '11': {
    slug: 'nevezis-paskolu-klubas',
    name: 'Nevėžis',
    shortName: 'NEV',
    city: 'Kėdainiai',
    pavilion: 'Kėdainių arena',
    capacity: 2_200
  }
};

/* --------------------------------------------------------------- NKL */

const NKL_SITE = 'https://nkl.lt';
const BASKETNEWS = 'https://www.basketnews.lt';
/** La primera fase de la temporada 2025-26: la liga regular que cuenta. */
const NKL_STAGE = '2639';
const NKL_ROUNDS = 32;

/**
 * Los clubes de la NKL, por id (el mismo en nkl.lt y basketnews): nombre sin
 * patrocinador (los filiales, con «-2»), ciudad y pabellón con el aforo de la
 * Wikipedia inglesa («National Basketball League (Lithuania)»); nkl.lt no da
 * el pabellón en la 2025-26.
 */
const NKL_TEAMS: Record<string, TeamInfo> = {
  '856': {
    name: 'Sūduva',
    shortName: 'SŪD',
    city: 'Marijampolė',
    pavilion: 'Marijampolės sporto centras',
    capacity: 800
  },
  '18': {
    name: 'Vytis',
    shortName: 'VYT',
    city: 'Šakiai',
    pavilion: 'Šakių sporto centras',
    capacity: 800
  },
  '266': {
    name: 'Žalgiris-2',
    shortName: 'ŽA2',
    city: 'Kaunas',
    pavilion: 'Žalgirio treniruočių centras',
    capacity: 500
  },
  '2147': {
    name: 'Kėdainiai',
    shortName: 'KĖD',
    city: 'Kėdainiai',
    pavilion: 'Kėdainių arena',
    capacity: 2_200
  },
  '381': {
    name: 'M Basket',
    shortName: 'MAŽ',
    city: 'Mažeikiai',
    pavilion: 'Mažeikių Ventos progimnazijos sporto salė',
    capacity: 500
  },
  '2377': {
    name: 'Perlas',
    shortName: 'VLK',
    city: 'Vilkaviškis',
    pavilion: 'Vilkaviškio sporto centras',
    capacity: 800
  },
  '928': {
    name: 'Rytas-2',
    shortName: 'RY2',
    city: 'Vilnius',
    pavilion: 'Active Vilnius Arena',
    capacity: 2_500
  },
  '997': {
    name: 'Telšiai',
    shortName: 'TEL',
    city: 'Telšiai',
    pavilion: 'Telšių sporto arena',
    capacity: 1_000
  },
  '285': {
    name: 'Neptūnas-2',
    shortName: 'NE2',
    city: 'Klaipėda',
    pavilion: 'Klaipėdos sporto ir gimnastikos rūmai',
    capacity: 400
  },
  '2250': {
    name: 'Jurbarkas',
    shortName: 'JUR',
    city: 'Jurbarkas',
    pavilion: 'Jurbarko A. Giedraičio-Giedriaus gimnazijos sporto salė',
    capacity: 500
  },
  '1000': {
    name: 'Kretinga',
    shortName: 'KRE',
    city: 'Kretinga',
    pavilion: 'Kretingos arena',
    capacity: 822
  },
  '609': {
    name: 'Šilutė',
    shortName: 'ŠIL',
    city: 'Šilutė',
    pavilion: 'Šilutės Vydūno gimnazijos sporto salė',
    capacity: 650
  },
  '3384': {
    name: 'Omega',
    shortName: 'OME',
    city: 'Garliava',
    pavilion: 'Garliavos arena',
    capacity: 1_300
  },
  '2427': {
    name: 'Olimpas Palanga',
    shortName: 'PAL',
    city: 'Palanga',
    pavilion: 'Palangos arena',
    capacity: 1_180
  },
  '1382': {
    name: 'Stekas',
    shortName: 'UKM',
    city: 'Ukmergė',
    pavilion: 'Ukmergės TVM sporto salė',
    capacity: 500
  },
  '1001': {
    name: 'Olimpas Plungė',
    shortName: 'PLU',
    city: 'Plungė',
    pavilion: 'Plungės arena',
    capacity: 1_500
  },
  '3385': {
    name: 'Alytus',
    shortName: 'ALY',
    city: 'Alytus',
    pavilion: 'Alytaus arena',
    capacity: 5_500
  }
};

/**
 * Los tres que suben a la LKL: los tres primeros de la NKL que no son
 * filiales, por la liga regular y por los playoffs (Sūduva, Vytis, Perlas).
 */
const NKL_PROMOTED = ['856', '18', '2377'];
/** Los dos últimos (Alytus desaparece en 2026-27): se valoran, pero no entran. */
const NKL_EXCLUDED = ['3385', '1382'];

/* ------------------------------------------------------------ a mano */

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `lkl-entrenadores.json`: `inicio`, por id de club de la LKL, el primer
 *   entrenador de la temporada (de la Wikipedia: nombre, nacimiento como la
 *   FEB «dd/mm/aaaa Ciudad (País)» y `nationality`) y `despues`.
 * - `nkl-entrenadores.json`: `inicio`, por id de club de la NKL, lo mismo
 *   para el entrenador del acta del primer partido; sólo los que tienen
 *   fecha en la Wikipedia. Sin él, el juego se inventa el entrenador.
 * - `lkl-jugadores.json` / `nkl-jugadores.json`: `jugadores`, por id de la
 *   web (el `slug` en la LKL, el número en la NKL), lo que la web da mal o no
 *   da: nombre de uso o con sus diacríticos (`firstName`, `lastName`) y, si
 *   hace falta, `birthDate` (AAAA-MM-DD), `nationality` (COI), `heightCm` o
 *   `position`.
 */
interface CoachesManual {
  inicio: Record<string, ManualCoach & { despues?: string }>;
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

const LKL_COACHES = loadManualJson<CoachesManual>('lkl-entrenadores.json', { inicio: {} });
const NKL_COACHES = loadManualJson<CoachesManual>('nkl-entrenadores.json', { inicio: {} });
const LKL_PLAYERS = loadManualJson<PlayersManual>('lkl-jugadores.json', { jugadores: {} });
const NKL_PLAYERS = loadManualJson<PlayersManual>('nkl-jugadores.json', { jugadores: {} });

type Log = (message: string) => void;
type Warn = (message: string) => void;

function plainName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function warner(prefix: string, log: Log): { warnings: string[]; warn: Warn } {
  const warnings: string[] = [];
  return {
    warnings,
    warn: (message) => {
      warnings.push(message);
      log(`  aviso ${prefix}: ${message}`);
    }
  };
}

/** Un nombre completo partido por la primera palabra («Nombre Apellido Compuesto»). */
function splitFirstWord(full: string): { firstName: string; lastName: string } {
  const words = full.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= 1) return { firstName: '', lastName: words[0] ?? '' };
  return { firstName: words[0] ?? '', lastName: words.slice(1).join(' ') };
}

function coachWithoutDate(sourceId: string, name: string): SourceCoach {
  return {
    sourceId,
    ...splitFirstWord(name),
    birthDate: null,
    age: null,
    nationality: null,
    nationalityRaw: null
  };
}

/* ------------------------------------------------------ LKL: extracción */

async function lklSquad(
  client: HttpClient,
  slug: string,
  warn: Warn
): Promise<LklSquadPlayer[] | null> {
  // Tres peticiones encadenadas (la página, para la sesión y el token; el
  // componente; y el componente en la 2025-26): sólo se guarda la última.
  const url = `${LKL_SITE}/livewire/update`;
  const options = { method: 'POST' as const, cacheKey: `lkl-team-squad-${slug}-${LKL_SEASON_ID}` };
  if (client.isCached(url, options)) return parseLklSquad(await client.request(url, options));
  const page = await client.get(`${LKL_SITE}/komandos/${slug}`, { noCache: true });
  const lazy = findLivewireLazy(page, 'team-squad');
  if (!lazy) {
    warn(`${slug}: no se encuentra la plantilla (Livewire) en la página del club`);
    return null;
  }
  const call = async (snapshot: string, body: Record<string, unknown>): Promise<string> =>
    client.request(url, {
      method: 'POST',
      noCache: true,
      headers: { 'X-Livewire': 'true', Accept: 'application/json' },
      json: { _token: lazy.csrf, components: [{ snapshot, ...body }] }
    });
  const loaded = parseLivewireUpdate(
    await call(lazy.snapshot, {
      updates: {},
      calls: [{ path: '', method: '__lazyLoad', params: [lazy.lazyParam] }]
    })
  );
  if (!loaded) {
    warn(`${slug}: Livewire no ha devuelto la plantilla`);
    return null;
  }
  const season = parseLivewireUpdate(
    await call(loaded.snapshot, { updates: { seasonId: String(LKL_SEASON_ID) }, calls: [] })
  );
  if (!season?.html.includes('zaidejai/')) {
    warn(`${slug}: Livewire no ha devuelto la plantilla de la 2025-26`);
    return null;
  }
  client.store(url, options, season.html);
  return parseLklSquad(season.html);
}

async function extractLkl(client: HttpClient, log: Log): Promise<SourceLeague> {
  const { warnings, warn } = warner('LKL', log);
  log('LKL 2025-26: clasificación…');
  const standings = parseLklStandings(
    await client.get(`${LKL_SITE}/loadStandings/${LKL_STANDINGS_SEASON}`, {
      accept: (body) => body.includes('/komandos/')
    })
  );
  const slugToId = new Map(Object.entries(LKL_TEAMS).map(([id, team]) => [team.slug, id]));
  if (standings.length !== Object.keys(LKL_TEAMS).length) {
    throw new Error(`La clasificación de la LKL trae ${standings.length} equipos.`);
  }

  log(`LKL: ${LKL_LAST_GAME - LKL_FIRST_GAME + 1} actas de liga regular…`);
  const games: LklGame[] = [];
  for (let id = LKL_FIRST_GAME; id <= LKL_LAST_GAME; id++) {
    const game = parseLklBoxScore(
      await client.get(`${LKL_SITE}/api/livestream/boxscore/${id}`, {
        accept: (body) => body.includes('"boxscore"')
      }),
      String(id)
    );
    if (!game) {
      warn(`acta ${id}: no se ha podido leer`);
      continue;
    }
    games.push(game);
  }
  const statsByTeam = new Map<string, Map<string, SourceStats>>();
  for (const entry of aggregateLklBoxScores(games.flatMap((game) => game.lines))) {
    const team = statsByTeam.get(entry.teamId) ?? new Map<string, SourceStats>();
    team.set(entry.slug, entry.stats);
    statsByTeam.set(entry.teamId, team);
  }

  const teams: SourceTeam[] = [];
  for (const standing of standings) {
    const teamId = slugToId.get(standing.slug);
    const info = teamId ? LKL_TEAMS[teamId] : undefined;
    if (!teamId || !info) throw new Error(`LKL: club desconocido ${standing.slug}`);
    log(`LKL ${standing.rank}. ${info.name}`);
    const teamGames = games.filter((game) => game.homeId === teamId || game.awayId === teamId);
    if (teamGames.length !== LKL_ROUNDS) {
      warn(`${info.name}: ${teamGames.length} actas y deberían ser ${LKL_ROUNDS}`);
    }
    const wins = teamGames.filter((game) =>
      game.homeId === teamId ? game.homeScore > game.awayScore : game.awayScore > game.homeScore
    ).length;
    if (wins !== standing.wins) {
      warn(`${info.name}: ${wins} victorias en las actas y ${standing.wins} en la clasificación`);
    }
    // Sin marcas de titular en las primeras semanas: se avisa aquí y se toma del historial.
    const unmarked = teamGames.filter(
      (game) => !game.lines.some((line) => line.teamId === teamId && line.starter)
    ).length;
    if (unmarked > 0) log(`  ${unmarked} actas sin titulares marcados`);

    const squad = (await lklSquad(client, standing.slug, warn)) ?? [];
    const teamStats = statsByTeam.get(teamId) ?? new Map<string, SourceStats>();
    const slugs = [...new Set([...squad.map((entry) => entry.slug), ...teamStats.keys()])];
    const players: SourcePlayer[] = [];
    for (const slug of slugs) {
      const listed = squad.find((entry) => entry.slug === slug) ?? null;
      const stats = teamStats.get(slug) ?? null;
      let page: LklPlayerPage | null = null;
      let starts: number | null = null;
      if (stats || !listed?.nationalityRaw) {
        page = parseLklPlayerPage(
          await client.get(`${LKL_SITE}/zaidejai/${slug}`, {
            accept: (body) => body.includes('<h1')
          })
        );
        if (!page) warn(`${info.name}: ${slug}: sin ficha`);
      }
      if (stats && page?.playerId) {
        const history = parseLklHistory(
          await client.get(
            `${LKL_SITE}/zaidejai/get-player-history?player_id=${page.playerId}&cup_type=lkl-regular`,
            { headers: { 'X-Requested-With': 'XMLHttpRequest' } }
          )
        ).filter((row) => row.season === '2025-2026');
        const row =
          history.length === 1
            ? history[0]
            : history.find((entry) => plainName(entry.team) === plainName(standing.name));
        if (!row) {
          warn(`${info.name}: ${slug}: sin historial de la 2025-26; titulares de las actas`);
        } else {
          if (row.games !== stats.games) {
            warn(
              `${info.name}: ${slug}: ${stats.games} partidos en las actas y ${row.games} en el historial`
            );
          }
          starts = Math.min(row.starts, stats.games);
        }
      }
      if (stats && starts !== null) stats.starts = starts;
      players.push(lklPlayer(slug, listed, page, stats, info.name, warn));
    }

    teams.push({
      sourceId: teamId,
      name: info.name,
      shortName: info.shortName,
      city: info.city,
      pavilionName: info.pavilion,
      pavilionCapacity: info.capacity,
      finalPosition: standing.rank,
      players,
      coach: manualCoach(LKL_COACHES, teamId, info.name, null, warn)
    });
  }

  return {
    competitionId: 'lituania-1',
    name: 'Lietuvos Krepšinio Lyga',
    shortName: 'LKL',
    country: 'LTU',
    seasonStartYear: SEASON_START_YEAR,
    source: LKL_SITE,
    extractedAt: new Date().toISOString(),
    teams,
    warnings
  };
}

/** Un jugador de la LKL con lo de la plantilla, su ficha, sus actas y lo puesto a mano. */
function lklPlayer(
  slug: string,
  listed: LklSquadPlayer | null,
  page: LklPlayerPage | null,
  stats: SourceStats | null,
  team: string,
  warn: Warn
): SourcePlayer {
  const fix = LKL_PLAYERS.jugadores[slug];
  const fromSquad = listed ? splitFirstWord(listed.fullName) : null;
  const firstName = fix?.firstName ?? (page?.firstName || fromSquad?.firstName || '');
  const lastName = fix?.lastName ?? (page?.lastName || fromSquad?.lastName || slug);
  const label = `${team}: ${firstName} ${lastName} (${slug})`;
  const nationality =
    (fix?.nationality ? toNationCode(fix.nationality) : null) ??
    lklNationality([listed?.nationalityRaw, ...(page?.flags ?? [])]);
  if (!nationality) warn(`${label}: sin nacionalidad (se pone la del club)`);
  const heightCm = fix?.heightCm ?? listed?.heightCm ?? page?.heightCm ?? null;
  const positionRaw = listed?.positionRaw ?? page?.positionRaw ?? null;
  const position = fix?.position ?? lklPosition(positionRaw, heightCm);
  if (positionRaw && !position) warn(`${label}: puesto no reconocido «${positionRaw}»`);
  const rawBirth = fix?.birthDate ?? listed?.birthDate ?? page?.birthDate ?? null;
  const birthDate = plausibleBirthDate(rawBirth, SEASON_START_YEAR);
  if (!birthDate) warn(`${label}: sin fecha de nacimiento${rawBirth ? ` («${rawBirth}»)` : ''}`);
  return {
    sourceId: slug,
    firstName,
    lastName,
    nickname: null,
    birthDate,
    age: null,
    nationality,
    nationalityRaw: listed?.nationalityRaw ?? page?.flags.join(',') ?? null,
    position,
    positionRaw,
    heightCm,
    weightKg: listed?.weightKg ?? page?.weightKg ?? null,
    shirtNumber: listed?.shirtNumber ?? null,
    licence: null,
    stats
  };
}

/**
 * El primer entrenador puesto a mano; sin él (o sin fecha), el del acta sin
 * fecha, que el montaje descarta para que el juego se invente uno.
 */
function manualCoach(
  manual: CoachesManual,
  teamId: string,
  team: string,
  fromBox: string | null,
  warn: Warn
): SourceCoach | null {
  const entry = manual.inicio[teamId];
  if (!entry) {
    if (!fromBox) {
      warn(`${team}: sin entrenador`);
      return null;
    }
    warn(`${team}: entrenador ${fromBox} sin fecha ni nacionalidad a mano; se inventa`);
    return coachWithoutDate(`equipo-${teamId}`, fromBox);
  }
  if (fromBox && plainName(splitFirstWord(fromBox).lastName) !== plainName(entry.lastName)) {
    warn(`${team}: el acta da a ${fromBox} y a mano está ${entry.firstName} ${entry.lastName}`);
  }
  const coach = coachFromManual(entry, `equipo-${teamId}`);
  if (!coach.birthDate && coach.age === null) warn(`${team}: entrenador sin fecha`);
  if (!coach.nationality) warn(`${team}: entrenador sin nacionalidad`);
  return coach;
}

/* ------------------------------------------------------ NKL: extracción */

async function extractNkl(
  nkl: HttpClient,
  basketnews: HttpClient,
  log: Log
): Promise<SourceLeague> {
  const { warnings, warn } = warner('NKL', log);
  log('NKL 2025-26: calendario y clasificación…');
  const calendar = parseNklCalendar(
    await nkl.get(`${NKL_SITE}/matches/?type=results&season=${SEASON_START_YEAR}`, {
      accept: (body) => body.includes('"stage_id"')
    }),
    SEASON_START_YEAR
  ).filter((fixture) => fixture.stageId === NKL_STAGE);
  const standings = parseNklStandings(
    await nkl.get(`${NKL_SITE}/turnyro-lentele/?fseason=${SEASON_START_YEAR}&fstage=${NKL_STAGE}`, {
      accept: (body) => body.includes('/komandos/')
    })
  );
  if (standings.length !== Object.keys(NKL_TEAMS).length) {
    throw new Error(`La clasificación de la NKL trae ${standings.length} equipos.`);
  }
  const expectedGames = (standings.length * NKL_ROUNDS) / 2;
  if (calendar.length !== expectedGames) {
    warn(`la primera fase tiene ${calendar.length} partidos y deberían ser ${expectedGames}`);
  }

  log(`NKL: ${calendar.length} actas de basketnews…`);
  const games: (NklGame & { date: string })[] = [];
  for (const fixture of calendar) {
    const game = parseBasketnewsGame(
      await basketnews.get(`${BASKETNEWS}/rungtynes/ziureti/${fixture.gameId}-x.html`, {
        accept: (body) => body.includes('game-stats__team')
      }),
      fixture.gameId
    );
    if (!game) {
      warn(`acta ${fixture.gameId}: no se ha podido leer`);
      continue;
    }
    if (game.home.teamId !== fixture.homeId || game.away.teamId !== fixture.awayId) {
      warn(`acta ${fixture.gameId}: los equipos no son los del calendario`);
      continue;
    }
    for (const [teamId, score] of [
      [fixture.homeId, fixture.homeScore],
      [fixture.awayId, fixture.awayScore]
    ] as const) {
      const points = game.lines
        .filter((line) => line.teamId === teamId)
        .reduce((sum, line) => sum + line.points, 0);
      if (score !== null && points !== score) {
        warn(`acta ${fixture.gameId}: ${teamId} suma ${points} y el tanteo es ${score}`);
      }
    }
    games.push({ ...game, date: fixture.date });
  }

  // Totales por jugador y club.
  const totals = new Map<string, { line: NklBoxLine; stats: SourceStats }>();
  for (const line of games.flatMap((game) => game.lines)) {
    if (!playedIn(line)) continue;
    const key = `${line.playerId}|${line.teamId}`;
    const entry = totals.get(key) ?? { line, stats: emptyStats() };
    addLine(entry.stats, line);
    totals.set(key, entry);
  }

  const teams: SourceTeam[] = [];
  for (const standing of standings) {
    const info = NKL_TEAMS[standing.teamId];
    if (!info) throw new Error(`NKL: club desconocido ${standing.teamId} (${standing.name})`);
    log(`NKL ${standing.rank}. ${info.name}`);
    const teamGames = games
      .filter(
        (game) => game.home.teamId === standing.teamId || game.away.teamId === standing.teamId
      )
      .sort((a, b) => a.date.localeCompare(b.date) || Number(a.gameId) - Number(b.gameId));
    if (teamGames.length !== NKL_ROUNDS) {
      warn(`${info.name}: ${teamGames.length} actas y deberían ser ${NKL_ROUNDS}`);
    }
    const coaches: string[] = [];
    for (const game of teamGames) {
      const coach = game.home.teamId === standing.teamId ? game.home.coach : game.away.coach;
      if (coach && coaches[coaches.length - 1] !== coach) coaches.push(coach);
    }
    if (coaches.length > 1) warn(`${info.name}: entrenadores en las actas: ${coaches.join(', ')}`);

    const players: SourcePlayer[] = [];
    for (const { line, stats } of [...totals.values()].filter(
      (entry) => entry.line.teamId === standing.teamId
    )) {
      const bio = parseBasketnewsPlayer(
        await basketnews.get(`${BASKETNEWS}/zaidejai/${line.playerId}-x.html`, {
          accept: (body) => body.includes('itemprop="name"')
        })
      );
      players.push(nklPlayer(line, bio, stats, info.name, warn));
    }

    teams.push({
      sourceId: standing.teamId,
      name: info.name,
      shortName: info.shortName,
      city: info.city,
      pavilionName: info.pavilion,
      pavilionCapacity: info.capacity,
      finalPosition: standing.rank,
      players,
      coach: manualCoach(NKL_COACHES, standing.teamId, info.name, coaches[0] ?? null, warn)
    });
  }

  return {
    competitionId: 'lituania-2',
    name: 'Nacionalinė Krepšinio Lyga',
    shortName: 'NKL',
    country: 'LTU',
    seasonStartYear: SEASON_START_YEAR,
    source: `${NKL_SITE} + ${BASKETNEWS}`,
    extractedAt: new Date().toISOString(),
    teams,
    warnings,
    promoted: { into: 'lituania-1', teamIds: NKL_PROMOTED },
    excluded: NKL_EXCLUDED
  };
}

/**
 * Un jugador de la NKL. Los extranjeros vienen con el nombre legal completo
 * («Nombre Segundo Tercero Apellido»): se queda el primer nombre de pila,
 * salvo lo puesto a mano.
 */
function nklPlayer(
  line: NklBoxLine,
  bio: ReturnType<typeof parseBasketnewsPlayer>,
  stats: SourceStats,
  team: string,
  warn: Warn
): SourcePlayer {
  const fix = NKL_PLAYERS.jugadores[line.playerId];
  const nationality =
    (fix?.nationality ? toNationCode(fix.nationality) : null) ??
    (bio ? basketnewsNationality(bio) : null);
  const legalFirst = bio?.firstName || line.firstName;
  const firstName =
    fix?.firstName ?? (nationality === 'LTU' ? legalFirst : usualFirstName(legalFirst));
  const lastName = fix?.lastName ?? (bio?.lastName || line.lastName);
  const label = `${team}: ${firstName} ${lastName} (${line.playerId})`;
  if (!bio) warn(`${label}: sin ficha`);
  if (!nationality) warn(`${label}: sin nacionalidad (se pone la del club)`);
  if (!fix?.firstName && firstName !== legalFirst) {
    log(`  nombre de uso: ${team}: «${legalFirst} ${lastName}» → «${firstName} ${lastName}»`);
  }
  const heightCm = fix?.heightCm ?? bio?.heightCm ?? null;
  const positionRaw = bio?.positionRaw ?? null;
  const position = fix?.position ?? nklPosition(positionRaw);
  if (positionRaw && !position) warn(`${label}: puesto no reconocido «${positionRaw}»`);
  const rawBirth = fix?.birthDate ?? bio?.birthDate ?? null;
  const birthDate = plausibleBirthDate(rawBirth, SEASON_START_YEAR);
  if (!birthDate) warn(`${label}: sin fecha de nacimiento${rawBirth ? ` («${rawBirth}»)` : ''}`);
  return {
    sourceId: line.playerId,
    firstName,
    lastName,
    nickname: null,
    birthDate,
    age: null,
    nationality,
    nationalityRaw: bio ? [...bio.flags, ...bio.citizenships].join(',') || null : null,
    position,
    positionRaw,
    heightCm,
    weightKg: bio?.weightKg ?? null,
    shirtNumber: null,
    licence: null,
    stats
  };
}

const log: Log = (message) => console.log(message);

async function main(): Promise<void> {
  const { force } = cliOptions();
  const started = Date.now();
  const lklClient = createHttpClient({ minDelayMs: 2_000, force, log });
  const nklClient = createHttpClient({ minDelayMs: 10_000, force, log });
  const basketnewsClient = createHttpClient({ minDelayMs: 3_000, force, log });

  // Cada web con su pausa: las dos ligas se descargan a la vez.
  const [lkl, nkl] = await Promise.all([
    extractLkl(lklClient, log),
    extractNkl(nklClient, basketnewsClient, log)
  ]);
  for (const [slug, league] of [
    ['lkl', lkl],
    ['nkl', nkl]
  ] as const) {
    const file = sourceFile(slug, SEASON_START_YEAR);
    writeSourceLeague(file, league);
    log('');
    log(summarizeLeague(league));
    log(file);
  }
  const requests =
    lklClient.networkRequests + nklClient.networkRequests + basketnewsClient.networkRequests;
  log(`\n${requests} peticiones a la red, ${Math.round((Date.now() - started) / 1000)} s`);
}

await main();
