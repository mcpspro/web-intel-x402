import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPage } from "../src/services/extract.js";
import { seoAudit } from "../src/services/seo.js";
import { analyzeText } from "../src/services/text.js";
import { FetchError, parseTargetUrl, safeFetchPage, type FetchedPage } from "../src/safeFetch.js";
import { createApp } from "../src/app.js";

const HTML = `<!doctype html><html lang="es"><head>
<title>Guía completa de pagos x402 para agentes de IA</title>
<meta name="description" content="Aprende cómo los agentes de IA pagan APIs con USDC usando el protocolo x402, paso a paso y con ejemplos.">
<meta name="viewport" content="width=device-width">
<meta property="og:title" content="Guía x402"><meta property="og:image" content="/img.png">
<link rel="canonical" href="/guia">
<script type="application/ld+json">{"@type":"Article"}</script>
<script>var x = "<p>no</p>";</script>
</head><body><nav><a href="/menu">Menú</a></nav>
<article><h1>Pagos x402</h1><p>Los agentes pagan por cada llamada &amp; reciben datos.</p>
<h2>Cómo funciona</h2><p>El servidor responde 402.</p><img src="a.png"><a href="https://otro.com/x">Enlace</a></article>
</body></html>`;

const page = (html: string, over: Partial<FetchedPage> = {}): FetchedPage => ({
  finalUrl: "https://ejemplo.com/guia", status: 200, contentType: "text/html", html,
  bytes: html.length, elapsedMs: 120, headers: {}, ...over,
});

test("extract: título, meta, texto limpio, enlaces absolutos y JSON-LD", () => {
  const r = extractPage(page(HTML));
  assert.equal(r.title, "Guía completa de pagos x402 para agentes de IA");
  assert.equal(r.language, "es");
  assert.equal(r.canonical, "https://ejemplo.com/guia");
  assert.equal(r.image, "https://ejemplo.com/img.png");
  assert.match(r.text, /Los agentes pagan por cada llamada & reciben datos\./);
  assert.doesNotMatch(r.text, /Menú|var x/);
  assert.deepEqual(r.headings.map((h) => h.text), ["Pagos x402", "Cómo funciona"]);
  assert.ok(r.links.some((l) => l.url === "https://otro.com/x" && !l.internal));
  assert.deepEqual(r.jsonLd, [{ "@type": "Article" }]);
});

test("seo: detecta imagen sin alt y contenido escaso; página vacía suspende", () => {
  const r = seoAudit(page(HTML));
  const ids = r.issues.map((i) => i.id);
  assert.ok(ids.includes("img-alt"));
  assert.ok(ids.includes("content-length"));
  assert.ok(!ids.includes("meta-description"));
  const bad = seoAudit(page("<html><body>hola</body></html>", { finalUrl: "http://x.com/" }));
  assert.equal(bad.grade, "F");
  assert.ok(bad.summary.errors >= 3);
});

test("text: idioma, palabras clave y sentimiento", () => {
  const r = analyzeText("El producto es excelente. La API es rápida y útil. Recomiendo la API a todos los desarrolladores.");
  assert.equal(r.language, "es");
  assert.equal(r.keywords[0].term, "api");
  assert.equal(r.sentiment.label, "positive");
  assert.equal(r.stats.sentences, 3);
  assert.equal(analyzeText("This is a bad, slow and broken tool. I hate it.").sentiment.label, "negative");
});

test("safeFetch: bloquea destinos internos (SSRF)", async () => {
  for (const u of ["http://localhost:4021", "http://127.0.0.1", "http://10.0.0.5", "http://169.254.169.254/latest", "http://[::1]/", "file:///etc/passwd", "http://intranet"]) {
    await assert.rejects(safeFetchPage(new URL(u)), FetchError, u);
  }
  await assert.rejects(safeFetchPage(new URL("https://evil.example.com"), async () => ["192.168.1.1"]), FetchError);
  assert.equal(parseTargetUrl("example.com").toString(), "https://example.com/");
});

test("app: rutas de pago devuelven 402 y el catálogo es gratis", async () => {
  const app = createApp({ EVM_ADDRESS: "0x1111111111111111111111111111111111111111" });
  assert.equal((await app.request("/")).status, 200);
  const r = await app.request("/v1/extract?url=example.com");
  assert.equal(r.status, 402);
  const req = JSON.parse(atob(r.headers.get("payment-required")!));
  assert.equal(req.accepts[0].network, "eip155:84532");
  assert.equal(req.accepts[0].amount, "2000");
  assert.throws(() => createApp({ EVM_ADDRESS: "no-valida" }));
  assert.throws(() => createApp({ EVM_ADDRESS: "0x1111111111111111111111111111111111111111", X402_NETWORK: "mainnet" }));
});

test("integración: extrae example.com real", { skip: !!process.env.OFFLINE }, async () => {
  const p = await safeFetchPage(parseTargetUrl("https://example.com"));
  assert.equal(p.status, 200);
  assert.match(extractPage(p).title ?? "", /Example Domain/);
});
