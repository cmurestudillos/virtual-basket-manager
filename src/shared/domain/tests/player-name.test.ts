import { describe, expect, it } from 'vitest';
import { nameInitial, splitPlayerName } from '../player-name';

/** «Nombre APELLIDO»: cómo se parte el nombre entero de un jugador. */

describe('splitPlayerName', () => {
  it('la primera palabra es el nombre y el resto el apellido', () => {
    expect(splitPlayerName('Adam Kozłowski')).toEqual({ first: 'Adam', last: 'Kozłowski' });
    expect(splitPlayerName('Juan Carlos Navarro')).toEqual({
      first: 'Juan',
      last: 'Carlos Navarro'
    });
  });

  it('una sola palabra es apellido, y los espacios de más no cuentan', () => {
    expect(splitPlayerName('Sabonis')).toEqual({ first: '', last: 'Sabonis' });
    expect(splitPlayerName('  Ivan   Tkachenko ')).toEqual({ first: 'Ivan', last: 'Tkachenko' });
    expect(splitPlayerName('')).toEqual({ first: '', last: '' });
  });
});

describe('nameInitial', () => {
  it('se queda con la inicial y el punto', () => {
    expect(nameInitial('Álvaro')).toBe('Á.');
    expect(nameInitial('')).toBe('');
  });
});
