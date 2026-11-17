# matixworks

What is this studio hiring for, what has it shipped, and who is it? matixworks is a local forwarding client for the dynomatix company MCP service: it answers `tools/list` locally from the captured tool definitions and forwards every call to the service, returning the answers exactly as the service sends them back.

The five tools are published reads of a software studio's own public site: its open job postings, its case studies, and its company profile. This rebuild is a labelled subset — 5 of the 7 upstream tools. The two upstream tools that submit a person's details to a human inbox (a job application and a project enquiry) are deliberately not included.

## The tools

- **`dynomatix_list_open_positions`** — Every role the studio is currently hiring for, one entry per position with its slug, summary, employment type, canonical URL and posting dates. Takes no arguments; no required parameters.
- **`dynomatix_get_position`** — One job posting in full — responsibilities, requirements and how the role is set up — as the posting's own markdown. Requires `slug`, as returned by `dynomatix_list_open_positions`.
- **`dynomatix_list_work`** — The products and client work the studio has shipped, retired items included, each with its year, status, short description and links. Takes no arguments; no required parameters.
- **`dynomatix_get_work`** — One case study in full: the problem, what was built and what it changed, as the study's own markdown. Requires `slug`, as returned by `dynomatix_list_work`, for an entry that has a case study.
- **`dynomatix_about`** — Who the company is, what it sells and how to reach it: identity, tagline, engagement types, contact addresses, key pages and track record. Takes no arguments; no required parameters.

Not served: `dynomatix_submit_application` and `dynomatix_submit_enquiry`. Both send a person's contact details to the vendor, so this read-only rebuild leaves them out.

## Install and run

As an MCP server via npm:

```bash
npx -y @reneturcios/matixworks mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "matixworks": {
      "command": "npx",
      "args": ["-y", "@reneturcios/matixworks", "mcp"]
    }
  }
}
```

As a container:

```bash
docker run -i ghcr.io/cloudcorprecords/matixworks
docker run --rm ghcr.io/cloudcorprecords/matixworks dynomatix_about '{}'
```

## CLI

One binary serves both the command line and the MCP server. Each tool is a subcommand taking a single JSON string with that tool's arguments:

```bash
matixworks dynomatix_list_open_positions '{}'
matixworks dynomatix_get_position '{"slug":"senior-engineer"}'
matixworks dynomatix_list_work '{}'
matixworks dynomatix_get_work '{"slug":"some-case-study"}'
matixworks dynomatix_about '{}'
matixworks --version
```

Exit codes: `0` when the forwarded call succeeds, `1` when the upstream result is an error, and `2` for usage problems such as an unknown subcommand or a malformed JSON argument.

## Configuration

- `DYNOMATIX_MCP_URL` — Overrides the upstream endpoint. The default is the pinned hosted endpoint, `https://dynomatix.com/mcp`. (The override variable is a reconstruction added by this rebuild.)

The upstream registry record declares no headers, so no authentication header is ever sent; the tool surface was captured keyless.

Upstream failures — a JSON-RPC error from the service, a non-2xx response, an unreadable body, or a request that fails outright — are reported to the caller as an error result whose text starts with `matixworks error:`.

## How forwarding works

The first forwarded call opens a session: an `initialize` request (protocol version `2025-03-26`), followed by a `notifications/initialized` notification, then the `tools/call` itself. If the service answers the initialize request with an `Mcp-Session-Id` header, that value is carried on every later request, and the open session is reused for the rest of the process. Replies are accepted either as plain JSON or as server-sent events. Successful results pass through verbatim, including any `isError` flag and any extra fields the service includes.

## Development

```bash
npm install
npm run build   # tsc -> dist/ (dist/cli.js is the bin)
npm test        # tsx --test test/*.test.ts — stubbed upstream, no network
npm run dev     # run the CLI from source
```

The test suite checks the served tool list against the captured surface (all 5 tools, deep-equal, in order, titles included, and no `required` key added to the three tools that carry none), asserts the two omitted upstream tools are absent at registry, MCP and CLI level, exercises the session handshake and its reuse, verifies that no `Authorization` or `X-API-Key` header is ever sent under any environment, and verifies that arguments go upstream untouched and results come back untouched.

## License

MIT — see `LICENSE`. Copyright (c) 2026 Rene Turcios.
