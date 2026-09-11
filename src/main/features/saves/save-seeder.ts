import { randomUUID } from 'node:crypto';
import { DEFAULT_TACTICS } from '@shared/domain/tactics';
import { randomName } from '@shared/domain/names';
import { STAFF_ROLES, staffLevelForReputation } from '@shared/domain/staff';
import { createRng, seedFromString } from '@shared/engine/basketball/rng';
import { buildAutomaticRotation } from '@shared/domain/rotation';
import { DEFAULT_TRAINING_FOCUS, DEFAULT_TRAINING_INTENSITY } from '@shared/domain/training';
import {
  DEFAULT_SUPPORT,
  DEFAULT_TICKET_PRICE_CENTS,
  renewSeasonTickets
} from '@shared/domain/attendance';
import type { SaveDatabase } from '../../database/client';
import {
  competitionsTable,
  gameStateTable,
  playersTable,
  rotationSlotsTable,
  staffTable,
  teamsTable,
  teamTacticsTable,
  teamTrainingTable
} from '../../database/schema/save';
import { buildFreeAgents } from '../market/free-agent-factory';
import { buildYouthPlayers } from '../youth/youth-factory';
import type { Dataset } from './dataset';

/**
 * Vuelca el dataset dentro del fichero de una partida recién creada y deja el
 * mundo en condiciones de jugarse: competiciones, equipos, plantillas, pizarra
 * por defecto y una rotación coherente para cada equipo (también los de la IA,
 * que si no saldrían a la cancha sin cinco inicial).
 */
/** Nivel de cantera con el que arranca cualquier club. */
const DEFAULT_YOUTH_LEVEL = 2;
/** Técnicos libres en el mercado al empezar la partida. */
const FREE_STAFF = 14;
/** Y jugadores sin equipo. */
const FREE_AGENTS = 20;

export function seedSave(
  db: SaveDatabase,
  dataset: Dataset,
  options: { managedTeamId: string; managerName: string }
): void {
  // Todo en una transacción: una partida a medio sembrar es peor que ninguna.
  db.transaction((tx) => {
    for (const competition of dataset.competitions) {
      tx.insert(competitionsTable).values(competition).run();
    }

    for (const team of dataset.teams) {
      tx.insert(teamsTable)
        .values({
          ...team,
          crest: null,
          ticketPriceCents: DEFAULT_TICKET_PRICE_CENTS,
          fanSupport: DEFAULT_SUPPORT,
          // Se arranca con el pabellón medio abonado, como cualquier club que
          // lleva años jugando: la temporada no empieza de cero.
          seasonTicketHolders: renewSeasonTickets({
            capacity: team.pavilionCapacity,
            fanSupport: DEFAULT_SUPPORT,
            ticketPriceCents: DEFAULT_TICKET_PRICE_CENTS
          })
        })
        .run();
      tx.insert(teamTacticsTable)
        .values({
          teamId: team.id,
          offensiveSystem: DEFAULT_TACTICS.offensiveSystem,
          defensiveSystem: DEFAULT_TACTICS.defensiveSystem,
          pace: DEFAULT_TACTICS.pace,
          defensiveIntensity: DEFAULT_TACTICS.defensiveIntensity,
          offensiveReboundEffort: DEFAULT_TACTICS.offensiveReboundEffort,
          focusPlayerId: null
        })
        .run();
      tx.insert(teamTrainingTable)
        .values({
          teamId: team.id,
          intensity: DEFAULT_TRAINING_INTENSITY,
          focus: DEFAULT_TRAINING_FOCUS
        })
        .run();
    }

    for (const player of dataset.players) {
      tx.insert(playersTable)
        .values({
          id: player.id,
          teamId: player.teamId,
          firstName: player.firstName,
          lastName: player.lastName,
          nationality: player.nationality,
          birthDate: new Date(player.birthDate),
          position: player.position,
          secondaryPosition: player.secondaryPosition,
          heightCm: player.heightCm,
          weightKg: player.weightKg,
          wingspanCm: player.wingspanCm,
          photo: null,
          // Los atributos se enumeran uno a uno en vez de esparcir el objeto:
          // la columna se llama `basketballIq` y el atributo `basketballIQ`,
          // así que un spread metería una clave que la tabla no tiene.
          close: player.attributes.close,
          midRange: player.attributes.midRange,
          threePoint: player.attributes.threePoint,
          freeThrow: player.attributes.freeThrow,
          finishing: player.attributes.finishing,
          passing: player.attributes.passing,
          handling: player.attributes.handling,
          driving: player.attributes.driving,
          perimeterDefense: player.attributes.perimeterDefense,
          interiorDefense: player.attributes.interiorDefense,
          steal: player.attributes.steal,
          block: player.attributes.block,
          offensiveRebound: player.attributes.offensiveRebound,
          defensiveRebound: player.attributes.defensiveRebound,
          speed: player.attributes.speed,
          strength: player.attributes.strength,
          jumping: player.attributes.jumping,
          stamina: player.attributes.stamina,
          basketballIq: player.attributes.basketballIQ,
          consistency: player.attributes.consistency,
          aggression: player.attributes.aggression,
          potential: player.potential,
          condition: 100,
          morale: 70,
          injuryDaysLeft: 0,
          injuryName: null,
          trainingFocus: null,
          wageCents: player.wageCents,
          contractUntil: new Date(player.contractUntil),
          valueCents: player.valueCents
        })
        .run();
    }

    for (const team of dataset.teams) {
      const roster = dataset.players.filter((player) => player.teamId === team.id);
      for (const entry of buildAutomaticRotation(roster)) {
        tx.insert(rotationSlotsTable)
          .values({ id: `${team.id}-rot-${entry.depth}`, teamId: team.id, ...entry })
          .run();
      }
    }

    // Cuerpo técnico y cantera: los tiene todo el mundo, no sólo el usuario.
    for (const team of dataset.teams) {
      const rng = createRng(seedFromString(`${team.id}-club`));
      const level = staffLevelForReputation(team.reputation);

      for (const role of STAFF_ROLES) {
        tx.insert(staffTable)
          .values({
            id: randomUUID(),
            teamId: team.id,
            ...randomName(rng),
            role,
            level: clamp(level + rng.int(-1, 1), 1, 5)
          })
          .run();
      }

      for (const row of buildYouthPlayers({
        teamId: team.id,
        level: DEFAULT_YOUTH_LEVEL,
        count: rng.int(3, 5),
        rng,
        seasonStartYear: dataset.seasonStartYear,
        nationality: team.country
      })) {
        tx.insert(playersTable).values(row).run();
      }
    }

    // Agentes libres: sin ellos, el primer mercado sólo se podría jugar pagando
    // traspasos y un club modesto no tendría nada que hacer.
    for (const row of buildFreeAgents({
      count: FREE_AGENTS,
      rng: createRng(seedFromString('agentes-libres')),
      seasonStartYear: dataset.seasonStartYear,
      nationality: 'ESP'
    })) {
      tx.insert(playersTable).values(row).run();
    }

    // Mercado de técnicos libres: sin él, el cuerpo técnico no sería una
    // decisión, sería una ficha que se mira una vez.
    const marketRng = createRng(seedFromString('mercado-tecnicos'));
    for (let index = 0; index < FREE_STAFF; index += 1) {
      tx.insert(staffTable)
        .values({
          id: randomUUID(),
          teamId: null,
          ...randomName(marketRng),
          role: STAFF_ROLES[marketRng.int(0, STAFF_ROLES.length - 1)] as string,
          level: marketRng.int(1, 5)
        })
        .run();
    }

    tx.insert(gameStateTable)
      .values({
        id: 'singleton',
        managedTeamId: options.managedTeamId,
        managerName: options.managerName,
        // 1 de septiembre del año en que arranca la temporada: pretemporada.
        currentDate: new Date(Date.UTC(dataset.seasonStartYear, 8, 1)),
        seasonNumber: 1
      })
      .run();
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
