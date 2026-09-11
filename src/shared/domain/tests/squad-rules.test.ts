import { describe, expect, it } from 'vitest';
import {
  MIN_HOMEGROWN,
  WAGE_CEILING_SHARE,
  canLeave,
  canSign,
  wageCeilingCents
} from '../squad-rules';

const SIGN = {
  homegrownInSquad: 6,
  squadSize: 12,
  maxSquadSize: 14,
  signingIsHomegrown: false,
  wageBillCents: 3_000_000_00,
  wageOfferedCents: 200_000_00,
  wageCeilingCents: 4_000_000_00
};

const LEAVE = {
  homegrownInSquad: 6,
  leavingIsHomegrown: false,
  squadSize: 12,
  minSquadSize: 10
};

describe('tope salarial', () => {
  it('deja un margen por encima de lo que ingresa el club', () => {
    expect(wageCeilingCents(1_000_000_00)).toBe(Math.round(1_000_000_00 * WAGE_CEILING_SHARE));
    expect(WAGE_CEILING_SHARE).toBeGreaterThan(1);
  });

  it('sin ingresos no hay tope que gastar', () => {
    expect(wageCeilingCents(0)).toBe(0);
    expect(wageCeilingCents(-5)).toBe(0);
  });
});

describe('fichar', () => {
  it('con sitio, cupo y tope, se puede', () => {
    expect(canSign(SIGN).ok).toBe(true);
  });

  it('la plantilla llena no admite a nadie más', () => {
    const check = canSign({ ...SIGN, squadSize: 14 });

    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/14/);
  });

  it('no se ficha a un extranjero si te quedas sin el cupo de casa', () => {
    const check = canSign({ ...SIGN, homegrownInSquad: MIN_HOMEGROWN - 1 });

    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/formación/);
  });

  it('y ese mismo hueco sí lo cubre uno de casa', () => {
    expect(
      canSign({
        ...SIGN,
        homegrownInSquad: MIN_HOMEGROWN - 1,
        signingIsHomegrown: true
      }).ok
    ).toBe(true);
  });

  it('la ficha que se sale del tope no se firma', () => {
    const check = canSign({ ...SIGN, wageOfferedCents: 1_500_000_00 });

    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/tope/);
  });
});

describe('dejar salir', () => {
  it('con plantilla de sobra y cupo cubierto, se puede', () => {
    expect(canLeave(LEAVE).ok).toBe(true);
  });

  it('no se puede vaciar el vestuario', () => {
    const check = canLeave({ ...LEAVE, squadSize: 10 });

    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/10/);
  });

  it('ni soltar al último jugador de formación', () => {
    const check = canLeave({
      ...LEAVE,
      homegrownInSquad: MIN_HOMEGROWN,
      leavingIsHomegrown: true
    });

    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/formación/);
  });

  it('aunque sí a un extranjero con el cupo justo', () => {
    expect(canLeave({ ...LEAVE, homegrownInSquad: MIN_HOMEGROWN }).ok).toBe(true);
  });
});
