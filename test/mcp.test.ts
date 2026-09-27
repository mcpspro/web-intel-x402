import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";

test("mcp: lista herramientas, pricing gratis y herramienta de pago exige x402", async () => {
  const app = createApp({ EVM_ADDRESS: "0x1111111111111111111111111111111111111111" });
  const transport = new StreamableHTTPClientTransport(new URL("http://local/mcp"), {
    fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["analyze_text", "extract_webpage", "pricing", "seo_audit"]);

  const pricing = await client.callTool({ name: "pricing", arguments: {} });
  assert.match((pricing.content as { text: string }[])[0].text, /extract_webpage/);

  const paid = await client.callTool({ name: "analyze_text", arguments: { text: "hola mundo" } });
  assert.equal(paid.isError, true);
  const body = JSON.stringify(paid);
  assert.match(body, /eip155:84532/);
  assert.match(body, /0x1111111111111111111111111111111111111111/);
  await client.close();
});

test("mcp: GET devuelve 405", async () => {
  const app = createApp({ EVM_ADDRESS: "0x1111111111111111111111111111111111111111" });
  assert.equal((await app.request("/mcp")).status, 405);
});
