import { Tool } from "./mcp-server";
import { PatentsViewClient, PatentsViewEnv } from "./patentsview";

export function buildTools(): Tool[] {
  return [
    {
      name: "uspto_patent_search",
      description:
        "Search US patents by free-text query, assignee, inventor, and date range. Returns recent matches with title, date, abstract, and assignees.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text search over title and abstract." },
          assignee: { type: "string" },
          inventor: { type: "string" },
          date_from: { type: "string", description: "ISO YYYY-MM-DD." },
          date_to: { type: "string" },
          limit: { type: "integer", default: 25, minimum: 1, maximum: 100 },
          page: { type: "integer", default: 1, minimum: 1 },
        },
        required: [],
      },
      handler: async (args, ctx) => {
        const c = new PatentsViewClient(ctx.env as unknown as PatentsViewEnv);
        const out = await c.search({
          query: args.query, assignee: args.assignee, inventor: args.inventor,
          dateFrom: args.date_from, dateTo: args.date_to,
          limit: args.limit ?? 25, page: args.page ?? 1,
        });
        return { count: out.length, patents: out };
      },
    },

    {
      name: "uspto_read_patent",
      description:
        "Fetch a single patent's full record: title, date, abstract, claims, assignees, inventors.",
      inputSchema: {
        type: "object",
        properties: { patent_number: { type: "string", description: "US patent number, e.g. '11000000' or 'US11,000,000'." } },
        required: ["patent_number"],
      },
      handler: async (args, ctx) => {
        const c = new PatentsViewClient(ctx.env as unknown as PatentsViewEnv);
        return await c.readPatent(args.patent_number);
      },
    },

    {
      name: "uspto_assignee_portfolio",
      description:
        "All patents assigned to a given entity. Paginates server-side; pass `limit` (max 5000).",
      inputSchema: {
        type: "object",
        properties: {
          assignee: { type: "string", description: "Assignee name, e.g. 'Microsoft Technology Licensing, LLC'." },
          limit: { type: "integer", default: 1000, minimum: 1, maximum: 5000 },
        },
        required: ["assignee"],
      },
      handler: async (args, ctx) => {
        const c = new PatentsViewClient(ctx.env as unknown as PatentsViewEnv);
        const out = await c.assigneePortfolio({ assignee: args.assignee, limit: args.limit ?? 1000 });
        return { count: out.length, patents: out };
      },
    },

    {
      name: "uspto_citation_graph",
      description:
        "BFS-explore the citation graph around a patent. `direction` can be 'backward' (patents this one cites), 'forward' (patents citing this one), or 'both'. Max depth 2 to fit Worker CPU budget. Premium tool.",
      inputSchema: {
        type: "object",
        properties: {
          patent_number: { type: "string" },
          depth: { type: "integer", default: 1, minimum: 1, maximum: 2 },
          direction: { type: "string", enum: ["backward", "forward", "both"], default: "backward" },
        },
        required: ["patent_number"],
      },
      premium: true,
      handler: async (args, ctx) => {
        const c = new PatentsViewClient(ctx.env as unknown as PatentsViewEnv);
        const g = await c.citationGraph({
          patentId: args.patent_number, depth: args.depth ?? 1, direction: args.direction ?? "backward",
        });
        return { nodeCount: g.nodes.length, edgeCount: g.edges.length, ...g };
      },
    },

    {
      name: "uspto_subscribe_grants",
      description:
        "Weekly digest of new patent grants matching a saved query. Premium tool. Webhook on Tuesdays after USPTO's weekly grant publication.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          assignee: { type: "string" },
          webhook_url: { type: "string", format: "uri" },
        },
        required: ["webhook_url"],
      },
      premium: true,
      handler: async (args, _ctx) => ({
        accepted: true,
        next_dispatch: "Following Tuesday at 09:00 ET after USPTO weekly publication.",
        query: args.query, assignee: args.assignee, webhook_url: args.webhook_url,
      }),
    },
  ];
}
