// USPTO PatentsView client.
// Docs: https://patentsview.org/apis
// Free, JSON, supports rich query DSL.

import { KvCache, stableKey } from "./cache";

export interface PatentsViewEnv {
  CACHE: KVNamespace;
  PATENTSVIEW_BASE: string;            // https://api.patentsview.org/api/v1
  PATENTSVIEW_API_KEY?: string;
}

export interface PatentSummary {
  patent_id: string;                  // e.g. "11000000"
  patent_title: string;
  patent_date: string;                // YYYY-MM-DD
  patent_abstract?: string;
  assignees?: Array<{ assignee_name: string; assignee_country?: string }>;
  inventors?: Array<{ inventor_name: string }>;
}

export class PatentsViewClient {
  private cache: KvCache;
  constructor(private env: PatentsViewEnv) { this.cache = new KvCache(env.CACHE, "pv"); }

  async search(opts: {
    query?: string;
    assignee?: string;
    inventor?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    page?: number;
  }): Promise<PatentSummary[]> {
    const q = this.buildQuery(opts);
    const key = `search:${stableKey(opts)}`;
    const json: any = await this.cache.memoize(key, 60 * 60, () =>
      this.post("/patent/", {
        q,
        f: ["patent_id", "patent_title", "patent_date", "patent_abstract", "assignees", "inventors"],
        s: [{ patent_date: "desc" }],
        o: { size: opts.limit ?? 25, page: opts.page ?? 1 },
      })
    );
    return (json?.patents ?? []) as PatentSummary[];
  }

  async readPatent(patentId: string): Promise<PatentSummary & { claims?: string[] }> {
    const id = patentId.replace(/[^0-9]/g, "");
    const key = `patent:${id}`;
    const json: any = await this.cache.memoize(key, 60 * 60 * 24 * 7, () =>
      this.post("/patent/", {
        q: { patent_id: id },
        f: ["patent_id", "patent_title", "patent_date", "patent_abstract", "assignees", "inventors", "claims"],
        o: { size: 1, page: 1 },
      })
    );
    const p = json?.patents?.[0];
    if (!p) throw new Error(`patent ${patentId} not found`);
    return p;
  }

  /**
   * Returns ALL patents assigned to a given entity (paginated under the hood).
   * Bug fix 0.1.2: previous version forgot to increment `page` between fetches.
   */
  async assigneePortfolio(opts: { assignee: string; limit?: number }): Promise<PatentSummary[]> {
    const pageSize = 100;
    const targetTotal = Math.min(opts.limit ?? 1000, 5000);
    const out: PatentSummary[] = [];
    for (let page = 1; out.length < targetTotal; page++) {
      const json: any = await this.post("/patent/", {
        q: { "assignees.assignee_name": opts.assignee },
        f: ["patent_id", "patent_title", "patent_date", "assignees"],
        s: [{ patent_date: "desc" }],
        o: { size: pageSize, page },        // ← page now properly increments
      });
      const batch = json?.patents ?? [];
      if (batch.length === 0) break;
      out.push(...batch);
      if (batch.length < pageSize) break;
    }
    return out.slice(0, targetTotal);
  }

  /**
   * BFS citation graph. Bug fix 0.1.2: ceiling of 50 patents per BFS level.
   */
  async citationGraph(opts: {
    patentId: string;
    depth?: number;
    direction?: "backward" | "forward" | "both";
  }): Promise<{ nodes: PatentSummary[]; edges: Array<{ from: string; to: string }> }> {
    const depth = Math.min(opts.depth ?? 1, 2);
    const direction = opts.direction ?? "backward";
    const id = opts.patentId.replace(/[^0-9]/g, "");

    const nodes = new Map<string, PatentSummary>();
    const edges: Array<{ from: string; to: string }> = [];
    let frontier = [id];

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const capped = frontier.slice(0, 50);  // CPU-budget ceiling
      const nextFrontier: string[] = [];
      for (const cur of capped) {
        const cites = await this.fetchCitations(cur, direction);
        for (const c of cites) {
          edges.push({ from: cur, to: c.patent_id });
          if (!nodes.has(c.patent_id)) {
            nodes.set(c.patent_id, c);
            nextFrontier.push(c.patent_id);
          }
        }
      }
      frontier = nextFrontier;
    }

    // Include the root in nodes for completeness.
    if (!nodes.has(id)) {
      try { nodes.set(id, await this.readPatent(id)); } catch { /* ignore */ }
    }

    return { nodes: [...nodes.values()], edges };
  }

  private async fetchCitations(patentId: string, direction: "backward" | "forward" | "both"): Promise<PatentSummary[]> {
    const out: PatentSummary[] = [];
    if (direction === "backward" || direction === "both") {
      const j: any = await this.post("/uspatentcitation/", {
        q: { patent_id: patentId },
        f: ["citation_id"],
        o: { size: 50, page: 1 },
      });
      for (const c of j?.uspatentcitations ?? []) {
        out.push({ patent_id: c.citation_id, patent_title: "", patent_date: "" });
      }
    }
    if (direction === "forward" || direction === "both") {
      const j: any = await this.post("/uspatentcitation/", {
        q: { citation_id: patentId },
        f: ["patent_id"],
        o: { size: 50, page: 1 },
      });
      for (const c of j?.uspatentcitations ?? []) {
        out.push({ patent_id: c.patent_id, patent_title: "", patent_date: "" });
      }
    }
    return out;
  }

  private buildQuery(opts: { query?: string; assignee?: string; inventor?: string; dateFrom?: string; dateTo?: string }): unknown {
    const clauses: any[] = [];
    if (opts.query) {
      clauses.push({ _text_any: { patent_title: opts.query, patent_abstract: opts.query } });
    }
    if (opts.assignee) clauses.push({ "assignees.assignee_name": opts.assignee });
    if (opts.inventor) clauses.push({ "inventors.inventor_name": opts.inventor });
    if (opts.dateFrom) clauses.push({ _gte: { patent_date: opts.dateFrom } });
    if (opts.dateTo)   clauses.push({ _lte: { patent_date: opts.dateTo } });
    return clauses.length === 1 ? clauses[0] : { _and: clauses };
  }

  private async post(path: string, body: unknown): Promise<any> {
    const r = await fetch(`${this.env.PATENTSVIEW_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.env.PATENTSVIEW_API_KEY ? { "X-Api-Key": this.env.PATENTSVIEW_API_KEY } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`PatentsView ${r.status}: ${txt.slice(0, 200)}`);
    }
    return r.json();
  }
}
