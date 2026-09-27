// Descarga segura de páginas web ajenas: bloquea destinos internos (SSRF),
// limita tamaño y tiempo, y solo acepta HTML/texto.

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;

export class FetchError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Resolver opcional de DNS (en Node se inyecta; en Workers no hace falta). */
export type HostResolver = (host: string) => Promise<string[]>;

function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v6.includes(":")) {
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
  }
  return false;
}

async function assertPublicUrl(url: URL, resolve?: HostResolver): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("Solo se admiten URLs http(s).");
  }
  if (url.username || url.password) throw new FetchError("URL con credenciales no permitida.");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".internal") || !host.includes(".") && !host.includes(":")
  ) {
    throw new FetchError("Destino no permitido.");
  }
  if (isPrivateIp(host)) throw new FetchError("Destino no permitido.");
  if (resolve) {
    const addrs = await resolve(host).catch(() => {
      throw new FetchError("No se pudo resolver el dominio.", 422);
    });
    if (addrs.length === 0 || addrs.some(isPrivateIp)) throw new FetchError("Destino no permitido.");
  }
}

export function parseTargetUrl(raw: string | undefined): URL {
  if (!raw) throw new FetchError("Falta el parámetro 'url'.");
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw new FetchError("URL inválida.");
  }
  return url;
}

export interface FetchedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
  bytes: number;
  elapsedMs: number;
  headers: Record<string, string>;
}

export async function safeFetchPage(target: URL, resolve?: HostResolver): Promise<FetchedPage> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = target;
    let res: Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(current, resolve);
      res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; x402-web-intel/1.0)",
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current);
        continue;
      }
      break;
    }
    if (!res || (res.status >= 300 && res.status < 400)) throw new FetchError("Demasiadas redirecciones.", 422);

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/html|text\/plain|xml/i.test(contentType)) {
      throw new FetchError(`Tipo de contenido no soportado: ${contentType}`, 422);
    }

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const buf = new Uint8Array(Math.min(bytes, MAX_BYTES));
    let off = 0;
    for (const c of chunks) {
      buf.set(c.subarray(0, buf.length - off), off);
      off += c.byteLength;
      if (off >= buf.length) break;
    }

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return {
      finalUrl: current.toString(),
      status: res.status,
      contentType,
      html: new TextDecoder().decode(buf),
      bytes,
      elapsedMs: Date.now() - started,
      headers,
    };
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if ((err as Error).name === "AbortError") throw new FetchError("Tiempo de espera agotado.", 504);
    throw new FetchError(`No se pudo descargar la página: ${(err as Error).message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}
