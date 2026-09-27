import type { FetchedPage } from "../safeFetch.js";
import { absolute, findElements, findTags, mainText, metaMap, titleOf } from "./html.js";

type Severity = "error" | "warning" | "info";
interface Check {
  id: string;
  passed: boolean;
  severity: Severity;
  message: string;
  value?: unknown;
}

const WEIGHT: Record<Severity, number> = { error: 10, warning: 4, info: 1 };

export function seoAudit(page: FetchedPage) {
  const html = page.html;
  const url = new URL(page.finalUrl);
  const meta = metaMap(html);
  const title = titleOf(html);
  const desc = meta.description;
  const h1s = findElements(html, "h1").map((h) => h.text).filter(Boolean);
  const imgs = findTags(html, "img");
  const imgsNoAlt = imgs.filter((i) => i.attrs.alt === undefined);
  const linkTags = findTags(html, "link");
  const canonical = linkTags.find((l) => (l.attrs.rel ?? "").toLowerCase() === "canonical");
  const hreflangs = linkTags.filter((l) => (l.attrs.rel ?? "").toLowerCase() === "alternate" && l.attrs.hreflang);
  const robots = (meta.robots ?? "").toLowerCase();
  const xRobots = (page.headers["x-robots-tag"] ?? "").toLowerCase();
  const words = mainText(html).split(/\s+/).filter(Boolean).length;
  const anchors = findElements(html, "a");
  const emptyAnchors = anchors.filter((a) => !a.text && !/aria-label|title/.test(Object.keys(a.attrs).join(" ")));
  const hasJsonLd = /application\/ld\+json/i.test(html);

  const checks: Check[] = [
    { id: "https", passed: url.protocol === "https:", severity: "error", message: "La página debe servirse por HTTPS." },
    { id: "status", passed: page.status >= 200 && page.status < 300, severity: "error", message: "La página debe responder 2xx.", value: page.status },
    { id: "title-present", passed: !!title, severity: "error", message: "Falta la etiqueta <title>." },
    { id: "title-length", passed: !!title && title.length >= 30 && title.length <= 60, severity: "warning", message: "El título idealmente mide 30–60 caracteres.", value: title?.length ?? 0 },
    { id: "meta-description", passed: !!desc, severity: "error", message: "Falta meta description." },
    { id: "meta-description-length", passed: !!desc && desc.length >= 70 && desc.length <= 160, severity: "warning", message: "La meta description idealmente mide 70–160 caracteres.", value: desc?.length ?? 0 },
    { id: "h1-single", passed: h1s.length === 1, severity: "warning", message: "Debe haber exactamente un <h1>.", value: h1s.length },
    { id: "canonical", passed: !!canonical?.attrs.href, severity: "warning", message: "Falta <link rel=canonical>.", value: absolute(canonical?.attrs.href, page.finalUrl) },
    { id: "indexable", passed: !robots.includes("noindex") && !xRobots.includes("noindex"), severity: "error", message: "La página está marcada como noindex.", value: robots || xRobots || null },
    { id: "viewport", passed: !!meta.viewport, severity: "warning", message: "Falta meta viewport (móvil)." },
    { id: "lang", passed: /<html\b[^>]*\blang=/i.test(html), severity: "warning", message: "Falta el atributo lang en <html>." },
    { id: "img-alt", passed: imgsNoAlt.length === 0, severity: "warning", message: "Imágenes sin atributo alt.", value: { total: imgs.length, withoutAlt: imgsNoAlt.length } },
    { id: "og-tags", passed: !!meta["og:title"] && !!meta["og:image"], severity: "info", message: "Faltan etiquetas Open Graph (og:title / og:image)." },
    { id: "twitter-card", passed: !!meta["twitter:card"], severity: "info", message: "Falta twitter:card." },
    { id: "structured-data", passed: hasJsonLd, severity: "info", message: "No hay datos estructurados JSON-LD." },
    { id: "content-length", passed: words >= 300, severity: "warning", message: "Contenido escaso (<300 palabras).", value: words },
    { id: "empty-links", passed: emptyAnchors.length === 0, severity: "info", message: "Enlaces sin texto accesible.", value: emptyAnchors.length },
    { id: "page-weight", passed: page.bytes <= 1_500_000, severity: "info", message: "HTML pesado (>1.5 MB).", value: page.bytes },
    { id: "response-time", passed: page.elapsedMs <= 2_000, severity: "warning", message: "Respuesta lenta (>2 s).", value: page.elapsedMs },
  ];

  const max = checks.reduce((s, c) => s + WEIGHT[c.severity], 0);
  const lost = checks.filter((c) => !c.passed).reduce((s, c) => s + WEIGHT[c.severity], 0);
  const score = Math.round(((max - lost) / max) * 100);

  return {
    url: page.finalUrl,
    score,
    grade: score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F",
    summary: {
      errors: checks.filter((c) => !c.passed && c.severity === "error").length,
      warnings: checks.filter((c) => !c.passed && c.severity === "warning").length,
      notices: checks.filter((c) => !c.passed && c.severity === "info").length,
    },
    title,
    description: desc ?? null,
    h1: h1s,
    hreflang: hreflangs.map((l) => ({ lang: l.attrs.hreflang, href: absolute(l.attrs.href, page.finalUrl) })),
    issues: checks.filter((c) => !c.passed).map(({ passed, ...c }) => c),
    passed: checks.filter((c) => c.passed).map((c) => c.id),
  };
}
