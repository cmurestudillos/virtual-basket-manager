import type { PlayerSummary } from '@shared/contracts/players.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { toPlayerSummary } from './players.mapper';
import { PlayersRepository } from './players.repository';

export class PlayersService {
  listByTeam(teamId: string): PlayerSummary[] {
    const repository = new PlayersRepository(requireActiveSaveDatabase());
    const today = repository.currentDate();

    return (
      repository
        .listByTeam(teamId)
        .map((row) => toPlayerSummary(row, today))
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
    return row ? toPlayerSummary(row, repository.currentDate()) : null;
  }
}

function positionRank(position: PlayerSummary['position']): number {
  return ['PG', 'SG', 'SF', 'PF', 'C'].indexOf(position);
}
