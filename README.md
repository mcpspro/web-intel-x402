# Web Intel API (x402)

API de pago por uso para agentes de IA. Cada llamada se cobra en **USDC** directamente a tu wallet mediante el protocolo [x402](https://docs.x402.org). No hay cuentas, API keys ni KYC para tus clientes.

| Endpoint | Precio | Qué devuelve |
|---|---|---|
| `GET /v1/extract?url=…` | $0.002 | Título, descripción, texto limpio, encabezados, enlaces, Open Graph y JSON-LD |
| `GET /v1/seo-audit?url=…` | $0.005 | Puntuación SEO 0-100, nota A-F y lista de problemas |
| `POST /v1/text-analysis` `{"text": "…"}` | $0.001 | Idioma, legibilidad, palabras clave, sentimiento y estadísticas |
| `GET /` y `GET /health` | gratis | Catálogo y estado |

Si el servicio falla (por ejemplo, la URL no existe), **no se cobra** al cliente.

## 1. Configurar tu wallet (lo haces tú)

Necesitas solo tu **dirección pública** (`0x…`) de una wallet EVM, como MetaMask, Rabby o Coinbase Wallet. **Nunca pongas aquí tu clave privada ni tu frase semilla.**

```bash
cp .env.example .env
# edita .env y pon EVM_ADDRESS=0xTuDireccion
```

## 2. Probar en local (testnet, dinero de prueba)

```bash
npm install
npm test
npm run dev          # http://localhost:4021
```

Para probar un pago real en testnet:
1. Crea una wallet **desechable** de pruebas y consigue USDC de prueba en Base Sepolia en https://faucet.circle.com
2. Ejecuta: `BUYER_PRIVATE_KEY=0xClaveDePrueba npx tsx scripts/pay.ts`

## 3. Publicar gratis en Cloudflare Workers

La capa gratuita incluye 100.000 peticiones al día.

```bash
npx wrangler login                     # crea o entra en tu cuenta de Cloudflare (gratis)
npx wrangler secret put EVM_ADDRESS    # pega tu dirección pública
npm run deploy                         # te da una URL tipo https://web-intel-x402.<tu-sub>.workers.dev
```

## 4. Pasar a dinero real (mainnet)

En `wrangler.toml`, dentro de `[vars]`:

```toml
X402_NETWORK = "mainnet"
FACILITATOR_URL = "https://facilitator.payai.network"   # facilitador sin API key
```

Vuelve a ejecutar `npm run deploy`. Los pagos llegan en USDC sobre Base a tu `EVM_ADDRESS`.

Otra opción es el facilitador de Coinbase CDP, que requiere crear claves en https://portal.cdp.coinbase.com.

## 5. Conseguir clientes

- Cada ruta publica metadatos de descubrimiento **Bazaar**, así los agentes pueden encontrarla en los catálogos x402 cuando el facilitador la indexa tras el primer pago.
- Registra tu URL en directorios de x402 y de agentes, como [gigs.sh](https://gigs.sh) y el ecosistema en https://www.x402.org/ecosystem.
- Puedes cambiar los precios con `PRICE_EXTRACT`, `PRICE_SEO` y `PRICE_TEXT`.

## Estructura

```
src/app.ts            rutas, precios y middleware x402
src/safeFetch.ts      descarga segura (anti-SSRF, límites de tamaño y tiempo)
src/services/         extract, seo, text (lógica pura, sin dependencias)
src/node.ts           entrada para Node (local o VPS)
src/worker.ts         entrada para Cloudflare Workers
scripts/pay.ts        cliente de prueba que paga con x402
```

## Servidor MCP

La misma API está disponible como servidor MCP remoto (Streamable HTTP):

```
https://web-intel-x402.x402-web-intel-api.workers.dev/mcp
```

Herramientas: `extract_webpage`, `seo_audit`, `analyze_text` (de pago, x402) y `pricing` (gratis).
Los clientes pagan con [@x402/mcp](https://www.npmjs.com/package/@x402/mcp) (`createx402MCPClient`). Si una llamada falla, no se cobra.
