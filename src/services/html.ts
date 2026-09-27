// Parser HTML ligero sin dependencias (funciona igual en Node y Cloudflare Workers).

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", hellip: "…", mdash: "—", ndash: "–",
  laquo: "«", raquo: "»", aacute: "á", eacute: "é", iacute: "í",
  oacute: "ó", uacute: "ú", ntilde: "ñ", Aacute: "Á", Eacute: "É",
  Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", uuml: "ü", iexcl: "¡", iquest: "¿",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

export interface Tag {
  name: string;
  attrs: Record<string, string>;
}

export function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

export function findTags(html: string, name: string): Tag[] {
  const re = new RegExp(`<${name}\\b([^>]*)>`, "gi");
  const out: Tag[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ name, attrs: parseAttrs(m[1]) });
  return out;
}

export function findElements(html: string, name: string): { attrs: Record<string, string>; text: string }[] {
  const re = new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)</${name}>`, "gi");
  const out: { attrs: Record<string, string>; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ attrs: parseAttrs(m[1]), text: clean(m[2]) });
  return out;
}

export function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|canvas)\b[\s\S]*?<\/\1>/gi, " ");
}

/** Texto principal legible: prioriza <article>/<main>, descarta nav/header/footer/aside. */
export function mainText(html: string): string {
  const body = stripNoise(html);
  const pick =
    body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    body.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ??
    body;
  const withoutChrome = pick.replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ");
  const blocks = withoutChrome
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|blockquote|pre)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ");
  return decodeEntities(blocks.replace(/<[^>]*>/g, " "))
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function metaMap(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of findTags(html, "meta")) {
    const key = (t.attrs.property || t.attrs.name || t.attrs["http-equiv"] || "").toLowerCase();
    if (key && t.attrs.content !== undefined && !(key in out)) out[key] = t.attrs.content.trim();
  }
  return out;
}

export function titleOf(html: string): string | null {
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? clean(m[1]) : null;
}

export function absolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
