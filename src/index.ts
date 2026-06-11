import { extractBearer, resolveKey, Tier } from "./auth";
import { checkAndIncrement, quotaErrorResponse, withRateLimitHeaders } from "./billing";
import { McpServer, ToolContext, isJsonRpcRequest } from "./mcp-server";
import { handleUpgrade, handleAccount, handleAccountRotate, handleWelcome, handleAccountExport, handleAccountDelete, handleSupportPage, handleSupportSubmit, handleFavicon, buildSocialMeta, handleTeamList, handleTeamInvite, handleTeamRevoke, handleTeamAccept } from "./checkout";
import { handleDodoWebhook } from "./webhook";
import { handleAdminListKeys, handleAdminListSupport, handleAdminListEvents } from "./admin";
import { handleOpenApi } from "./openapi";
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
  BREVO_API_KEY?: string;
  SUPPORT_FORWARD_EMAIL?: string;
  PRODUCT_NAME?: string; PRODUCT_TAGLINE?: string; PRODUCT_URL?: string;
  ADMIN_TOKEN?: string;
}

const SERVER_INFO = { name: "uspto-patents-mcp", version: "0.1.2" };
const TOOLS = buildTools();
const server = new McpServer(SERVER_INFO);
for (const t of TOOLS) server.register(t);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/health") return json({ ok: true, server: SERVER_INFO });
    if (request.method === "GET" && url.pathname === "/llms.txt") return new Response(LLMS_TXT, { headers: { "Content-Type": "text/markdown" } });
    if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg")) return handleFavicon();
    if (request.method === "GET" && url.pathname === "/") return new Response(renderLanding(env, url), { headers: { "Content-Type": "text/html" } });
    if (request.method === "GET" && url.pathname === "/upgrade") return handleUpgrade(request, env, new URL(request.url).origin);
    if (request.method === "GET" && url.pathname === "/account") return withCors(await handleAccount(request, env));
    if (request.method === "GET" && url.pathname === "/account/export") return withCors(await handleAccountExport(request, env));
    if (request.method === "DELETE" && url.pathname === "/account") return withCors(await handleAccountDelete(request, env));
    if (request.method === "POST" && url.pathname === "/account/delete") return withCors(await handleAccountDelete(request, env));
    if (request.method === "GET" && url.pathname === "/support") return withCors(handleSupportPage(request, env));
    if (request.method === "POST" && url.pathname === "/support") return withCors(await handleSupportSubmit(request, env));
    if (request.method === "GET" && (url.pathname === "/welcome" || url.pathname === "/welcome.json")) return withCors(await handleWelcome(request, env));
    if (request.method === "POST" && url.pathname === "/account/rotate") return withCors(await handleAccountRotate(request, env));
    if (request.method === "GET" && url.pathname === "/account/team") return withCors(await handleTeamList(request, env));
    if (request.method === "POST" && url.pathname === "/account/team/invite") return withCors(await handleTeamInvite(request, env, new URL(request.url).origin));
    if (request.method === "POST" && url.pathname === "/account/team/revoke") return withCors(await handleTeamRevoke(request, env));
    if (request.method === "GET" && url.pathname === "/team/accept") return withCors(await handleTeamAccept(request, env));
    if (request.method === "POST" && url.pathname === "/webhooks/dodo") return await handleDodoWebhook(request, env);
    if (request.method === "GET" && url.pathname === "/openapi.json") return withCors(handleOpenApi(env, { serverInfo: SERVER_INFO, tools: TOOLS, origin: url.origin }));
    if (request.method === "GET" && url.pathname === "/admin/list-keys") return await handleAdminListKeys(request, env);
    if (request.method === "GET" && url.pathname === "/admin/list-support") return await handleAdminListSupport(request, env);
    if (request.method === "GET" && url.pathname === "/admin/list-events") return await handleAdminListEvents(request, env);
    if (url.pathname !== "/mcp") return new Response("Not Found", { status: 404 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, OPTIONS" } });

    const apiKey = extractBearer(request);
    const resolved = await resolveKey(apiKey, env.USAGE);
    const tier = resolved.tier;
    const quota = await checkAndIncrement(resolved.effectiveKey ?? apiKey, tier, env.USAGE);
    if (!quota.allowed) return withCors(quotaErrorResponse(quota, env.UPGRADE_URL));

    let body: unknown;
    try { body = await request.json(); }
    catch { return withCors(rpcErr(null, -32700, "Parse error")); }
    if (!isJsonRpcRequest(body)) return withCors(rpcErr((body as any)?.id ?? null, -32600, "Invalid JSON-RPC"));

    const ctx: ToolContext = { env: env as unknown as Record<string, any>, apiKey, tier: tier as Tier, callsRemaining: quota.callsRemaining };
    const r = await server.handle(body, ctx);
    if (r === null) return new Response(null, { status: 204, headers: corsHeaders() });
    return withRateLimitHeaders(withCors(json(r)), tier as Tier, quota);
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

Endpoint: https://uspto-patents-mcp.atlasword.workers.dev/mcp
`;
function renderLanding(env: Env, url: URL): string {
  const productName = env.PRODUCT_NAME ?? "uspto-patents-mcp";
  const tagline = env.PRODUCT_TAGLINE ?? "MCP server for US patent search via USPTO PatentsView. Search, read, assignee portfolio, citation graph.";
  const meta = buildSocialMeta(env, {
    title: `${productName}`,
    description: tagline,
    url: env.PRODUCT_URL || url.origin,
  });
  void productName; void tagline;
  return `<!doctype html><html><head><meta charset="utf-8"><title>uspto-patents-mcp</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:4rem auto;padding:0 1rem}code{background:#f3f3f3;padding:.1em .35em;border-radius:3px}</style>${meta}
</head>
<body>
<div style="background:#fef3c7;border:1px solid #f59e0b;color:#78350f;padding:.8em 1em;border-radius:8px;margin-bottom:1.5em;font-size:.95rem">
  &#9888; <strong>Heads up:</strong> this product is in maintenance mode while the upstream USPTO PatentsView v1 API sunsets in 2026. Patent search may have reduced coverage during the migration.
</div>
<h1>uspto-patents-mcp</h1>
<p>US patents for AI agents. From $9/mo.</p>
<p><code>POST https://uspto-patents-mcp.atlasword.workers.dev/mcp</code></p></body></html>`;
}
