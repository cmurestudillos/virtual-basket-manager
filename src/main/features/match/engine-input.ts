import { and, asc, eq } from 'drizzle-orm';
import { POSITIONS, type Position } from '@shared/domain/positions';
import { LINEUP_SIZE } from '@shared/domain/rotation';
import type { TeamTactics } from '@shared/domain/tactics';
import { DEFAULT_TACTICS } from '@shared/domain/tactics';
import type { EnginePlayer, EngineTeam } from '@shared/engine/basketball';
import type { SaveDatabase } from '../../database/client';
import {
  playersTable,
  rotationSlotsTable,
  teamsTable,
  teamTacticsTable,
  type PlayerRow
} from '../../database/schema/save';

/**
 * Traduce lo que hay en la base de datos a lo que entiende el motor.
 *
 * Es la única costura entre los dos mundos: el motor no sabe que existe SQLite
 * y la base de datos no sabe que existe el motor. Todo lo que el motor necesita
 * —convocados, cinco inicial, pizarra— sale de aquí.
 */
export function buildEngineTeam(db: SaveDatabase, teamId: string): EngineTeam {
  const team = db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get();
  if (!team) {
    throw new Error(`No existe el equipo ${teamId}`);
  }

  // Los juveniles no se visten: para el motor, la plantilla es el primer equipo.
  const roster = db
    .select()
    .from(playersTable)
    .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
    .all();
  const rotation = db
    .select()
    .from(rotationSlotsTable)
    .where(eq(rotationSlotsTable.teamId, teamId))
    .orderBy(asc(rotationSlotsTable.depth))
    .all();

  // Los lesionados no se visten. Si no quedaran cinco sanos —plantilla
  // diezmada— se convoca igualmente a quien haga falta: un partido no se
  // suspende, y es mejor jugar tocado que no presentarse.
  const healthy = roster.filter((row) => row.injuryDaysLeft === 0);
  const available = healthy.length >= LINEUP_SIZE ? healthy : roster;

  const byId = new Map(available.map((row) => [row.id, row]));
  // El orden de la rotación manda: el motor reparte minutos por profundidad, y
  // un jugador que esté en la plantilla pero no en la rotación va al final.
  const ordered = [
    ...rotation.map((slot) => byId.get(slot.playerId)).filter((row): row is PlayerRow => !!row),
    ...available.filter((row) => !rotation.some((slot) => slot.playerId === row.id))
  ];

  const tactics = db
    .select()
    .from(teamTacticsTable)
    .where(eq(teamTacticsTable.teamId, teamId))
    .get();

  return {
    id: team.id,
    name: team.name,
    players: ordered.map(toEnginePlayer),
    // El motor coloca a los titulares en los huecos 1 a 5 por el orden en el
    // que los recibe, así que se ordenan por el hueco que tienen asignado y no
    // por profundidad: si el usuario cambia de sitio a dos titulares, el base
    // debe seguir saliendo de base.
    starters: rotation
      .filter((slot) => slot.depth < LINEUP_SIZE && byId.has(slot.playerId))
      .slice(0, LINEUP_SIZE)
      .sort((a, b) => slotOrder(a.slotPosition) - slotOrder(b.slotPosition))
      .map((slot) => slot.playerId),
    minutesTargets: Object.fromEntries(
      rotation
        .filter((slot) => byId.has(slot.playerId))
        .map((slot) => [slot.playerId, slot.targetMinutes])
    ),
    tactics: toTactics(tactics)
  };
}

function slotOrder(slotPosition: string): number {
  const index = POSITIONS.indexOf(slotPosition as Position);
  // Un hueco desconocido va al final en vez de colarse en el puesto de base.
  return index < 0 ? POSITIONS.length : index;
}

function toEnginePlayer(row: PlayerRow): EnginePlayer {
  return {
    id: row.id,
    name: `${row.firstName} ${row.lastName}`,
    position: row.position as Position,
    condition: row.condition,
    attributes: {
      close: row.close,
      midRange: row.midRange,
      threePoint: row.threePoint,
      freeThrow: row.freeThrow,
      finishing: row.finishing,
      passing: row.passing,
      handling: row.handling,
      driving: row.driving,
      perimeterDefense: row.perimeterDefense,
      interiorDefense: row.interiorDefense,
      steal: row.steal,
      block: row.block,
      offensiveRebound: row.offensiveRebound,
      defensiveRebound: row.defensiveRebound,
      speed: row.speed,
      strength: row.strength,
      jumping: row.jumping,
      stamina: row.stamina,
      basketballIQ: row.basketballIq,
      consistency: row.consistency,
      aggression: row.aggression
    }
  };
}

function toTactics(row: typeof teamTacticsTable.$inferSelect | undefined): TeamTactics {
  if (!row) {
    return { ...DEFAULT_TACTICS };
  }

  return {
    offensiveSystem: row.offensiveSystem as TeamTactics['offensiveSystem'],
    defensiveSystem: row.defensiveSystem as TeamTactics['defensiveSystem'],
    pace: row.pace,
    defensiveIntensity: row.defensiveIntensity,
    offensiveReboundEffort: row.offensiveReboundEffort,
    focusPlayerId: row.focusPlayerId
  };
}
