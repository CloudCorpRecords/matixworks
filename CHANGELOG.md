# Changelog

## 0.1.0 (2026-10-28)

- First release: a forwarding client for the dynomatix company MCP server. A labelled subset of 5 of the 7 captured tools is answered locally for tools/list, and every tools/call is forwarded upstream over a streamable-HTTP JSON-RPC session (initialize, notifications/initialized, tools/call, honouring the Mcp-Session-Id header when the upstream issues one).
- Tools: `dynomatix_list_open_positions`, `dynomatix_get_position`, `dynomatix_list_work`, `dynomatix_get_work`, `dynomatix_about`. Each carries its captured `title`; `dynomatix_list_open_positions`, `dynomatix_list_work` and `dynomatix_about` carry no `required` key in the capture and none is served; `dynomatix_get_position` and `dynomatix_get_work` each require `slug`.
- Omitted (labelled subset): `dynomatix_submit_application` and `dynomatix_submit_enquiry` — both are final sends of a person's details to a monitored human inbox, so they are not part of this rebuild.
- Upstream results pass through verbatim, including the isError flag; upstream failures surface as `matixworks error:` text results.
- One bin serves the CLI (one subcommand per tool, plus `--version`) and the stdio MCP server (`mcp` subcommand). The upstream endpoint can be overridden via `DYNOMATIX_MCP_URL`. The upstream record declares no headers, so no auth header is ever sent.
