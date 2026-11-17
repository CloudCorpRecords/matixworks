/**
 * matixworks core: a forwarding client for the dynomatix
 * company MCP server.
 *
 * Nothing about the company is computed here. tools/list
 * is answered from the literal definitions below, which
 * reproduce a live capture of the upstream server word
 * for word (name, title, description and inputSchema
 * exactly as captured; three tools --
 * dynomatix_list_open_positions, dynomatix_list_work and
 * dynomatix_about -- carry no `required` key, so none is
 * served for them; dynomatix_get_position and
 * dynomatix_get_work each require slug). This is a
 * LABELLED SUBSET: 5 of the 7 captured tools are built.
 * The two omitted tools, dynomatix_submit_application and
 * dynomatix_submit_enquiry, are final sends of a person's
 * details to a monitored human inbox, so they are not
 * part of this rebuild. A tools/call travels upstream
 * over a streamable-HTTP JSON-RPC session: an initialize
 * POST, a notifications/initialized POST, then the
 * tools/call POST, carrying the Mcp-Session-Id response
 * header on later requests when the upstream issues one.
 * The session opens lazily on the first forwarded call
 * and is reused for the client's lifetime.
 *
 * The endpoint is pinned to https://dynomatix.com/mcp
 * and may be replaced with the DYNOMATIX_MCP_URL
 * environment variable (that override is a labelled
 * reconstruction). The registry record declares NO
 * headers on the upstream remote, so no auth header is
 * ever sent, under any environment.
 *
 * A successful upstream result is returned exactly as
 * received, isError flag and extra fields included.
 * Failures -- an upstream JSON-RPC error, a non-2xx
 * status, a body that cannot be parsed, or a fetch that
 * throws or times out -- become an isError result whose
 * text begins with `matixworks error:` (that rendering
 * is a labelled reconstruction). Replies may be plain
 * JSON or SSE (`data:` lines); the JSON-RPC message
 * whose id matches the request wins.
 */
import type {
  FetchFn,
  FetchResponseLike,
  ForwardDeps,
  ToolArgs,
  ToolDef,
  ToolResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL = "https://dynomatix.com/mcp";

export const DEFAULT_TIMEOUT_MS = 30000;

export const PROTOCOL_VERSION = "2025-03-26";

/** Upstream tools captured but deliberately NOT built (labelled subset 5 of 7). */
export const OMITTED_TOOLS = [
  "dynomatix_submit_application",
  "dynomatix_submit_enquiry",
] as const;

/* ------------------------------------------------------------------ */
/* Tool definitions (tools/list literals, verbatim from the live       */
/* capture in harness/fixtures/dynomatix-tools.json; generated         */
/* programmatically by parsing and re-serialising the fixture JSON,    */
/* never retyped). 5 of 7 captured tools are built; see OMITTED_TOOLS. */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    "name": "dynomatix_list_open_positions",
    "title": "List open positions",
    "description": "List every role Dynomatix is currently hiring for. Returns one entry per position with its slug, title, one-line summary, employment type, canonical URL and posting dates. Start here before dynomatix_get_position or dynomatix_submit_application: the slug this returns is the value both of them expect. An empty list means there are no openings right now, not that the lookup failed. Takes no arguments.",
    "inputSchema": {
      "type": "object",
      "additionalProperties": false
    }
  },
  {
    "name": "dynomatix_get_position",
    "title": "Read a job posting",
    "description": "Read one job posting in full: responsibilities, requirements and how the role is set up. Returns the posting's own markdown, frontmatter included — the title and canonical URL it opens with are the citation to quote when you tell someone about the role. Call dynomatix_list_open_positions first to get a valid slug; a slug that is not currently open is refused rather than guessed at.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "slug": {
          "type": "string",
          "description": "The position's slug, exactly as dynomatix_list_open_positions returned it. Lowercase letters, digits and hyphens.",
          "maxLength": 81
        }
      },
      "required": [
        "slug"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "dynomatix_list_work",
    "title": "List past and current work",
    "description": "List the products and client work Dynomatix has shipped. Returns one entry per item with its name, the year it started, its status, a short description and its links. Retired items are included — the site shows them and `status` says which is which — because a track record with the failures removed is not a track record. Where `caseStudyUrl` is not null, dynomatix_get_work will return the full write-up for that slug. Takes no arguments.",
    "inputSchema": {
      "type": "object",
      "additionalProperties": false
    }
  },
  {
    "name": "dynomatix_get_work",
    "title": "Read a case study",
    "description": "Read one case study in full: what the problem was, what was built and what it changed. Returns the study's own markdown, frontmatter included — the title and canonical URL it opens with are the citation to quote. Call dynomatix_list_work first for a valid slug; only entries whose `caseStudyUrl` is not null have a write-up to return.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "slug": {
          "type": "string",
          "description": "The item's slug, exactly as dynomatix_list_work returned it. Lowercase letters, digits and hyphens.",
          "maxLength": 81
        }
      },
      "required": [
        "slug"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "dynomatix_about",
    "title": "About Dynomatix",
    "description": "Who Dynomatix is, what it sells and how to reach it. Returns the company's identity and tagline, its engagement types, both contact addresses, its key pages and its track record. Read this first if you are deciding whether this company fits a need; use dynomatix_submit_enquiry to start a conversation. Takes no arguments.",
    "inputSchema": {
      "type": "object",
      "additionalProperties": false
    }
  }
];
export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

/** Whether `name` belongs to the captured built surface. */
export function isKnownTool(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

/* ------------------------------------------------------------------ */
/* Forwarding client                                                   */
/* ------------------------------------------------------------------ */

function errorResult(detail: string): ToolResult {
  return {
    content: [{ type: "text", text: `matixworks error: ${detail}` }],
    isError: true,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Read a JSON-RPC response body, tolerating SSE framing.
 * Returns the message whose id matches `expectedId` when
 * present, otherwise the last parseable message, otherwise
 * null when nothing in the body parses.
 */
export function parseRpcBody(
  text: string,
  expectedId?: number,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const candidates: Record<string, unknown>[] = [];
  const tryPush = (payload: string): void => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not a JSON payload; skip this candidate.
    }
  };
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice("data:".length).trim();
      if (payload !== "" && payload !== "[DONE]") tryPush(payload);
    }
  } else {
    tryPush(trimmed);
  }
  if (candidates.length === 0) return null;
  if (expectedId !== undefined) {
    const match = candidates.find((c) => c.id === expectedId);
    if (match !== undefined) return match;
  }
  return candidates[candidates.length - 1];
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init) as unknown as FetchResponseLike;
}

/**
 * A forwarding client holding a single upstream session,
 * opened lazily on first use and reused from then on
 * (for the process lifetime in the MCP server, or for a
 * single invocation in the CLI).
 */
export class MatixworksClient {
  private readonly deps: ForwardDeps;
  private sessionId: string | null = null;
  private ready = false;
  private sessionPromise: Promise<void> | null = null;
  private idCounter = 0;

  constructor(deps: ForwardDeps = {}) {
    this.deps = deps;
  }

  private fetchFn(): FetchFn {
    return this.deps.fetchFn ?? defaultFetch;
  }

  private endpointUrl(): string {
    if (this.deps.url && this.deps.url.trim() !== "") return this.deps.url.trim();
    const raw = (this.deps.env ?? process.env).DYNOMATIX_MCP_URL;
    if (raw && raw.trim() !== "") return raw.trim();
    return DEFAULT_ENDPOINT_URL;
  }

  private timeoutMs(): number {
    if (typeof this.deps.timeoutMs === "number" && this.deps.timeoutMs > 0) {
      return this.deps.timeoutMs;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private async post(
    body: unknown,
    withSession: boolean,
  ): Promise<FetchResponseLike> {
    // The registry record declares NO headers on the upstream
    // remote: no Authorization or X-API-Key header is ever sent.
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (withSession && this.sessionId !== null) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await this.fetchFn()(this.endpointUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.ready) return;
    if (this.sessionPromise === null) {
      this.sessionPromise = (async () => {
        const initId = this.nextId();
        const initRes = await this.post(
          {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "matixworks", version: VERSION },
            },
          },
          false,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (sessionId) this.sessionId = sessionId;
        const initText = await initRes.text();
        const initParsed = parseRpcBody(initText, initId);
        if (initParsed !== null && initParsed.error) {
          throw new Error(rpcErrorMessage(initParsed.error));
        }
        if (initRes.status < 200 || initRes.status >= 300) {
          throw new Error(`HTTP ${initRes.status}`);
        }
        if (initParsed === null && initText.trim() !== "") {
          throw new Error("malformed response");
        }
        const initializedRes = await this.post(
          { jsonrpc: "2.0", method: "notifications/initialized" },
          true,
        );
        try {
          await initializedRes.text();
        } catch {
          // Nothing needed from the notification response body.
        }
        this.ready = true;
      })();
    }
    try {
      await this.sessionPromise;
    } catch (err) {
      this.sessionPromise = null;
      this.sessionId = null;
      throw err;
    }
  }

  /** Forward one tool call; upstream failures come back as isError results. */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    try {
      await this.ensureSession();
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    const callId = this.nextId();
    let callRes: FetchResponseLike;
    try {
      callRes = await this.post(
        {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name, arguments: args ?? {} },
        },
        true,
      );
    } catch (err) {
      return errorResult(
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = parseRpcBody(await callRes.text(), callId);
    if (parsed !== null && parsed.error) {
      return errorResult(rpcErrorMessage(parsed.error));
    }
    if (callRes.status < 200 || callRes.status >= 300) {
      return errorResult(`HTTP ${callRes.status}`);
    }
    if (parsed === null) return errorResult("malformed response");
    const result = parsed.result as ToolResult | undefined;
    if (result === undefined || result === null || typeof result !== "object") {
      return errorResult("malformed response");
    }
    // Hand the upstream result back exactly as received.
    return result;
  }
}

/** Build a forwarding client; tests inject a fake fetch and env through deps. */
export function createClient(deps: ForwardDeps = {}): MatixworksClient {
  return new MatixworksClient(deps);
}

/** One-shot helper: a fresh client for a single call (the CLI path). */
export async function callTool(
  name: string,
  args: ToolArgs,
  deps: ForwardDeps = {},
): Promise<ToolResult> {
  return new MatixworksClient(deps).callTool(name, args);
}
