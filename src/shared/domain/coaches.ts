/**
 * Los entrenadores de la IA: quiénes son, cuánto valen y cómo se mueven.
 *
 * Todos los banquillos de club tienen entrenador. Los de la IA se inventan con
 * una semilla fija por club —la misma partida da siempre los mismos—, llegan
 * sin palmarés (lo que cuente será lo que hagan en la partida) y se mueven
 * solos: al que va mal lo echan, al que está libre lo fichan, un club grande le
 * quita el suyo a uno pequeño, los mayores se retiran y la bolsa de libres se
 * repone con gente joven.
 *
 * Aquí están las reglas de todo eso. Funciones puras: el azar llega de fuera,
 * en un generador ya sembrado, y la base de datos no se ve.
 */

import type { Rng } from '@shared/engine/basketball/rng';
import { clubWouldHire, coachReputation, tempts } from './career';
import type { SeasonVerdict } from './board';
import { randomNameFor } from './names';

export { coachReputation };

/** Por qué acabó una etapa en un banquillo. */
export type CoachExitReason = 'dismissed' | 'left' | 'retired';

export const MIN_COACH_AGE = 34;
export const MAX_COACH_AGE = 66;
/** Los jóvenes que reponen la bolsa: recién salidos de ser ayudantes. */
export const MAX_YOUNG_COACH_AGE = 42;

/** Cuántos entrenadores de club son de fuera: uno de cada seis, más o menos. */
export const FOREIGN_COACH_SHARE = 0.17;

/**
 * Las escuelas de entrenadores que más exportan. Un extranjero sale de aquí:
 * un club griego trae a un serbio o a un italiano, no a uno de cualquier sitio.
 */
export const COACH_EXPORTERS = [
  'ESP',
  'ITA',
  'SRB',
  'GRE',
  'LTU',
  'USA',
  'FRA',
  'CRO',
  'SLO',
  'TUR',
  'ISR',
  'ARG'
] as const;

/** Libres que quiere haber siempre en la bolsa al empezar un curso. */
export const COACH_POOL_SIZE = 40;

/** La reputación de un entrenador de la IA, dentro de la misma escala que la del usuario. */
export const MIN_COACH_REPUTATION = 10;
export const MAX_COACH_BASE_REPUTATION = 90;

/**
 * Lo que vale el entrenador de un club al empezar la partida.
 *
 * Unos quince puntos por debajo de su club —como el usuario, que arranca en 35
 * y le corresponde un club de 50—, algo menos en las categorías de abajo y con
 * un margen de ±8: no todos los grandes tienen a un gran entrenador.
 */
export function initialCoachReputation(clubReputation: number, tier: number, rng: Rng): number {
  const center = clubReputation - 15 - Math.max(0, tier - 1) * 5;
  const noise = rng.int(-8, 8);
  return clamp(Math.round(center + noise), MIN_COACH_REPUTATION, MAX_COACH_BASE_REPUTATION);
}

/** Un entrenador recién inventado, antes de tener id ni club. */
export interface GeneratedCoach {
  firstName: string;
  lastName: string;
  nationality: string;
  birthDate: Date;
  baseReputation: number;
}

/** Quién es de verdad el entrenador de un club, cuando el dataset lo sabe. */
export interface RealCoachIdentity {
  firstName: string;
  lastName: string;
  nationality: string;
  birthDate: Date;
}

/**
 * El entrenador de un club.
 *
 * Las tiradas van siempre en el mismo orden —extranjero, bandera, nombre, edad,
 * día de nacimiento, reputación—, así que la misma semilla da el mismo
 * entrenador aunque cambie todo lo demás de la partida. El oficio suma algo a
 * la reputación: un técnico de sesenta años ha dirigido mucho antes de que
 * empiece la partida, aunque eso no cuente como palmarés.
 *
 * Con `real` (la edición privada, en las ligas con datos reales) el nombre, la
 * bandera y la fecha son los de verdad, pero la reputación sale igual que la de
 * uno inventado —del club, la categoría y la edad, con la misma tirada—: su
 * fama de fuera no cuenta, como no cuenta el palmarés.
 */
export function generateClubCoach(input: {
  country: string;
  clubReputation: number;
  tier: number;
  /** Fecha a la que se mide la edad: el arranque del curso. */
  today: Date;
  rng: Rng;
  real?: RealCoachIdentity | null;
}): GeneratedCoach {
  const { rng } = input;
  // Las tiradas del inventado se hacen igual aunque haya uno real: así la de
  // la reputación es la misma que le tocaría al club en la edición pública.
  const foreign = rng.chance(FOREIGN_COACH_SHARE);
  const nationality = foreign ? foreignNationality(input.country, rng) : input.country;
  const name = randomNameFor(nationality, rng);
  const age = rng.int(MIN_COACH_AGE, MAX_COACH_AGE);
  const birthDate = birthDateFor(input.today, age, rng.int(0, 364));
  const fromClub = initialCoachReputation(input.clubReputation, input.tier, rng);
  const real = input.real ?? null;
  const base =
    fromClub + seniorityBonus(real ? Math.max(0, coachAge(real.birthDate, input.today)) : age);

  return {
    firstName: real ? real.firstName : name.firstName,
    lastName: real ? real.lastName : name.lastName,
    nationality: real ? real.nationality : nationality,
    birthDate: real ? real.birthDate : birthDate,
    baseReputation: clamp(base, MIN_COACH_REPUTATION, MAX_COACH_BASE_REPUTATION)
  };
}

/**
 * Un entrenador libre de la bolsa.
 *
 * `young` es la reposición: gente de 34 a 42 años con poco nombre todavía. La
 * bolsa del arranque, en cambio, mezcla de todo —veteranos a los que echaron y
 * jóvenes que esperan su oportunidad—, con reputaciones de 15 a 60: los libres
 * son, por definición, los que ningún club tiene ahora mismo.
 */
export function generateFreeCoach(input: {
  /** Banderas posibles, en un orden estable. */
  nationalities: readonly string[];
  today: Date;
  young: boolean;
  rng: Rng;
}): GeneratedCoach {
  const { rng } = input;
  const flags = input.nationalities.length > 0 ? input.nationalities : COACH_EXPORTERS;
  const nationality = flags[rng.int(0, flags.length - 1)] as string;
  const name = randomNameFor(nationality, rng);
  const age = rng.int(MIN_COACH_AGE, input.young ? MAX_YOUNG_COACH_AGE : MAX_COACH_AGE);
  const birthDate = birthDateFor(input.today, age, rng.int(0, 364));
  const base = input.young ? rng.int(12, 30) : rng.int(15, 60) + seniorityBonus(age);

  return {
    ...name,
    nationality,
    birthDate,
    baseReputation: clamp(base, MIN_COACH_REPUTATION, MAX_COACH_BASE_REPUTATION)
  };
}

/** Años cumplidos a una fecha. */
export function coachAge(birthDate: Date, today: Date): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() &&
      today.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age;
}

// --- El carrusel --------------------------------------------------------------

/**
 * Probabilidad de que echen en verano al entrenador de un club, según cómo
 * acabó el curso: fallar el objetivo es lo normal para salir, cumplirlo casi
 * nunca y superarlo, jamás.
 */
export function summerDismissalChance(verdict: SeasonVerdict): number {
  switch (verdict) {
    case 'failed':
      return 0.55;
    case 'met':
      return 0.04;
    case 'exceeded':
      return 0;
  }
}

/** Partidos de liga que tiene que llevar un entrenador en un club antes de que lo echen. */
export const MIN_GAMES_BEFORE_DISMISSAL = 6;

/**
 * ¿Va el club claramente por debajo de lo que es?
 *
 * Lo esperado es su sitio por reputación dentro de su propia liga (el de más
 * nombre, primero), y «claramente» es un cuarto de la tabla por detrás, con un
 * mínimo de tres puestos: ir quinto cuando te toca ser tercero no le cuesta el
 * puesto a nadie, ir décimo sí. Medirlo contra la liga, y no contra la escala
 * absoluta, evita que en una liga de grandes alguien vaya «mal» por ser el
 * último de los grandes.
 */
export function isClearlyBelowExpectations(input: {
  position: number;
  /** 1 el club de más reputación de la liga. */
  expectedPosition: number;
  teams: number;
}): boolean {
  const margin = Math.max(3, Math.ceil(input.teams / 4));
  return input.position - input.expectedPosition >= margin;
}

/**
 * ¿Se puede echar a mitad de temporada?
 *
 * Sólo en la liga regular —en playoffs nadie cambia de entrenador— y con
 * margen: ni en las primeras jornadas del curso ni a quien acaba de llegar.
 * El resto lo decide la misma tirada que abre los banquillos al usuario, así
 * que un despido de la IA y una oferta que ve el usuario salen del mismo sitio.
 */
export function canDismissMidSeason(input: {
  stage: string;
  /** Partidos de liga del club desde que llegó el entrenador. */
  gamesInCharge: number;
}): boolean {
  return input.stage === 'regular' && input.gamesInCharge >= MIN_GAMES_BEFORE_DISMISSAL;
}

/**
 * Probabilidad de retirarse en un verano.
 *
 * Nadie se retira antes de los sesenta; desde ahí, cinco puntos más cada año,
 * y a los setenta y dos se retira todo el mundo. Quien está en el paro se
 * retira antes: sin banquillo a la vista, colgar la pizarra es lo natural.
 */
export function retirementChance(age: number, employed: boolean): number {
  if (age < 60) {
    return 0;
  }
  if (age >= 72) {
    return 1;
  }
  const base = 0.04 + (age - 60) * 0.05;
  return clamp(base + (employed ? 0 : 0.1), 0, 1);
}

/** Cuántos jóvenes hacen falta para que la bolsa vuelva a su tamaño. */
export function poolShortfall(freeCoaches: number, target = COACH_POOL_SIZE): number {
  return Math.max(0, target - freeCoaches);
}

/** Un entrenador que podría ocupar un banquillo vacío. */
export interface CoachCandidate {
  coachId: string;
  reputation: number;
  /** Su club, si tiene; `null` si está libre. */
  teamId: string | null;
  /** Reputación de su club; `null` si está libre. */
  teamReputation: number | null;
}

/** Cuánto más tiene que valer uno con equipo para que merezca la pena quitárselo a otro. */
export const POACH_MARGIN = 5;
/** Probabilidad de que un club intente llevarse al entrenador de otro, si lo hay. */
export const POACH_CHANCE = 0.35;

/**
 * El sustituto: a quién ficha un club con el banquillo vacío.
 *
 * Primero, el libre de más nombre dispuesto a venir —{@link clubWouldHire}:
 * ni tan poca cosa que el club no lo quiera ni tan grande que no se moleste—.
 * Pero si hay un entrenador claramente mejor en un club más pequeño, al que el
 * cambio le tienta ({@link tempts}), y la tirada acompaña (`poach`), se lo
 * quita. Si nadie encaja, el libre que más se acerque a lo que es el club: un
 * banquillo nunca se queda vacío. Devuelve `null` sólo si no hay a nadie.
 */
export function chooseReplacement(input: {
  clubReputation: number;
  candidates: readonly CoachCandidate[];
  poach: boolean;
}): CoachCandidate | null {
  const free = input.candidates.filter((row) => row.teamId === null);
  const willing = free.filter((row) => clubWouldHire(input.clubReputation, row.reputation));
  const bestFree = best(willing);

  if (input.poach) {
    const poachable = input.candidates.filter(
      (row) =>
        row.teamId !== null &&
        row.teamReputation !== null &&
        tempts(input.clubReputation, row.teamReputation) &&
        clubWouldHire(input.clubReputation, row.reputation)
    );
    const target = best(poachable);
    if (target && (!bestFree || target.reputation >= bestFree.reputation + POACH_MARGIN)) {
      return target;
    }
  }

  if (bestFree) {
    return bestFree;
  }

  // Nadie encaja del todo: el que más se parezca a lo que el club suele tener.
  const fit = input.clubReputation - 15;
  return (
    [...free].sort(
      (a, b) =>
        Math.abs(a.reputation - fit) - Math.abs(b.reputation - fit) ||
        a.coachId.localeCompare(b.coachId)
    )[0] ?? null
  );
}

// ------------------------------------------------------------------------

/** El de más reputación; a igualdad, el id, para que el resultado no dependa del orden. */
function best(rows: readonly CoachCandidate[]): CoachCandidate | null {
  return (
    [...rows].sort(
      (a, b) => b.reputation - a.reputation || a.coachId.localeCompare(b.coachId)
    )[0] ?? null
  );
}

/** Un par de puntos por el oficio: de 0 a los 34 años a +5 a los 64. */
function seniorityBonus(age: number): number {
  return Math.floor(Math.max(0, age - MIN_COACH_AGE) / 6);
}

function foreignNationality(country: string, rng: Rng): string {
  const options = COACH_EXPORTERS.filter((code) => code !== country);
  return options[rng.int(0, options.length - 1)] as string;
}

function birthDateFor(today: Date, age: number, dayOffset: number): Date {
  const anniversary = Date.UTC(
    today.getUTCFullYear() - age,
    today.getUTCMonth(),
    today.getUTCDate()
  );
  return new Date(anniversary - dayOffset * 24 * 60 * 60 * 1000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
