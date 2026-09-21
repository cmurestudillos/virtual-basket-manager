import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT, createHttpClient, type HttpClient } from '../lib/http';
import { toNationCode } from '../lib/nationalities';
import { toInt, toIsoDate } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type {
  SourceCoach,
  SourceLeague,
  SourcePlayer,
  SourcePromotion,
  SourceStats,
  SourceTeam
} from '../lib/source-types';
import { birthPlaceOf } from './feb-parse';
import {
  aggregateBoxScores,
  leftBefore,
  nameKey,
  nationFromFrenchPlace,
  parseBoxScore,
  parseCompetitions,
  parseFixtures,
  parseHeadCoaches,
  parseMatchVenue,
  parsePersonDetail,
  parsePlayerTotals,
  parseRoster,
  parseStandings,
  parseToken,
  regularSeasonOf,
  toLnbPosition,
  widgetState,
  type LnbPersonDetail,
  type LnbPlayerStats,
  type LnbRosterPlayer,
  type LnbStaffCoach,
  type LnbStanding,
  type SrBoxLine,
  type SrFixture,
  type SrPlayerTotals
} from './lnb-parse';

/**
 * Extractor de la liga francesa (LNB): Betclic ÉLITE y ÉLITE 2.
 *
 *   pnpm real:lnb            usa la caché de descargas
 *   pnpm real:lnb --force    lo vuelve a descargar todo
 *
 * Deja dos ficheros: `lnb-elite-2025.json` (Pro A del juego) y
 * `lnb-elite2-2025.json` (Pro B). La ÉLITE 2025-26 tuvo 16 equipos y la Pro A
 * del juego tiene 18: las dos plazas que faltan son para los dos que suben de
 * la ÉLITE 2 (`promoted`), que a su vez tuvo 20 y así se queda en 18.
 *
 * - La API de lnb.fr (`api-prod.lnb.fr`) da la clasificación, las plantillas,
 *   las fichas y el cuerpo técnico. Pide un token que la propia web reparte
 *   (`lnb.fr/api/token`) y que caduca a los quince minutos: se renueva solo
 *   y no forma parte de la clave de la caché.
 * - Las estadísticas se suman de las actas de Sportradar, el proveedor del
 *   «match center» de la LNB: la API de la LNB sólo da los totales de los
 *   jugadores con partidos suficientes. Es lenta (dos o tres segundos por
 *   acta, 620 actas): la primera vez tarda una media hora.
 */

const LNB_SITE = 'https://lnb.fr';
const LNB_API = 'https://api-prod.lnb.fr';
const SPORTRADAR = 'https://embed-api.eui.connect.sportradar.com/v1/embed/12';
const SEASON_START_YEAR = 2025;
/** Los tokens duran quince minutos; se piden de nuevo a los doce. */
const TOKEN_LIFETIME_MS = 12 * 60 * 1000;

interface LeagueSpec {
  slug: string;
  /** Abreviatura de la LNB. */
  abbrev: string;
  competitionId: string;
  name: string;
  shortName: string;
  /** Los que suben: ids de equipo de la LNB en la 2025-26, en su orden de entrada. */
  promoted?: { into: string; teamIds: string[] };
}

/**
 * Los dos que suben de la ÉLITE 2 2025-26: Roanne, primero de la liga regular
 * (ascenso directo), y Pau-Lacq-Orthez, ganador de la final de los playoffs
 * de ascenso. Entran por ese orden detrás de los 16 de la ÉLITE. Van fijos,
 * como el de la A2 italiana: el cuadro de los playoffs no se lee aquí.
 */
const ELITE2_PROMOTED = ['1813', '1810'];

const LEAGUES: LeagueSpec[] = [
  {
    slug: 'lnb-elite',
    abbrev: 'PROA',
    competitionId: 'francia-1',
    name: 'Betclic ÉLITE',
    shortName: 'ÉLITE'
  },
  {
    slug: 'lnb-elite2',
    abbrev: 'PROB',
    competitionId: 'francia-2',
    name: 'ÉLITE 2',
    shortName: 'ÉLITE 2',
    promoted: { into: 'francia-1', teamIds: ELITE2_PROMOTED }
  }
];

/**
 * Lo que se pone a mano, en `resources/real-data/manual/lnb-entrenadores.json`
 * (fuera de git: son personas reales):
 *
 * - `fallbacks`: la fecha y el lugar de nacimiento de los entrenadores, que la
 *   LNB no da nunca, por id de persona de la LNB y con el formato de la FEB
 *   («dd/mm/aaaa Ciudad (País)»; una ciudad sin país es francesa). Sin fecha
 *   exacta, la edad (`age`) y el lugar (`place`).
 * - `inicio`: el entrenador que empezó la liga, por id de equipo de la LNB,
 *   cuando el cuerpo técnico de la LNB se equivoca (sustitutos que no están,
 *   fechas cambiadas). Con `despues`, quién le sustituyó, para el aviso.
 */
interface ManualBirth {
  /** «dd/mm/aaaa Ciudad (País)», como la FEB. */
  birth?: string;
  /** Sin fecha exacta: la edad el día de la extracción (se aplica la regla del 1 de julio). */
  age?: number;
  /** Sin fecha exacta: el lugar de nacimiento, para la nacionalidad. */
  place?: string;
  /** Quién le sustituyó durante la temporada, si la LNB no lo dice: sólo para el aviso. */
  despues?: string;
}

interface LnbCoachOverrides {
  fallbacks: Record<string, ManualBirth>;
  inicio: Record<string, ManualBirth & { personId?: string; firstName: string; lastName: string }>;
}

/**
 * Los pabellones, en `resources/real-data/manual/lnb-pabellones.json` (fuera
 * de git como todo el dataset real): la LNB da el nombre del pabellón en cada
 * acta pero no el aforo. Por nombre de equipo de la LNB («Paris»), con el
 * aforo y, si hace falta corregirlo, el nombre.
 */
interface LnbPavilions {
  clubs: Record<string, { capacity?: number; pavilion?: string; city?: string }>;
}

const MANUAL_DIR = join(PROJECT_ROOT, 'resources', 'real-data', 'manual');

function loadJson<T>(file: string, empty: T): T {
  const path = join(MANUAL_DIR, file);
  if (!existsSync(path)) return empty;
  return { ...empty, ...(JSON.parse(readFileSync(path, 'utf8')) as Partial<T>) };
}

const COACHES = loadJson<LnbCoachOverrides>('lnb-entrenadores.json', {
  fallbacks: {},
  inicio: {}
});
const PAVILIONS = loadJson<LnbPavilions>('lnb-pabellones.json', { clubs: {} });

/**
 * El nombre completo de cada club, por el nombre corto con el que lo da la
 * LNB («Paris» → «Paris Basketball»): la API no tiene otro. Es el nombre del
 * club, como en España e Italia; el de la LNB se sigue usando para cruzar
 * datos (pabellones). Uno que falte se queda con el de la LNB y se avisa.
 */
const CLUB_NAMES: Record<string, string> = {
  // Betclic ÉLITE
  Paris: 'Paris Basketball',
  Monaco: 'AS Monaco',
  Nanterre: 'Nanterre 92',
  'Lyon-Villeurbanne': 'LDLC ASVEL',
  Cholet: 'Cholet Basket',
  'Le Mans': 'Le Mans Sarthe Basket',
  'Bourg-en-Bresse': 'JL Bourg',
  Strasbourg: 'SIG Strasbourg',
  'Chalon/Saône': 'Élan Chalon',
  Nancy: 'SLUC Nancy',
  Dijon: 'JDA Dijon',
  Boulazac: 'Boulazac Basket Dordogne',
  Limoges: 'Limoges CSP',
  'Gravelines-Dunkerque': 'BCM Gravelines-Dunkerque',
  'Saint-Quentin': 'Saint-Quentin Basket-Ball',
  'Le Portel': 'ESSM Le Portel',
  // ÉLITE 2
  Roanne: 'Chorale Roanne Basket',
  'Pau-Lacq-Orthez': 'Élan Béarnais Pau-Lacq-Orthez',
  Blois: 'ADA Blois Basket 41',
  Orléans: 'Orléans Loiret Basket',
  Poitiers: 'Poitiers Basket 86',
  Vichy: 'JA Vichy',
  Nantes: 'Nantes Basket Hermine',
  'La Rochelle': 'Stade Rochelais Basket',
  Denain: 'ASC Denain Voltaire',
  'Châlons-Reims': 'Champagne Basket',
  'Gries-Souffel': 'Alliance Sport Alsace',
  'Hyères-Toulon': 'Hyères-Toulon Var Basket',
  Rouen: 'Rouen Métropole Basket',
  'Aix-Maurienne': 'Aix Maurienne Savoie Basket',
  Antibes: "Sharks d'Antibes",
  'Saint-Chamond-Andrezieux': 'Saint-Chamond Andrézieux-Bouthéon',
  Caen: 'Caen Basket Calvados',
  Evreux: 'ALM Évreux Basket',
  Quimper: 'Béliers de Kemper',
  Challans: 'Vendée Challans Basket'
};

function clubName(standing: LnbStanding, warn: (message: string) => void): string {
  const name = CLUB_NAMES[standing.name];
  if (!name) warn(`${standing.name}: sin nombre completo en CLUB_NAMES (se usa el de la LNB)`);
  return name ?? standing.name;
}

const log = (message: string): void => console.log(message);

const isJson = (body: string): boolean => /^\s*[{[]/.test(body);
/** La API de la LNB responde 200 con `{"status":false}` o `{"code":400}` cuando algo va mal. */
const isLnbOk = (body: string): boolean =>
  isJson(body) && !/^\s*\{\s*"code"\s*:\s*4\d\d/.test(body) && !/"status"\s*:\s*false/.test(body);

class LnbApi {
  private token: string | null = null;
  private tokenAt = 0;

  constructor(private readonly client: HttpClient) {}

  private async freshToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() - this.tokenAt < TOKEN_LIFETIME_MS) return this.token;
    const token = parseToken(
      await this.client.get(`${LNB_SITE}/api/token`, { noCache: true, accept: isJson })
    );
    if (!token) throw new Error('lnb.fr no ha dado el token de su API.');
    this.token = token;
    this.tokenAt = Date.now();
    return token;
  }

  private async call(path: string, json?: unknown): Promise<string> {
    const url = `${LNB_API}/${path}`;
    // Con caché no hace falta token: sólo se pide si hay que ir a la red.
    const options = { method: json === undefined ? 'GET' : 'POST', json } as const;
    if (this.client.isCached(url, options)) return this.client.request(url, options);
    for (let attempt = 0; ; attempt += 1) {
      const token = await this.freshToken(attempt > 0);
      try {
        return await this.client.request(url, {
          ...options,
          headers: {
            Accept: 'application/json, text/plain, */*',
            Authorization: `Bearer ${token}`,
            device_type: 'web',
            language_code: 'fr',
            Origin: LNB_SITE,
            Referer: `${LNB_SITE}/`
          },
          accept: isLnbOk
        });
      } catch (error) {
        // Token caducado: uno nuevo y otra vez, una sola.
        if (attempt === 0 && /HTTP 401/.test((error as Error).message)) continue;
        throw error;
      }
    }
  }

  get(path: string): Promise<string> {
    return this.call(path);
  }

  post(path: string, body: unknown): Promise<string> {
    return this.call(path, body);
  }
}

function sportradar(client: HttpClient, path: string): Promise<string> {
  return client.get(`${SPORTRADAR}/${path}`, {
    headers: { Accept: 'application/json', Origin: LNB_SITE, Referer: `${LNB_SITE}/` },
    accept: isJson
  });
}

interface Extraction {
  league: SourceLeague;
  /** Para los avisos de la clasificación. */
  standings: LnbStanding[];
}

/** «Nombre Apellido Largo» → «Nombre» y «Apellido Largo», para quien sólo sale en las actas. */
function splitBoxName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: '', lastName: name.trim() };
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

async function extractLeague(
  api: LnbApi,
  sr: HttpClient,
  spec: LeagueSpec,
  competitions: ReturnType<typeof parseCompetitions>
): Promise<Extraction> {
  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(message);
    log(`  aviso: ${message}`);
  };

  const competition = regularSeasonOf(competitions, spec.abbrev);
  if (!competition?.seasonId) throw new Error(`No está la liga regular ${spec.abbrev}.`);
  log(`\n${spec.name} (competición ${competition.externalId}): clasificación…`);
  const rounds = Array.from({ length: 50 }, (_, index) => index + 1).join(',');
  const standings = parseStandings(
    await api.post('altrstats/getStandingByCompetition', {
      competition_external_id: Number(competition.externalId),
      competition_filter_name: 'GENERAL',
      round_numbers: rounds
    })
  );
  if (standings.length === 0) throw new Error(`${spec.name}: la clasificación ha salido vacía.`);
  for (const row of standings) {
    if (row.penalty > 0) {
      warn(
        `${row.name}: ${row.penalty} victoria(s) quitada(s) por sanción` +
          (row.penaltyNote ? ` («${row.penaltyNote}»)` : '') +
          `; la clasificación oficial ya la descuenta`
      );
    }
  }
  if (spec.promoted) {
    for (const teamId of spec.promoted.teamIds) {
      if (!standings.some((row) => row.teamId === teamId)) {
        throw new Error(
          `${spec.name}: el equipo que sube (${teamId}) no está en la clasificación.`
        );
      }
    }
  }

  // Las actas de Sportradar de toda la liga regular.
  const state = widgetState(competition.seasonId);
  const fixtures = parseFixtures(await sportradar(sr, `fixtures?state=${state}`));
  const expected = standings.length * (standings.length - 1);
  if (fixtures.length !== expected) {
    warn(`el calendario trae ${fixtures.length} partidos y deberían ser ${expected}`);
  }
  log(`  ${fixtures.length} actas (la primera vez tarda: Sportradar es lento)…`);
  const lines: SrBoxLine[] = [];
  let done = 0;
  for (const fixture of fixtures) {
    const box = parseBoxScore(
      await sportradar(sr, `fixture_detail?fixtureId=${fixture.fixtureId}`)
    );
    checkBoxScore(fixture, box, warn);
    lines.push(...box);
    done += 1;
    if (done % 50 === 0) log(`  … ${done}/${fixtures.length}`);
  }
  const statsByTeam = new Map<string, LnbPlayerStats[]>();
  for (const entry of aggregateBoxScores(lines)) {
    const bucket = statsByTeam.get(entry.teamId) ?? [];
    bucket.push(entry);
    statsByTeam.set(entry.teamId, bucket);
  }
  const totals = parsePlayerTotals(await sportradar(sr, `statistics_persons?state=${state}`));
  const lastGame = fixtures.reduce((last, fixture) => {
    const day = fixture.start?.slice(0, 10) ?? '';
    return day > last ? day : last;
  }, '');

  const teams: SourceTeam[] = [];
  for (const standing of standings) {
    log(`${standing.rank}. ${standing.name}`);
    const teamStats = standing.teamUuid ? (statsByTeam.get(standing.teamUuid) ?? []) : [];
    const games = fixtures.filter(
      (fixture) => fixture.homeId === standing.teamUuid || fixture.awayId === standing.teamUuid
    ).length;
    if (standing.games !== null && games !== standing.games) {
      warn(`${standing.name}: la clasificación da ${standing.games} partidos y hay ${games} actas`);
    }
    const maxGames = Math.max(0, ...teamStats.map((entry) => entry.stats.games));
    if (maxGames > games) warn(`${standing.name}: un jugador con ${maxGames} partidos de ${games}`);

    const roster = parseRoster(
      await api.get(`teams/getRoster?team_external_id=${standing.teamId}`)
    );
    const details = new Map<string, LnbPersonDetail | null>();
    for (const player of roster) {
      details.set(
        player.personId,
        parsePersonDetail(
          await api.post('person/getPersonDetail', {
            team_external_id: Number(standing.teamId),
            person_external_id: Number(player.personId)
          })
        )
      );
    }
    const players = playersOf(standing, roster, details, teamStats, totals, lastGame, warn);

    const heads = parseHeadCoaches(
      await api.post('altrstats/getCoachingStaff', { teamExternalId: Number(standing.teamId) })
    );
    const coach = coachOf(standing, heads, warn);

    const venue = await venueOf(api, standing, fixtures);
    const manual = PAVILIONS.clubs[standing.name];
    const city = manual?.city ?? venue.city;
    const pavilionName = manual?.pavilion ?? venue.pavilion;
    const pavilionCapacity = manual?.capacity ?? null;
    if (!city) warn(`${standing.name}: ciudad desconocida (se usa el nombre del equipo)`);
    if (!pavilionName) warn(`${standing.name}: sin pabellón`);
    if (pavilionCapacity === null) {
      warn(`${standing.name}: sin aforo en lnb-pabellones.json (el montaje lo estima)`);
    }

    teams.push({
      sourceId: standing.teamId,
      name: clubName(standing, warn),
      shortName: standing.code,
      city: city ?? standing.name,
      pavilionName,
      pavilionCapacity,
      finalPosition: standing.rank,
      players,
      coach
    });
  }

  const promoted: SourcePromotion | undefined = spec.promoted
    ? { into: spec.promoted.into, teamIds: [...spec.promoted.teamIds] }
    : undefined;
  const league: SourceLeague = {
    competitionId: spec.competitionId,
    name: spec.name,
    shortName: spec.shortName,
    country: 'FRA',
    seasonStartYear: SEASON_START_YEAR,
    source: LNB_SITE,
    extractedAt: new Date().toISOString(),
    teams,
    warnings,
    ...(promoted ? { promoted } : {})
  };
  return { league, standings };
}

/**
 * Un acta que no cuadra con el tanteo: se avisa y se usa igual. Un partido
 * dado por ganado sale 0-0 en el calendario y su acta es la del partido que
 * se jugó: sus estadísticas cuentan (decidido así), la clasificación es la
 * oficial.
 */
function checkBoxScore(
  fixture: SrFixture,
  box: readonly SrBoxLine[],
  warn: (message: string) => void
): void {
  const label = `${fixture.start?.slice(0, 10) ?? '?'} ${fixture.homeName}-${fixture.awayName}`;
  if (box.length === 0) {
    warn(`${label}: acta vacía`);
    return;
  }
  for (const [teamId, score, name] of [
    [fixture.homeId, fixture.homeScore, fixture.homeName],
    [fixture.awayId, fixture.awayScore, fixture.awayName]
  ] as const) {
    const lines = box.filter((line) => line.teamId === teamId);
    const points = lines.reduce((sum, line) => sum + line.points, 0);
    const starters = lines.filter((line) => line.starter).length;
    if (fixture.homeScore === 0 && fixture.awayScore === 0) {
      if (teamId === fixture.homeId) {
        warn(
          `${label}: el tanteo oficial es 0-0 (dado por ganado); cuentan las estadísticas del acta`
        );
      }
      continue;
    }
    if (score !== null && points !== score) {
      warn(`${label}: ${name} suma ${points} puntos en el acta y ${score} en el tanteo`);
    }
    if (starters !== 5) warn(`${label}: ${name} sale con ${starters} titulares en el acta`);
  }
}

function playersOf(
  standing: LnbStanding,
  roster: readonly LnbRosterPlayer[],
  details: ReadonlyMap<string, LnbPersonDetail | null>,
  teamStats: readonly LnbPlayerStats[],
  totals: readonly SrPlayerTotals[],
  lastGame: string,
  warn: (message: string) => void
): SourcePlayer[] {
  const statsByName = new Map<string, LnbPlayerStats>();
  for (const entry of teamStats) statsByName.set(nameKey(entry.name), entry);
  const used = new Set<LnbPlayerStats>();
  const players: SourcePlayer[] = [];

  const withExtras = (entry: LnbPlayerStats): SourceStats => {
    const extra = totals.find(
      (row) => row.personId === entry.personId && row.teamName === standing.name
    );
    return { ...entry.stats, dunks: extra?.dunks ?? null, foulsDrawn: extra?.foulsDrawn ?? null };
  };

  for (const player of roster) {
    const detail = details.get(player.personId) ?? null;
    const entry = statsByName.get(nameKey(`${player.firstName} ${player.lastName}`));
    if (entry) used.add(entry);
    // Quien se fue a mitad sin jugar ni un partido no cuenta.
    if (!entry && leftBefore(detail, lastGame)) continue;
    const label = `${standing.name}: ${player.firstName} ${player.lastName}`;
    const nationalityRaw = detail?.nationality ?? player.nationality;
    const nationality = toNationCode(nationalityRaw);
    if (nationalityRaw && !nationality) {
      warn(`${label}: nacionalidad no reconocida «${nationalityRaw}»`);
    }
    const positionRaw = detail?.position ?? player.position;
    const position = toLnbPosition(positionRaw, detail?.heightCm ?? player.heightCm);
    if (positionRaw && !position) warn(`${label}: posición no reconocida «${positionRaw}»`);
    players.push({
      sourceId: player.personId,
      firstName: player.firstName,
      lastName: player.lastName,
      nickname: null,
      birthDate: detail?.birthDate ?? player.birthDate,
      age: null,
      nationality,
      nationalityRaw,
      position,
      positionRaw,
      heightCm: detail?.heightCm ?? player.heightCm,
      weightKg: detail?.weightKg ?? null,
      shirtNumber: toInt(detail?.shirtNumber ?? player.shirtNumber),
      // La LNB no publica el cupo (JFL).
      licence: null,
      stats: entry ? withExtras(entry) : null
    });
  }

  // Quien jugó y no está en la plantilla (canteranos de un par de partidos).
  for (const entry of teamStats) {
    if (used.has(entry)) continue;
    const { firstName, lastName } = splitBoxName(entry.name);
    warn(
      `${standing.name}: ${entry.name} jugó ${entry.stats.games} partidos y no está en la plantilla (sin ficha)`
    );
    players.push({
      sourceId: entry.personId,
      firstName,
      lastName,
      nickname: null,
      birthDate: null,
      age: null,
      nationality: null,
      nationalityRaw: null,
      position: null,
      positionRaw: null,
      heightCm: null,
      weightKg: null,
      shirtNumber: null,
      licence: null,
      stats: withExtras(entry)
    });
  }
  return players;
}

/**
 * El entrenador que empezó la liga: el primer `HEAD_COACH` por fecha del
 * cuerpo técnico de la LNB, salvo que el fichero a mano diga otro. Su fecha y
 * lugar de nacimiento, siempre del fichero a mano (la LNB no los da).
 */
function coachOf(
  standing: LnbStanding,
  heads: readonly LnbStaffCoach[],
  warn: (message: string) => void
): SourceCoach | null {
  const manualStart = COACHES.inicio[standing.teamId];
  const first = heads[0];
  if (heads.length > 1) {
    warn(
      `${standing.name}: la LNB da ${heads.length} primeros entrenadores: ` +
        heads
          .map((head) => `${head.firstName} ${head.lastName} (${head.fromDate}–${head.toDate})`)
          .join(', ')
    );
  }
  let start: { personId: string | null; firstName: string; lastName: string };
  if (manualStart) {
    start = {
      personId: manualStart.personId ?? null,
      firstName: manualStart.firstName,
      lastName: manualStart.lastName
    };
    warn(
      `${standing.name}: empezó ${start.firstName} ${start.lastName} (puesto a mano` +
        (first ? `; la LNB da primero a ${first.firstName} ${first.lastName}` : '') +
        ')' +
        (manualStart.despues ? `; después, ${manualStart.despues}` : '')
    );
  } else if (first) {
    start = { personId: first.personId, firstName: first.firstName, lastName: first.lastName };
  } else {
    warn(`${standing.name}: la LNB no da entrenador y no hay dato a mano`);
    return null;
  }

  const label = `${standing.name}: entrenador ${start.firstName} ${start.lastName}`;
  const manual: ManualBirth | undefined =
    manualStart ?? (start.personId ? COACHES.fallbacks[start.personId] : undefined);
  if (!manualStart && manual?.despues && heads.length < 2) {
    warn(`${label}: empezó la temporada; después, ${manual.despues} (según el fichero a mano)`);
  }
  const birth = manual?.birth ?? null;
  const age = birth ? null : (manual?.age ?? null);
  if (!birth && age === null) {
    warn(
      `${label}: sin fecha de nacimiento ni nacionalidad (la LNB no las da y no hay dato a mano)`
    );
  } else if (!birth) {
    warn(`${label}: sin fecha exacta; edad ${age} puesta a mano (nacimiento el 1 de julio)`);
  }
  const place = birthPlaceOf(birth) ?? manual?.place ?? null;
  const nationality = nationFromFrenchPlace(place) ?? (manual ? 'FRA' : null);
  if (manual && !nationFromFrenchPlace(place)) {
    warn(`${label}: sin lugar de nacimiento a mano; nacionalidad francesa por defecto`);
  }
  return {
    sourceId: start.personId ?? `equipo-${standing.teamId}`,
    firstName: start.firstName,
    lastName: start.lastName,
    birthDate: toIsoDate(birth),
    age,
    nationality,
    nationalityRaw: place
  };
}

/**
 * El pabellón donde el equipo jugó más partidos en casa y su ciudad, que la
 * LNB escribe en el partido como «Adidas Arena (Paris)».
 */
async function venueOf(
  api: LnbApi,
  standing: LnbStanding,
  fixtures: readonly SrFixture[]
): Promise<{ pavilion: string | null; city: string | null }> {
  const home = fixtures.filter((fixture) => fixture.homeId === standing.teamUuid);
  const counts = new Map<string, SrFixture[]>();
  for (const fixture of home) {
    const venue = fixture.venue ?? '';
    counts.set(venue, [...(counts.get(venue) ?? []), fixture]);
  }
  const [, mostUsed] = [...counts].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  const sample = mostUsed?.[0];
  if (!sample) return { pavilion: null, city: null };
  const fromLnb = parseMatchVenue(await api.get(`match/getMatchDetails/${sample.fixtureId}`));
  return { pavilion: fromLnb.pavilion ?? sample.venue, city: fromLnb.city };
}

async function main(): Promise<void> {
  const { force } = cliOptions();
  const lnbClient = createHttpClient({ minDelayMs: 300, force, log });
  const srClient = createHttpClient({ minDelayMs: 300, force, log, timeoutMs: 120_000 });
  const api = new LnbApi(lnbClient);
  const started = Date.now();

  const competitions = parseCompetitions(
    await api.get(`competition/getDivisionCompetitionByYear?year=${SEASON_START_YEAR}`)
  );
  for (const spec of LEAGUES) {
    const { league } = await extractLeague(api, srClient, spec, competitions);
    const file = sourceFile(spec.slug, SEASON_START_YEAR);
    writeSourceLeague(file, league);
    log('');
    log(summarizeLeague(league));
    log(file);
  }
  log(
    `\n${lnbClient.networkRequests + srClient.networkRequests} peticiones a la red, ` +
      `${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
