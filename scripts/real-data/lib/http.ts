import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Descargas de los extractores de datos reales.
 *
 * Las webs de las ligas son de terceros y algunas van justas de servidor, así
 * que aquí se cumplen tres normas para no molestar: todo lo descargado se
 * guarda en disco y no se vuelve a pedir (rehacer un extractor mil veces
 * mientras se afina el parser no cuesta ni una petición más), entre dos
 * peticiones reales al mismo cliente hay siempre una pausa mínima y, si el
 * servidor falla o tarda, se reintenta con calma en vez de insistir.
 */

export const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..');
export const CACHE_ROOT = join(PROJECT_ROOT, '.real-data-cache');
const HTTP_CACHE_DIR = join(CACHE_ROOT, 'http');

// Un navegador de escritorio corriente: algunas webs devuelven otra cosa (o
// nada) a los clientes que no se presentan como tal.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/140.0.0.0 Safari/537.36';

export interface HttpClientOptions {
  /** Pausa mínima entre dos peticiones reales, en milisegundos. */
  minDelayMs: number;
  /** Descarga de nuevo aunque esté en caché (y la sobrescribe). */
  force?: boolean;
  retries?: number;
  timeoutMs?: number;
  /** Para los mensajes de progreso. */
  log?: (message: string) => void;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  /** Campos de formulario: se envían como `application/x-www-form-urlencoded`. */
  form?: Record<string, string>;
  headers?: Record<string, string>;
  /**
   * Clave de caché explícita. Hace falta cuando la respuesta no depende sólo de
   * la URL y el cuerpo: un postback de ASP.NET lleva un `__VIEWSTATE` que cambia
   * en cada visita, así que por cuerpo nunca acertaría.
   */
  cacheKey?: string;
  /** No leer ni escribir caché para esta petición (p. ej. la página previa a un postback). */
  noCache?: boolean;
  /** Fuerza esta petición concreta aunque el cliente no fuerce. */
  force?: boolean;
  /**
   * Comprueba que la respuesta es la esperada antes de guardarla. Un postback
   * caducado devuelve la página de siempre con un 200, y guardarlo en caché
   * dejaría el error fijo para las siguientes ejecuciones.
   */
  accept?: (body: string) => boolean;
}

export interface HttpClient {
  request(url: string, options?: RequestOptions): Promise<string>;
  get(url: string, options?: Omit<RequestOptions, 'method' | 'form'>): Promise<string>;
  /** ¿Está ya en caché? Sirve para saltarse pasos previos que sólo preparan una petición. */
  isCached(url: string, options?: RequestOptions): boolean;
  /**
   * Guarda a mano una respuesta en caché. Para lo que ha costado varias
   * peticiones encadenadas (dos postbacks seguidos) y sólo interesa el final.
   */
  store(url: string, options: RequestOptions, body: string): void;
  /** Peticiones que han ido de verdad a la red (no a la caché). */
  readonly networkRequests: number;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function encodeForm(form: Record<string, string>): string {
  return new URLSearchParams(Object.entries(form)).toString();
}

export function cacheFileFor(url: string, options: RequestOptions = {}): string {
  const method = options.method ?? 'GET';
  const identity = options.cacheKey
    ? `key:${options.cacheKey}`
    : `${method} ${url}\n${options.form ? encodeForm(options.form) : ''}`;
  const hash = createHash('sha256').update(identity).digest('hex');
  return join(HTTP_CACHE_DIR, `${hash}.html`);
}

class RetryableError extends Error {}

export function createHttpClient(clientOptions: HttpClientOptions): HttpClient {
  const retries = clientOptions.retries ?? 4;
  const timeoutMs = clientOptions.timeoutMs ?? 60_000;
  const log = clientOptions.log ?? (() => {});
  // Cookies de sesión: sólo nombre=valor, sin fechas ni rutas. Basta para
  // mantener la sesión de ASP.NET entre la página y su postback.
  const cookies = new Map<string, string>();
  let lastRequestAt = 0;
  let networkRequests = 0;

  function storeCookies(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';', 1)[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async function fetchOnce(url: string, options: RequestOptions): Promise<string> {
    const wait = lastRequestAt + clientOptions.minDelayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    networkRequests++;

    const headers: Record<string, string> = {
      'User-Agent': BROWSER_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9',
      ...options.headers
    };
    if (cookies.size > 0) {
      headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    let body: string | undefined;
    if (options.form) {
      body = encodeForm(options.form);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      // Timeout, conexión cortada, DNS…: todo eso suele arreglarse esperando.
      throw new RetryableError(`${url}: ${(error as Error).message}`);
    }
    storeCookies(response);
    const text = await response.text();
    if (response.status >= 500 || response.status === 429) {
      throw new RetryableError(`${url}: HTTP ${response.status}`);
    }
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return text;
  }

  function store(file: string, body: string): void {
    mkdirSync(HTTP_CACHE_DIR, { recursive: true });
    writeFileSync(file, body, 'utf8');
  }

  async function request(url: string, options: RequestOptions = {}): Promise<string> {
    const file = cacheFileFor(url, options);
    const force = clientOptions.force || options.force;
    if (!options.noCache && !force && existsSync(file)) return readFileSync(file, 'utf8');

    for (let attempt = 0; ; attempt++) {
      try {
        const text = await fetchOnce(url, options);
        if (options.accept && !options.accept(text)) {
          throw new Error(`${url}: la respuesta no es la esperada (no se guarda en caché)`);
        }
        if (!options.noCache) store(file, text);
        return text;
      } catch (error) {
        if (!(error instanceof RetryableError) || attempt >= retries) throw error;
        // Espera creciente: 5 s, 10 s, 20 s… Un servidor viejo que se atraganta
        // no se recupera antes porque se le insista.
        const backoff = 5_000 * 2 ** attempt;
        log(`  ${error.message}; reintento ${attempt + 1}/${retries} en ${backoff / 1000} s`);
        await sleep(backoff);
      }
    }
  }

  return {
    request,
    get: (url, options) => request(url, { ...options, method: 'GET' }),
    isCached: (url, options = {}) => existsSync(cacheFileFor(url, options)),
    store: (url, options, body) => store(cacheFileFor(url, options), body),
    get networkRequests() {
      return networkRequests;
    }
  };
}
