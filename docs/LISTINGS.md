# Registry Submission Checklist — uspto-patents-mcp

Pre-filled values for every MCP registry. Each submission takes 1–3 minutes in a browser.

## ✅ Already automatic

### Glama — `glama.ai`
Auto-crawls GitHub by repo topic `mcp-server`. Already tagged. Indexes within 24 hours.
- https://glama.ai/mcp/servers?q=uspto-patents-mcp

### Official MCP Registry
- The `server.json` at this repo's root is the registry manifest.
- Submit via: `mcp-publisher publish server.json` (after `make publisher` and `mcp-publisher login github` in the registry repo).
- Downstream registries (PulseMCP, mcp.so) ingest from here weekly.

## 🌐 Manual browser submission

### PulseMCP — single URL field
- https://www.pulsemcp.com/submit
- **Paste:** `https://github.com/guptaprakhariitr/uspto-patents-mcp`

### mcp.so — multi-field form
- https://mcp.so/submit
- **Name:** `uspto-patents-mcp`
- **Display name:** `USPTO Patents`
- **Description:** `US patent search and full-text via USPTO PatentsView. Assignee portfolios, citation graph, weekly grant alerts.`
- **GitHub URL:** `https://github.com/guptaprakhariitr/uspto-patents-mcp`
- **Endpoint URL:** `https://uspto-patents-mcp.prakhar-cognizance.workers.dev/mcp`
- **Tags:** uspto, patents, patentsview, ip-law, biotech, r-and-d
- **License:** MIT
- **Transport:** HTTP (remote)

### mcp.directory
- https://mcp.directory/submit
- Same values as mcp.so. Include a demo GIF if you can.

### Smithery (paid — $30/mo)
- https://smithery.ai/new
- Worth it if you have ≥6 paid subscribers.

### Cursor Marketplace
- Submit from Cursor → Settings → Marketplace → Submit. Curated; 1–2 weeks for approval.

## Social

### Show HN
- Title: `Show HN: uspto-patents-mcp — USPTO Patents as an MCP for Claude / Cursor`
- URL: `https://github.com/guptaprakhariitr/uspto-patents-mcp`

### Twitter / X thread template
> Just shipped uspto-patents-mcp — Model Context Protocol server: us patent search and full-text via uspto patentsview.
>
> Endpoint: https://uspto-patents-mcp.prakhar-cognizance.workers.dev/mcp
> GitHub: https://github.com/guptaprakhariitr/uspto-patents-mcp
>
> Free tier available. Paid from $9/mo.
