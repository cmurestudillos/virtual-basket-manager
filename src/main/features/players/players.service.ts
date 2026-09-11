import type { PlayerSummary } from '@shared/contracts/players.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { StaffService } from '../staff/staff.service';
import { toPlayerSummary } from './players.mapper';
import { PlayersRepository } from './players.repository';
import { scoutPlayer, scoutingErrorFor } from './scouting';

export class PlayersService {
  listByTeam(teamId: string): PlayerSummary[] {
    const repository = new PlayersRepository(requireActiveSaveDatabase());
    const today = repository.currentDate();
    const error = this.scoutingErrorFor(repository, teamId);

    return (
      repository
        .listByTeam(teamId)
        .map((row) => scoutPlayer(toPlayerSummary(row, today), error))
        // Ordenados por puesto (1 a 5) y luego por media: es como se lee una
        // plantilla de baloncesto, no alfabéticamente.
        .sort(
          (a, b) => positionRank(a.position) - positionRank(b.position) || b.overall - a.overall
        )
    );
  }

  get(id: string): PlayerSummary | null {
    const repository = new PlayersRepository(requireActiveSaveDatabase());
    const row = repository.findById(id);
    if (!row) {
      return null;
    }

    return scoutPlayer(
      toPlayerSummary(row, repository.currentDate()),
      this.scoutingErrorFor(repository, row.teamId)
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
    const level = managedTeamId
      ? new StaffService(requireActiveSaveDatabase).levels(managedTeamId).scout
      : 0;

    return scoutingErrorFor(level, Boolean(teamId) && teamId === managedTeamId);
  }
}

function positionRank(position: PlayerSummary['position']): number {
  return ['PG', 'SG', 'SF', 'PF', 'C'].indexOf(position);
}
