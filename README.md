# uspto-patents-mcp — SCAFFOLD

> US patent search, full-text retrieval, claim extraction, weekly alerts on technology areas. Wraps **USPTO PatentsView API** + USPTO bulk data. Pairs with `sec-edgar-mcp` and `fda-approvals-mcp` for the R&D / biotech / IP-law audience.

**Status:** scaffolded. Idea #3 in [`../../../ai-as-customer-ideas.md`](../../../ai-as-customer-ideas.md).

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
