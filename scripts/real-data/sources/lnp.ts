import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT, createHttpClient, type HttpClient } from '../lib/http';
import { hiddenInputs } from '../lib/html';
import { toNationCode } from '../lib/nationalities';
import { toHeightCm, toInt, toIsoDate, toWeightKg } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type { SourceCoach, SourceLeague, SourcePlayer, SourceTeam } from '../lib/source-types';
import { birthPlaceOf } from './feb-parse';
import { nationFromLbaPlace, toLbaPosition } from './lba-parse';
import {
  parsePlayerPage,
  parseSchedule,
  parseStandings,
  parseTeamStats,
  splitArena,
  splitLnpName,
  statsHtmlFromAjax,
  toSourceStats,
  type LnpGame,
  type LnpStatsLine
} from './lnp-parse';

/**
 * Extractor de la Serie A2 italiana desde la web de la Lega Nazionale
 * Pallacanestro (legapallacanestro.com), sólo para el equipo que sube a la
 * Serie A del juego.
 *
 *   pnpm real:lnp            usa la caché de descargas
 *   pnpm real:lnp --force    lo vuelve a descargar todo
 *
 * La Serie A real 2025-26 terminó con 15 equipos (uno fue excluido a mitad de
 * temporada) y la del juego tiene 16: la plaza que falta la ocupa el campeón
 * de la A2, que es el equipo que la ocupará de verdad la temporada siguiente.
 * Se extrae la A2 entera porque los atributos salen del percentil de cada
 * jugador en su liga; sólo ese equipo entra en el juego (`guest`).
 *
 * La clasificación y el calendario salen del servicio de estadísticas de la
 * LNP en JSON. Las estadísticas por equipo son el formulario de Drupal de la
 * ficha del equipo: la página se abre en la temporada en curso y hay que
 * pedir la 2025-26 con la llamada Ajax que hace el desplegable. Un segundo
 * entre peticiones.
 */

const BASE = 'https://www.legapallacanestro.com';
const STATS = 'https://lnpstat.domino.it/getstatisticsfiles';
const SEASON_START_YEAR = 2025;
const YEAR = 'x2526';
const LEAGUE = 'ita2';

/**
 * El equipo que sube: el ganador de la final de los playoffs. La A2 2025-26
 * tuvo dos ascensos, el primero de la liga regular directo y el ganador de los
 * playoffs; el de la final es el campeón que se ha elegido para el juego. La
 * web no publica los playoffs en un formato legible, así que va a mano.
 */
const PROMOTED_TEAM_ID = '13051';

/**
 * El entrenador del inicio de temporada del equipo que sube, puesto a mano: la
 * LNP no publica los técnicos de temporadas pasadas. Por id de equipo, con el
 * nombre y la fecha y lugar de nacimiento como la FEB («11/09/1974 Ciudad»).
 * Vive en `resources/real-data/manual/lnp-entrenadores.json` (fuera de git:
 * son personas reales); sin él, el equipo se queda sin entrenador real.
 */
interface LnpCoachOverrides {
  fallbacks: Record<string, { firstName: string; lastName: string; birth: string }>;
}

const COACH_OVERRIDES_FILE = join(
  PROJECT_ROOT,
  'resources',
  'real-data',
  'manual',
  'lnp-entrenadores.json'
);

function loadCoachOverrides(): LnpCoachOverrides {
  if (!existsSync(COACH_OVERRIDES_FILE)) return { fallbacks: {} };
  const parsed = JSON.parse(
    readFileSync(COACH_OVERRIDES_FILE, 'utf8')
  ) as Partial<LnpCoachOverrides>;
  return { fallbacks: parsed.fallbacks ?? {} };
}

const { fallbacks: COACH_FALLBACKS } = loadCoachOverrides();

const log = (message: string): void => console.log(message);

const warnings: string[] = [];
function warn(message: string): void {
  warnings.push(message);
  log(`  aviso: ${message}`);
}

const isJson = (body: string): boolean => /^\s*[{[]/.test(body);

function stats(client: HttpClient, query: string): Promise<string> {
  return client.get(`${STATS}?${query}&year=${YEAR}&league=${LEAGUE}`, { accept: isJson });
}

/**
 * Las estadísticas de la A2 2025-26 de un equipo. La ficha del equipo lleva el
 * `form_build_id` del formulario, que caduca, así que si la respuesta no está
 * en caché se piden las dos seguidas.
 */
async function teamStatsHtml(client: HttpClient, teamId: string): Promise<string> {
  const ajaxUrl = `${BASE}/system/ajax`;
  const cacheKey = `lnp:${YEAR}:${LEAGUE}:squadra:${teamId}:stats-giocatori`;
  if (client.isCached(ajaxUrl, { cacheKey })) {
    return client.request(ajaxUrl, { cacheKey });
  }
  const page = await client.get(`${BASE}/squadra/wp/${teamId}`, { noCache: true });
  const form = /<form[^>]*id="lnp-stats-giocatori-squadra-form"[\s\S]*?<\/form>/i.exec(page)?.[0];
  if (!form)
    throw new Error(`La ficha del equipo ${teamId} no trae el formulario de estadísticas.`);
  const hidden = hiddenInputs(form);
  return client.request(ajaxUrl, {
    method: 'POST',
    cacheKey,
    force: true,
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, */*' },
    form: {
      competizione: `${YEAR},${LEAGUE}`,
      form_build_id: hidden.form_build_id ?? '',
      form_id: hidden.form_id ?? 'lnp_stats_giocatori_squadra_form',
      _triggering_element_name: 'competizione'
    },
    accept: (body) => isJson(body) && body.includes('tabelle-stats-giocatori-wrapper')
  });
}

async function playerFrom(
  client: HttpClient,
  line: LnpStatsLine,
  teamName: string
): Promise<SourcePlayer> {
  const page = parsePlayerPage(await client.get(`${BASE}/giocatore/wp/${line.playerId}`));
  const { firstName, lastName } = splitLnpName(line.name, page.surnameFirst);
  const label = `${teamName}: ${firstName} ${lastName}`;
  // Con doble nacionalidad («CRO/ITA», «ITA-NIG», «ITAARG») cuenta la primera,
  // que es la deportiva.
  const nationalityRaw = page.nationality;
  const nationality = toNationCode(/^[A-Za-z]{3}/.exec(nationalityRaw ?? '')?.[0]);
  const heightCm = toHeightCm(page.height);
  const position = toLbaPosition(page.role, heightCm);
  if (nationalityRaw && !nationality)
    warn(`${label}: nacionalidad no reconocida «${nationalityRaw}»`);
  if (page.role && !position) warn(`${label}: posición no reconocida «${page.role}»`);
  const birthDate = toIsoDate(page.birth);
  if (!birthDate) warn(`${label}: sin fecha de nacimiento`);
  return {
    sourceId: line.playerId,
    firstName,
    lastName,
    nickname: null,
    birthDate,
    age: null,
    nationality,
    nationalityRaw,
    position,
    positionRaw: page.role,
    heightCm,
    weightKg: toWeightKg(page.weight),
    shirtNumber: toInt(page.shirtNumber),
    licence: null,
    stats: toSourceStats(line)
  };
}

function coachFor(teamId: string, teamName: string): SourceCoach | null {
  const manual = COACH_FALLBACKS[teamId];
  if (!manual) {
    warn(`${teamName}: la LNP no publica el entrenador de 2025-26 y no hay dato a mano`);
    return null;
  }
  const place = birthPlaceOf(manual.birth);
  const nationality = nationFromLbaPlace(place);
  const label = `${teamName}: entrenador ${manual.firstName} ${manual.lastName}`;
  warn(`${label}: puesto a mano («${manual.birth}»)`);
  if (!nationality) warn(`${label}: nacionalidad no deducible de «${place ?? ''}»`);
  return {
    sourceId: `equipo-${teamId}`,
    firstName: manual.firstName,
    lastName: manual.lastName,
    birthDate: toIsoDate(manual.birth),
    age: null,
    nationality,
    nationalityRaw: place
  };
}

/** El primer partido en casa del equipo, para saber su pabellón y su ciudad. */
async function firstHomeGame(
  client: HttpClient,
  teamId: string,
  rounds: number
): Promise<LnpGame | null> {
  for (let round = 1; round <= rounds; round += 1) {
    const game = parseSchedule(await stats(client, `task=schedule&round=${round}`)).find(
      (entry) => entry.homeId === teamId && entry.arena
    );
    if (game) return game;
  }
  return null;
}

async function main(): Promise<void> {
  const { force } = cliOptions();
  const client = createHttpClient({ minDelayMs: 1_000, force, log });
  const started = Date.now();

  log('Serie A2: clasificación…');
  const standings = parseStandings(await stats(client, 'task=standings&round=ista'));
  if (standings.length === 0) throw new Error('La clasificación ha salido vacía.');
  if (!standings.some((row) => row.teamId === PROMOTED_TEAM_ID)) {
    throw new Error(`El equipo que sube (${PROMOTED_TEAM_ID}) no está en la clasificación.`);
  }
  const rounds = Math.max(...standings.map((row) => row.games ?? 0));

  const teams: SourceTeam[] = [];
  for (const standing of standings) {
    log(`${standing.position}. ${standing.name}`);
    const html = statsHtmlFromAjax(await teamStatsHtml(client, standing.teamId));
    const lines = html ? parseTeamStats(html) : [];
    if (lines.length === 0) warn(`${standing.name}: sin estadísticas de jugadores`);
    const maxGames = Math.max(0, ...lines.map((line) => line.games));
    if (standing.games !== null && maxGames > standing.games) {
      warn(`${standing.name}: un jugador con ${maxGames} partidos de ${standing.games}`);
    }
    const players: SourcePlayer[] = [];
    for (const line of lines.filter((entry) => entry.games > 0)) {
      players.push(await playerFrom(client, line, standing.name));
    }

    const promoted = standing.teamId === PROMOTED_TEAM_ID;
    const home = promoted ? await firstHomeGame(client, standing.teamId, rounds) : null;
    const arena = splitArena(home?.arena ?? null);
    if (promoted && !arena.city) warn(`${standing.name}: sin pabellón ni ciudad`);
    teams.push({
      sourceId: standing.teamId,
      name: standing.name,
      shortName: null,
      city: arena.city,
      pavilionName: arena.pavilion,
      pavilionCapacity: null,
      finalPosition: standing.position,
      players,
      coach: promoted ? coachFor(standing.teamId, standing.name) : null
    });
  }

  const league: SourceLeague = {
    competitionId: 'italia-a2',
    name: 'Serie A2',
    shortName: 'A2',
    country: 'ITA',
    seasonStartYear: SEASON_START_YEAR,
    source: BASE,
    extractedAt: new Date().toISOString(),
    teams,
    warnings,
    // Una segunda división: su escala es la de la Liga Plata ficticia, la
    // segunda categoría con la que se calibró el juego.
    guest: { into: 'italia-1', teamIds: [PROMOTED_TEAM_ID], scale: { league: 'liga-plata' } }
  };
  const file = sourceFile('lnp-a2', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(
    `\n${file}\n${client.networkRequests} peticiones a la red, ` +
      `${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
