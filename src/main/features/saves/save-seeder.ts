import { DEFAULT_TACTICS } from '@shared/domain/tactics';
import { buildAutomaticRotation } from '@shared/domain/rotation';
import type { SaveDatabase } from '../../database/client';
import {
  competitionsTable,
  gameStateTable,
  playersTable,
  rotationSlotsTable,
  teamsTable,
  teamTacticsTable
} from '../../database/schema/save';
import type { Dataset } from './dataset';

/**
 * Vuelca el dataset dentro del fichero de una partida recién creada y deja el
 * mundo en condiciones de jugarse: competiciones, equipos, plantillas, pizarra
 * por defecto y una rotación coherente para cada equipo (también los de la IA,
 * que si no saldrían a la cancha sin cinco inicial).
 */
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
        .values({ ...team, crest: null })
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
          gamesInjured: 0,
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
