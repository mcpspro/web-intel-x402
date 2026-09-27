// Cliente de prueba: paga una llamada a tu propia API con USDC de testnet.
// Uso: BUYER_PRIVATE_KEY=0x... npx tsx scripts/pay.ts [url]
// Usa SIEMPRE una wallet de pruebas desechable, nunca la que recibe los pagos.
import "dotenv/config";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const key = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) {
  console.error("Define BUYER_PRIVATE_KEY (clave de una wallet de PRUEBAS con USDC de Base Sepolia).");
  process.exit(1);
}
const url = process.argv[2] ?? "http://localhost:4021/v1/seo-audit?url=example.com";

const client = new x402Client();
client.setSpendControls({ maxAmountPerPayment: "$0.05" });
client.register("eip155:*", new ExactEvmScheme(privateKeyToAccount(key)));

const res = await wrapFetchWithPayment(fetch, client)(url);
const result = await new x402HTTPClient(client).processResponse(res);
console.dir(result, { depth: 4 });
