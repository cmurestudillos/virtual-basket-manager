/**
 * Lectura de los datos que una página Next.js (App Router) lleva incrustados.
 *
 * acb.com no pinta sus tablas con HTML estático que se pueda leer sin más: el
 * servidor manda, además del HTML, el «RSC payload» de React troceado en
 * `<script>self.__next_f.push([1,"…"])</script>`. Juntando esos trozos sale un
 * texto con una fila por línea (`id:contenido`), y la mayoría de filas son JSON
 * con las props de los componentes, que es donde vienen los datos de verdad
 * (plantillas, estadísticas…). Así se leen sin ejecutar JavaScript.
 */

const PUSH_RE = /self\.__next_f\.push\((\[[\s\S]*?\])\)\s*<\/script>/g;

/** Junta los trozos de texto de `self.__next_f.push` en el orden en que llegan. */
export function extractFlightPayload(html: string): string {
  let payload = '';
  for (const match of html.matchAll(PUSH_RE)) {
    let chunk: unknown;
    try {
      chunk = JSON.parse(match[1] ?? '');
    } catch {
      continue;
    }
    // [0] marca el arranque y [2, …] datos de formularios; sólo [1, "texto"] trae filas.
    if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === 'string') {
      payload += chunk[1];
    }
  }
  return payload;
}

/**
 * Las filas del payload que son JSON, ya parseadas y por su id. Las filas de
 * texto (`id:T<longitud>,…`), de módulos (`id:I[…]`) y de pistas (`:HL[…]`) no
 * llevan datos y se saltan.
 */
export function parseFlightRows(payload: string): Map<string, unknown> {
  const rows = new Map<string, unknown>();
  let index = 0;
  while (index < payload.length) {
    const colon = payload.indexOf(':', index);
    if (colon < 0) break;
    const id = payload.slice(index, colon);
    // Una fila de texto dice cuántos bytes ocupa y puede contener saltos de
    // línea: hay que saltarla por longitud, no hasta el siguiente salto.
    const text = /^T([0-9a-f]+),/.exec(payload.slice(colon + 1, colon + 20));
    if (text) {
      const start = colon + 1 + text[0].length;
      index = start + charsForBytes(payload, start, parseInt(text[1] ?? '0', 16));
      continue;
    }
    const end = payload.indexOf('\n', colon);
    const body = payload.slice(colon + 1, end < 0 ? payload.length : end);
    index = end < 0 ? payload.length : end + 1;
    if (body[0] !== '{' && body[0] !== '[') continue;
    try {
      rows.set(id, JSON.parse(body));
    } catch {
      // Fila cortada o con otro formato: no trae nada que se pueda aprovechar.
    }
  }
  return rows;
}

// `$29` es la fila 0x29 entera; `$29:props:data:standings:0:team`, un trozo de
// ella. React las usa para no repetir un objeto que ya ha mandado (en la
// clasificación, cada equipo sale completo una vez y el resto son punteros).
const REFERENCE_RE = /^\$([0-9a-f]+)(?::(.+))?$/;
const MAX_REFERENCE_DEPTH = 32;

function lookupReference(rows: Map<string, unknown>, ref: string, depth: number): unknown {
  const match = REFERENCE_RE.exec(ref);
  if (!match || depth > MAX_REFERENCE_DEPTH || !rows.has(match[1] ?? '')) return undefined;
  let current = rows.get(match[1] ?? '');
  for (const step of match[2] ? match[2].split(':') : []) {
    if (typeof current === 'string' && REFERENCE_RE.test(current)) {
      current = lookupReference(rows, current, depth + 1);
    }
    if (Array.isArray(current)) {
      // Un elemento de React viaja como ["$", tipo, clave, props]: «props» es el cuarto.
      current = step === 'props' && current[0] === '$' ? current[3] : current[Number(step)];
    } else if (current !== null && typeof current === 'object') {
      current = (current as Record<string, unknown>)[step];
    } else {
      return undefined;
    }
  }
  if (typeof current === 'string' && REFERENCE_RE.test(current)) {
    return lookupReference(rows, current, depth + 1);
  }
  return current;
}

/**
 * Sustituye, en el sitio, los punteros `$id:ruta` por el objeto al que apuntan,
 * para que quien lea los datos no tenga que saber nada de este formato. Los
 * objetos se enlazan, no se copian: un equipo repetido cien veces sigue siendo
 * un único objeto en memoria.
 */
export function resolveFlightReferences(rows: Map<string, unknown>): void {
  const seen = new Set<object>();
  const stack: unknown[] = [...rows.values()];
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const container = value as Record<string, unknown>;
    for (const key of Object.keys(container)) {
      let child = container[key];
      if (typeof child === 'string' && child.includes(':') && REFERENCE_RE.test(child)) {
        const target = lookupReference(rows, child, 0);
        if (target !== undefined) {
          container[key] = target;
          child = target;
        }
      }
      if (child !== null && typeof child === 'object') stack.push(child);
    }
  }
}

function charsForBytes(text: string, start: number, bytes: number): number {
  let consumed = 0;
  let index = start;
  while (index < text.length && consumed < bytes) {
    const code = text.codePointAt(index) ?? 0;
    consumed += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    index += code >= 0x10000 ? 2 : 1;
  }
  return index - start;
}

export type JsonObject = Record<string, unknown>;

/**
 * Todos los objetos del árbol que cumplen la condición, en profundidad y en
 * orden. No sigue buscando dentro de un objeto que ya ha cumplido (un jugador
 * de la plantilla no contiene otros jugadores) y cada objeto sale una sola vez:
 * tras resolver los punteros, el mismo equipo cuelga de muchos sitios.
 */
export function findObjects(root: unknown, test: (value: JsonObject) => boolean): JsonObject[] {
  const found: JsonObject[] = [];
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) stack.push(value[i]);
    } else {
      const object = value as JsonObject;
      if (test(object)) {
        found.push(object);
        continue;
      }
      const values = Object.values(object);
      for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]);
    }
  }
  return found;
}

/** Atajo: los datos JSON de una página de acb.com listos para buscar en ellos. */
export function flightDataOf(html: string): unknown[] {
  const rows = parseFlightRows(extractFlightPayload(html));
  resolveFlightReferences(rows);
  return [...rows.values()];
}

/** ¿Tiene el objeto todas estas claves? */
export function hasKeys(...keys: string[]): (value: JsonObject) => boolean {
  return (value) => keys.every((key) => key in value);
}
