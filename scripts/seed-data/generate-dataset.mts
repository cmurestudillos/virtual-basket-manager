import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRng } from '../../src/shared/engine/basketball/rng';
import { POSITIONS, type Position } from '../../src/shared/domain/positions';
import { randomNameFor } from '../../src/shared/domain/names';
import {
  ATTRIBUTE_KEYS,
  overallForPosition,
  type PlayerAttributes
} from '../../src/shared/domain/attributes';
import {
  CONTINENTAL_COMPETITIONS,
  WORLD,
  type LeagueCountry,
  type LeagueTier
} from './leagues.mts';

/**
 * Generador del dataset con el que arranca una partida nueva.
 *
 * Todo lo que produce es inventado: clubes, pabellones y jugadores. Ni nombres
 * ni escudos reales, y a propósito — un dataset con marcas reales condiciona
 * después qué se puede distribuir, y arrastrar ese problema desde el primer día
 * sale mucho más caro que evitarlo. La *forma* de cada liga sí es la de verdad:
 * cuántos equipos, cuántas categorías y con qué reglamento.
 *
 * Es determinista: misma semilla, mismo dataset, así que regenerarlo no cambia
 * el mundo entero por sorpresa.
 *
 *   pnpm seed:generate
 */

const OUTPUT = resolve('resources/seed-data/dataset.json');
const SEED = 20260821;
const SEASON_START_YEAR = 2025;

/** Las ciudades españolas: las primeras dieciocho son las de primera. */
const SPANISH_CITIES = [
  'Valdeorán',
  'Ríoseco',
  'Montenegro',
  'Puertollano del Mar',
  'Alcorada',
  'Vilanova de Bierzo',
  'Santa Marina',
  'Torrelaguna',
  'Peñalba',
  'Miralcampo',
  'Aldebarán',
  'Costa Verde',
  'San Cristóbal',
  'Villafría',
  'Mediana',
  'Las Salinas',
  'Roquedal',
  'Nueva Estrada',
  'Alborada',
  'Bárcena',
  'Cabo Verde',
  'Duratón',
  'Espinar',
  'Fuenteseca',
  'Gálvez',
  'Hontanar',
  'Isla Redonda',
  'Jarales',
  'Lomas Altas',
  'Montalbán',
  'Navacerrada',
  'Olmedilla',
  'Pinar del Río',
  'Quintanar',
  'Robledal',
  'Soto Mayor'
];

/**
 * De dónde es la gente que no es del país de su club.
 *
 * El reparto no es uniforme a propósito: hay muchos más estadounidenses sueltos
 * por las ligas del mundo que lituanos.
 */
const NATIONALITIES = [
  'ESP',
  'ESP',
  'USA',
  'USA',
  'USA',
  'USA',
  'SRB',
  'LTU',
  'FRA',
  'ITA',
  'GRE',
  'SEN',
  'ARG',
  'BRA',
  'TUR',
  'GER',
  'AUS',
  'CRO'
];

/** Altura media y dispersión por posición, en centímetros. */
const HEIGHT_BY_POSITION: Record<Position, { mean: number; spread: number }> = {
  PG: { mean: 186, spread: 5 },
  SG: { mean: 194, spread: 5 },
  SF: { mean: 200, spread: 5 },
  PF: { mean: 205, spread: 5 },
  C: { mean: 211, spread: 6 }
};

/**
 * Sesgo de cada atributo por posición: cuánto se suma o resta al nivel base del
 * jugador. Es lo que hace que un base tenga pase y manejo y un pívot rebote y
 * tapón, en vez de doce clones con la misma media.
 */
const POSITION_BIAS: Record<Position, Partial<Record<keyof PlayerAttributes, number>>> = {
  PG: {
    passing: 14,
    handling: 14,
    basketballIQ: 10,
    driving: 8,
    threePoint: 5,
    speed: 8,
    close: -6,
    offensiveRebound: -18,
    defensiveRebound: -14,
    interiorDefense: -14,
    block: -20,
    strength: -10
  },
  SG: {
    threePoint: 12,
    midRange: 10,
    handling: 6,
    perimeterDefense: 6,
    speed: 6,
    driving: 5,
    offensiveRebound: -12,
    defensiveRebound: -8,
    block: -14,
    interiorDefense: -8
  },
  SF: {
    threePoint: 5,
    driving: 6,
    close: 3,
    perimeterDefense: 5,
    defensiveRebound: 2,
    strength: 2,
    block: -5
  },
  PF: {
    close: 8,
    finishing: 8,
    offensiveRebound: 10,
    defensiveRebound: 12,
    interiorDefense: 10,
    strength: 10,
    block: 6,
    threePoint: -8,
    handling: -10,
    passing: -6
  },
  C: {
    close: 12,
    finishing: 10,
    offensiveRebound: 14,
    defensiveRebound: 16,
    interiorDefense: 16,
    block: 14,
    strength: 14,
    jumping: 4,
    threePoint: -20,
    handling: -16,
    passing: -10,
    speed: -8
  }
};

interface DatasetCompetition {
  id: string;
  name: string;
  shortName: string;
  country: string;
  /** `EUR`, `AME` u `OCE`: decide a qué competición continental se va. */
  continent: string;
  rulesetId: string;
  tier: number;
  format: string;
  playoffTeams: number;
  playoffSeriesLength: number;
}

interface DatasetTeam {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  competitionId: string;
  pavilionName: string;
  pavilionCapacity: number;
  reputation: number;
  budgetCents: number;
}

interface DatasetPlayer {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  nationality: string;
  birthDate: string;
  position: Position;
  secondaryPosition: Position | null;
  heightCm: number;
  weightKg: number;
  wingspanCm: number;
  attributes: PlayerAttributes;
  potential: number;
  wageCents: number;
  contractUntil: string;
  valueCents: number;
}

const rng = createRng(SEED);

const competitions: DatasetCompetition[] = [];
const teams: DatasetTeam[] = [];
const players: DatasetPlayer[] = [];

for (const country of WORLD) {
  // Las ciudades se reparten por orden entre las categorías del país: la
  // primera se queda las primeras. Dos clubes de la misma ciudad en distinta
  // división se confundirían en cuanto uno ascendiera.
  const cities = country.code === 'ESP' ? SPANISH_CITIES : country.cities;
  let cityIndex = 0;

  country.tiers.forEach((tier, tierIndex) => {
    competitions.push({
      id: tier.id,
      name: tier.name,
      shortName: tier.shortName,
      country: country.code,
      continent: country.continent,
      rulesetId: country.rulesetId,
      tier: tierIndex + 1,
      format: 'league',
      playoffTeams: tier.playoffTeams,
      playoffSeriesLength: tier.playoffSeriesLength
    });

    for (let index = 0; index < tier.teams; index += 1) {
      const city = cities[cityIndex] ?? `${country.code} ${cityIndex + 1}`;
      cityIndex += 1;
      teams.push(buildTeam(country, tier, city, index));
    }
  });
}

// La Copa nacional: de momento sólo la española, que es la que se juega.
competitions.push({
  id: 'copa-nacional',
  name: 'Copa Nacional',
  shortName: 'Copa',
  country: 'ESP',
  continent: 'EUR',
  rulesetId: 'fiba',
  tier: 1,
  format: 'cup',
  playoffTeams: 0,
  playoffSeriesLength: 1
});

for (const competition of CONTINENTAL_COMPETITIONS) {
  competitions.push({
    id: competition.id,
    name: competition.name,
    shortName: competition.shortName,
    // El «país» de una competición continental es su continente: así no entra
    // en el reparto de ascensos y descensos, que es cosa de cada país.
    country: competition.continent,
    continent: competition.continent,
    rulesetId: 'fiba',
    tier: competition.tier,
    format: 'continental',
    // Ocho a la eliminatoria tras la fase de liga, al mejor de tres.
    playoffTeams: 8,
    playoffSeriesLength: 3
  });
}

for (const team of teams) {
  buildRoster(team);
}

function buildTeam(
  country: LeagueCountry,
  tier: LeagueTier,
  city: string,
  index: number
): DatasetTeam {
  const prefix = country.prefixes[rng.int(0, country.prefixes.length - 1)] as string;
  const flag = country.flags[rng.int(0, country.flags.length - 1)] as string;
  // La reputación va escalonada del mejor al peor de cada liga: así toda
  // competición tiene favoritos y colistas desde el primer día, y el mejor de
  // segunda sigue estando por debajo del peor de primera.
  const [best, worst] = tier.reputation;
  const step = tier.teams > 1 ? (best - worst) / (tier.teams - 1) : 0;
  const reputation = Math.max(1, Math.round(best - index * step + rng.int(-3, 3)));

  return {
    id: `${tier.id}-${index + 1}`,
    name: prefix ? `${prefix} ${city}` : city,
    shortName: city
      .replace(/[^\p{L}]/gu, '')
      .slice(0, 3)
      .toUpperCase(),
    city,
    country: flag,
    competitionId: tier.id,
    pavilionName: `Pabellón ${city}`,
    pavilionCapacity: Math.round(tier.capacity * (0.45 + reputation / 110)) + rng.int(-400, 400),
    reputation,
    budgetCents: (300_000 + reputation * 58_000 + rng.int(-120_000, 120_000)) * 100
  };
}

/** Doce fichas por equipo: los inscritos en acta de un partido FIBA. */
function buildRoster(team: DatasetTeam): void {
  const rosterPositions: Position[] = [
    'PG',
    'PG',
    'SG',
    'SG',
    'SF',
    'SF',
    'PF',
    'PF',
    'C',
    'C',
    POSITIONS[rng.int(0, 4)] as Position,
    POSITIONS[rng.int(0, 4)] as Position
  ];

  // La unicidad de los nombres es por vestuario, no por mundo: dos Tomas
  // Vaitkus en dos clubes lituanos distintos es lo normal; dos en el mismo
  // canta mucho.
  const usedNames = new Set<string>();

  rosterPositions.forEach((position, slot) => {
    // Los cinco primeros de cada puesto son el bloque titular: mejores que el
    // resto, y todos ellos escalados por la reputación del club.
    const teamLevel = 34 + team.reputation * 0.42;
    const depthPenalty = slot < 5 ? 0 : slot < 9 ? 5 : 11;
    const level = clamp(teamLevel - depthPenalty + rng.int(-5, 5), 25, 92);

    const age = weightedAge();
    const height = Math.round(
      HEIGHT_BY_POSITION[position].mean +
        rng.int(-HEIGHT_BY_POSITION[position].spread, HEIGHT_BY_POSITION[position].spread)
    );

    const nationality = nationalityFor(team);
    const { firstName, lastName } = uniqueName(nationality, usedNames);
    const attributes = attributesFor(position, level);
    // El techo se mide contra la media real del jugador en su puesto, no contra
    // el `level` con el que se generó: los sesgos por posición suben esa media
    // por encima del nivel base, y un potencial por debajo de lo que ya vale
    // significaría que nadie mejora nunca por mucho que entrene.
    const overall = overallForPosition(attributes, position);

    players.push({
      id: `${team.id}-p${slot + 1}`,
      teamId: team.id,
      firstName,
      lastName,
      nationality,
      birthDate: birthDateFor(age),
      position,
      secondaryPosition: rng.chance(0.45) ? neighbourPosition(position) : null,
      heightCm: height,
      weightKg: Math.round((height - 100) * 0.92 + rng.int(-6, 8)),
      // La envergadura suele pasar de la altura; es lo que explica tapones y
      // robos mejor que la altura sola.
      wingspanCm: height + rng.int(0, 9),
      attributes,
      potential: clamp(overall + Math.max(0, 24 - age) * 1.6 + rng.int(-3, 6), overall, 97),
      wageCents: Math.round(Math.pow(level / 10, 3.1) * 1_200) * 100,
      contractUntil: `${SEASON_START_YEAR + rng.int(1, 4)}-06-30`,
      valueCents: Math.round(Math.pow(level / 10, 3.6) * 9_000) * 100
    });
  });
}

/**
 * De dónde es una ficha: media plantilla del país del club y media de fuera,
 * que es como se reparte cualquier plantilla europea de verdad.
 */
function nationalityFor(team: DatasetTeam): string {
  const roll = rng.int(0, NATIONALITIES.length - 1);
  return roll < NATIONALITIES.length / 2 ? team.country : (NATIONALITIES[roll] as string);
}

function uniqueName(flag: string, used: Set<string>): { firstName: string; lastName: string } {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const name = randomNameFor(flag, rng);
    const key = `${name.firstName} ${name.lastName}`;
    if (!used.has(key)) {
      used.add(key);
      return name;
    }
  }

  // Con doce fichas por vestuario esto no debería pasar, pero prefiero un
  // segundo apellido a un bucle infinito.
  const first = randomNameFor(flag, rng);
  const second = randomNameFor(flag, rng);
  const name = { firstName: first.firstName, lastName: `${first.lastName}-${second.lastName}` };
  used.add(`${name.firstName} ${name.lastName}`);
  return name;
}

function attributesFor(position: Position, level: number): PlayerAttributes {
  const bias = POSITION_BIAS[position];
  const attributes = {} as PlayerAttributes;

  for (const key of ATTRIBUTE_KEYS) {
    const value = level + (bias[key] ?? 0) + rng.int(-7, 7);
    attributes[key] = clamp(value, 15, 97);
  }

  return attributes;
}

/** Curva de edad de una plantilla real: mucho veinteañero, poco veterano. */
function weightedAge(): number {
  const roll = rng.next();
  if (roll < 0.18) return rng.int(18, 21);
  if (roll < 0.62) return rng.int(22, 27);
  if (roll < 0.9) return rng.int(28, 32);
  return rng.int(33, 38);
}

function birthDateFor(age: number): string {
  const year = SEASON_START_YEAR - age;
  const month = String(rng.int(1, 12)).padStart(2, '0');
  const day = String(rng.int(1, 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function neighbourPosition(position: Position): Position {
  const index = POSITIONS.indexOf(position);
  const offset = rng.chance(0.5) ? -1 : 1;
  return POSITIONS[clamp(index + offset, 0, POSITIONS.length - 1)] as Position;
}

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(
  OUTPUT,
  `${JSON.stringify(
    {
      version: 1,
      seed: SEED,
      seasonStartYear: SEASON_START_YEAR,
      competitions,
      teams,
      players
    },
    null,
    2
  )}\n`,
  'utf8'
);

console.log(
  `Dataset generado: ${competitions.length} competiciones, ${teams.length} equipos, ${players.length} jugadores -> ${OUTPUT}`
);
