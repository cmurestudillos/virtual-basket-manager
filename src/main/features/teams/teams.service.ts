import type { CatalogLeague, CatalogTeam, TeamSummary } from '@shared/contracts/teams.contract';
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

  /**
   * Las ligas del mundo, con cuántos clubes tiene cada una.
   *
   * Sólo las de formato liga: en una competición continental no se empieza una
   * partida, se entra clasificándose.
   */
  listLeagues(): CatalogLeague[] {
    const dataset = loadDataset(this.seedDirectory);
    const sizes = new Map<string, number>();
    for (const team of dataset.teams) {
      sizes.set(team.competitionId, (sizes.get(team.competitionId) ?? 0) + 1);
    }

    const leagues = dataset.competitions.filter((competition) => competition.format === 'league');
    const home = leagues[0]?.id;

    return (
      leagues
        .map((competition) => ({
          competitionId: competition.id,
          name: competition.name,
          country: competition.country,
          tier: competition.tier,
          teams: sizes.get(competition.id) ?? 0,
          isHome: competition.id === home
        }))
        // Por país y por categoría: es como las busca quien está eligiendo club.
        .sort((a, b) => a.country.localeCompare(b.country) || a.tier - b.tier)
    );
  }
}
