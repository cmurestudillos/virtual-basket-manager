import { describe, expect, it } from 'vitest';
import { DANGER_CONFIDENCE } from '../board';
import {
  diffSnapshots,
  expiringContractDrafts,
  type ClubSnapshot,
  type InboxNames
} from '../inbox';

/**
 * Qué merece un aviso.
 *
 * La bandeja no escucha a los servicios: compara la foto de antes con la de
 * ahora. Así que lo que se comprueba aquí es exactamente eso, pares de fotos y
 * los avisos que salen — y, sobre todo, los que **no** tienen que salir, porque
 * una bandeja que avisa de todo es una bandeja que nadie lee.
 */

const DIA_1 = Date.UTC(2025, 8, 1);
const DIA_2 = Date.UTC(2025, 8, 2);

function snapshot(overrides: Partial<ClubSnapshot> = {}): ClubSnapshot {
  return {
    teamId: 'club',
    competitionId: 'liga',
    seasonNumber: 1,
    date: DIA_1,
    injured: {},
    squad: ['base', 'escolta', 'alero', 'ala-pivot', 'pivot'],
    confidence: 60,
    dismissed: false,
    champions: {},
    lastGameId: null,
    ...overrides
  };
}

const names: InboxNames = {
  player: (id) => `Jugador ${id}`,
  team: (id) => `Equipo ${id}`,
  competition: (id) => (id === 'plata' ? 'Liga Plata' : 'Liga Nacional'),
  tier: (id) => (id === 'plata' ? 2 : 1),
  seasonCompetition: () => 'liga'
};

describe('sin cambios, sin avisos', () => {
  it('dos fotos iguales no dan ni un aviso', () => {
    expect(diffSnapshots(snapshot(), snapshot(), names)).toEqual([]);
  });

  it('la cuenta atrás de una baja no es noticia', () => {
    const antes = snapshot({ injured: { base: { name: 'Esguince', days: 10 } } });
    const ahora = snapshot({ injured: { base: { name: 'Esguince', days: 6 } } });

    expect(diffSnapshots(antes, ahora, names)).toEqual([]);
  });

  it('la confianza que sube y baja sin cruzar la raya no es noticia', () => {
    expect(
      diffSnapshots(snapshot({ confidence: 60 }), snapshot({ confidence: 48 }), names)
    ).toEqual([]);
  });
});

describe('lesiones', () => {
  it('avisa de una lesión nueva y lleva a la ficha del jugador', () => {
    const avisos = diffSnapshots(
      snapshot(),
      snapshot({ injured: { base: { name: 'Rotura fibrilar', days: 28 } } }),
      names
    );

    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.category).toBe('injury');
    expect(avisos[0]!.title).toContain('Jugador base');
    expect(avisos[0]!.body).toContain('Rotura fibrilar');
    expect(avisos[0]!.body).toContain('4 semanas');
    expect(avisos[0]!.route).toEqual({ name: 'player', params: { playerId: 'base' } });
  });

  it('una recaída distinta es otra lesión', () => {
    const avisos = diffSnapshots(
      snapshot({ injured: { base: { name: 'Contusión', days: 2 } } }),
      snapshot({ injured: { base: { name: 'Esguince de tobillo', days: 14 } } }),
      names
    );

    expect(avisos.map((aviso) => aviso.category)).toEqual(['injury']);
  });

  it('avisa del alta, pero no si el jugador se ha ido del club', () => {
    const alta = diffSnapshots(
      snapshot({ injured: { base: { name: 'Esguince', days: 1 } } }),
      snapshot(),
      names
    );
    expect(alta.map((aviso) => aviso.category)).toEqual(['recovery']);

    const seFue = diffSnapshots(
      snapshot({ injured: { base: { name: 'Esguince', days: 1 } } }),
      snapshot({ squad: ['escolta', 'alero', 'ala-pivot', 'pivot'] }),
      names
    );
    expect(seFue.some((aviso) => aviso.category === 'recovery')).toBe(false);
  });
});

describe('plantilla', () => {
  it('lo que hace el usuario sin que corra el reloj no se le cuenta', () => {
    // Fichar a uno y ceder a otro el mismo día: son sus decisiones, no noticias.
    const avisos = diffSnapshots(
      snapshot(),
      snapshot({ squad: ['escolta', 'alero', 'ala-pivot', 'pivot', 'fichaje'] }),
      names
    );

    expect(avisos).toEqual([]);
  });

  it('pero una lesión el mismo día sí es noticia: los partidos no mueven el calendario', () => {
    const avisos = diffSnapshots(
      snapshot(),
      snapshot({ injured: { base: { name: 'Esguince', days: 8 } } }),
      names
    );

    expect(avisos.map((aviso) => aviso.category)).toEqual(['injury']);
  });

  it('cuenta quién llega y quién se va cuando lo ha movido el mundo', () => {
    const avisos = diffSnapshots(
      snapshot(),
      snapshot({ date: DIA_2, squad: ['escolta', 'alero', 'ala-pivot', 'pivot', 'fichaje'] }),
      names
    );

    expect(avisos).toHaveLength(2);
    expect(avisos.find((aviso) => aviso.title.includes('llega'))?.title).toContain('fichaje');
    expect(avisos.find((aviso) => aviso.title.includes('deja'))?.title).toContain('base');
  });
});

describe('el consejo', () => {
  it('avisa al cruzar la raya de peligro, en los dos sentidos', () => {
    const abajo = diffSnapshots(
      snapshot({ confidence: DANGER_CONFIDENCE + 5 }),
      snapshot({ confidence: DANGER_CONFIDENCE - 5 }),
      names
    );
    expect(abajo.map((aviso) => aviso.title)).toEqual(['El consejo se impacienta']);

    const arriba = diffSnapshots(
      snapshot({ confidence: DANGER_CONFIDENCE - 5 }),
      snapshot({ confidence: DANGER_CONFIDENCE + 5 }),
      names
    );
    expect(arriba.map((aviso) => aviso.title)).toEqual(['El consejo respira']);
  });

  it('el despido tapa al aviso de impaciencia: no se cuentan las dos cosas', () => {
    const avisos = diffSnapshots(
      snapshot({ confidence: 40 }),
      snapshot({ confidence: 0, dismissed: true }),
      names
    );

    expect(avisos.map((aviso) => aviso.title)).toEqual(['Destituido']);
  });
});

describe('títulos y categorías', () => {
  it('distingue el título propio del ajeno', () => {
    const propio = diffSnapshots(snapshot(), snapshot({ champions: { t1: 'club' } }), names);
    expect(propio[0]!.title).toBe('¡Campeones de Liga Nacional!');
    expect(propio[0]!.route).toEqual({ name: 'history' });

    const ajeno = diffSnapshots(snapshot(), snapshot({ champions: { t1: 'rival' } }), names);
    expect(ajeno[0]!.title).toBe('Equipo rival gana Liga Nacional');
  });

  it('un campeón ya conocido no se vuelve a anunciar', () => {
    const antes = snapshot({ champions: { t1: 'rival' } });
    expect(diffSnapshots(antes, snapshot({ champions: { t1: 'rival' } }), names)).toEqual([]);
  });

  it('distingue ascenso de descenso', () => {
    const ascenso = diffSnapshots(
      snapshot({ competitionId: 'plata' }),
      snapshot({ competitionId: 'liga' }),
      names
    );
    expect(ascenso[0]!.title).toBe('¡Ascenso a Liga Nacional!');

    const descenso = diffSnapshots(
      snapshot({ competitionId: 'liga' }),
      snapshot({ competitionId: 'plata' }),
      names
    );
    expect(descenso[0]!.title).toBe('Descenso a Liga Plata');
  });
});

describe('convocatorias', () => {
  it('un aviso por ventana, con todos los convocados del club juntos', () => {
    const avisos = diffSnapshots(
      snapshot({ date: DIA_1 }),
      snapshot({ date: DIA_2, calledUp: { base: 'seleccion-esp', pivot: 'seleccion-gre' } }),
      names
    );

    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.category).toBe('national');
    expect(avisos[0]!.title).toBe('2 jugadores convocados con sus selecciones');
    expect(avisos[0]!.body).toContain('Jugador base (Equipo seleccion-esp)');
  });

  it('seguir convocado no es noticia, ni tampoco volver', () => {
    const convocado = { base: 'seleccion-esp' };
    expect(
      diffSnapshots(snapshot({ calledUp: convocado }), snapshot({ calledUp: convocado }), names)
    ).toEqual([]);
    expect(diffSnapshots(snapshot({ calledUp: convocado }), snapshot({}), names)).toEqual([]);
  });

  it('las fotos de antes de las selecciones no traen convocados y no rompen nada', () => {
    const avisos = diffSnapshots(
      snapshot(),
      snapshot({ calledUp: { alero: 'seleccion-arg' } }),
      names
    );
    expect(avisos[0]!.title).toBe('Jugador alero, convocado con su selección');
  });
});

describe('vestuario', () => {
  it('avisa una vez cuando un jugador cruza la raya del descontento', () => {
    const avisos = diffSnapshots(snapshot({ unhappy: [] }), snapshot({ unhappy: ['base'] }), names);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.category).toBe('morale');
    expect(avisos[0]!.title).toBe('Jugador base está descontento');
  });

  it('seguir descontento o haberse ido del club no es noticia', () => {
    expect(
      diffSnapshots(snapshot({ unhappy: ['base'] }), snapshot({ unhappy: ['base'] }), names)
    ).toEqual([]);
    expect(
      diffSnapshots(snapshot({ unhappy: [] }), snapshot({ unhappy: ['fichado-y-vendido'] }), names)
    ).toEqual([]);
  });
});

describe('cambio de banquillo', () => {
  it('fichar por otro club es un aviso, no doce idas y doce llegadas', () => {
    const avisos = diffSnapshots(
      snapshot(),
      snapshot({ teamId: 'otro', squad: ['a', 'b', 'c', 'd', 'e'] }),
      names
    );

    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.category).toBe('career');
    expect(avisos[0]!.title).toContain('Equipo otro');
  });
});

describe('los banquillos de la liga', () => {
  const conEntrenadores: InboxNames = {
    ...names,
    coach: (id) => `Entrenador ${id}`,
    coachExit: (coachId) =>
      coachId === 'echado'
        ? { reason: 'dismissed', toTeamId: null }
        : coachId === 'fichado'
          ? { reason: 'left', toTeamId: 'grande' }
          : { reason: 'retired', toTeamId: null }
  };

  it('un aviso por club que cambia de entrenador, con el porqué', () => {
    const avisos = diffSnapshots(
      snapshot({ coaches: { a: 'echado', b: 'fichado', c: 'mayor', d: 'sigue' } }),
      snapshot({ coaches: { a: 'nuevo-a', b: 'nuevo-b', c: 'nuevo-c', d: 'sigue' } }),
      conEntrenadores
    );

    expect(avisos.map((aviso) => aviso.title)).toEqual([
      'Equipo a destituye a Entrenador echado',
      'Entrenador fichado se marcha a Equipo grande',
      'Entrenador mayor se retira'
    ]);
    expect(avisos.every((aviso) => aviso.category === 'press')).toBe(true);
    expect(avisos[0]!.route).toEqual({ name: 'team-profile', params: { teamId: 'a' } });
  });

  it('una foto sin entrenadores, o un club que no estaba antes, no avisan', () => {
    expect(diffSnapshots(snapshot(), snapshot({ coaches: { a: 'x' } }), conEntrenadores)).toEqual(
      []
    );
    expect(
      diffSnapshots(
        snapshot({ coaches: { a: 'x' } }),
        snapshot({ coaches: { a: 'x', b: 'y' } }),
        conEntrenadores
      )
    ).toEqual([]);
  });
});

describe('contratos que acaban', () => {
  it('uno solo, o varios juntos en un aviso', () => {
    expect(expiringContractDrafts([], 2)).toEqual([]);

    const uno = expiringContractDrafts([{ playerId: 'base', name: 'Pérez' }], 2);
    expect(uno).toHaveLength(1);
    expect(uno[0]!.title).toContain('un contrato');

    const varios = expiringContractDrafts(
      [
        { playerId: 'base', name: 'Pérez' },
        { playerId: 'pivot', name: 'Gómez' }
      ],
      2
    );
    expect(varios).toHaveLength(1);
    expect(varios[0]!.title).toContain('2 contratos');
    expect(varios[0]!.body).toContain('Pérez, Gómez');
    expect(varios[0]!.route).toEqual({ name: 'market' });
  });
});
