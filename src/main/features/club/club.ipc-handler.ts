import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { ExpandArenaRequest, SetTicketPriceRequest } from '@shared/contracts/club.contract';
import { requireActiveSaveDatabase } from '../../database/resolve-save-database';
import { SeasonService } from '../season/season.service';
import { BoardService } from './board.service';
import { ClubService } from './club.service';

/**
 * Aquí se cruzan el club y la competición: la previsión de taquilla necesita
 * saber quién viene de visitante y el consejo necesita el puesto en la tabla.
 * Ese cruce vive en el cableado y no en los servicios, que es lo que mantiene
 * al club sin saber nada de calendarios y a la temporada sin saber de dinero.
 */
export function registerClubIpcHandlers(): void {
  const club = new ClubService(requireActiveSaveDatabase);
  const board = new BoardService(requireActiveSaveDatabase);
  const season = new SeasonService(requireActiveSaveDatabase);

  ipcMain.handle(IPC_CHANNELS.clubGetFinances, (_event, teamId: string) =>
    club.getFinances(teamId, nextHomeOpponent(season, teamId))
  );
  ipcMain.handle(IPC_CHANNELS.clubSetTicketPrice, (_event, request: SetTicketPriceRequest) =>
    club.setTicketPrice(request)
  );
  ipcMain.handle(IPC_CHANNELS.clubExpandArena, (_event, request: ExpandArenaRequest) =>
    club.expandArena(request)
  );
  ipcMain.handle(IPC_CHANNELS.clubGetBoard, () => {
    const standings = season.getStandings();
    const managed = standings.find((row) => row.isManaged);
    const run = playoffRun(season, managed?.teamId);

    return board.get(managed?.position ?? null, standings.length, run.round, run.champion);
  });
}

/** Rival del próximo partido en casa, para poder prever la taquilla. */
function nextHomeOpponent(season: SeasonService, teamId: string): string | null {
  const next = season
    .listTeamFixtures(teamId)
    .find((fixture) => !fixture.played && fixture.homeTeamId === teamId);

  return next?.awayTeamId ?? null;
}

/** Hasta dónde llegó el equipo en el cuadro: 0 fuera, 1 cuartos, 2 semis, 3 final. */
function playoffRun(
  season: SeasonService,
  teamId: string | undefined
): { round: number; champion: boolean } {
  const bracket = teamId ? season.getPlayoffs() : null;
  if (!bracket || !teamId) {
    return { round: 0, champion: false };
  }

  const round = bracket.rounds.reduce(
    (deepest, entry) =>
      entry.series.some(
        (series) => series.higherSeedTeamId === teamId || series.lowerSeedTeamId === teamId
      )
        ? Math.max(deepest, entry.round)
        : deepest,
    0
  );

  return { round, champion: bracket.championTeamId === teamId };
}
