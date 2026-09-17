/**
 * Lo mínimo para leer HTML de servidor sin añadir un parser: las páginas que
 * se leen así (las de la FEB) son tablas generadas por ASP.NET, con una
 * estructura fija y muy repetitiva, y con unas pocas expresiones regulares
 * basta. Si una fuente futura tiene HTML más libre, ése será el momento de
 * meter un parser de verdad.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  ccedil: 'ç',
  Ccedil: 'Ç',
  ordf: 'ª',
  ordm: 'º',
  middot: '·',
  copy: '©'
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[entity] ?? whole;
  });
}

/** El texto visible de un trozo de HTML, con los espacios colapsados. */
export function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Las filas `<tr>` de un trozo de HTML (sin tablas anidadas, que aquí no hay). */
export function tableRows(html: string): string[] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1] ?? '');
}

/** Las celdas `<td>` de una fila, en HTML, con su clase. */
export function rowCells(rowHtml: string): { className: string; html: string }[] {
  return [...rowHtml.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((match) => ({
    className: /class\s*=\s*["']([^"']*)["']/i.exec(match[1] ?? '')?.[1]?.trim() ?? '',
    html: match[2] ?? ''
  }));
}

/** Los campos ocultos de un formulario (`__VIEWSTATE`, `__EVENTVALIDATION`…). */
export function hiddenInputs(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/type\s*=\s*["']hidden["']/i.test(tag)) continue;
    const name = /name\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (!name) continue;
    fields[name] = decodeEntities(/value\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '');
  }
  return fields;
}

/** El `action` del formulario principal, ya como URL absoluta. */
export function formAction(html: string, pageUrl: string): string {
  const action = /<form\b[^>]*action\s*=\s*["']([^"']*)["']/i.exec(html)?.[1];
  return new URL(decodeEntities(action ?? pageUrl), pageUrl).toString();
}
