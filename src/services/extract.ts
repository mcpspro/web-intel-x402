import type { FetchedPage } from "../safeFetch.js";
import { absolute, findElements, findTags, mainText, metaMap, stripNoise, titleOf } from "./html.js";

const MAX_TEXT = 50_000;
const MAX_LINKS = 200;

export function extractPage(page: FetchedPage) {
  const html = page.html;
  const base = page.finalUrl;
  const meta = metaMap(html);
  const text = mainText(html);
  const host = new URL(base).hostname;

  const seen = new Set<string>();
  const links: { url: string; text: string; internal: boolean }[] = [];
  for (const a of findElements(stripNoise(html), "a")) {
    const url = absolute(a.attrs.href, base);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push({ url, text: a.text.slice(0, 200), internal: new URL(url).hostname === host });
    if (links.length >= MAX_LINKS) break;
  }

  const headings = (["h1", "h2", "h3"] as const).flatMap((lvl) =>
    findElements(html, lvl).map((h) => ({ level: Number(lvl[1]), text: h.text })).filter((h) => h.text),
  );

  const jsonLd: unknown[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      jsonLd.push(JSON.parse(m[1].trim()));
    } catch {
      /* JSON-LD mal formado: se ignora */
    }
  }

  const canonical = findTags(html, "link").find((l) => (l.attrs.rel ?? "").toLowerCase() === "canonical");
  const words = text.split(/\s+/).filter(Boolean).length;

  return {
    url: base,
    status: page.status,
    title: titleOf(html) ?? meta["og:title"] ?? null,
    description: meta.description ?? meta["og:description"] ?? null,
    language: html.match(/<html\b[^>]*\blang=["']?([\w-]+)/i)?.[1] ?? null,
    canonical: absolute(canonical?.attrs.href, base),
    image: absolute(meta["og:image"], base),
    author: meta.author ?? meta["article:author"] ?? null,
    publishedTime: meta["article:published_time"] ?? null,
    openGraph: Object.fromEntries(Object.entries(meta).filter(([k]) => k.startsWith("og:") || k.startsWith("twitter:"))),
    headings,
    wordCount: words,
    readingTimeMin: Math.max(1, Math.round(words / 230)),
    text: text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + "…" : text,
    textTruncated: text.length > MAX_TEXT,
    links,
    jsonLd,
  };
}
