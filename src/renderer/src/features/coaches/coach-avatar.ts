/**
 * La semilla de la cara de un entrenador.
 *
 * La del usuario sale de su nombre, como en la barra de arriba (que no tiene su
 * id): así es la misma cara en la cabecera, en su ficha y en la de su club. La
 * de un entrenador de la IA sale de su id, que no cambia aunque cambie de club.
 */
export function coachAvatarSeed(coach: { id: string; name: string; isManager: boolean }): string {
  return coach.isManager ? coach.name : coach.id;
}
