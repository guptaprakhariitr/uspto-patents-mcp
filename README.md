# uspto-patents-mcp

> US patent search, full-text retrieval, claim extraction, citation graph, weekly grant alerts. Pairs with `sec-edgar-mcp` and `fda-approvals-mcp` for the R&D / biotech / IP-law audience.

> ⚠️ **UPSTREAM API MIGRATION REQUIRED (as of 2025/2026).** USPTO sunset the PatentsView v1 API and migrated everything to the [Open Data Portal](https://data.uspto.gov/) at `data.uspto.gov/odp`. The new API requires registration + API key. This MCP's code shape is correct; only the upstream URL + auth method changes. Tracking issue: PatentsView v1 endpoints now 301-redirect to USPTO's transition guide. **All tools will currently surface the migration message until the new endpoint is wired.**

**Status:** code green, infra live (`https://uspto-patents-mcp.prakhar-cognizance.workers.dev`), tests passing, awaiting USPTO ODP API key + migration to v2 schema.

---

## Planned tools

| Tool | Source | What it returns |
|---|---|---|
| `uspto_patent_search(query, assignee?, inventor?, date_range, limit)` | PatentsView API | Recent patents matching query/filters. |
| `uspto_read_patent(patent_number)` | USPTO full text | Patent title, abstract, claims, drawings list. |
| `uspto_assignee_portfolio(assignee_name)` | PatentsView | All patents assigned to an entity. |
| `uspto_citation_graph(patent_number, depth?)` | PatentsView citations | Patents cited by + citing this patent. Premium. |
| `uspto_trademark_search(query)` | TSDR | Trademark lookup. Premium. |
| `uspto_subscribe_grants(query, webhook_url)` | bulk weekly grants | Weekly digest of new grants matching saved query. Premium. |

## Audience

- R&D engineers / scientists asking "has anyone patented this?"
- IP lawyers prepping FTO (freedom-to-operate) opinions.
- Biotech / pharma agents tracking patent-cliff dates.
- Investor agents tracking competitive moats (cross-sells with `sec-edgar-mcp`).

## Risk notes

- USPTO bulk data is huge; precompute search indexes nightly via GitHub Actions, store in R2 (10GB free), serve via Worker. Don't try to live-search the full corpus.
- PatentsView API has rate limits but is genuinely free.
- USPTO sometimes restructures their APIs (annual). Build for graceful degradation.

## Open / closed split

- **Open**: PatentsView wrapper, basic search.
- **Closed**: nightly bulk-data indexer + R2 storage, citation graph precomputation, subscribe/webhook engine.

## See also

- [`../sec-edgar-mcp/`](../sec-edgar-mcp/) — reference implementation; shared audience.
- [`../README.md`](../README.md) — Category 1 pipeline.
