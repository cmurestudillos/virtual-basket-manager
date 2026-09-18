import type { PlayerSummary } from '@shared/contracts/players.contract';
import type { SaveDatabase } from '../../database/save-database';
import { nationalSquad, userNationalTeamId } from '../national/national-squad';
import { StaffService } from '../staff/staff.service';
import { toPlayerSummary, withoutMorale } from './players.mapper';
import { PlayersRepository } from './players.repository';
import { scoutPlayer, scoutingErrorFor } from './scouting';

export class PlayersService {
  /** Ver el porqué del resolutor en `SeasonService`. */
  constructor(private readonly resolveDb: () => SaveDatabase) {}

  listByTeam(teamId: string): PlayerSummary[] {
    const db = this.resolveDb();
    const repository = new PlayersRepository(db);
    const today = repository.currentDate();
    const error = this.scoutingErrorFor(repository, teamId);
    const mine = this.ownPlayerIds(db, repository, today);

    return (
      repository
        .listByTeam(teamId)
        .map((row) => visible(scoutPlayer(toPlayerSummary(row, today), error), mine))
        // Ordenados por puesto (1 a 5) y luego por media: es como se lee una
        // plantilla de baloncesto, no alfabéticamente.
        .sort(
          (a, b) => positionRank(a.position) - positionRank(b.position) || b.overall - a.overall
        )
    );
  }

  get(id: string): PlayerSummary | null {
    const db = this.resolveDb();
    const repository = new PlayersRepository(db);
    const row = repository.findById(id);
    if (!row) {
      return null;
    }

    const today = repository.currentDate();
    return visible(
      scoutPlayer(toPlayerSummary(row, today), this.scoutingErrorFor(repository, row.teamId)),
      this.ownPlayerIds(db, repository, today)
    );
  }

  /**
   * Cuánto margen de error tiene lo que ves de un jugador.
   *
   * Los tuyos los conoces: cero. De los de fuera ves lo que te cuente tu
   * ojeador, y sin ojeador, muy poco. Es lo que evita que el mercado se juegue
   * mirando números exactos.
   */
  private scoutingErrorFor(repository: PlayersRepository, teamId: string | null): number {
    const managedTeamId = repository.managedTeamId();
    const level = managedTeamId ? new StaffService(this.resolveDb).levels(managedTeamId).scout : 0;

    return scoutingErrorFor(level, Boolean(teamId) && teamId === managedTeamId);
  }

  /**
   * De quién ve el usuario la moral: su club y los convocados de su selección.
   * A esos los dirige él —la alineación de la selección pinta su ánimo—; del
   * resto no se sabe cómo está el vestuario.
   */
  private ownPlayerIds(
    db: SaveDatabase,
    repository: PlayersRepository,
    today: Date
  ): (player: PlayerSummary) => boolean {
    const managedTeamId = repository.managedTeamId();
    const nationalTeamId = userNationalTeamId(db);
    const called = nationalTeamId
      ? new Set(nationalSquad(db, nationalTeamId, today).map((row) => row.id))
      : new Set<string>();

    return (player) =>
      (managedTeamId !== null && player.teamId === managedTeamId) || called.has(player.id);
  }
}

function visible(player: PlayerSummary, isMine: (player: PlayerSummary) => boolean): PlayerSummary {
  return isMine(player) ? player : withoutMorale(player);
}

function positionRank(position: PlayerSummary['position']): number {
  return ['PG', 'SG', 'SF', 'PF', 'C'].indexOf(position);
}
