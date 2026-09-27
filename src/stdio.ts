// Entrada MCP por stdio (para catálogos como Glama que arrancan el servidor en Docker).
// Por defecto usa testnet y la wallet pública del proyecto; configurable por variables de entorno.
import "dotenv/config";
import { lookup } from "node:dns/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { paymentConfig } from "./app.js";
import { buildServer } from "./mcp.js";

const cfg = paymentConfig({
  ...process.env,
  EVM_ADDRESS: process.env.EVM_ADDRESS || "0xC10f83Fa8D5e2AcD5D0725d8eAc8A7A908a14BA0",
});
const resolveHost = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address);
const server = await buildServer(cfg, resolveHost);
await server.connect(new StdioServerTransport());
