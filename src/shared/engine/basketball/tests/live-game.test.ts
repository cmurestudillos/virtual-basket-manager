import { describe, expect, it } from 'vitest';
import { FIBA_RULESET } from '@shared/domain/rulesets';
import { GameSimulation, simulateGame } from '../simulate-game';
import { buildTestTeam } from './test-teams';

/**
 * El partido en vivo: el motor parando entre posesiones y obedeciendo órdenes.
 *
 * Lo primero que se comprueba aquí, y lo más importante, es que **ver el
 * partido no lo cambia**: jugarlo posesión a posesión tiene que dar exactamente
 * el mismo partido que jugarlo de una tacada. Lo demás —cambios, tiempos
 * muertos, pizarra— son decisiones del entrenador, y esas sí deben notarse.
 */

function build(gameId = 'vivo-1'): GameSimulation {
  return new GameSimulation({
    gameId,
    home: buildTestTeam('local', 60),
    away: buildTestTeam('visitante', 58),
    ruleset: FIBA_RULESET
  });
}

describe('posesión a posesión', () => {
  it('sale el mismo partido que jugándolo de una tacada', () => {
    const live = build();
    while (!live.isFinished) {
      live.playPossession();
    }

    const oneGo = simulateGame({
      gameId: 'vivo-1',
      home: buildTestTeam('local', 60),
      away: buildTestTeam('visitante', 58),
      ruleset: FIBA_RULESET
    });

    expect(live.result).toEqual(oneGo);
  });

  it('el reloj del cuarto baja con cada posesión y se agota al acabarlo', () => {
    const live = build();
    expect(live.clockSeconds).toBe(FIBA_RULESET.periodMinutes * 60);

    live.playPossession();
    expect(live.clockSeconds).toBeLessThan(FIBA_RULESET.periodMinutes * 60);
    expect(live.isPeriodInProgress).toBe(true);

    while (live.playPossession()) {
      // hasta el final del cuarto
    }
    expect(live.isPeriodInProgress).toBe(false);
    expect(live.playedPeriods).toBe(1);
    expect(live.nextPeriod).toBe(2);
  });

  it('un cuarto jugado a posesiones deja el mismo parcial que playPeriod', () => {
    const porPosesiones = build();
    while (porPosesiones.playPossession()) {
      // un cuarto
    }

    const porCuartos = build();
    porCuartos.playPeriod();

    expect(porPosesiones.result.periods).toEqual(porCuartos.result.periods);
  });
});

describe('cambios del entrenador', () => {
  it('mete al suplente por el titular y le pasa el mando del banquillo', () => {
    const live = build();
    live.playPossession();

    const antes = live.liveBench('local')!;
    const sale = antes.players.find((player) => player.onCourt)!;
    const entra = antes.players.find((player) => !player.onCourt)!;
    expect(antes.autoRotation).toBe(true);

    expect(live.orderSubstitution('local', sale.playerId, entra.playerId)).toEqual({ ok: true });

    const despues = live.liveBench('local')!;
    expect(despues.players.find((p) => p.playerId === sale.playerId)!.onCourt).toBe(false);
    expect(despues.players.find((p) => p.playerId === entra.playerId)!.onCourt).toBe(true);
    // El que entra ocupa el hueco del que sale, no su posición natural.
    expect(despues.players.find((p) => p.playerId === entra.playerId)!.playedPosition).toBe(
      sale.playedPosition
    );
    // A partir de aquí manda él: el motor deja de rotarle el equipo.
    expect(despues.autoRotation).toBe(false);
    expect(live.liveBench('visitante')!.autoRotation).toBe(true);
  });

  it('el cambio queda apuntado en la retransmisión', () => {
    const live = build();
    live.playPossession();

    const bench = live.liveBench('local')!;
    const sale = bench.players.find((player) => player.onCourt)!;
    const entra = bench.players.find((player) => !player.onCourt)!;
    live.orderSubstitution('local', sale.playerId, entra.playerId);

    const cambio = live.result.events.filter(
      (event) => event.type === 'substitution' && event.playerId === entra.playerId
    );
    expect(cambio).toHaveLength(1);
    expect(cambio[0]!.secondaryPlayerId).toBe(sale.playerId);
  });

  it('rechaza con su motivo lo que no se puede hacer', () => {
    const live = build();
    live.playPossession();

    const bench = live.liveBench('local')!;
    const enPista = bench.players.filter((player) => player.onCourt);
    const enBanquillo = bench.players.filter((player) => !player.onCourt);

    expect(live.orderSubstitution('nadie', enPista[0]!.playerId, enBanquillo[0]!.playerId)).toEqual(
      {
        ok: false,
        reason: 'Ese equipo no juega este partido'
      }
    );
    // Sacar a uno que ya está sentado, o meter a uno que ya juega.
    expect(
      live.orderSubstitution('local', enBanquillo[0]!.playerId, enBanquillo[1]!.playerId).ok
    ).toBe(false);
    expect(live.orderSubstitution('local', enPista[0]!.playerId, enPista[1]!.playerId).ok).toBe(
      false
    );
    expect(live.orderSubstitution('local', enPista[0]!.playerId, 'fantasma').ok).toBe(false);
  });

  it('con el mando cogido, el motor ya no deshace el cambio', () => {
    const live = build();
    live.playPossession();

    const bench = live.liveBench('local')!;
    const sale = bench.players.find((player) => player.onCourt)!;
    const entra = bench.players.find((player) => !player.onCourt)!;
    live.orderSubstitution('local', sale.playerId, entra.playerId);

    // Un cuarto entero después, el que entró sigue en pista si nadie lo saca.
    while (live.playPossession()) {
      // resto del cuarto
    }
    const tras = live.liveBench('local')!;
    expect(tras.players.find((p) => p.playerId === entra.playerId)!.onCourt).toBe(true);
  });

  it('se le puede devolver la rotación al motor', () => {
    const live = build();
    live.playPossession();
    const bench = live.liveBench('local')!;
    live.orderSubstitution(
      'local',
      bench.players.find((p) => p.onCourt)!.playerId,
      bench.players.find((p) => !p.onCourt)!.playerId
    );
    expect(live.liveBench('local')!.autoRotation).toBe(false);

    live.setAutoRotation('local', true);
    expect(live.liveBench('local')!.autoRotation).toBe(true);
  });
});

describe('tiempos muertos', () => {
  it('gasta uno, devuelve piernas a los de pista y lo cuenta', () => {
    const live = build();
    // Unas cuantas posesiones para que haya cansancio que recuperar.
    for (let i = 0; i < 20; i += 1) {
      live.playPossession();
    }

    const antes = live.liveBench('local')!;
    const frescuraAntes = antes.players
      .filter((player) => player.onCourt)
      .reduce((sum, player) => sum + player.freshness, 0);

    expect(live.callTimeout('local')).toEqual({ ok: true });

    const despues = live.liveBench('local')!;
    const frescuraDespues = despues.players
      .filter((player) => player.onCourt)
      .reduce((sum, player) => sum + player.freshness, 0);

    expect(despues.timeoutsLeft).toBe(antes.timeoutsLeft - 1);
    expect(frescuraDespues).toBeGreaterThan(frescuraAntes);
    expect(live.result.events.some((event) => event.type === 'timeout')).toBe(true);
    // El rival no gasta el suyo porque lo pida el otro.
    expect(live.liveBench('visitante')!.timeoutsLeft).toBe(FIBA_RULESET.timeoutsPerGame);
  });

  it('se acaban, y entonces ya no hay más', () => {
    const live = build();
    live.playPossession();

    for (let i = 0; i < FIBA_RULESET.timeoutsPerGame; i += 1) {
      expect(live.callTimeout('local').ok).toBe(true);
    }
    expect(live.liveBench('local')!.timeoutsLeft).toBe(0);
    expect(live.callTimeout('local')).toEqual({ ok: false, reason: 'No quedan tiempos muertos' });
  });

  it('no se pide con el cuarto sin empezar', () => {
    const live = build();
    expect(live.callTimeout('local').ok).toBe(false);
  });
});

describe('la pizarra sobre la marcha', () => {
  it('cambiar de defensa a mitad de partido cambia cómo se juega', () => {
    const conCambio = build();
    const sinCambio = build();

    for (let i = 0; i < 30; i += 1) {
      conCambio.playPossession();
      sinCambio.playPossession();
    }
    expect(conCambio.result.home.score).toBe(sinCambio.result.home.score);

    conCambio.setTactics('local', { defensiveSystem: 'zone23', defensiveIntensity: 9 });

    while (!conCambio.isFinished) conCambio.playPossession();
    while (!sinCambio.isFinished) sinCambio.playPossession();

    // No se comprueba quién gana —eso es cosa del dado— sino que el partido
    // dejó de ser el mismo a partir de la orden.
    expect(conCambio.result.events.length).not.toBe(sinCambio.result.events.length);
  });

  it('subir el ritmo acorta las posesiones', () => {
    const lento = build();
    const rapido = build();
    rapido.setTactics('local', { pace: 10 });
    rapido.setTactics('visitante', { pace: 10 });

    lento.playPeriod();
    rapido.playPeriod();

    const posesiones = (game: GameSimulation): number =>
      game.result.events.filter((event) => event.type === 'periodStart').length +
      game.result.home.boxScores.reduce(
        (sum, line) => sum + line.twoPointAttempted + line.threePointAttempted,
        0
      );

    expect(posesiones(rapido)).toBeGreaterThan(posesiones(lento));
  });

  it('no acepta órdenes de un equipo que no juega este partido', () => {
    const live = build();
    expect(live.setTactics('otro', { pace: 9 }).ok).toBe(false);
    expect(live.setAutoRotation('otro', false).ok).toBe(false);
    expect(live.liveBench('otro')).toBeNull();
  });
});
