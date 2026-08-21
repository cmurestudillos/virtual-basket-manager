import { describe, expect, it } from 'vitest';
import { computeStandings, headToHeadDifference, type PlayedGame } from '../standings';

const A = 'equipo-a';
const B = 'equipo-b';
const C = 'equipo-c';
const D = 'equipo-d';

function game(
  homeTeamId: string,
  homeScore: number,
  awayTeamId: string,
  awayScore: number
): PlayedGame {
  return { homeTeamId, awayTeamId, homeScore, awayScore };
}

describe('computeStandings', () => {
  it('ordena por victorias antes que por nada', () => {
    const standings = computeStandings(
      [A, B],
      [
        // B gana uno por paliza; A gana dos ajustados y va primero igualmente.
        game(A, 80, B, 78),
        game(A, 75, B, 74),
        game(B, 100, A, 60)
      ]
    );

    expect(standings[0]?.teamId).toBe(A);
    expect(standings[0]?.won).toBe(2);
    expect(standings[1]?.teamId).toBe(B);
  });

  it('desempata por el particular, no por la diferencia general', () => {
    // A y B empatan a una victoria. A ganó el enfrentamiento directo por 10,
    // pero B tiene mucha mejor diferencia general por una paliza a C.
    const standings = computeStandings(
      [A, B, C],
      [game(A, 90, B, 80), game(B, 120, C, 60), game(C, 81, A, 80), game(C, 70, B, 68)]
    );

    const posiciones = standings.map((row) => row.teamId);
    const a = standings.find((row) => row.teamId === A)!;
    const b = standings.find((row) => row.teamId === B)!;

    expect(a.won).toBe(1);
    expect(b.won).toBe(1);
    expect(b.pointsDifference).toBeGreaterThan(a.pointsDifference);
    // Aun así manda el particular: esto en fútbol saldría al revés.
    expect(posiciones.indexOf(A)).toBeLessThan(posiciones.indexOf(B));
  });

  it('cuenta el particular con la ida jugada y la vuelta no', () => {
    const games = [game(A, 90, B, 80)];

    expect(headToHeadDifference(A, B, games)).toBe(10);
    expect(headToHeadDifference(B, A, games)).toBe(-10);
  });

  it('cae en la diferencia general cuando el particular está igualado', () => {
    // Se reparten los dos enfrentamientos con el mismo margen: el particular
    // queda a cero y tiene que decidir la diferencia general.
    const games = [
      game(A, 90, B, 80),
      game(B, 90, A, 80),
      game(A, 100, C, 70),
      game(B, 85, C, 80),
      game(D, 70, A, 60),
      game(D, 70, B, 60)
    ];
    const standings = computeStandings([A, B, C, D], games);
    const posiciones = standings.map((row) => row.teamId);

    expect(headToHeadDifference(A, B, games)).toBe(0);
    expect(posiciones.indexOf(A)).toBeLessThan(posiciones.indexOf(B));
  });

  it('incluye a los equipos que todavía no han jugado', () => {
    const standings = computeStandings([A, B, C], [game(A, 80, B, 70)]);
    const c = standings.find((row) => row.teamId === C)!;

    expect(standings).toHaveLength(3);
    expect(c.played).toBe(0);
    // Queda por delante del que ha perdido: ambos tienen cero victorias y C
    // mejor diferencia. En el calendario del juego todos los equipos juegan
    // todas las jornadas, así que este empate a cero partidos no llega a darse
    // en una partida real; el caso está aquí para fijar el comportamiento.
    expect(c.position).toBe(2);
  });

  it('calcula la racha con signo', () => {
    const standings = computeStandings(
      [A, B],
      [game(A, 80, B, 70), game(A, 80, B, 70), game(B, 90, A, 60)]
    );

    const a = standings.find((row) => row.teamId === A)!;
    const b = standings.find((row) => row.teamId === B)!;

    expect(a.streak).toBe(-1);
    expect(b.streak).toBe(1);
  });

  it('ignora partidos de equipos ajenos a la competición', () => {
    const standings = computeStandings([A, B], [game(A, 80, B, 70), game(C, 90, D, 60)]);

    expect(standings).toHaveLength(2);
    expect(standings.every((row) => row.played === 1)).toBe(true);
  });
});
