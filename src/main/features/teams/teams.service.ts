import type { CatalogTeam, TeamSummary } from '@shared/contracts/teams.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { loadDataset } from '../saves/dataset';
import { TeamsRepository } from './teams.repository';

export class TeamsService {
  constructor(private readonly seedDirectory: string) {}

  list(): TeamSummary[] {
    return new TeamsRepository(requireActiveSaveDatabase()).list();
  }

  get(id: string): TeamSummary | null {
    return new TeamsRepository(requireActiveSaveDatabase()).findById(id);
  }

  /**
   * Equipos elegibles al empezar una partida. Se leen del dataset y no de
   * SQLite porque en ese momento todavía no existe ningún fichero de partida:
   * es justo la pantalla en la que el usuario decide a quién va a dirigir.
   */
  listCatalog(): CatalogTeam[] {
    const dataset = loadDataset(this.seedDirectory);
    const competitions = new Map(dataset.competitions.map((c) => [c.id, c.name]));

    return dataset.teams
      .map((team) => ({
        id: team.id,
        name: team.name,
        city: team.city,
        country: team.country,
        competitionId: team.competitionId,
        competitionName: competitions.get(team.competitionId) ?? team.competitionId,
        reputation: team.reputation
      }))
      .sort((a, b) => b.reputation - a.reputation);
  }
}
