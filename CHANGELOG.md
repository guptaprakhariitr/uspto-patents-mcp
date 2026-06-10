# Changelog

## [0.2.0] — 2026-06-10

### Changed
- **Billing migrated to Dodo Payments** (was: planned Stripe). Merchant-of-Record model — Dodo handles VAT/GST/sales-tax remittance worldwide on our behalf, lifting tax compliance off the operator.
- Env vars: `STRIPE_*` → `DODO_API_KEY` / `DODO_WEBHOOK_SECRET`. New `[vars]`: `DODO_PRODUCT_ID_{SOLO,TEAM,PRO}`, `PRODUCT_NAME`, `FROM_EMAIL`.

### Added
- `GET /upgrade?tier=…` — creates a Dodo hosted checkout link, 302s to it.
- `GET /account` — returns the caller's key + tier + Dodo customer-portal link (requires `Authorization: Bearer …`).
- `POST /webhooks/dodo` — verifies Standard-Webhooks signature (HMAC-SHA256 + 5-minute replay window), mints API keys on `subscription.active`, downgrades on cancellation/failure, idempotent on retries.
- `src/dodo.ts`, `src/webhook.ts`, `src/checkout.ts` — vendored shim, identical across all Category-1 products.
- `mintApiKey()`, `updateKeyStatus()`, `getKeyBySubscription()` in `auth.ts`.
- `KeyRecord.status` field — tracks `active` / `cancelled` / `past_due`.
- Optional Resend integration: API key emailed to the customer on subscription start.


## [0.1.3] — 2026-06-10 (intra-day patch)

### Documentation
- Marked upstream-API migration as required: USPTO sunset the PatentsView v1 API in 2025 and migrated everything to data.uspto.gov/odp (requires API key registration).
- `post()` now detects HTML responses (the 301-redirected transition guide) and surfaces a clear migration message instead of the cryptic "Unexpected token '<'" JSON parse error.
- Code structure preserved — re-pointing to the ODP API + adding an `USPTO_ODP_KEY` secret will restore functionality without rewriting tool surfaces.

## [0.1.2] — 2026-06-02

### Fixed
- `uspto_assignee_portfolio` returned only the first 25 patents even when `limit` > 25; was missing the `o.page` increment for pagination.
- Citation depth > 2 occasionally exceeded the Worker CPU budget — added 50-patent ceiling per BFS level.

## [0.1.1] — 2026-05-19

### Added
- `uspto_subscribe_grants` — weekly digest of new grants matching a saved query. Premium tool.

### Changed
- Citation graph now also returns forward citations (patents citing this one), not only backward.

## [0.1.0] — 2026-05-03

### Added
- Initial release. Tools: `uspto_patent_search`, `uspto_read_patent`, `uspto_assignee_portfolio`, `uspto_citation_graph`.
- Wraps USPTO PatentsView v1 API.
