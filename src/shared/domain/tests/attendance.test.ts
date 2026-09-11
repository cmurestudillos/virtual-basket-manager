import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUPPORT,
  MAX_SUPPORT,
  MIN_SUPPORT,
  REFERENCE_TICKET_PRICE_CENTS,
  SEASON_TICKET_GAMES,
  expectedAttendance,
  gateRevenueCents,
  renewSeasonTickets,
  seasonTicketPriceCents,
  supportAfterGame,
  supportLabel
} from '../attendance';

const PABELLON = {
  capacity: 10_000,
  seasonTicketHolders: 3_000,
  fanSupport: DEFAULT_SUPPORT,
  ticketPriceCents: REFERENCE_TICKET_PRICE_CENTS,
  opponentReputation: 50
};

describe('expectedAttendance', () => {
  it('no cabe más gente que asientos tiene el pabellón', () => {
    const lleno = expectedAttendance({
      ...PABELLON,
      fanSupport: MAX_SUPPORT,
      ticketPriceCents: 5_00
    });

    expect(lleno).toBeLessThanOrEqual(PABELLON.capacity);
  });

  it('los abonados son el suelo: su asiento está ocupado pase lo que pase', () => {
    const desastre = expectedAttendance({
      ...PABELLON,
      fanSupport: MIN_SUPPORT,
      ticketPriceCents: 120_00
    });

    expect(desastre).toBeGreaterThanOrEqual(PABELLON.seasonTicketHolders);
  });

  it('subir el precio trae menos gente', () => {
    expect(expectedAttendance({ ...PABELLON, ticketPriceCents: 45_00 })).toBeLessThan(
      expectedAttendance({ ...PABELLON, ticketPriceCents: 12_00 })
    );
  });

  it('con el pabellón caliente viene más gente', () => {
    expect(expectedAttendance({ ...PABELLON, fanSupport: 90 })).toBeGreaterThan(
      expectedAttendance({ ...PABELLON, fanSupport: 20 })
    );
  });

  it('un rival grande llena más que uno pequeño', () => {
    expect(expectedAttendance({ ...PABELLON, opponentReputation: 95 })).toBeGreaterThan(
      expectedAttendance({ ...PABELLON, opponentReputation: 20 })
    );
  });
});

describe('taquilla', () => {
  it('sólo paga quien no tiene abono', () => {
    expect(gateRevenueCents(5_000, 3_000, 20_00)).toBe(2_000 * 20_00);
  });

  it('un partido al que sólo van abonados no deja taquilla', () => {
    expect(gateRevenueCents(3_000, 3_000, 20_00)).toBe(0);
    expect(gateRevenueCents(2_500, 3_000, 20_00)).toBe(0);
  });

  it('el abono sale por doce entradas', () => {
    expect(seasonTicketPriceCents(20_00)).toBe(20_00 * SEASON_TICKET_GAMES);
  });
});

describe('ambiente', () => {
  it('ganar calienta el pabellón y perder lo enfría', () => {
    const ganando = supportAfterGame(50, { won: true, ticketPriceCents: 20_00 });
    const perdiendo = supportAfterGame(50, { won: false, ticketPriceCents: 20_00 });

    expect(ganando).toBeGreaterThan(50);
    expect(perdiendo).toBeLessThan(50);
  });

  it('cobrar caro enfría aunque se gane', () => {
    expect(supportAfterGame(50, { won: true, ticketPriceCents: 60_00 })).toBeLessThan(
      supportAfterGame(50, { won: true, ticketPriceCents: 10_00 })
    );
  });

  it('no se sale de la escala', () => {
    expect(supportAfterGame(100, { won: true, ticketPriceCents: 5_00 })).toBeLessThanOrEqual(
      MAX_SUPPORT
    );
    expect(supportAfterGame(0, { won: false, ticketPriceCents: 120_00 })).toBeGreaterThanOrEqual(
      MIN_SUPPORT
    );
  });

  it('tiene una etiqueta para cada tramo', () => {
    expect(supportLabel(90)).toBe('Entregada');
    expect(supportLabel(65)).toBe('Animada');
    expect(supportLabel(45)).toBe('Tibia');
    expect(supportLabel(25)).toBe('Fría');
    expect(supportLabel(5)).toBe('Enfadada');
  });
});

describe('renovación de abonos', () => {
  it('una afición entregada renueva mucho más que una enfadada', () => {
    const entregada = renewSeasonTickets({
      capacity: 10_000,
      fanSupport: 90,
      ticketPriceCents: 20_00
    });
    const enfadada = renewSeasonTickets({
      capacity: 10_000,
      fanSupport: 10,
      ticketPriceCents: 20_00
    });

    expect(entregada).toBeGreaterThan(enfadada * 1.5);
  });

  it('y el precio del abono también pesa', () => {
    expect(
      renewSeasonTickets({ capacity: 10_000, fanSupport: 60, ticketPriceCents: 50_00 })
    ).toBeLessThan(
      renewSeasonTickets({ capacity: 10_000, fanSupport: 60, ticketPriceCents: 15_00 })
    );
  });

  it('nunca se abona más gente de la que cabe', () => {
    const holders = renewSeasonTickets({
      capacity: 8_000,
      fanSupport: 100,
      ticketPriceCents: 5_00
    });

    expect(holders).toBeLessThanOrEqual(8_000);
  });
});
