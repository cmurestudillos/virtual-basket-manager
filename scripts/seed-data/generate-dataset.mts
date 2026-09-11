import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRng } from '../../src/shared/engine/basketball/rng';
import { POSITIONS, type Position } from '../../src/shared/domain/positions';
import {
  ATTRIBUTE_KEYS,
  overallForPosition,
  type PlayerAttributes
} from '../../src/shared/domain/attributes';

/**
 * Generador del dataset con el que arranca una partida nueva.
 *
 * Todo lo que produce es inventado: clubes, pabellones y jugadores. Ni nombres
 * ni escudos reales, y a propósito — un dataset con marcas reales condiciona
 * después qué se puede distribuir, y arrastrar ese problema desde el primer día
 * sale mucho más caro que evitarlo.
 *
 * Es determinista: misma semilla, mismo dataset, así que regenerarlo no cambia
 * la liga entera por sorpresa.
 *
 *   pnpm seed:generate
 */

const OUTPUT = resolve('resources/seed-data/dataset.json');
const SEED = 20260821;
const SEASON_START_YEAR = 2025;

const CITIES = [
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
  'Nueva Estrada'
];

const CLUB_PREFIXES = ['CB', 'Club Baloncesto', 'Basket', 'BC'];

const FIRST_NAMES = [
  'Álvaro',
  'Íñigo',
  'Rubén',
  'Sergi',
  'Mateo',
  'Nicolás',
  'Adrián',
  'Óscar',
  'Bruno',
  'Guillem',
  'Héctor',
  'Pau',
  'Marcos',
  'Ignacio',
  'Diego',
  'Aitor',
  'Jonás',
  'Emilio',
  'Rodrigo',
  'Kilian',
  'Darius',
  'Milan',
  'Tomas',
  'Andrei',
  'Ousmane',
  'Dwayne',
  'Marcus',
  'Trevor',
  'Kendrick',
  'Lamar'
];

const LAST_NAMES = [
  'Arroyo',
  'Bermúdez',
  'Cifuentes',
  'Delgado',
  'Escobar',
  'Fuentes',
  'Gallardo',
  'Herrera',
  'Iriarte',
  'Jáuregui',
  'Lorenzo',
  'Maldonado',
  'Nogales',
  'Olmedo',
  'Peñarroya',
  'Quesada',
  'Robledo',
  'Salgado',
  'Terrazas',
  'Ugarte',
  'Vidal',
  'Zabala',
  'Novak',
  'Petrovic',
  'Vasiliev',
  'Kowalski',
  'Diallo',
  'Okafor',
  'Brooks',
  'Whitaker'
];

const NATIONALITIES = [
  'ESP',
  'ESP',
  'ESP',
  'ESP',
  'ESP',
  'ESP',
  'ESP',
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
  'BRA'
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

const competitions: DatasetCompetition[] = [
  {
    id: 'liga-nacional',
    name: 'Liga Nacional',
    shortName: 'LN',
    country: 'ESP',
    rulesetId: 'fiba',
    tier: 1,
    format: 'league',
    // Ocho equipos a playoff al mejor de cinco: el formato ACB de toda la vida
    // y la diferencia estructural que este proyecto tiene y el de fútbol no.
    playoffTeams: 8,
    playoffSeriesLength: 5
  },
  {
    id: 'copa-nacional',
    name: 'Copa Nacional',
    shortName: 'Copa',
    country: 'ESP',
    rulesetId: 'fiba',
    tier: 1,
    format: 'cup',
    playoffTeams: 0,
    playoffSeriesLength: 1
  }
];

const teams: DatasetTeam[] = CITIES.map((city, index) => {
  const prefix = CLUB_PREFIXES[rng.int(0, CLUB_PREFIXES.length - 1)] as string;
  // La reputación va escalonada para que la liga tenga favoritos y colistas
  // desde el primer día, no dieciocho equipos calcados.
  const reputation = Math.round(78 - index * 2.4 + rng.int(-4, 4));

  return {
    id: `team-${index + 1}`,
    name: `${prefix} ${city}`,
    shortName: city.slice(0, 3).toUpperCase(),
    city,
    country: 'ESP',
    competitionId: 'liga-nacional',
    pavilionName: `Pabellón ${city}`,
    pavilionCapacity: 3200 + Math.round(reputation * 90) + rng.int(-400, 400),
    reputation,
    budgetCents: (900_000 + reputation * 55_000 + rng.int(-120_000, 120_000)) * 100
  };
});

const players: DatasetPlayer[] = [];
/** Nombres ya usados: dos "Pau Vidal" en la misma plantilla cantan mucho. */
const usedNames = new Set<string>();

function uniqueName(): { firstName: string; lastName: string } {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const firstName = FIRST_NAMES[rng.int(0, FIRST_NAMES.length - 1)] as string;
    const lastName = LAST_NAMES[rng.int(0, LAST_NAMES.length - 1)] as string;
    const key = `${firstName} ${lastName}`;
    if (!usedNames.has(key)) {
      usedNames.add(key);
      return { firstName, lastName };
    }
  }
  // Con 30x30 combinaciones y 216 fichas esto no debería pasar, pero si el
  // dataset crece prefiero un segundo apellido a un bucle infinito.
  const firstName = FIRST_NAMES[rng.int(0, FIRST_NAMES.length - 1)] as string;
  const lastName = `${LAST_NAMES[rng.int(0, LAST_NAMES.length - 1)]}-${LAST_NAMES[rng.int(0, LAST_NAMES.length - 1)]}`;
  usedNames.add(`${firstName} ${lastName}`);
  return { firstName, lastName };
}

for (const team of teams) {
  // Doce fichas por equipo: los inscritos en acta de un partido FIBA.
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

    const { firstName, lastName } = uniqueName();
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
      nationality: NATIONALITIES[rng.int(0, NATIONALITIES.length - 1)] as string,
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
  `${JSON.stringify({ version: 1, seed: SEED, seasonStartYear: SEASON_START_YEAR, competitions, teams, players }, null, 2)}\n`,
  'utf8'
);

console.log(
  `Dataset generado: ${competitions.length} competiciones, ${teams.length} equipos, ${players.length} jugadores -> ${OUTPUT}`
);
