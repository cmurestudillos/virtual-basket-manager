import { overallForPosition } from '@shared/domain/attributes';
import { MIN_NATIONAL_POOL, nationName, nationStrength } from '@shared/domain/national-teams';
import type {
  CatalogLeague,
  CatalogScope,
  CatalogTeam,
  TeamSummary
} from '@shared/contracts/teams.contract';
import {
  countryName,
  estimateContinentalGames,
  estimateCountryGames,
  estimateNationalGames
} from '@shared/domain/simulation-scope';
import type { SaveDatabase } from '../../database/save-database';
import { loadDataset } from '../saves/dataset';
import { applyWorldEdits, type WorldEdit } from '../world-editor/apply-world-edits';
import { TeamsRepository, type TeamWithContext } from './teams.repository';

export class TeamsService {
  constructor(
    private readonly seedDirectory: string,
    /**
     * Las ediciones del mundo base. El catálogo de «Nueva partida» tiene que
     * enseñar el mundo editado: si no, se elige un club con un nombre y la
     * partida nace con otro.
     */
    private readonly worldEdits: () => readonly WorldEdit[],
    /** La partida activa. Ver el porqué del resolutor en `SeasonService`. */
    private readonly resolveDb: () => SaveDatabase
  ) {}

  private world() {
    return applyWorldEdits(loadDataset(this.seedDirectory), this.worldEdits());
  }

  list(): TeamSummary[] {
    const repository = new TeamsRepository(this.resolveDb());
    const managedTeamId = repository.managedTeamId();
    return repository.list().map((row) => toSummary(row, managedTeamId));
  }

  get(id: string): TeamSummary | null {
    const repository = new TeamsRepository(this.resolveDb());
    const row = repository.findById(id);
    return row ? toSummary(row, repository.managedTeamId()) : null;
  }

  /**
   * Equipos elegibles al empezar una partida. Se leen del dataset y no de
   * SQLite porque en ese momento todavía no existe ningún fichero de partida:
   * es justo la pantalla en la que el usuario decide a quién va a dirigir.
   */
  listCatalog(): CatalogTeam[] {
    const dataset = this.world();
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
    const dataset = this.world();
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
          countryName: countryName(competition.country),
          tier: competition.tier,
          teams: sizes.get(competition.id) ?? 0,
          isHome: competition.id === home
        }))
        // Por país y por categoría: es como las busca quien está eligiendo club.
        .sort((a, b) => a.country.localeCompare(b.country) || a.tier - b.tier)
    );
  }

  /**
   * Los países jugables y las continentales de cada continente, con su coste
   * en partidos por temporada. Sale del mundo base, como el catálogo: se elige
   * antes de que exista la partida.
   */
  listScope(): CatalogScope {
    const dataset = this.world();
    const sizes = new Map<string, number>();
    for (const team of dataset.teams) {
      sizes.set(team.competitionId, (sizes.get(team.competitionId) ?? 0) + 1);
    }

    const leagues = dataset.competitions.filter((row) => row.format === 'league');
    const codes = [...new Set(leagues.map((row) => row.country))];

    const countries = codes
      .map((code) => {
        const own = leagues
          .filter((row) => row.country === code)
          .sort((a, b) => a.tier - b.tier)
          .map((row) => ({
            competitionId: row.id,
            name: row.name,
            tier: row.tier,
            teams: sizes.get(row.id) ?? 0,
            playoffTeams: row.playoffTeams,
            playoffSeriesLength: row.playoffSeriesLength
          }));
        const hasCup = dataset.competitions.some(
          (row) => row.format === 'cup' && row.country === code
        );

        return {
          code,
          name: countryName(code),
          continent: leagues.find((row) => row.country === code)?.continent ?? '',
          leagues: own.map(({ competitionId, name, tier, teams }) => ({
            competitionId,
            name,
            tier,
            teams
          })),
          hasCup,
          games: estimateCountryGames(own, hasCup)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const continents = [...new Set(countries.map((row) => row.continent))].map((code) => {
      const competitions = dataset.competitions.filter(
        (row) => row.format === 'continental' && row.continent === code
      ).length;
      return { code, competitions, games: competitions * estimateContinentalGames() };
    });

    // Selecciones: las mismas cuentas que hará la partida al crearlas.
    const byNationality = new Map<string, number[]>();
    for (const player of dataset.players) {
      const overalls = byNationality.get(player.nationality) ?? [];
      overalls.push(overallForPosition(player.attributes, player.position));
      byNationality.set(player.nationality, overalls);
    }
    const nations = [...byNationality.entries()]
      .filter(([, overalls]) => overalls.length >= MIN_NATIONAL_POOL)
      .map(([code, overalls]) => ({
        code,
        name: nationName(code),
        strength: nationStrength(overalls),
        players: overalls.length
      }))
      .sort((a, b) => b.strength - a.strength || a.code.localeCompare(b.code))
      .map(({ code, name, players }, index) => ({ code, name, players, rank: index + 1 }));

    return { countries, continents, nations, nationalGames: estimateNationalGames(nations.length) };
  }
}

/**
 * Lo que sale hacia la pantalla de un club. La caja sólo del club que dirige el
 * usuario: la de los demás no se ve desde fuera, y mandarla al renderer era
 * enseñarla a quien abriera las herramientas de desarrollo.
 */
function toSummary(row: TeamWithContext, managedTeamId: string | null): TeamSummary {
  return {
    ...row,
    budgetCents: row.id === managedTeamId ? row.budgetCents : null,
    // Los entrenadores de la IA todavía no existen: el hueco queda preparado.
    coach: null
  };
}
