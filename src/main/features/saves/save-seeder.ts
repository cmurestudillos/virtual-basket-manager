import { DEFAULT_TACTICS } from '@shared/domain/tactics';
import { overallForPosition } from '@shared/domain/attributes';
import { POSITIONS, type Position } from '@shared/domain/positions';
import type { SaveDatabase } from '../../database/client';
import {
  competitionsTable,
  gameStateTable,
  playersTable,
  rotationSlotsTable,
  teamsTable,
  teamTacticsTable
} from '../../database/schema/save';
import type { Dataset, DatasetPlayer } from './dataset';

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
      for (const slot of buildRotation(team.id, roster)) {
        tx.insert(rotationSlotsTable).values(slot).run();
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

/**
 * Rotación inicial de un equipo: el mejor de cada posición sale de titular y el
 * resto se ordena por nivel.
 *
 * Se hace aquí, al sembrar, y no al simular el primer partido: así el usuario
 * ve una alineación razonable nada más entrar en su equipo, y los equipos de la
 * IA tienen una desde el minuto cero sin que nadie la toque.
 */
function buildRotation(
  teamId: string,
  roster: readonly DatasetPlayer[]
): {
  id: string;
  teamId: string;
  playerId: string;
  depth: number;
  slotPosition: string;
  targetMinutes: number;
}[] {
  const remaining = [...roster];
  const starters: DatasetPlayer[] = [];

  for (const position of POSITIONS) {
    const best = bestFor(remaining, position);
    if (best) {
      starters.push(best);
      remaining.splice(remaining.indexOf(best), 1);
    }
  }

  const bench = remaining.sort(
    (a, b) =>
      overallForPosition(b.attributes, b.position) - overallForPosition(a.attributes, a.position)
  );

  // Reparto de minutos por puesto en la rotación; suma 200, los cinco huecos de
  // pista durante 40 minutos.
  const minutesByDepth = [32, 30, 29, 28, 27, 16, 14, 12, 7, 3, 1, 1];

  return [...starters, ...bench].map((player, depth) => ({
    id: `${teamId}-rot-${depth}`,
    teamId,
    playerId: player.id,
    depth,
    slotPosition: depth < POSITIONS.length ? (POSITIONS[depth] as Position) : player.position,
    targetMinutes: minutesByDepth[depth] ?? 0
  }));
}

/**
 * Mejor jugador disponible para un puesto del quinteto.
 *
 * Va por prioridades y no por una media común: primero los de esa posición
 * natural, después los que la tienen como segunda, y sólo si no queda nadie,
 * cualquiera. Mezclarlas en un mismo montón dejaba quintetos con dos pívots y
 * ningún alero, porque un escolta bueno con el alero como segunda posición le
 * ganaba el puesto al alero titular.
 */
function bestFor(candidates: readonly DatasetPlayer[], position: Position): DatasetPlayer | null {
  const natural = candidates.filter((player) => player.position === position);
  const secondary = candidates.filter((player) => player.secondaryPosition === position);
  const pool = natural.length > 0 ? natural : secondary.length > 0 ? secondary : candidates;
  if (pool.length === 0) {
    return null;
  }

  return pool.reduce((best, candidate) =>
    overallForPosition(candidate.attributes, position) >
    overallForPosition(best.attributes, position)
      ? candidate
      : best
  );
}
