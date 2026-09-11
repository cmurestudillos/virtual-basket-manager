import { describe, expect, it } from 'vitest';
import {
  DIVISION_REPUTATION_STEP,
  PROMOTION_SLOTS,
  RELEGATION_SLOTS,
  divisionSwap,
  promotedTeamIds,
  relegatedTeamIds,
  zoneFor
} from '../promotion';

/** Una clasificación de juguete, del primero al último. */
function standings(teams: number): { teamId: string }[] {
  return Array.from({ length: teams }, (_, index) => ({ teamId: `team-${index + 1}` }));
}

/** La primera división de la partida: dieciocho equipos, ocho a playoff. */
const PRIMERA = { teams: 18, playoffTeams: 8, promotes: false, relegates: true };
/** Y la segunda: sin cuadro, con ascenso y sin nadie por debajo. */
const SEGUNDA = { teams: 18, playoffTeams: 0, promotes: true, relegates: false };

describe('zoneFor', () => {
  it('en primera marca el playoff arriba y el descenso abajo', () => {
    expect(zoneFor(1, PRIMERA)).toBe('playoffs');
    expect(zoneFor(8, PRIMERA)).toBe('playoffs');
    expect(zoneFor(9, PRIMERA)).toBeNull();
    expect(zoneFor(16, PRIMERA)).toBeNull();
    expect(zoneFor(17, PRIMERA)).toBe('relegation');
    expect(zoneFor(18, PRIMERA)).toBe('relegation');
  });

  it('en segunda marca el ascenso y no marca descenso, porque no hay tercera', () => {
    expect(zoneFor(1, SEGUNDA)).toBe('promotion');
    expect(zoneFor(2, SEGUNDA)).toBe('promotion');
    expect(zoneFor(3, SEGUNDA)).toBeNull();
    expect(zoneFor(18, SEGUNDA)).toBeNull();
  });

  it('el descenso manda sobre el playoff si llegaran a solaparse', () => {
    // Una liga pequeña donde las dos zonas se pisan: lo urgente es lo de abajo.
    const enana = { teams: 4, playoffTeams: 4, promotes: false, relegates: true };

    expect(zoneFor(1, enana)).toBe('playoffs');
    expect(zoneFor(3, enana)).toBe('relegation');
    expect(zoneFor(4, enana)).toBe('relegation');
  });
});

describe('quién sube y quién baja', () => {
  it('suben los primeros de abajo y bajan los últimos de arriba', () => {
    expect(promotedTeamIds(standings(18))).toEqual(['team-1', 'team-2']);
    expect(relegatedTeamIds(standings(18))).toEqual(['team-17', 'team-18']);
  });

  it('sin plazas no se mueve nadie', () => {
    expect(promotedTeamIds(standings(18), 0)).toEqual([]);
    expect(relegatedTeamIds(standings(18), 0)).toEqual([]);
  });

  it('el intercambio deja las dos divisiones del mismo tamaño', () => {
    const { promoted, relegated } = divisionSwap({
      upper: standings(18),
      lower: standings(18)
    });

    expect(promoted).toHaveLength(relegated.length);
    expect(promoted).toHaveLength(Math.min(PROMOTION_SLOTS, RELEGATION_SLOTS));
  });

  it('con una división diminuta se ajusta al cupo que quepa', () => {
    // Si la de abajo sólo tiene un equipo, sube uno y baja uno: lo contrario
    // dejaría la primera con un hueco y un calendario imposible.
    const { promoted, relegated } = divisionSwap({ upper: standings(18), lower: standings(1) });

    expect(promoted).toEqual(['team-1']);
    expect(relegated).toEqual(['team-18']);
  });
});

describe('DIVISION_REPUTATION_STEP', () => {
  it('mueve la reputación lo bastante para notarse en las cuentas', () => {
    // No es un detalle cosmético: la televisión y el patrocinio salen de ahí.
    expect(DIVISION_REPUTATION_STEP).toBeGreaterThan(0);
  });
});
