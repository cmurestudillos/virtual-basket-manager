import type { PlayerSummary } from '@shared/contracts/players.contract';
import {
  saveRotationRequestSchema,
  teamIdRequestSchema,
  type RotationSlotView,
  type SaveRotationRequest,
  type TeamRotation
} from '@shared/contracts/rotation.contract';
import { POSITIONS, outOfPositionPenalty, type Position } from '@shared/domain/positions';
import {
  LINEUP_SIZE,
  REGULATION_TEAM_MINUTES,
  buildAutomaticRotation,
  slotPositionForDepth,
  type RotationCandidate,
  type RotationEntry
} from '@shared/domain/rotation';
import type { SaveDatabase } from '../../database/save-database';
import type { NewRotationSlotRow } from '../../database/schema/save';
import { toPlayerSummary } from '../players/players.mapper';
import { RotationRepository } from './rotation.repository';

export class TeamNotFoundError extends Error {
  constructor(teamId: string) {
    super(`No existe el equipo ${teamId}`);
    this.name = 'TeamNotFoundError';
  }
}

export class NotManagedTeamError extends Error {
  constructor(teamId: string) {
    super(`El equipo ${teamId} no lo dirige el usuario`);
    this.name = 'NotManagedTeamError';
  }
}

export class InvalidRotationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidRotationError';
  }
}

/**
 * Alineación y reparto de minutos.
 *
 * La plantilla entera es la rotación: todos los jugadores tienen un puesto, y
 * los que no van a jugar figuran con cero minutos en vez de quedarse fuera de
 * la lista. Así el editor enseña siempre a los doce y el motor no se queda sin
 * recambios cuando se acumulan las faltas.
 */
export class RotationService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  get(teamId: string): TeamRotation {
    const validated = teamIdRequestSchema.parse({ teamId });
    const repository = new RotationRepository(this.resolveDb());
    const { roster, teamName } = this.requireTeam(repository, validated.teamId);

    const known = new Set(roster.map((player) => player.id));
    const stored: RotationEntry[] = repository
      .listSlots(validated.teamId)
      .filter((slot) => known.has(slot.playerId))
      .map((slot) => ({
        playerId: slot.playerId,
        depth: slot.depth,
        slotPosition: slot.slotPosition as Position,
        targetMinutes: slot.targetMinutes
      }));

    // Una plantilla sin rotación guardada no debe pintar una pantalla vacía: se
    // propone la automática sin escribirla, y se guarda si el usuario la acepta.
    const entries =
      stored.length === 0
        ? buildAutomaticRotation(toCandidates(roster))
        : appendMissing(stored, roster);

    return this.toRotation(repository, validated.teamId, teamName, roster, entries);
  }

  save(request: SaveRotationRequest): TeamRotation {
    const validated = saveRotationRequestSchema.parse(request);
    const repository = new RotationRepository(this.resolveDb());
    const { roster, teamName } = this.requireTeam(repository, validated.teamId);
    this.requireManaged(repository, validated.teamId);

    const entries = normalizeEntries(validated.slots, roster);
    repository.replaceSlots(validated.teamId, toRows(validated.teamId, entries));

    return this.toRotation(repository, validated.teamId, teamName, roster, entries);
  }

  /** Rotación automática: la misma que propone el juego al crear la partida. */
  auto(teamId: string): TeamRotation {
    const validated = teamIdRequestSchema.parse({ teamId });
    const repository = new RotationRepository(this.resolveDb());
    const { roster, teamName } = this.requireTeam(repository, validated.teamId);
    this.requireManaged(repository, validated.teamId);

    const entries = buildAutomaticRotation(toCandidates(roster));
    repository.replaceSlots(validated.teamId, toRows(validated.teamId, entries));

    return this.toRotation(repository, validated.teamId, teamName, roster, entries);
  }

  // ------------------------------------------------------------------------

  private requireTeam(
    repository: RotationRepository,
    teamId: string
  ): { roster: PlayerSummary[]; teamName: string } {
    const teamName = repository.findTeamName(teamId);
    if (!teamName) {
      throw new TeamNotFoundError(teamId);
    }

    const today = repository.currentDate();
    const roster = repository.listRoster(teamId).map((row) => toPlayerSummary(row, today));
    if (roster.length < LINEUP_SIZE) {
      throw new InvalidRotationError(`El equipo ${teamId} no tiene cinco jugadores`);
    }

    return { roster, teamName };
  }

  private requireManaged(repository: RotationRepository, teamId: string): void {
    if (repository.managedTeamId() !== teamId) {
      throw new NotManagedTeamError(teamId);
    }
  }

  private toRotation(
    repository: RotationRepository,
    teamId: string,
    teamName: string,
    roster: readonly PlayerSummary[],
    entries: readonly RotationEntry[]
  ): TeamRotation {
    const byId = new Map(roster.map((player) => [player.id, player]));
    const slots = entries.map((entry) =>
      toSlotView(entry, byId.get(entry.playerId) as PlayerSummary)
    );

    return {
      teamId,
      teamName,
      slots,
      totalTargetMinutes: slots.reduce((total, slot) => total + slot.targetMinutes, 0),
      regulationTeamMinutes: REGULATION_TEAM_MINUTES,
      isManaged: repository.managedTeamId() === teamId
    };
  }
}

function toSlotView(entry: RotationEntry, player: PlayerSummary): RotationSlotView {
  return {
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    position: player.position,
    secondaryPosition: player.secondaryPosition,
    overall: player.overall,
    condition: player.condition,
    depth: entry.depth,
    slotPosition: entry.slotPosition,
    targetMinutes: entry.targetMinutes,
    isStarter: entry.depth < LINEUP_SIZE,
    positionFit: Math.round(outOfPositionPenalty(player.position, entry.slotPosition) * 100)
  };
}

function toCandidates(roster: readonly PlayerSummary[]): RotationCandidate[] {
  return roster.map((player) => ({
    id: player.id,
    position: player.position,
    secondaryPosition: player.secondaryPosition,
    attributes: player.attributes
  }));
}

/** Los jugadores sin puesto van al final, con cero minutos: existen, pero no juegan. */
function appendMissing(
  entries: readonly RotationEntry[],
  roster: readonly PlayerSummary[]
): RotationEntry[] {
  const placed = new Set(entries.map((entry) => entry.playerId));
  const missing = roster.filter((player) => !placed.has(player.id));

  return [...entries]
    .sort((a, b) => a.depth - b.depth)
    .concat(
      missing.map((player, index) => ({
        playerId: player.id,
        depth: entries.length + index,
        slotPosition: player.position,
        targetMinutes: 0
      }))
    )
    .map((entry, depth) => ({ ...entry, depth }));
}

/**
 * Sanea lo que llega del editor antes de tocar la base de datos.
 *
 * Reordena por profundidad y la vuelve a numerar desde cero, fuerza los huecos
 * de pista —el quinteto ocupa del 1 al 5 y el banquillo figura en su posición
 * natural— y exige que el cinco inicial cubra las cinco posiciones: un quinteto
 * con dos bases y ningún pívot no es una alineación, es un fallo de la pantalla.
 */
function normalizeEntries(
  slots: SaveRotationRequest['slots'],
  roster: readonly PlayerSummary[]
): RotationEntry[] {
  const byId = new Map(roster.map((player) => [player.id, player]));
  const seen = new Set<string>();

  for (const slot of slots) {
    if (!byId.has(slot.playerId)) {
      throw new InvalidRotationError(`El jugador ${slot.playerId} no está en la plantilla`);
    }
    if (seen.has(slot.playerId)) {
      throw new InvalidRotationError(`El jugador ${slot.playerId} aparece dos veces`);
    }
    seen.add(slot.playerId);
  }

  const ordered = [...slots].sort((a, b) => a.depth - b.depth);
  const starters = ordered.slice(0, LINEUP_SIZE);
  if (new Set(starters.map((slot) => slot.slotPosition)).size !== LINEUP_SIZE) {
    throw new InvalidRotationError('El cinco inicial tiene que cubrir las cinco posiciones');
  }

  // El motor coloca a los titulares en el orden 1-5, así que el quinteto se
  // guarda ordenado por hueco y no por como lo haya movido el usuario.
  const sortedStarters = [...starters].sort(
    (a, b) => POSITIONS.indexOf(a.slotPosition) - POSITIONS.indexOf(b.slotPosition)
  );

  return [...sortedStarters, ...ordered.slice(LINEUP_SIZE)].map((slot, depth) => ({
    playerId: slot.playerId,
    depth,
    slotPosition: slotPositionForDepth(depth, (byId.get(slot.playerId) as PlayerSummary).position),
    targetMinutes: slot.targetMinutes
  }));
}

function toRows(teamId: string, entries: readonly RotationEntry[]): NewRotationSlotRow[] {
  return entries.map((entry) => ({
    id: `${teamId}-rot-${entry.depth}`,
    teamId,
    playerId: entry.playerId,
    depth: entry.depth,
    slotPosition: entry.slotPosition,
    targetMinutes: entry.targetMinutes
  }));
}
