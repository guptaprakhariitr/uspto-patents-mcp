import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PatentsViewClient } from "../src/patentsview";
import { McpServer, ToolContext } from "../src/mcp-server";
import { buildTools } from "../src/tools";

class FakeKv {
  store = new Map<string, string>();
  async get(key: string, type?: "text" | "json"): Promise<any> {
    const v = this.store.get(key); if (v === undefined) return null;
    if (type === "json") return JSON.parse(v); return v;
  }
  async put(key: string, value: string): Promise<void> { this.store.set(key, value); }
  async delete(key: string): Promise<void> { this.store.delete(key); }
}

const env = {
  CACHE: new FakeKv() as unknown as KVNamespace,
  USAGE: new FakeKv() as unknown as KVNamespace,
  PATENTSVIEW_BASE: "https://api.patentsview.org/api/v1",
  UPGRADE_URL: "x",
};

// Fabricated PatentsView responses
const fixSearchAI = {
  patents: [
    { patent_id: "11500000", patent_title: "Neural network optimization", patent_date: "2026-05-12", assignees: [{ assignee_name: "Microsoft Technology Licensing, LLC" }] },
    { patent_id: "11499999", patent_title: "Attention mechanism for LLM", patent_date: "2026-05-10", assignees: [{ assignee_name: "Microsoft Technology Licensing, LLC" }] },
  ],
};

// Pagination test: page 1 returns 100, page 2 returns 50, page 3 returns 0.
let pageRequests: number[] = [];

beforeEach(() => {
  (env.CACHE as any).store = new Map();
  pageRequests = [];
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) || "{}");
    pageRequests.push(body?.o?.page ?? -1);
    const u = typeof url === "string" ? url : url.toString();

    if (u.endsWith("/patent/")) {
      // Assignee portfolio pagination test
      if (body?.q?.["assignees.assignee_name"]) {
        const page = body.o?.page ?? 1;
        if (page === 1) return new Response(JSON.stringify({ patents: Array.from({ length: 100 }, (_, i) => ({ patent_id: `p1-${i}`, patent_title: `T${i}`, patent_date: "2026-01-01" })) }), { status: 200 });
        if (page === 2) return new Response(JSON.stringify({ patents: Array.from({ length: 50 }, (_, i) => ({ patent_id: `p2-${i}`, patent_title: `T${i}`, patent_date: "2026-01-01" })) }), { status: 200 });
        return new Response(JSON.stringify({ patents: [] }), { status: 200 });
      }
      // readPatent
      if (body?.q?.patent_id) {
        return new Response(JSON.stringify({ patents: [{ patent_id: body.q.patent_id, patent_title: "Test", patent_date: "2026-05-12", patent_abstract: "abstract", claims: ["1. A method..."] }] }), { status: 200 });
      }
      // generic search
      return new Response(JSON.stringify(fixSearchAI), { status: 200 });
    }
    if (u.endsWith("/uspatentcitation/")) {
      if (body?.q?.patent_id) {
        // backward citations
        return new Response(JSON.stringify({ uspatentcitations: [{ citation_id: "10000001" }, { citation_id: "10000002" }] }), { status: 200 });
      }
      if (body?.q?.citation_id) {
        // forward citations
        return new Response(JSON.stringify({ uspatentcitations: [{ patent_id: "12000001" }] }), { status: 200 });
      }
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("PatentsViewClient.search", () => {
  it("returns search results with assignee filter", async () => {
    const c = new PatentsViewClient(env as any);
    const out = await c.search({ query: "neural network", assignee: "Microsoft" });
    expect(out.length).toBe(2);
    expect(out[0].patent_id).toBe("11500000");
  });
});

describe("PatentsViewClient.assigneePortfolio (0.1.2 pagination bug fix)", () => {
  it("paginates correctly, incrementing page each request", async () => {
    const c = new PatentsViewClient(env as any);
    const out = await c.assigneePortfolio({ assignee: "Microsoft Technology Licensing, LLC", limit: 200 });
    expect(out.length).toBe(150);
    // We must have requested pages 1 and 2 (not page 1 twice — the bug).
    expect(pageRequests.filter((p) => p === 1).length).toBe(1);
    expect(pageRequests).toContain(2);
  });

  it("stops at requested limit", async () => {
    const c = new PatentsViewClient(env as any);
    const out = await c.assigneePortfolio({ assignee: "Microsoft Technology Licensing, LLC", limit: 50 });
    expect(out.length).toBe(50);
  });
});

describe("PatentsViewClient.readPatent", () => {
  it("strips non-digits and returns the patent record", async () => {
    const c = new PatentsViewClient(env as any);
    const p: any = await c.readPatent("US 11,500,000");
    expect(p.patent_id).toBe("11500000");
    expect(p.claims.length).toBeGreaterThan(0);
  });
});

describe("PatentsViewClient.citationGraph", () => {
  it("returns backward citations by default", async () => {
    const c = new PatentsViewClient(env as any);
    const g = await c.citationGraph({ patentId: "11500000", depth: 1, direction: "backward" });
    // 2 citations + root = 3 nodes (but root might be deduped if readPatent throws).
    // Edges = 2.
    expect(g.edges.length).toBe(2);
    expect(g.edges[0].from).toBe("11500000");
  });
  it("returns forward citations when direction=forward", async () => {
    const c = new PatentsViewClient(env as any);
    const g = await c.citationGraph({ patentId: "11500000", depth: 1, direction: "forward" });
    expect(g.edges.length).toBe(1);
    expect(g.edges[0].to).toBe("12000001");
  });
});

describe("MCP protocol", () => {
  const server = new McpServer({ name: "uspto-patents-mcp", version: "0.1.2" });
  for (const t of buildTools()) server.register(t);
  const ctx: ToolContext = { env: env as any, apiKey: null, tier: "free", callsRemaining: 100 };

  it("free tier hides citation_graph + subscribe_grants", async () => {
    const r = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx);
    const names = (r!.result as any).tools.map((t: any) => t.name) as string[];
    expect(names).toContain("uspto_patent_search");
    expect(names).toContain("uspto_assignee_portfolio");
    expect(names).not.toContain("uspto_citation_graph");
    expect(names).not.toContain("uspto_subscribe_grants");
  });

  it("uspto_read_patent end-to-end", async () => {
    const r = await server.handle(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "uspto_read_patent", arguments: { patent_number: "US11500000" } } }, ctx
    );
    const out = JSON.parse((r!.result as any).content[0].text);
    expect(out.patent_id).toBe("11500000");
  });
});
