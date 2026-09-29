/** La aplicación en sí: lo que no es de ninguna partida. */
export interface AppApi {
  /** Cierra la aplicación. Sólo se ofrece fuera de partida, en el menú de inicio. */
  quit: () => Promise<void>;
}
