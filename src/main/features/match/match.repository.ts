import { and, asc, eq } from 'drizzle-orm';
import type { Position } from '@shared/domain/positions';
import { RULESETS, type Ruleset } from '@shared/domain/rulesets';
import type { GameResult, PeriodScore } from '@shared/engine/basketball';
import type { SaveDatabase } from '../../database/client';
import {
  competitionsTable,
  gamePlayerStatsTable,
  gamesTable,
  gameStateTable,
  playersTable,
  rotationSlotsTable,
  seasonsTable,
  teamsTable,
  teamTacticsTable,
  type CompetitionRow,
  type GamePlayerStatsRow,
  type GameRow,
  type TeamTacticsRow
} from '../../database/schema/save';

export interface PlayerCard {
  id: string;
  name: string;
  position: Position;
  depth: number;
}

export class MatchRepository {
  constructor(private readonly db: SaveDatabase) {}

  findGame(gameId: string): GameRow | null {
    return this.db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).get() ?? null;
  }

  /** Reglamento con el que se juega ese partido: lo fija su competición. */
  rulesetForGame(gameId: string): Ruleset {
    const row = this.db
      .select({ rulesetId: competitionsTable.rulesetId })
      .from(gamesTable)
      .innerJoin(seasonsTable, eq(seasonsTable.id, gamesTable.seasonId))
      .innerJoin(competitionsTable, eq(competitionsTable.id, seasonsTable.competitionId))
      .where(eq(gamesTable.id, gameId))
      .get();

    return RULESETS[(row?.rulesetId as keyof typeof RULESETS) ?? 'fiba'] ?? RULESETS.fiba;
  }

  /** Competición a la que pertenece el partido: de ahí sale el formato de playoffs. */
  competitionForGame(gameId: string): CompetitionRow | null {
    const row = this.db
      .select({ competition: competitionsTable })
      .from(gamesTable)
      .innerJoin(seasonsTable, eq(seasonsTable.id, gamesTable.seasonId))
      .innerJoin(competitionsTable, eq(competitionsTable.id, seasonsTable.competitionId))
      .where(eq(gamesTable.id, gameId))
      .get();

    return row?.competition ?? null;
  }

  managedTeamId(): string | null {
    return this.db.select().from(gameStateTable).get()?.managedTeamId ?? null;
  }

  currentDate(): Date {
    return this.db.select().from(gameStateTable).get()?.currentDate ?? new Date();
  }

  teamName(teamId: string): string {
    return this.db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).get()?.name ?? teamId;
  }

  /**
   * Fichas de los jugadores de un equipo con su sitio en la rotación, para
   * poder pintar el acta en el orden en el que se lee un acta de verdad:
   * titulares primero y suplentes después, no alfabéticamente.
   */
  playerCards(teamId: string): Map<string, PlayerCard> {
    const roster = this.db
      .select()
      .from(playersTable)
      .where(and(eq(playersTable.teamId, teamId), eq(playersTable.isYouth, false)))
      .all();
    const depths = new Map(
      this.db
        .select()
        .from(rotationSlotsTable)
        .where(eq(rotationSlotsTable.teamId, teamId))
        .all()
        .map((slot) => [slot.playerId, slot.depth])
    );

    return new Map(
      roster.map((row) => [
        row.id,
        {
          id: row.id,
          name: `${row.firstName} ${row.lastName}`,
          position: row.position as Position,
          // Un jugador fuera de la rotación va al final del acta, no el primero.
          depth: depths.get(row.id) ?? 99
        }
      ])
    );
  }

  /** Pizarra de un equipo: lo que el analista es capaz de leerle al rival. */
  teamTactics(teamId: string): TeamTacticsRow | null {
    return (
      this.db.select().from(teamTacticsTable).where(eq(teamTacticsTable.teamId, teamId)).get() ??
      null
    );
  }

  playerName(playerId: string): string | null {
    const row = this.db.select().from(playersTable).where(eq(playersTable.id, playerId)).get();
    return row ? `${row.firstName} ${row.lastName}` : null;
  }

  listBoxScores(gameId: string): GamePlayerStatsRow[] {
    return this.db
      .select()
      .from(gamePlayerStatsTable)
      .where(eq(gamePlayerStatsTable.gameId, gameId))
      .orderBy(asc(gamePlayerStatsTable.id))
      .all();
  }

  /**
   * Guarda el resultado y el acta completa.
   *
   * En una transacción porque son 25 escrituras que sólo tienen sentido juntas:
   * un partido con marcador pero sin acta dejaría las estadísticas de la
   * temporada mintiendo para siempre.
   */
  saveResult(game: GameRow, result: GameResult, playedOn: Date): void {
    this.db.transaction((tx) => {
      tx.update(gamesTable)
        .set({
          homeScore: result.home.score,
          awayScore: result.away.score,
          periodScores: JSON.stringify(result.periods),
          overtimes: result.overtimes,
          playedOn,
          seed: result.seed
        })
        .where(eq(gamesTable.id, game.id))
        .run();

      for (const [teamId, teamResult] of [
        [game.homeTeamId, result.home] as const,
        [game.awayTeamId, result.away] as const
      ]) {
        for (const line of teamResult.boxScores) {
          tx.insert(gamePlayerStatsTable)
            .values({
              id: `${game.id}-${line.playerId}`,
              gameId: game.id,
              playerId: line.playerId,
              teamId,
              secondsPlayed: line.secondsPlayed,
              twoPointMade: line.twoPointMade,
              twoPointAttempted: line.twoPointAttempted,
              threePointMade: line.threePointMade,
              threePointAttempted: line.threePointAttempted,
              freeThrowMade: line.freeThrowMade,
              freeThrowAttempted: line.freeThrowAttempted,
              offensiveRebounds: line.offensiveRebounds,
              defensiveRebounds: line.defensiveRebounds,
              assists: line.assists,
              steals: line.steals,
              blocks: line.blocks,
              turnovers: line.turnovers,
              fouls: line.fouls,
              foulsDrawn: line.foulsDrawn,
              plusMinus: line.plusMinus
            })
            .run();
        }
      }
    });
  }

  /** Parciales guardados de un partido ya jugado. */
  parsePeriodScores(game: GameRow): PeriodScore[] {
    if (!game.periodScores) {
      return [];
    }
    try {
      return JSON.parse(game.periodScores) as PeriodScore[];
    } catch {
      // Un acta con los parciales corruptos sigue teniendo marcador válido; es
      // mejor enseñar el partido sin parciales que reventar la pantalla.
      return [];
    }
  }
}
