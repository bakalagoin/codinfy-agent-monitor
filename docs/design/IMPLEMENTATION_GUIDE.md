# Design implementation guide

1. Map the requested page to a real core method, MCP tool, and local API.
2. Return redacted structured data with provenance and ISO timestamps.
3. Implement loading, empty, error, protected, and success states.
4. Keep dangerous actions server-validated even when the UI disables them.
5. Test core contracts, Fastify routes, MCP registration, keyboard behavior, and responsive layout.
6. Run review before commit and preserve all identity/attribution strings.

The web implementation currently lives in `packages/server/src/index.ts`; reusable domain logic belongs in `packages/core/src/`.

© CODINFY PLATFORMS SASU · codinfy.com
