# Pixel Workroom

A pixel-art 3D office where AI agents work for you. Walk around in first person or look from above, type a goal ("a snake game"), and watch the team build it. Claude Code, Codex and Gemini can also drive the room over the [Model Context Protocol](https://modelcontextprotocol.io).

- **First-person + top-down view** (press `V`), raycast-rendered, no WebGL needed
- **Goal runner**: type an idea, press **Build**, get working files and an **Open result** button
- **Live agent monitors**: see each agent's editor, thoughts and terminal
- **Health bar = token budget** per agent, plus a team total in the header
- **MCP server** with 9 tools for Claude Code, Codex, Gemini CLI, Cursor, ...
- **Token Saver** on by default (local replies, cheap models, response cache, hard budgets)

## Quick start

Requirements: Node.js 20.12 or newer. For the Build button, the [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI installed and signed in (run `claude` once).

```bash
git clone <this repo> && cd pixel-workroom-mcp
npm install
npm start          # http://localhost:3333
```

On Windows you can also double-click `start.bat`.

1. Type what you want in the bar at the top ("a snake game") and press **▶ Build**.
   - **Solo**: Bob builds it. **Team**: Alice plans, Bob builds, Charlie improves the logic, Diana fixes bugs, Echo writes the README (about 5x the tokens).
2. Click an agent in the progress bar to watch their screen live.
3. When it says **Done**, click **▶ Open result**. Each goal gets its own folder `workspace/<project>/`, so earlier projects are never overwritten. Tick "improve the previous project" to keep working on the last one instead.

Builds use your own Claude plan. Agents may only read and write files inside `workspace/` (no shell commands).

## Remote control from your phone (Telegram)

Send a goal to your own Telegram bot and get a **screenshot of the result** back, e.g. "a snake game".

1. In Telegram, talk to **@BotFather**, send `/newbot`, and copy the token.
2. Put it in `.env`: `TELEGRAM_BOT_TOKEN=...` and start the workroom (`npm start`).
3. Run `npm run telegram:setup`, then message your bot once. It saves your chat id into `.env` for you. Restart the workroom.
4. Send a goal. You get progress messages and, when finished, a screenshot.

| Message | Effect |
|---|---|
| any text | build solo (Bob) |
| `/team <goal>` | full five-agent team |
| `/improve <text>` | keep working on the previous project |
| `/shot` | screenshot of the latest project |
| `/status`, `/stop` | progress / cancel |

Notes: only chats listed in `TELEGRAM_ALLOWED_CHAT_IDS` can give orders (everyone else is refused), because every goal spends your Claude plan and writes files on your computer. The workroom must be running on your computer. Screenshots use the Chrome or Edge you already have installed (`BROWSER_BIN` to override); they show the first screen of `index.html`, so a game is shown at its start state. WhatsApp is not supported: it needs a business account and a public webhook, which does not fit a local app.

## Controls

| Key | Action |
|---|---|
| `W` `A` `S` `D` / arrows | Walk |
| Mouse drag / `Q` / `←` `→` | Look around |
| `E` | Inspect a monitor / use a prop |
| `V` | Toggle top-down view (click floor to move, click an agent to open their monitor) |
| `T` | Open intercom (chat, jobs, whiteboard, agents) |
| `M` / `C` | Toggle minimap / CRT scanlines |
| `Esc` | Close dialogs |

## Connect your AI tools (MCP)

Start the web UI (`npm start`), then register the stdio server once per tool. Use the absolute path to `src/mcp-server.mjs`.

```bash
claude mcp add pixel-workroom -- node /ABSOLUTE/PATH/pixel-workroom-mcp/src/mcp-server.mjs
codex  mcp add pixel-workroom -- node /ABSOLUTE/PATH/pixel-workroom-mcp/src/mcp-server.mjs
gemini mcp add pixel-workroom node /ABSOLUTE/PATH/pixel-workroom-mcp/src/mcp-server.mjs
```

Other clients (Claude Desktop, Cursor, Antigravity): copy [`mcp_config.example.json`](mcp_config.example.json) into their MCP config and fix the path. Gemini CLI asks you to trust the folder the first time.

Then ask your tool, for example: *"Use pixel-workroom to split 'build a snake game' across all five agents with workroom_assign_task."* Calls from your tool show up live in the browser; your tool uses its own plan, so the room spends no tokens.

| Tool | Purpose |
|---|---|
| `workroom_list_agents` | Roster with state and energy |
| `workroom_assign_task` | Put a job on the whiteboard for an agent |
| `workroom_get_whiteboard` | List all jobs |
| `workroom_get_screen` / `workroom_update_agent_screen` | Read or write an agent's monitor |
| `workroom_broadcast` / `workroom_send_agent_message` | Talk to everyone / one agent |
| `workroom_intercom_history` | Read recent chat |
| `workroom_trigger_sprint` | Scripted demo sprint (not a real build) |

## Health bar and tokens

Each agent has a budget (`AGENT_TOKEN_BUDGET`, default 400000). The bar over their head, in top view, in their monitor and in the header shows what is left: green above 50%, amber above 20%, red below. **🔋 refill** in the goal bar resets it.

The bar counts tokens spent by the room itself: goal runs and in-room agents that call an API. Work done by Claude Code, Codex or Gemini through MCP uses their own plans and does not move it. At zero, in-room agents stop calling paid APIs and answer locally.

Saving tokens without losing quality: Token Saver answers trivial messages locally, uses cheap model tiers, sends only the last two messages as context, caps replies, and caches repeated prompts. Toggle it in the intercom, or `node src/cli.mjs eco on|off`. Set `CLAUDE_RUN_MODEL=haiku` for cheaper builds.

## Configuration

Copy [`.env.example`](.env.example) to `.env`. Everything is optional. Without API keys the in-room agents reply with free local heuristics. Key settings: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `CLAUDE_RUN_MODEL`, `AGENT_TOKEN_BUDGET`, `PORT`, `WORKROOM_DEMO=1` (fake jobs and chatter for demos).

## CLI

```bash
node src/cli.mjs list
node src/cli.mjs task bob "Add lights" "Radial falloff for ceiling lamps"
node src/cli.mjs broadcast "Stand-up in five"
node src/cli.mjs sprint "Mini game"     # scripted demo
```

## Security notes

- The UI, API and WebSocket accept requests only from `http://localhost:<PORT>`. Generated apps are served from `http://127.0.0.1:<PORT>/workspace/`, a different origin, so they cannot call the runner.
- The goal runner lets Claude Code use `Read, Write, Edit, Glob, Grep` inside `workspace/` only. Review generated code before running it anywhere that matters.
- The server has no authentication. Run it on your own machine; do not expose the port to a network.
- `.env` and runtime state are git-ignored. Never commit API keys.

## Development

```bash
npm test          # integration, runner and Telegram bot tests (no API calls)
npm run test:e2e  # real server + real Chrome screenshot against a local fake Telegram
```

```
src/server.mjs             HTTP, WebSocket, REST API
src/mcp-server.mjs         MCP stdio server (syncs with the web UI through the state file)
src/runner.mjs             Goal runner (spawns Claude Code in workspace/)
src/agent-coordinator.mjs  Agent behaviour, token budget sync
src/llm-provider.mjs       Claude / OpenAI / Gemini calls, Token Saver, budgets
src/state.mjs              Shared state and persistence
public/                    Raycaster, top view, goal bar, intercom UI
```

## Troubleshooting

- **"Claude Code is not logged in"**: run `claude` in a terminal once and sign in.
- **Command not found right after `npm i -g`**: open a fresh terminal so PATH reloads.
- **Gemini CLI says the client is no longer supported**: Google sign-in for individuals was discontinued there; choose "Use Gemini API Key" instead.
- **Build fails**: the exact reason is in the red message and in `run.log`.

## License

MIT, see [LICENSE](LICENSE).
