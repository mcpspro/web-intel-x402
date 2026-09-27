import "dotenv/config";
import { lookup } from "node:dns/promises";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const resolveHost = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address);
const app = createApp(process.env, resolveHost);
const port = Number(process.env.PORT) || 4021;

serve({ fetch: app.fetch, port });
console.log(`Web Intel API escuchando en http://localhost:${port} (red: ${process.env.X402_NETWORK || "testnet"})`);
