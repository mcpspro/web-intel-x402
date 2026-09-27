// Documento de descubrimiento (OpenAPI 3.1 + x-payment-info) que leen x402scan y otros catálogos.

const usd = (price: string) => Number(price.replace(/[$\s]/g, "")).toFixed(6);

const pay = (price: string) => ({
  "x-payment-info": { price: { mode: "fixed", currency: "USD", amount: usd(price) }, protocols: [{ x402: {} }] },
});

const urlParam = [{
  name: "url", in: "query", required: true,
  description: "URL pública http(s) a analizar (p. ej. https://example.com)",
  schema: { type: "string", minLength: 1, example: "https://example.com" },
}];

const errors = {
  "400": { description: "Parámetros inválidos (no se cobra)" },
  "402": { description: "Payment Required" },
  "502": { description: "No se pudo descargar la página (no se cobra)" },
};

export function openApiSpec(origin: string, prices: { extract: string; seo: string; text: string }) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Web Intel API",
      version: "1.0.0",
      description: "Pay-per-call web extraction, on-page SEO audits and text analytics for AI agents. Paid in USDC on Base via x402 — no accounts or API keys.",
      "x-guidance":
        "Use GET /v1/extract?url=<page> to get clean main text, title, metadata, headings, links, Open Graph and JSON-LD from any public web page (ideal for RAG and research agents). " +
        "Use GET /v1/seo-audit?url=<page> for an on-page SEO score (0-100), grade A-F and a prioritized list of issues. " +
        "Use POST /v1/text-analysis with JSON {\"text\": \"...\"} for language detection (es/en/pt/fr), readability, keywords, key phrases, sentiment and stats. " +
        "Requests that fail (invalid URL, unreachable page) are not charged.",
    },
    servers: [{ url: origin }],
    paths: {
      "/v1/extract": {
        get: {
          operationId: "extract",
          summary: "Extract - clean text, metadata and links from a web page",
          tags: ["Web", "Scraping"],
          ...pay(prices.extract),
          parameters: urlParam,
          responses: {
            "200": {
              description: "Extracted page",
              content: { "application/json": { schema: {
                type: "object",
                properties: {
                  url: { type: "string" }, title: { type: ["string", "null"] }, description: { type: ["string", "null"] },
                  language: { type: ["string", "null"] }, wordCount: { type: "integer" }, text: { type: "string" },
                  headings: { type: "array", items: { type: "object" } }, links: { type: "array", items: { type: "object" } },
                  openGraph: { type: "object" }, jsonLd: { type: "array" },
                },
                required: ["url", "text", "links"],
              } } },
            },
            ...errors,
          },
        },
      },
      "/v1/seo-audit": {
        get: {
          operationId: "seoAudit",
          summary: "SEO audit - on-page score, grade and issues for a URL",
          tags: ["SEO", "Web"],
          ...pay(prices.seo),
          parameters: urlParam,
          responses: {
            "200": {
              description: "SEO audit",
              content: { "application/json": { schema: {
                type: "object",
                properties: {
                  url: { type: "string" }, score: { type: "integer", minimum: 0, maximum: 100 },
                  grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
                  summary: { type: "object" }, issues: { type: "array", items: { type: "object" } }, passed: { type: "array", items: { type: "string" } },
                },
                required: ["url", "score", "grade", "issues"],
              } } },
            },
            ...errors,
          },
        },
      },
      "/v1/text-analysis": {
        post: {
          operationId: "textAnalysis",
          summary: "Text analysis - language, readability, keywords and sentiment",
          tags: ["NLP", "Text"],
          ...pay(prices.text),
          requestBody: {
            required: true,
            content: { "application/json": { schema: {
              type: "object",
              properties: {
                text: { type: "string", minLength: 1, maxLength: 200000, description: "Texto a analizar" },
                topN: { type: "integer", minimum: 1, maximum: 50, description: "Número de palabras clave (por defecto 15)" },
              },
              required: ["text"],
            } } },
          },
          responses: {
            "200": {
              description: "Text analysis",
              content: { "application/json": { schema: {
                type: "object",
                properties: {
                  language: { type: "string" }, stats: { type: "object" }, readability: { type: "object" },
                  sentiment: { type: "object" }, keywords: { type: "array", items: { type: "object" } }, keyPhrases: { type: "array", items: { type: "object" } },
                },
                required: ["language", "stats", "keywords"],
              } } },
            },
            "400": errors["400"],
            "402": errors["402"],
          },
        },
      },
    },
  };
}
