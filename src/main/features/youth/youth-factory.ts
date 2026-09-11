import { randomUUID } from 'node:crypto';
import { randomName } from '@shared/domain/names';
import { generateProspect } from '@shared/domain/youth';
import type { Rng } from '@shared/engine/basketball/rng';
import type { NewPlayerRow } from '../../database/schema/save';

export interface IntakeInput {
  teamId: string;
  /** Instalaciones de la cantera, 1-5. */
  level: number;
  count: number;
  rng: Rng;
  /** Año de arranque de la temporada: de ahí sale la fecha de nacimiento. */
  seasonStartYear: number;
  nationality: string;
}

/**
 * Convierte lo que dice el dominio de cantera en filas de jugador.
 *
 * La comparten el sembrado de la partida y la hornada de cada verano: un
 * juvenil generado al crear la partida y uno que sale en 2031 tienen que ser la
 * misma clase de cosa.
 */
export function buildYouthPlayers(input: IntakeInput): NewPlayerRow[] {
  const rows: NewPlayerRow[] = [];

  for (let index = 0; index < input.count; index += 1) {
    const prospect = generateProspect(input.level, input.rng);
    const { firstName, lastName } = randomName(input.rng);

    rows.push({
      id: randomUUID(),
      teamId: input.teamId,
      firstName,
      lastName,
      nationality: input.nationality,
      birthDate: new Date(
        Date.UTC(input.seasonStartYear - prospect.age, input.rng.int(0, 11), input.rng.int(1, 28))
      ),
      position: prospect.position,
      secondaryPosition: prospect.secondaryPosition,
      heightCm: prospect.heightCm,
      weightKg: Math.round((prospect.heightCm - 100) * 0.88),
      wingspanCm: prospect.heightCm + input.rng.int(0, 8),
      photo: null,
      close: prospect.attributes.close,
      midRange: prospect.attributes.midRange,
      threePoint: prospect.attributes.threePoint,
      freeThrow: prospect.attributes.freeThrow,
      finishing: prospect.attributes.finishing,
      passing: prospect.attributes.passing,
      handling: prospect.attributes.handling,
      driving: prospect.attributes.driving,
      perimeterDefense: prospect.attributes.perimeterDefense,
      interiorDefense: prospect.attributes.interiorDefense,
      steal: prospect.attributes.steal,
      block: prospect.attributes.block,
      offensiveRebound: prospect.attributes.offensiveRebound,
      defensiveRebound: prospect.attributes.defensiveRebound,
      speed: prospect.attributes.speed,
      strength: prospect.attributes.strength,
      jumping: prospect.attributes.jumping,
      stamina: prospect.attributes.stamina,
      basketballIq: prospect.attributes.basketballIQ,
      consistency: prospect.attributes.consistency,
      aggression: prospect.attributes.aggression,
      potential: prospect.potential,
      condition: 100,
      morale: 70,
      injuryDaysLeft: 0,
      injuryName: null,
      trainingFocus: null,
      isYouth: true,
      // Un juvenil cobra poco y su valor está en el techo, no en lo que es hoy.
      wageCents: prospect.potential * 400_00,
      contractUntil: new Date(Date.UTC(input.seasonStartYear + 3, 5, 30)),
      valueCents: prospect.potential * prospect.potential * 1_200
    });
  }

  return rows;
}
