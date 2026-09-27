import { Hono } from "hono";
import { cors } from "hono/cors";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { FetchError, parseTargetUrl, safeFetchPage, type HostResolver } from "./safeFetch.js";
import { extractPage } from "./services/extract.js";
import { seoAudit } from "./services/seo.js";
import { analyzeText } from "./services/text.js";
import { openApiSpec } from "./openapi.js";
import { handleMcp } from "./mcp.js";

export interface Env {
  EVM_ADDRESS?: string;
  SVM_ADDRESS?: string;
  /** "testnet" (por defecto, dinero de prueba) o "mainnet" (USDC real). */
  X402_NETWORK?: string;
  FACILITATOR_URL?: string;
  PRICE_EXTRACT?: string;
  PRICE_SEO?: string;
  PRICE_TEXT?: string;
}

const NETWORKS = {
  testnet: { evm: "eip155:84532", svm: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", label: "Base Sepolia / Solana Devnet (pruebas)" },
  mainnet: { evm: "eip155:8453", svm: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", label: "Base / Solana (USDC real)" },
} as const;

const TESTNET_FACILITATOR = "https://x402.org/facilitator";

export type PaymentConfig = ReturnType<typeof paymentConfig>;

export function paymentConfig(env: Env) {
  const evm = env.EVM_ADDRESS?.trim();
  const svm = env.SVM_ADDRESS?.trim();
  if (!evm && !svm) throw new Error("Configura EVM_ADDRESS y/o SVM_ADDRESS (tu dirección pública de wallet).");
  if (evm && !/^0x[0-9a-fA-F]{40}$/.test(evm)) throw new Error("EVM_ADDRESS no es una dirección 0x válida.");

  const mode = env.X402_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const net = NETWORKS[mode];
  const facilitatorUrl = env.FACILITATOR_URL?.trim() || (mode === "testnet" ? TESTNET_FACILITATOR : "");
  if (!facilitatorUrl) throw new Error("En mainnet debes definir FACILITATOR_URL.");

  const prices = {
    extract: env.PRICE_EXTRACT || "$0.002",
    seo: env.PRICE_SEO || "$0.005",
    text: env.PRICE_TEXT || "$0.001",
  };

  const accepts = (price: string) => [
    ...(evm ? [{ scheme: "exact", price, network: net.evm, payTo: evm }] : []),
    ...(svm ? [{ scheme: "exact", price, network: net.svm, payTo: svm }] : []),
  ];

  const newResourceServer = () => {
    const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl }));
    if (evm) server.register(net.evm, new ExactEvmScheme());
    if (svm) server.register(net.svm, new ExactSvmScheme());
    return server;
  };

  return { evm, svm, net, prices, accepts, newResourceServer };
}

export function createApp(env: Env, resolveHost?: HostResolver) {
  const cfg = paymentConfig(env);
  const { net, prices, accepts } = cfg;
  const server = cfg.newResourceServer();
  server.registerExtension(bazaarResourceServerExtension);

  const routes = {
    "GET /v1/extract": {
      accepts: accepts(prices.extract),
      description: "Extrae de cualquier URL pública: título, descripción, texto principal limpio, encabezados, enlaces, Open Graph y JSON-LD.",
      mimeType: "application/json",
      extensions: declareDiscoveryExtension({
        input: { url: "https://example.com" },
        inputSchema: { type: "object", properties: { url: { type: "string", description: "URL http(s) pública" } }, required: ["url"] },
        output: { example: { title: "Example Domain", wordCount: 17, text: "…", links: [] } },
      }),
    },
    "GET /v1/seo-audit": {
      accepts: accepts(prices.seo),
      description: "Auditoría SEO on-page de una URL: puntuación 0-100, nota A-F y lista de problemas (título, meta, H1, canonical, noindex, alt, OG, JSON-LD, velocidad).",
      mimeType: "application/json",
      extensions: declareDiscoveryExtension({
        input: { url: "https://example.com" },
        inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
        output: { example: { score: 72, grade: "C", issues: [{ id: "meta-description", severity: "error" }] } },
      }),
    },
    "POST /v1/text-analysis": {
      accepts: accepts(prices.text),
      description: "Analiza texto (es/en/pt/fr): idioma, legibilidad, palabras clave, frases clave, sentimiento y estadísticas.",
      mimeType: "application/json",
      extensions: declareDiscoveryExtension({
        bodyType: "json",
        input: { text: "Texto a analizar…" },
        inputSchema: { type: "object", properties: { text: { type: "string", maxLength: 200000 }, topN: { type: "integer" } }, required: ["text"] },
        output: { example: { language: "es", readability: { score: 64.2 }, keywords: [{ term: "api", count: 3 }] } },
      }),
    },
  };

  const app = new Hono();
  app.use("*", cors({ origin: "*", exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE", "X-PAYMENT-RESPONSE"] }));

  // Gratis: catálogo y salud (para que humanos y agentes descubran el servicio).
  app.get("/", (c) =>
    c.json({
      name: "Web Intel API (x402)",
      description: "Datos web y análisis de texto de pago por uso en USDC vía x402. Sin cuentas ni API keys.",
      network: net.label,
      endpoints: Object.entries(routes).map(([route, r]) => ({ route, price: r.accepts[0]?.price, description: r.description })),
      mcp: { url: `${new URL(c.req.url).origin}/mcp`, transport: "streamable-http", tools: ["extract_webpage", "seo_audit", "analyze_text", "pricing"] },
      howToPay: "https://docs.x402.org",
    }),
  );
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/favicon.ico", (c) => c.body(FAVICON, 200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" }));
  app.get("/openapi.json", (c) => c.json(openApiSpec(new URL(c.req.url).origin, prices)));

  // MCP remoto (Streamable HTTP). El cobro x402 va dentro de cada herramienta de pago.
  app.all("/mcp", (c) => handleMcp(c.req.raw, cfg, resolveHost));

  app.use(paymentMiddleware(routes as never, server));

  app.get("/v1/extract", async (c) => {
    const page = await safeFetchPage(parseTargetUrl(c.req.query("url")), resolveHost);
    return c.json(extractPage(page));
  });

  app.get("/v1/seo-audit", async (c) => {
    const page = await safeFetchPage(parseTargetUrl(c.req.query("url")), resolveHost);
    return c.json(seoAudit(page));
  });

  app.post("/v1/text-analysis", async (c) => {
    const body = await c.req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text : null;
    if (!text?.trim()) throw new FetchError("El cuerpo debe ser JSON con un campo 'text'.");
    const topN = Math.min(50, Math.max(1, Number(body.topN) || 15));
    return c.json(analyzeText(text, topN));
  });

  app.onError((err, c) => {
    if (err instanceof FetchError) return c.json({ error: err.message }, err.status as 400);
    console.error(err);
    return c.json({ error: "Error interno" }, 500);
  });

  return app;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0052FF"/><text x="32" y="42" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#fff" text-anchor="middle">402</text></svg>`;
