import type { BoardView } from '@shared/contracts/club.contract';
import {
  BOARD_OBJECTIVE_LABELS,
  DISMISSAL_CONFIDENCE,
  START_CONFIDENCE,
  confidenceAfterGame,
  confidenceAfterMonth,
  confidenceAfterSeason,
  confidenceLabel,
  objectiveForReputation,
  seasonVerdict,
  targetPositionFor,
  type BoardObjective,
  type SeasonVerdict
} from '@shared/domain/board';
import type { SaveDatabase } from '../../database/save-database';
import type { BoardRow } from '../../database/schema/save';
import { ClubRepository } from './club.repository';

export class NoManagedTeamError extends Error {
  constructor() {
    super('La partida no tiene equipo asignado');
    this.name = 'NoManagedTeamError';
  }
}

/**
 * El consejo del club.
 *
 * Vive en la misma feature que las finanzas porque comparte con ellas lo que le
 * importa: a un consejo se le cae la paciencia por los resultados **y** por las
 * cuentas, y las dos cosas se leen de la misma fila de equipo. Separarlos
 * obligaría a que una feature leyera el repositorio de la otra.
 *
 * No sabe de clasificaciones: el puesto se lo pasa quien lo llama, que es quien
 * tiene delante la tabla. Así no hay una dependencia circular con la temporada.
 */
export class BoardService {
  /** Ver el porqué del resolutor en {@link SeasonService}. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  /**
   * Objetivo de la temporada. Se fija la primera vez y se renueva al cambiar de
   * curso, siempre a partir de lo que es el club: al grande le piden el título
   * y al pequeño mantenerse.
   */
  ensureForSeason(seasonNumber: number, teams: number): BoardRow {
    const repository = new ClubRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    if (!teamId) {
      throw new NoManagedTeamError();
    }

    const existing = repository.findBoard(teamId);
    if (existing && existing.seasonNumber === seasonNumber) {
      return existing;
    }

    const team = repository.findTeam(teamId);
    const objective = objectiveForReputation(team?.reputation ?? 50);
    const row: BoardRow = {
      teamId,
      seasonNumber,
      objective,
      targetPosition: targetPositionFor(objective, teams),
      // La confianza no se reinicia de una temporada a otra: lo que se hizo el
      // año pasado es justo lo que decide cuánta cuerda te queda este.
      confidence: existing?.confidence ?? START_CONFIDENCE,
      dismissed: existing?.dismissed ?? false
    };
    repository.upsertBoard(row);

    return row;
  }

  /** Cómo lo ve el consejo, con el puesto que le pasen. */
  get(position: number | null, teams: number, playoffRound = 0, champion = false): BoardView {
    const repository = new ClubRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    if (!teamId) {
      throw new NoManagedTeamError();
    }

    const row = repository.findBoard(teamId) ?? this.ensureForSeason(1, teams);
    const team = repository.findTeam(teamId);
    const objective = row.objective as BoardObjective;

    return {
      teamId,
      teamName: team?.name ?? teamId,
      seasonNumber: row.seasonNumber,
      objective,
      objectiveLabel: BOARD_OBJECTIVE_LABELS[objective],
      targetPosition: row.targetPosition,
      position,
      confidence: row.confidence,
      confidenceLabel: confidenceLabel(row.confidence),
      dismissed: row.dismissed,
      verdict: seasonVerdict({
        objective,
        position: position ?? teams,
        teams,
        playoffRound,
        champion
      })
    };
  }

  /**
   * Un partido del equipo del usuario.
   *
   * Perder contra quien tenías que ganar pesa el triple que caer en la cancha
   * del primero, así que aquí se mira la reputación de los dos y quién jugaba
   * en casa: eso es lo que convierte un tropiezo en un aviso.
   */
  afterManagedGame(game: {
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
  }): void {
    const repository = new ClubRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    if (!teamId || (game.homeTeamId !== teamId && game.awayTeamId !== teamId)) {
      return;
    }

    const isHome = game.homeTeamId === teamId;
    const own = repository.findTeam(teamId);
    const rival = repository.findTeam(isHome ? game.awayTeamId : game.homeTeamId);
    const ownScore = isHome ? game.homeScore : game.awayScore;
    const rivalScore = isHome ? game.awayScore : game.homeScore;

    this.update((row) => ({
      ...row,
      confidence: confidenceAfterGame(row.confidence, {
        won: ownScore > rivalScore,
        expectedToWin: (own?.reputation ?? 50) + (isHome ? 6 : 0) >= (rival?.reputation ?? 50)
      })
    }));
  }

  /**
   * Revisión de primero de mes: dónde está el equipo y cómo está la caja. El
   * saldo lo lee de la ficha del club, que es donde vive.
   */
  monthlyReview(position: number): void {
    const repository = new ClubRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    const balanceCents = teamId ? (repository.findTeam(teamId)?.budgetCents ?? 0) : 0;

    this.update((row) => ({
      ...row,
      confidence: confidenceAfterMonth(row.confidence, {
        position,
        targetPosition: row.targetPosition,
        balanceCents
      })
    }));
  }

  /**
   * Cierre de curso: el veredicto pesa mucho más que cualquier partido suelto.
   *
   * El objetivo es del consejo, así que el veredicto lo saca él: quien llama
   * sólo aporta cómo terminó el equipo.
   */
  closeSeason(result: {
    position: number;
    teams: number;
    playoffRound: number;
    champion: boolean;
  }): SeasonVerdict | null {
    const repository = new ClubRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    const row = teamId ? repository.findBoard(teamId) : null;
    if (!row) {
      return null;
    }

    const verdict = seasonVerdict({
      objective: row.objective as BoardObjective,
      position: result.position,
      teams: result.teams,
      playoffRound: result.playoffRound,
      champion: result.champion
    });

    this.update((current) => ({
      ...current,
      confidence: confidenceAfterSeason(current.confidence, verdict)
    }));

    return verdict;
  }

  /** ¿Sigues siendo el entrenador? */
  isDismissed(): boolean {
    const repository = new ClubRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    return teamId ? (repository.findBoard(teamId)?.dismissed ?? false) : false;
  }

  // ------------------------------------------------------------------------

  private update(change: (row: BoardRow) => BoardRow): void {
    const repository = new ClubRepository(this.resolveDb());
    const teamId = repository.managedTeamId();
    if (!teamId) {
      return;
    }

    const row = repository.findBoard(teamId);
    if (!row || row.dismissed) {
      return;
    }

    const next = change(row);
    repository.upsertBoard({
      ...next,
      // A cero se acabó: no hay segunda oportunidad a mitad de temporada.
      dismissed: next.confidence <= DISMISSAL_CONFIDENCE
    });
  }
}
