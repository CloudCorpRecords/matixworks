# BUILD REPORT — matixworks

Clean-room rebuild of `dynomatix/company` v1.0.0
(remote-only MCP server at `https://dynomatix.com/mcp`),
built 2026-10-28 as a forwarding client. Package:
`@reneturcios/matixworks` 0.1.0, registry name
`io.github.CloudCorpRecords/matixworks`.

## Surface built

Labelled subset: **5 of 7 captured tools built**.
Omitted: `dynomatix_submit_application` and
`dynomatix_submit_enquiry` — both are final sends of a
person's details (name + email + résumé / name + email
+ company + brief) to a monitored human inbox, so they
are excluded (request_quote/send family). Their absence
is asserted in tests at registry level (TOOL_DEFS /
TOOL_NAMES / isKnownTool), MCP level (handleCallTool
rejects both with MethodNotFound before any network
hop, and the stdio tools/list response contains
neither), and CLI level (both exit 2 with usage and are
not listed as subcommands).

| Tool | Required fields as served |
|------|---------------------------|
| `dynomatix_list_open_positions` | NO `required` key in the capture — served verbatim, none invented |
| `dynomatix_get_position` | `slug` |
| `dynomatix_list_work` | NO `required` key in the capture — served verbatim, none invented |
| `dynomatix_get_work` | `slug` |
| `dynomatix_about` | NO `required` key in the capture — served verbatim, none invented |

Each served tool carries exactly the keys `name`,
`title`, `description`, `inputSchema`, exactly as
captured: the capture carries `title` keys, so they are
served verbatim. The tool literals were generated
programmatically from
`harness/fixtures/dynomatix-tools.json` by the script
at `/tmp/b49-matixworks-scratch/gen.py` (parse +
re-serialise; the generator's round-trip assertion and
a post-assembly check confirmed the literals in
`src/forward.ts` parse back to and deep-equal the
fixture's tool objects) — never retyped — and the
registration-integrity test suite plus the parity
harness confirmed the served literals deep-equal the
fixture's 5 tool objects, in order. Tools are
registered via the MCP SDK low-level Server API
(`ListToolsRequestSchema` / `CallToolRequestSchema`
handlers), not McpServer+zod.

## Fixture conflicts

**None.** The spec and the fixture agree on all 5
served tools' names, titles, descriptions, required
fields (including the three tools with no `required`
key: `dynomatix_list_open_positions`,
`dynomatix_list_work`, `dynomatix_about`, and the two
slug tools requiring `slug`) and property shapes
(`slug`: string, maxLength 81; every inputSchema
carries `additionalProperties: false`). The spec's
server.json description matches at exactly 92 chars.

## Labelled reconstructions (from the spec's Wire section)

- Upstream endpoint pinned: `https://dynomatix.com/mcp`.
- Env override `DYNOMATIX_MCP_URL` — labelled reconstruction.
- The registry record declares NO headers on the remote: no auth
  header is ever sent. Tests assert that no `Authorization` header
  is sent under any environment — including with key-like env vars
  (`DYNOMATIX_API_KEY`, `API_KEY`, `AUTHORIZATION`) set — and
  that no `X-API-Key` header is ever sent; upstream requests carry
  only `Content-Type`, `Accept` and, when issued, `Mcp-Session-Id`.
- Error rendering `matixworks error:` text for upstream failures —
  labelled reconstruction.
- Upstream results pass through verbatim, including
  `structuredContent`, `isError` and extra fields. tools/call is
  forwarded as streamable-HTTP JSON-RPC: initialize
  (protocolVersion `2025-03-26`) → notifications/initialized →
  tools/call, honouring `Mcp-Session-Id` when issued; plain-JSON
  and SSE replies are both parsed. The forwarding core takes an
  injectable fetch; tests stub the upstream — no live network
  calls in tests.

## Deviations

None.

## Lockfile

- Route: generated clean from birth in the build dir with no
  `node_modules` and no pre-existing lockfile:
  `npm install --package-lock-only --ignore-scripts --offline`
  (Route 3).
- Parses as JSON; `name` == `@reneturcios/matixworks`.
- Package entries: **128**.
- sha256: `c8e7b8dcf7ef8cfba30eefe55535fa30830d649bbebec7b6eb6092a340ad11bd`
  (re-verified unchanged after the subsequent offline `npm ci`).

## server.json

- Description exactly: "Read a software studio's public site data: open positions, case studies and company profile." —
  **92 characters** (verified programmatically).
- npm package entry carries `"version": "0.1.0"`; the OCI entry
  (`ghcr.io/cloudcorprecords/matixworks:0.1.0`) carries **no**
  `version` field. Both entries carry packageArguments
  `[{type: positional, value: mcp}]` and transport stdio.
  Dockerfile (node:20-alpine, both stages) carries the label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/matixworks"`.
  Container workflow `IMAGE` is `ghcr.io/cloudcorprecords/matixworks`
  and its smoke test asserts the server name `matixworks`.

## Verification (all run 2026-10-28)

1. `npx tsc --noEmit` → exit 0.
2. `npm run build` → exit 0; real `dist/` produced (cli, forward,
   index, mcp, types — .js, .d.ts, .js.map each).
3. `node dist/cli.js --version` → `0.1.0`.
4. `npm test` → **60 tests, 60 pass, 0 fail** (registration-integrity
   suite deep-equals the served tools/list against the fixture's 5
   tools, including title verbatim and required-key exactness
   assertions — the two slug tools require `slug`, the other three
   have NO required key — plus omitted-tool absence at registry,
   MCP and CLI level, a stdio MCP tools/list integration check,
   session handling/reuse, env override, the no-auth-header
   assertions under any environment, verbatim argument forwarding
   and result pass-through including structuredContent and upstream
   isError, SSE parsing, error rendering, MCP-layer validation, and
   CLI behaviour including a per-tool subcommand forwarding test
   against a local stub server).
5. Parity: `python3 /home/hatch/workspace/mcp-rebuild-100/harness/parity.py --original /home/hatch/workspace/mcp-rebuild-100/harness/fixtures/dynomatix-tools.json --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/matixworks/dist/cli.js mcp" --out /home/hatch/workspace/mcp-rebuild-100/builds/matixworks/parity-out` → **verdict PASS, parity 100.0**
   (5/5 identical, 0 missing, 0 extra, no schema diffs). Output in
   `parity-out/`.
