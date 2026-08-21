/**
 * Resoluciones de ventana ofrecidas en Ajustes. Vive en `shared` porque la
 * eligen en el renderer y la aplica el proceso principal al crear la ventana.
 */
export const WINDOW_RESOLUTIONS = ['1280x720', '1366x768', '1600x900', '1920x1080'] as const;

export type WindowResolution = (typeof WINDOW_RESOLUTIONS)[number];

export const DEFAULT_WINDOW_RESOLUTION: WindowResolution = '1600x900';

export interface WindowSize {
  width: number;
  height: number;
}

/** Devuelve `null` para cualquier cadena que no sea una resolución conocida. */
export function parseWindowResolution(value: string): WindowSize | null {
  if (!(WINDOW_RESOLUTIONS as readonly string[]).includes(value)) {
    return null;
  }

  const [width, height] = value.split('x').map(Number);
  if (!width || !height) {
    return null;
  }

  return { width, height };
}
