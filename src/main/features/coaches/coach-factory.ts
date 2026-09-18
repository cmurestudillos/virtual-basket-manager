import { randomUUID } from 'node:crypto';
import { MANAGER_COACH_ID } from '@shared/contracts/coaches.contract';
import {
  COACH_POOL_SIZE,
  generateClubCoach,
  generateFreeCoach,
  type GeneratedCoach,
  type RealCoachIdentity
} from '@shared/domain/coaches';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import type { NewCoachRow, NewCoachSeasonRow } from '../../database/schema/save';

/**
 * Los entrenadores de una partida, recién inventados.
 *
 * Lo usan la siembra de una partida nueva y {@link CoachService.ensure} en una
 * partida de antes de los entrenadores, con las **mismas semillas**: un club
 * tiene el mismo entrenador se cree la partida hoy o se abra una vieja. En la
 * edición privada, los clubes de las ligas con datos reales llevan a su
 * entrenador de verdad (`realCoach`), con la reputación de la misma semilla.
 */

/** Un club de liga, con lo que hace falta para inventarle entrenador. */
export interface CoachFactoryClub {
  id: string;
  country: string;
  reputation: number;
  competitionId: string;
  tier: number;
  /**
   * El entrenador de verdad, si el dataset lo trae (edición privada). Sólo
   * cambia quién es: la reputación sale igual que la de uno inventado.
   */
  realCoach?: {
    firstName: string;
    lastName: string;
    nationality: string;
    birthDate: string;
  } | null;
}

/** Prefijo de los libres: `coach-libre-1`, `coach-libre-2`… */
export const FREE_COACH_PREFIX = 'coach-libre-';

/** El id del entrenador de la IA con el que arranca un club. */
export function clubCoachId(teamId: string): string {
  return `coach-${teamId}`;
}

/**
 * Todos los entrenadores del arranque: uno por club de liga, la bolsa de
 * libres y el usuario, con los tramos del curso abiertos.
 *
 * El club del usuario también tiene el suyo inventado, pero **empieza en la
 * bolsa**: es el entrenador al que el usuario sustituye. Así todos los clubes
 * tienen su `coach-<club>` sea quien sea el dirigido, y si el usuario se va, el
 * carrusel puede hasta devolverle el banquillo.
 */
export function buildInitialCoaches(input: {
  clubs: readonly CoachFactoryClub[];
  /** Banderas de la bolsa, en un orden estable: los países del mundo. */
  nationalities: readonly string[];
  /** Arranque del curso: desde ahí cuentan los tramos y se miden las edades. */
  seasonStart: Date;
  seasonNumber: number;
  /** El club que dirige el usuario ahora mismo; `null` si está sin banquillo. */
  managerTeamId: string | null;
  managerName: string;
  managerNationality: string;
}): { coaches: NewCoachRow[]; stints: NewCoachSeasonRow[] } {
  const coaches: NewCoachRow[] = [];
  const stints: NewCoachSeasonRow[] = [];
  const clubs = [...input.clubs].sort((a, b) => a.id.localeCompare(b.id));

  for (const club of clubs) {
    const generated = generateClubCoach({
      country: club.country,
      clubReputation: club.reputation,
      tier: club.tier,
      today: input.seasonStart,
      rng: createRng(seedFromString(`${club.id}-entrenador`)),
      real: realIdentity(club.realCoach)
    });
    const employed = club.id !== input.managerTeamId;
    const id = clubCoachId(club.id);
    coaches.push(toRow(id, employed ? club.id : null, generated));
    if (employed) {
      stints.push(openStint(id, club, input.seasonNumber, input.seasonStart));
    }
  }

  coaches.push(
    ...buildFreeCoaches({
      count: COACH_POOL_SIZE,
      firstIndex: 1,
      seed: 'mercado-entrenadores',
      nationalities: input.nationalities,
      today: input.seasonStart,
      young: false
    })
  );

  const [firstName, ...rest] = input.managerName.trim().split(/\s+/);
  coaches.push({
    id: MANAGER_COACH_ID,
    teamId: input.managerTeamId,
    firstName: firstName ?? input.managerName,
    lastName: rest.join(' '),
    nationality: input.managerNationality,
    birthDate: null,
    baseReputation: 35,
    retired: false
  });
  const managerClub = clubs.find((club) => club.id === input.managerTeamId);
  if (managerClub) {
    stints.push(openStint(MANAGER_COACH_ID, managerClub, input.seasonNumber, input.seasonStart));
  }

  return { coaches, stints };
}

/**
 * Libres para la bolsa. `young` es la reposición del verano; sin él, la bolsa
 * del arranque, que mezcla edades.
 */
export function buildFreeCoaches(input: {
  count: number;
  /** Número del primero: los ids siguen la cuenta de los que ya hay. */
  firstIndex: number;
  seed: string;
  nationalities: readonly string[];
  today: Date;
  young: boolean;
}): NewCoachRow[] {
  const rng = createRng(seedFromString(input.seed));
  const rows: NewCoachRow[] = [];
  for (let index = 0; index < input.count; index += 1) {
    const generated = generateFreeCoach({
      nationalities: input.nationalities,
      today: input.today,
      young: input.young,
      rng
    });
    rows.push(toRow(`${FREE_COACH_PREFIX}${input.firstIndex + index}`, null, generated));
  }
  return rows;
}

/** Un tramo nuevo en un banquillo, sin cifras todavía. */
export function openStint(
  coachId: string,
  club: { id: string; competitionId: string; tier: number; reputation: number },
  seasonNumber: number,
  startDate: Date
): NewCoachSeasonRow {
  return {
    id: randomUUID(),
    coachId,
    teamId: club.id,
    seasonNumber,
    competitionId: club.competitionId,
    startDate,
    endDate: null,
    endReason: null,
    closed: false,
    tier: club.tier,
    clubReputation: club.reputation
  };
}

/** La identidad real del dataset, con la fecha ya como fecha; `null` si no la hay o no se lee. */
function realIdentity(coach: CoachFactoryClub['realCoach']): RealCoachIdentity | null {
  if (!coach) {
    return null;
  }
  const birthDate = new Date(`${coach.birthDate}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }
  return {
    firstName: coach.firstName,
    lastName: coach.lastName,
    nationality: coach.nationality,
    birthDate
  };
}

function toRow(id: string, teamId: string | null, generated: GeneratedCoach): NewCoachRow {
  return {
    id,
    teamId,
    firstName: generated.firstName,
    lastName: generated.lastName,
    nationality: generated.nationality,
    birthDate: generated.birthDate,
    baseReputation: generated.baseReputation,
    retired: false
  };
}
