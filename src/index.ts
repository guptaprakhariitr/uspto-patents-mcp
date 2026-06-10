import { extractBearer, resolveKey, Tier } from "./auth";
import { checkAndIncrement, quotaErrorResponse } from "./billing";
import { McpServer, ToolContext, isJsonRpcRequest } from "./mcp-server";
import { handleUpgrade, handleAccount } from "./checkout";
import { handleDodoWebhook } from "./webhook";
import { buildTools } from "./tools";

export interface Env {
  CACHE: KVNamespace;
  USAGE: KVNamespace;
  UPGRADE_URL: string;
  PATENTSVIEW_BASE: string;
  PATENTSVIEW_API_KEY?: string;
  DODO_API_KEY: string;
  DODO_WEBHOOK_SECRET: string;
  DODO_BASE?: string;
  DODO_PRODUCT_ID_SOLO: string;
  DODO_PRODUCT_ID_TEAM: string;
  DODO_PRODUCT_ID_PRO: string;
  CUSTOMER_PORTAL_RETURN_URL?: string;
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
  PRODUCT_NAME?: string;
}

const SERVER_INFO = { name: "uspto-patents-mcp", version: "0.1.2" };
const server = new McpServer(SERVER_INFO);
for (const t of buildTools()) server.register(t);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, server: SERVER_INFO });
    if (request.method === "GET" && url.pathname === "/llms.txt") return new Response(LLMS_TXT, { headers: { "Content-Type": "text/markdown" } });
    if (request.method === "GET" && url.pathname === "/") return new Response(LANDING_HTML, { headers: { "Content-Type": "text/html" } });
    if (request.method === "GET" && url.pathname === "/upgrade") return handleUpgrade(request, env, new URL(request.url).origin);
    if (request.method === "GET" && url.pathname === "/account") return withCors(await handleAccount(request, env));
    if (request.method === "POST" && url.pathname === "/webhooks/dodo") return await handleDodoWebhook(request, env);
    if (url.pathname !== "/mcp") return new Response("Not Found", { status: 404 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, OPTIONS" } });

    const apiKey = extractBearer(request);
    const { tier } = await resolveKey(apiKey, env.USAGE);
    const quota = await checkAndIncrement(apiKey, tier, env.USAGE);
    if (!quota.allowed) return withCors(quotaErrorResponse(quota, env.UPGRADE_URL));

    let body: unknown;
    try { body = await request.json(); }
    catch { return withCors(rpcErr(null, -32700, "Parse error")); }
    if (!isJsonRpcRequest(body)) return withCors(rpcErr((body as any)?.id ?? null, -32600, "Invalid JSON-RPC"));

    const ctx: ToolContext = { env: env as unknown as Record<string, any>, apiKey, tier: tier as Tier, callsRemaining: quota.callsRemaining };
    const r = await server.handle(body, ctx);
    if (r === null) return new Response(null, { status: 204, headers: corsHeaders() });
    return withCors(json(r));
  },
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { ...init, headers: { ...(init.headers || {}), "Content-Type": "application/json" } });
}
function corsHeaders(): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Session-Id", "Access-Control-Max-Age": "86400" };
}
function withCors(r: Response): Response {
  const headers = new Headers(r.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
}
function rpcErr(id: any, code: number, message: string): Response {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 400 });
}

const LLMS_TXT = `# uspto-patents-mcp

> US patents via PatentsView for AI agents.

## Tools
- uspto_patent_search — by query / assignee / inventor / date.
- uspto_read_patent — full patent record.
- uspto_assignee_portfolio — all patents for an entity (paginated).
- uspto_citation_graph — backward / forward citations (premium).
- uspto_subscribe_grants — weekly grant alerts (premium).

Endpoint: https://uspto-patents-mcp.workers.dev/mcp
`;
const LANDING_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>uspto-patents-mcp</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:4rem auto;padding:0 1rem}code{background:#f3f3f3;padding:.1em .35em;border-radius:3px}</style></head>
<body><h1>uspto-patents-mcp</h1>
<p>US patents for AI agents. From $9/mo.</p>
<p><code>POST https://uspto-patents-mcp.workers.dev/mcp</code></p></body></html>`;
