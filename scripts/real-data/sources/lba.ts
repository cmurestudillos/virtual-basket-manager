import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT, createHttpClient, type HttpClient } from '../lib/http';
import { toInt, toIsoDate } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type { SourceCoach, SourceLeague, SourcePlayer, SourceTeam } from '../lib/source-types';
import { birthPlaceOf } from './feb-parse';
import {
  coachSpells,
  nationFromLbaCountry,
  nationFromLbaPlace,
  parseClub,
  parseCoachProfile,
  parseMatchCoaches,
  parsePlayerProfile,
  parseRoster,
  parseSchedule,
  parseTeamStats,
  parseTeams,
  toLbaPosition,
  toSourceStats,
  type LbaMatchCoach,
  type LbaPerson,
  type LbaPlayerProfile,
  type LbaRosterPlayer,
  type LbaStatsLine
} from './lba-parse';

/**
 * Extractor de la Serie A italiana (LBA) desde la API JSON de legabasket.it.
 *
 *   pnpm real:lba            usa la caché de descargas
 *   pnpm real:lba --force    lo vuelve a descargar todo
 *
 * Es la API que usa la propia web: equipos del año, plantilla, club,
 * estadísticas por equipo y calendario, y las actas de los partidos para
 * saber qué entrenador empezó la liga. Las estadísticas se piden con la
 * temporada, la Serie A (`cs_id=1`) y la liga regular (`ct_id=4`): sin esos
 * parámetros la API devuelve la temporada en curso.
 */

const BASE = 'https://www.legabasket.it';
const API = `${BASE}/api`;
const SEASON_START_YEAR = 2025;
const SERIE_A = 1;
const REGULAR_SEASON = 4;

/**
 * Ciudad de los clubes cuya sede no está en su ciudad, por id de club (el que
 * no cambia de un año a otro). La API da el municipio de la sede y el del
 * pabellón, y en algún caso los dos son el del pabellón de fuera de la ciudad.
 */
const CLUB_CITIES: Record<string, string> = {
  // La sede y el pabellón del Olimpia están en Assago, a las afueras de Milán.
  '28': 'Milano'
};

/**
 * Lo que la LBA no da de un entrenador del inicio de temporada (la fecha o el
 * lugar de nacimiento), completado a mano: por id de entrenador de la LBA, con
 * el mismo formato de fecha y lugar que la FEB («30/09/1959 Catania», «Ciudad
 * (País)»). Lo que da la LBA manda.
 *
 * Vive en `resources/real-data/manual/lba-entrenadores.json` y no aquí: son
 * datos de personas reales y este repositorio es público. Sin el fichero,
 * esos entrenadores se quedan sin fecha (y sin nacionalidad si tampoco hay
 * lugar) y se avisa.
 */
interface LbaCoachOverrides {
  fallbacks: Record<string, { birth: string }>;
}

const COACH_OVERRIDES_FILE = join(
  PROJECT_ROOT,
  'resources',
  'real-data',
  'manual',
  'lba-entrenadores.json'
);

function loadCoachOverrides(): LbaCoachOverrides {
  if (!existsSync(COACH_OVERRIDES_FILE)) return { fallbacks: {} };
  const parsed = JSON.parse(
    readFileSync(COACH_OVERRIDES_FILE, 'utf8')
  ) as Partial<LbaCoachOverrides>;
  return { fallbacks: parsed.fallbacks ?? {} };
}

const { fallbacks: COACH_FALLBACKS } = loadCoachOverrides();

const log = (message: string): void => console.log(message);

const warnings: string[] = [];
function warn(message: string): void {
  warnings.push(message);
  log(`  aviso: ${message}`);
}

/** La API responde JSON; una página HTML es un error de ruta que no se guarda. */
const isJson = (body: string): boolean => /^\s*[{[]/.test(body);

function api(client: HttpClient, path: string): Promise<string> {
  return client.get(`${API}${path}`, {
    headers: { Accept: 'application/json, text/plain, */*', Referer: `${BASE}/` },
    accept: isJson
  });
}

function playerFrom(
  playerId: string,
  roster: LbaRosterPlayer | undefined,
  stats: LbaStatsLine | undefined,
  profile: LbaPlayerProfile | null,
  teamName: string
): SourcePlayer {
  const base = roster ?? profile;
  const firstName = base?.firstName ?? stats?.firstName ?? '';
  const lastName = base?.lastName ?? stats?.lastName ?? '';
  const label = `${teamName}: ${firstName} ${lastName}`;
  // La ficha es la de hoy: el dorsal y el cupo pueden ser ya de otro equipo.
  const current = roster ?? (profile?.year === SEASON_START_YEAR ? profile : null);
  const nationalityRaw = base?.country ?? null;
  const nationality = nationFromLbaCountry(nationalityRaw);
  const heightCm = base?.heightCm ?? null;
  const positionRaw = base?.role ?? null;
  const position = toLbaPosition(positionRaw, heightCm);
  if (nationalityRaw && !nationality)
    warn(`${label}: nacionalidad no reconocida «${nationalityRaw}»`);
  if (!nationalityRaw) warn(`${label}: sin nacionalidad`);
  if (positionRaw && !position) warn(`${label}: posición no reconocida «${positionRaw}»`);
  if (!base) warn(`${label}: sin ficha de jugador (fecha de nacimiento desconocida)`);
  return {
    sourceId: playerId,
    firstName,
    lastName,
    nickname: null,
    birthDate: base?.birthDate ?? null,
    age: null,
    nationality,
    nationalityRaw,
    position,
    positionRaw,
    heightCm,
    weightKg: base?.weightKg ?? null,
    shirtNumber: toInt(current?.shirtNumber ?? null),
    licence: current?.uefaRatio ?? null,
    stats: stats ? toSourceStats(stats) : null
  };
}

/**
 * El primer entrenador con el que el club empezó la liga: el del acta de su
 * primer partido jugado (por fecha). Sus datos, de su ficha; lo que falte, del
 * fichero a mano.
 */
async function coachFrom(
  client: HttpClient,
  teamName: string,
  spells: ReturnType<typeof coachSpells>,
  current: LbaPerson | null
): Promise<SourceCoach | null> {
  const start = spells[0];
  if (!start) {
    warn(`${teamName}: ninguna acta de liga regular trae entrenador`);
    return null;
  }
  const profile =
    parseCoachProfile(await api(client, `/coaches/get-coaches-by-id?id=${start.coachId}`)) ??
    (current?.id === start.coachId ? current : null);
  if (!profile) {
    warn(`${teamName}: sin ficha del entrenador ${start.name} (${start.coachId})`);
    return null;
  }
  const label = `${teamName}: entrenador ${profile.firstName} ${profile.lastName}`;
  const later = spells.slice(1);
  if (later.length > 0) {
    warn(
      `${label}: empezó la temporada (${start.games} partidos); después se sentaron en el banquillo ` +
        later.map((spell) => `${spell.name} (${spell.games})`).join(' y ')
    );
  }
  if (current && current.id !== start.coachId && !later.some((s) => s.coachId === current.id)) {
    warn(
      `${label}: la plantilla trae a ${current.firstName} ${current.lastName}, que no sale en ninguna acta`
    );
  }

  const manual = COACH_FALLBACKS[start.coachId];
  let birthDate = profile.birthDate;
  let place = profile.placeOfBirth;
  if (manual && (!birthDate || !place)) {
    birthDate ??= toIsoDate(manual.birth);
    place ??= birthPlaceOf(manual.birth);
    warn(`${label}: fecha o lugar de nacimiento puestos a mano («${manual.birth}»)`);
  }
  if (!birthDate) warn(`${label}: sin fecha de nacimiento`);
  const nationality = nationFromLbaPlace(place);
  if (!nationality) {
    warn(
      place
        ? `${label}: nacionalidad no deducible de «${place}» (se pone la del club)`
        : `${label}: sin lugar de nacimiento, nacionalidad desconocida (se pone la del club)`
    );
  }
  return {
    sourceId: start.coachId,
    firstName: profile.firstName,
    lastName: profile.lastName,
    birthDate,
    age: null,
    nationality,
    nationalityRaw: place
  };
}

async function main(): Promise<void> {
  const { force } = cliOptions();
  const client = createHttpClient({ minDelayMs: 1_000, force, log });
  const started = Date.now();

  log('Serie A: equipos…');
  const refs = parseTeams(await api(client, `/teams/get-teams?year=${SEASON_START_YEAR}&items=50`));
  if (refs.length === 0) throw new Error('La lista de equipos ha salido vacía.');

  const teams: SourceTeam[] = [];
  for (const ref of refs) {
    const roster = parseRoster(await api(client, `/teams/get-team-roster?id=${ref.teamId}`));
    log(`${roster.finalPosition ?? '?'}. ${ref.name}`);
    const club = parseClub(await api(client, `/clubs/get-club-by-id?id=${ref.teamId}`));
    const stats = parseTeamStats(
      await api(
        client,
        `/teams/get-team-players-stats?id=${ref.teamId}&s=${SEASON_START_YEAR}` +
          `&cs_id=${SERIE_A}&ct_id=${REGULAR_SEASON}&st=sum`
      )
    );
    const schedule = parseSchedule(
      await api(
        client,
        `/teams/get-team-schedules?id=${ref.teamId}&s=${SEASON_START_YEAR}` +
          `&cs_id=${SERIE_A}&ct_id=${REGULAR_SEASON}`
      )
    );
    const played = schedule.filter((match) => match.played);
    if (roster.finalPosition === null) warn(`${ref.name}: sin puesto en la clasificación`);
    if (roster.wins !== null && roster.losses !== null) {
      if (roster.wins + roster.losses !== played.length) {
        warn(
          `${ref.name}: la clasificación suma ${roster.wins + roster.losses} partidos y el calendario ${played.length}`
        );
      }
    }
    const maxGames = Math.max(0, ...stats.map((line) => line.games));
    if (maxGames > played.length) {
      warn(
        `${ref.name}: un jugador con ${maxGames} partidos de ${played.length}: ¿no es sólo la liga regular?`
      );
    }

    // Las actas, una por partido jugado: el primero dice quién empezó.
    const byMatch: (LbaMatchCoach | undefined)[] = [];
    for (const match of played) {
      const coaches = parseMatchCoaches(
        await api(client, `/championships/get-championships-matches-by-id?id=${match.matchId}`)
      );
      byMatch.push(coaches.get(ref.teamId));
    }
    const coach = await coachFrom(client, ref.name, coachSpells(byMatch), roster.coach);

    // La plantilla es la del final de temporada; quien se fue antes sólo sale
    // en las estadísticas, y se le busca su ficha. Quien se fue sin jugar no
    // cuenta.
    const rosterById = new Map(roster.players.map((player) => [player.id, player]));
    const statsById = new Map(stats.map((line) => [line.playerId, line]));
    const ids = [
      ...new Set([
        ...rosterById.keys(),
        ...stats.filter((line) => line.games > 0).map((line) => line.playerId)
      ])
    ];
    const players: SourcePlayer[] = [];
    for (const playerId of ids) {
      const inRoster = rosterById.get(playerId);
      const profile = inRoster
        ? null
        : parsePlayerProfile(await api(client, `/players/get-player-by-id?id=${playerId}`));
      players.push(playerFrom(playerId, inRoster, statsById.get(playerId), profile, ref.name));
    }

    const city =
      (ref.clubId ? CLUB_CITIES[ref.clubId] : undefined) ?? club.companyTown ?? club.plantTown;
    if (!city) warn(`${ref.name}: ciudad desconocida`);
    teams.push({
      sourceId: ref.teamId,
      name: ref.name,
      shortName: ref.clubCode,
      city: city ?? null,
      pavilionName: club.plantName,
      pavilionCapacity: club.plantCapacity,
      finalPosition: roster.finalPosition,
      players,
      coach
    });
  }

  const positions = teams.map((team) => team.finalPosition).filter((pos) => pos !== null);
  if (new Set(positions).size !== teams.length) {
    warn('los puestos de la clasificación se repiten o faltan');
  }

  const league: SourceLeague = {
    competitionId: 'italia-1',
    name: 'Serie A',
    shortName: 'LBA',
    country: 'ITA',
    seasonStartYear: SEASON_START_YEAR,
    source: BASE,
    extractedAt: new Date().toISOString(),
    teams,
    warnings
  };
  const file = sourceFile('lba', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(
    `\n${file}\n${client.networkRequests} peticiones a la red, ` +
      `${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
