# Tools Reference — uspto-patents-mcp

Per-tool reference for AI agents. The descriptions below are what the LLM reads to decide whether to call your tool — verbatim from `src/tools.ts`.

## `uspto_patent_search`

Search US patents by free-text query, assignee, inventor, and date range. Returns recent matches with title, date, abstract, and assignees.

See `src/tools.ts` for the JSON Schema input.

## `uspto_read_patent`

Fetch a single patent's full record: title, date, abstract, claims, assignees, inventors.

See `src/tools.ts` for the JSON Schema input.

## `uspto_assignee_portfolio`

All patents assigned to a given entity. Paginates server-side; pass `limit` (max 5000).

See `src/tools.ts` for the JSON Schema input.

## `uspto_citation_graph`

BFS-explore the citation graph around a patent. `direction` can be 'backward' (patents this one cites), 'forward' (patents citing this one), or 'both'. Max depth 2 to fit Worker CPU budget. Premium tool.

See `src/tools.ts` for the JSON Schema input.

## `uspto_subscribe_grants`

Weekly digest of new patent grants matching a saved query. Premium tool. Webhook on Tuesdays after USPTO's weekly grant publication.

See `src/tools.ts` for the JSON Schema input.

## Client setup

### Cursor / Claude Desktop / Cline
```json
{
  "mcpServers": {
    "uspto-patents-mcp": {
      "url": "https://uspto-patents-mcp.atlasword.workers.dev/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

Anonymous requests get the free tier (100 calls/month, 10/min). Upgrade at `/upgrade?tier=solo|team|pro`.