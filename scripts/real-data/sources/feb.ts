import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT, createHttpClient, type HttpClient } from '../lib/http';
import { formAction, hiddenInputs } from '../lib/html';
import { nationFromBirthPlace, toNationCode } from '../lib/nationalities';
import {
  splitCommaName,
  splitFullName,
  toHeightCm,
  toInt,
  toIsoDate,
  toPosition,
  toTitleCase,
  toWeightKg,
  usualFirstName,
  type PersonName
} from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type { SourceCoach, SourceLeague, SourcePlayer, SourceTeam } from '../lib/source-types';
import {
  birthPlaceOf,
  cityFromAddress,
  parseAccumulatedStats,
  parseCalendarTeams,
  parsePlayerPage,
  parseStandings,
  parseTeamPage,
  selectOptions,
  toSourceStats,
  type FebCoachBox,
  type FebPlayerPage,
  type FebPlayerStats,
  type FebRosterRow
} from './feb-parse';

/**
 * Extractor de la Primera FEB desde baloncestoenvivo.feb.es.
 *
 *   pnpm real:feb            usa la caché de descargas
 *   pnpm real:feb --force    lo vuelve a descargar todo
 *
 * La web es ASP.NET WebForms de las de antes: la plantilla y la clasificación
 * de la liga regular sólo salen haciendo el «postback» que haría el navegador
 * al pulsar el enlace o cambiar el desplegable. El servidor va justo, así que
 * entre peticiones hay dos segundos.
 */

const BASE = 'https://baloncestoenvivo.feb.es';
const SEASON_START_YEAR = 2025;
const CALENDAR_URL = `${BASE}/calendario.aspx?g=1&t=${SEASON_START_YEAR}&nm=primerafeb`;
const RESULTS_URL = `${BASE}/resultados.aspx?g=1&t=${SEASON_START_YEAR}&nm=primerafeb`;
const STATS_EVENT_TARGET = '_ctl0$MainContentPlaceHolderMaster$estadAcumLinkButton';
const SELECT_PREFIX = '_ctl0:MainContentPlaceHolderMaster:';
const REGULAR_SEASON = 'LR';

/**
 * Lo que la FEB no deja leer bien de un entrenador, completado a mano: el
 * entrenador de los equipos cuya ficha tiene el recuadro vacío (por id de
 * equipo, con el mismo formato que la FEB; si la FEB lo publica, manda la FEB)
 * y los nombres legales que no se pueden partir a ojo, ya partidos.
 *
 * Vive en `resources/real-data/manual/feb-entrenadores.json` y no aquí: son
 * datos de personas reales (nombre legal, fecha y lugar de nacimiento) y este
 * repositorio es público. Sin el fichero, esos equipos se quedan sin
 * entrenador y se avisa.
 */
interface FebCoachOverrides {
  fallbacks: Record<string, FebCoachBox>;
  names: Record<string, PersonName>;
}

const COACH_OVERRIDES_FILE = join(
  PROJECT_ROOT,
  'resources',
  'real-data',
  'manual',
  'feb-entrenadores.json'
);

function loadCoachOverrides(): FebCoachOverrides {
  if (!existsSync(COACH_OVERRIDES_FILE)) {
    return { fallbacks: {}, names: {} };
  }
  const parsed = JSON.parse(
    readFileSync(COACH_OVERRIDES_FILE, 'utf8')
  ) as Partial<FebCoachOverrides>;
  return { fallbacks: parsed.fallbacks ?? {}, names: parsed.names ?? {} };
}

const { fallbacks: COACH_FALLBACKS, names: COACH_NAMES } = loadCoachOverrides();

const log = (message: string): void => console.log(message);

const warnings: string[] = [];
function warn(message: string): void {
  warnings.push(message);
  log(`  aviso: ${message}`);
}

/** «MULTIUSOS FONTES DO SAR» → «Multiusos Fontes do Sar»; lo que ya viene en minúsculas se deja. */
function tidy(text: string | null): string | null {
  if (!text) return null;
  return text === text.toUpperCase() ? toTitleCase(text) : text;
}

/**
 * La clasificación de la liga regular tras su última jornada. La página de
 * resultados abre en la última fase jugada (la final de los playoffs), así que
 * hay que cambiar el desplegable de fase a la liga regular y, si no queda en la
 * última jornada, también el de jornada.
 */
async function regularSeasonStandings(client: HttpClient): Promise<string> {
  const cacheKey = `feb:${SEASON_START_YEAR}:primerafeb:clasificacion-liga-regular`;
  const hasStandings = (html: string) => /_clasificacionDataGrid"/.test(html);
  if (client.isCached(RESULTS_URL, { cacheKey })) return client.request(RESULTS_URL, { cacheKey });

  const page = await client.get(RESULTS_URL, { noCache: true });
  const group = selectOptions(page, 'gruposDropDownList').find((option) =>
    /liga regular/i.test(option.label)
  );
  if (!group) throw new Error('La página de resultados no tiene la fase «Liga Regular».');
  let html = await client.request(formAction(page, RESULTS_URL), {
    method: 'POST',
    noCache: true,
    headers: { Referer: RESULTS_URL },
    form: {
      ...hiddenInputs(page),
      __EVENTTARGET: '_ctl0$MainContentPlaceHolderMaster$gruposDropDownList',
      __EVENTARGUMENT: '',
      [`${SELECT_PREFIX}temporadasDropDownList`]: String(SEASON_START_YEAR),
      [`${SELECT_PREFIX}gruposDropDownList`]: group.value
    }
  });
  const rounds = selectOptions(html, 'jornadasDropDownList');
  const last = rounds.at(-1);
  if (last && !last.selected) {
    html = await client.request(formAction(html, RESULTS_URL), {
      method: 'POST',
      noCache: true,
      headers: { Referer: RESULTS_URL },
      form: {
        ...hiddenInputs(html),
        __EVENTTARGET: '_ctl0$MainContentPlaceHolderMaster$jornadasDropDownList',
        __EVENTARGUMENT: '',
        [`${SELECT_PREFIX}temporadasDropDownList`]: String(SEASON_START_YEAR),
        [`${SELECT_PREFIX}gruposDropDownList`]: group.value,
        [`${SELECT_PREFIX}jornadasDropDownList`]: last.value
      }
    });
  }
  if (!hasStandings(html)) throw new Error('El postback no ha devuelto la clasificación.');
  // Se guarda con su clave a mano: el postback no se puede repetir por URL.
  client.store(RESULTS_URL, { cacheKey }, html);
  return html;
}

/**
 * La ficha del equipo y sus estadísticas acumuladas. El enlace de las
 * estadísticas es un postback que necesita el `__VIEWSTATE` de una visita
 * reciente a la ficha, así que si falta alguna de las dos se piden juntas.
 */
async function teamPages(
  client: HttpClient,
  teamId: string
): Promise<{ team: string; stats: string }> {
  const url = `${BASE}/Equipo.aspx?i=${teamId}`;
  const statsKey = `feb:equipo:${teamId}:estadisticas-acumuladas`;
  if (client.isCached(url) && client.isCached(url, { cacheKey: statsKey })) {
    return {
      team: await client.get(url),
      stats: await client.request(url, { cacheKey: statsKey })
    };
  }
  const team = await client.get(url, { force: true });
  const stats = await client.request(formAction(team, url), {
    method: 'POST',
    cacheKey: statsKey,
    force: true,
    headers: { Referer: url },
    form: { ...hiddenInputs(team), __EVENTTARGET: STATS_EVENT_TARGET, __EVENTARGUMENT: '' },
    accept: (html) => /<th[^>]*class="fase"/i.test(html)
  });
  return { team, stats };
}

function playerFrom(
  playerId: string,
  roster: FebRosterRow | undefined,
  stats: FebPlayerStats | undefined,
  page: FebPlayerPage | undefined,
  teamName: string
): SourcePlayer {
  const nationalityRaw = roster?.nationality ?? page?.nationality ?? null;
  const nationality = toNationCode(nationalityRaw);
  const positionRaw = roster?.position ?? page?.position ?? null;
  const position = toPosition(positionRaw);

  // La tabla de estadísticas y la ficha escriben «APELLIDOS, NOMBRE»; la
  // plantilla, el nombre legal seguido, sin marcar el corte. Sólo si no hay
  // otra cosa se adivina el corte.
  let name: PersonName | null =
    splitCommaName(stats?.commaName ?? '') ?? splitCommaName(page?.commaName ?? '');
  if (!name) {
    const full = roster?.fullName ?? page?.commaName ?? '';
    name = splitFullName(full, { spanish: nationality === 'ESP' });
    warn(`${teamName}: nombre de «${full}» partido a ojo (${name.firstName} | ${name.lastName})`);
  }

  if (nationalityRaw && !nationality) {
    warn(`${teamName}: nacionalidad no reconocida «${nationalityRaw}» (${name.lastName})`);
  }
  if (positionRaw && !position) {
    warn(`${teamName}: posición no reconocida «${positionRaw}» (${name.lastName})`);
  }
  const regular = stats?.phases.get(REGULAR_SEASON);
  return {
    sourceId: playerId,
    // La FEB da el nombre legal entero; en el juego va el de uso.
    firstName: usualFirstName(name.firstName),
    lastName: name.lastName,
    nickname: null,
    birthDate: toIsoDate(roster?.birth ?? page?.birth),
    age: null,
    nationality,
    nationalityRaw,
    position,
    positionRaw,
    heightCm: toHeightCm(roster?.height ?? page?.height),
    weightKg: toWeightKg(roster?.weight ?? page?.weight),
    shirtNumber: toInt(roster?.shirtNumber ?? page?.shirtNumber ?? null),
    licence: roster?.homegrown ?? null,
    stats: regular ? toSourceStats(regular) : null
  };
}

/**
 * El entrenador de la ficha del equipo. La FEB da el nombre legal en
 * mayúsculas y sin marcar el corte (como la plantilla) y la fecha con el lugar
 * de nacimiento a veces; la nacionalidad no la da y se deduce del lugar.
 */
function coachFrom(box: FebCoachBox | null, teamId: string, teamName: string): SourceCoach | null {
  let coach = box;
  if (!coach) {
    coach = COACH_FALLBACKS[teamId] ?? null;
    if (!coach) {
      warn(`${teamName}: la ficha no trae entrenador`);
      return null;
    }
    warn(`${teamName}: la ficha no trae entrenador; se pone a mano ${coach.fullName}`);
  }
  const place = birthPlaceOf(coach.birth);
  const nationality = nationFromBirthPlace(place);
  const name =
    COACH_NAMES[coach.fullName] ??
    splitFullName(coach.fullName, { spanish: nationality === null || nationality === 'ESP' });
  const label = `${teamName}: entrenador ${usualFirstName(name.firstName)} ${name.lastName}`;
  if (!nationality) {
    warn(
      place
        ? `${label}: nacionalidad no deducible de «${place}» (se pone la del club)`
        : `${label}: sin lugar de nacimiento, nacionalidad desconocida (se pone la del club)`
    );
  }
  const birthDate = toIsoDate(coach.birth);
  if (!birthDate) warn(`${label}: sin fecha de nacimiento`);
  return {
    sourceId: coach.personId ?? `equipo-${teamId}`,
    firstName: usualFirstName(name.firstName),
    lastName: name.lastName,
    birthDate,
    age: null,
    nationality,
    nationalityRaw: place
  };
}

async function main(): Promise<void> {
  const { force } = cliOptions();
  const client = createHttpClient({ minDelayMs: 2_000, force, log });
  const started = Date.now();

  log('Primera FEB: calendario y clasificación…');
  const calendarTeams = parseCalendarTeams(await client.get(CALENDAR_URL));
  const standings = parseStandings(await regularSeasonStandings(client));
  if (standings.length === 0) throw new Error('No se ha podido leer la clasificación.');
  if (calendarTeams.length !== standings.length) {
    warn(
      `el calendario tiene ${calendarTeams.length} equipos y la clasificación ${standings.length}`
    );
  }
  for (const team of calendarTeams) {
    if (!standings.some((row) => row.teamId === team.id)) {
      warn(`«${team.name}» está en el calendario pero no en la clasificación`);
    }
  }
  const maxPlayed = Math.max(...standings.map((row) => row.played ?? 0));
  for (const row of standings) {
    if (row.played !== maxPlayed) warn(`${row.name} jugó ${row.played} partidos y no ${maxPlayed}`);
  }

  const teams: SourceTeam[] = [];
  for (const standing of standings) {
    const name = toTitleCase(standing.name);
    log(`${standing.position}. ${name}`);
    const pages = await teamPages(client, standing.teamId);
    const teamPage = parseTeamPage(pages.team);
    const accumulated = parseAccumulatedStats(pages.stats);
    const rosterById = new Map(teamPage.roster.map((row) => [row.playerId, row]));
    const statsById = new Map(accumulated.map((row) => [row.playerId, row]));
    if (teamPage.roster.length === 0) warn(`${name}: plantilla vacía`);
    if (accumulated.length === 0) warn(`${name}: sin estadísticas acumuladas`);

    // La plantilla es la del final de temporada; quien se fue antes sólo
    // aparece en las estadísticas. Se juntan las dos, sin repetir a nadie.
    const ids = [...new Set([...rosterById.keys(), ...statsById.keys()])];
    const players: SourcePlayer[] = [];
    for (const playerId of ids) {
      const roster = rosterById.get(playerId);
      const stats = statsById.get(playerId);
      // La ficha del jugador sólo hace falta para lo que no está en la
      // plantilla o para saber dónde acaba su nombre y empiezan sus apellidos.
      const page =
        !roster || !stats
          ? parsePlayerPage(
              await client.get(`${BASE}/Jugador.aspx?i=${standing.teamId}&c=${playerId}`)
            )
          : undefined;
      players.push(playerFrom(playerId, roster, stats, page, name));
    }

    teams.push({
      sourceId: standing.teamId,
      name,
      shortName: null,
      city: tidy(
        cityFromAddress(teamPage.pavilionAddress) ?? cityFromAddress(teamPage.clubAddress)
      ),
      pavilionName: tidy(teamPage.pavilionName),
      pavilionCapacity: null,
      finalPosition: standing.position,
      players,
      coach: coachFrom(teamPage.coach, standing.teamId, name)
    });
    if (!teams.at(-1)?.city) warn(`${name}: no se ha podido sacar la ciudad de la dirección`);
  }

  const league: SourceLeague = {
    competitionId: 'liga-plata',
    name: 'Primera FEB',
    shortName: 'PFEB',
    country: 'ESP',
    seasonStartYear: SEASON_START_YEAR,
    source: BASE,
    extractedAt: new Date().toISOString(),
    teams,
    warnings
  };
  const file = sourceFile('feb', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(
    `\n${file}\n${client.networkRequests} peticiones a la red, ` +
      `${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
