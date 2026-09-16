import { createHash } from 'node:crypto';
import { FIBA_RULESET } from '../src/shared/domain/rulesets';
import { simulateGame } from '../src/shared/engine/basketball';
import { buildTestTeam } from '../src/shared/engine/basketball/tests/test-teams';

/**
 * Huella del motor: veinticinco partidos resumidos en un hash.
 *
 * Existe para responder a una sola pregunta, la que más veces hace falta al
 * tocar `simulate-game.ts`: **¿he cambiado el partido sin querer?** Si el hash
 * es el mismo antes y después, no se ha movido ni una tirada de dado; si
 * cambia, algo ha alterado el orden en que se consume el azar aunque los tests
 * sigan pasando, porque los tests comprueban rangos y esto compara el partido
 * entero jugada a jugada.
 *
 * Así se usa para verificar que un cambio es neutro:
 *
 *   pnpm verify:engine
 *   git stash && pnpm verify:engine && git stash pop
 *
 * Y así se distingue un refactor de un ajuste de calibrado: el primero tiene
 * que dar el mismo hash, el segundo no.
 */

const GAMES = 25;
const hash = createHash('sha256');

for (let index = 0; index < GAMES; index += 1) {
  // Niveles distintos en cada partido para que la huella no dependa de un solo
  // emparejamiento: un cambio que sólo afecte a los equipos flojos también sale.
  const result = simulateGame({
    gameId: `huella-${index}`,
    home: buildTestTeam('local', 55 + (index % 7)),
    away: buildTestTeam('visitante', 52 + (index % 5)),
    ruleset: FIBA_RULESET
  });
  hash.update(JSON.stringify(result));
}

console.log('huella:', hash.digest('hex'));
