# Personal Yahoo Fantasy Football MCP

A personal, noncommercial project in development for private weekly league reporting. **Yahoo Fantasy API access is pending.** Mock mode works locally; the experimental Yahoo adapter has not been tested against an authorized live league. This project is not affiliated with or endorsed by Yahoo.

Read-only TypeScript server using the official MCP SDK v2 and local stdio transport. No frontend, database, hosting, report generator, or league-write tools.

## Setup and launch (PowerShell)

Requires Node.js 22.15+ and npm. From this project directory:

```powershell
npm ci
npm run build
npm test
$env:FANTASY_PROVIDER = 'mock'
npm start
```

The server waits for an MCP client on stdin; a quiet terminal is expected. Stop with Ctrl+C. Stdout is reserved for MCP protocol messages.

To automatically launch the built server and call all six tools through a real stdio MCP client:

```powershell
npm run smoke
```

To inspect interactively:

```powershell
$env:FANTASY_PROVIDER = 'mock'
npx @modelcontextprotocol/inspector node dist/index.js
```

Open the Inspector URL printed in your terminal, connect with stdio, open Tools, select `get_weekly_matchups`, and call with `season: 2026` and `week: 4`. Inspector is optional and is downloaded by npx; it is not a project frontend.

An MCP host can launch `node` with the absolute path to `dist/index.js` and environment `FANTASY_PROVIDER=mock`. `npm start` optionally reads `.env` from the current directory. Direct `node dist/index.js` uses only process environment; do not depend on a host's working directory for configuration.

## Tools

| Tool | Required arguments | Optional arguments |
| --- | --- | --- |
| `get_league_settings` | `season` | — |
| `get_teams` | `season` | — |
| `get_weekly_rosters` | `season`, `week` | `teamId` (omit for all teams) |
| `get_weekly_matchups` | `season`, `week` | — |
| `get_standings` | `season` | — |
| `get_draft_results` | `season` | — |

Season is an integer from 2000–2100; week is an integer from 1–18. No implicit current season/week. Unknown arguments are rejected. Standings describe the retrieved season snapshot, not historical standings for an arbitrary week. Tool annotations declare read-only behavior.

Successful responses include `source`, `isMock`, a notice, explicit season/week where applicable, ISO UTC `retrievedAt`, and `data`, in both text JSON and structured content. Retrieval time is when the response was produced, not when the underlying game data changed. Provider failures produce `isError: true` and safe error codes/messages; SDK input errors use the SDK's validation response.

## Fictional fixtures

Mock mode supports season **2026**, weeks **1–18**, with 12 fictional Milwaukee-area teams, 15 players per team (180 unique fictional player IDs), six matchups each week, and 180 snake-draft picks. Team IDs are `mock-team-01` through `mock-team-12`; player IDs are `mock-player-001` through `mock-player-180`. All fixtures and scores are synthetic and deterministic. Even future-week matchups are fictional completed games, not predictions. Mock standings are calculated through week 4. Every successful mock response prominently identifies itself as MOCK DATA. Roster membership stays fixed across mock weeks; no transactions are simulated.

## Experimental Yahoo mode and OAuth

Do not enable Yahoo mode until your application has approved Fantasy Sports read access. No credentials are needed for mock mode. Copy `.env.example` to `.env` only if configuring Yahoo; replace every placeholder privately. `.env`, token files, and `.secrets/` are ignored. Never commit or paste tokens into MCP tool arguments. Keep private configuration and MCP logs restricted to your local account.

`FANTASY_PROVIDER=yahoo` requires a numeric season-specific NFL `YAHOO_LEAGUE_KEY` (e.g. the documented shape `461.l.1000`), matching `YAHOO_SEASON`, client ID/secret, registered redirect URI, and refresh token. Invalid/missing configuration fails closed; it never falls back to mock data. The same league key cannot silently serve another season. Every retrieval verifies Yahoo league metadata matches the requested NFL season.

`src/oauth.ts` implements the documented authorization URL, authorization-code exchange with state comparison, and refresh-token POST using Basic client authentication. The caller must generate a cryptographically random one-use state, securely retain it, validate the returned state, and use the exact registered redirect URI. These helpers are **not MCP tools**. There is no callback listener or credential acquisition command yet; first-time authorization orchestration awaits approved access and live testing. No scope is guessed; use the read permission approved for your application.

Access tokens and rotated refresh tokens stay in memory. Refresh occurs before expiry, concurrent refreshes are deduplicated, and one 401 triggers a single refresh/retry. Rotated refresh tokens are **not persisted across restarts**; an OS credential-store adapter and rotation persistence remain future work. No tokens, secrets, OAuth response bodies, or arbitrary upstream errors are returned over MCP. API redirects are rejected, requests have a 15-second timeout, and 403/429 errors surface safely without unbounded retries.

The adapter requests XML and returns `format: yahoo-field-projection-v1` with allowlisted Yahoo field names (strings and upstream singleton/array cardinality), rather than claiming fully normalized mock/live parity. Stable live IDs are Yahoo `team_key`/`player_key`; optional `teamId` is the full team key from the configured league. Manager account identifiers, emails, and arbitrary unknown fields are excluded. Consumers must branch on source/format; production report generation is out of scope.

## Documentation verification and live-validation boundary

Official sources reviewed October 2, 2026:

- [Official MCP TypeScript SDK server guide](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server): v2 `McpServer`, `registerTool`, `serveStdio`, input validation and protocol stdout rules. npm registry verified and pinned `@modelcontextprotocol/server` and test client to **2.2.0**; lockfile records installed versions.
- [Yahoo Fantasy Sports API documentation](https://sports.yahoo.com/developer/docs/): league metadata, settings, teams, standings, draftresults, `scoreboard;week=N`, weekly NFL `roster;week=N`, XML samples, and collection sub-resource chaining. Official HTML was retrieved directly after web-reader rate limits. The old guide is at [Yahoo Developer Network](https://developer.yahoo.com/fantasysports/guide/).
- [Yahoo authorization-code and refresh documentation](https://developer.yahoo.com/oauth2/guide/flows_authcode/): authorization endpoint, token endpoint, Basic authentication, redirect URI, token lifetime and refresh flow.

Implemented GET paths under `https://fantasysports.yahooapis.com/fantasy/v2`:

```text
league/{league_key}
league/{league_key}/settings
league/{league_key}/teams
league/{league_key}/teams/roster;week={week}/players
league/{league_key}/scoreboard;week={week}
league/{league_key}/standings
league/{league_key}/draftresults
```

**Awaiting live validation:** application permission/access, registered callback and actual first authorization, token refresh/rotation/revocation, real XML cardinality and field coverage for every resource, weekly collection chaining, full-roster completeness and pagination behavior, season metadata, historical availability, pre-draft/empty responses, and real rate limits. Simulated HTTP tests verify request construction and error handling; they do not prove Yahoo integration works. All Yahoo tool responses explicitly retain the pending-validation notice.

## Review checks

`npm test` covers real SDK stdio discovery/calls for all six mock tools, argument validation, provider selection, fixture ID/draft/standings consistency, recoverable errors, simulated OAuth rotation and concurrency, XML validation, field filtering, documented request construction, season checks and safe upstream errors. `npm run build` type-checks and emits `dist/`. `npm run smoke` calls the compiled server. Review before publishing; `private: true` prevents accidental npm publication.
