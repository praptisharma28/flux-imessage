# Flux

**Your second brain in iMessage. Text it anything worth remembering, and it'll surface the right thing when you need it.**

Flux is a personal AI agent that lives inside your iMessage. Tell it things — ideas, deadlines, people, half-formed thoughts, what you ate for lunch — and it remembers. Ask it later, and it answers from what you told it. No app to open, no UI to learn. Just text.

Built on [Photon's `imessage-kit`](https://github.com/photon-hq/imessage-kit) and powered by Claude.

---

## Why this and not another chatbot

Most AI assistants forget you the moment the tab closes. Flux doesn't. Every fact you share gets categorized, tagged, and stored locally in SQLite, then loaded back as context on every reply. The longer you use it, the more useful it gets — because it actually knows you.

And it lives where your thoughts already happen: your messages app. Capturing an idea is one swipe and three words away.

---

## What it feels like to use

```
You:  Just had a great idea — what if the onboarding had a 60-second mode for power users?
Flux: Noted — onboarding "60-second mode" for power users. Worth prototyping?

You:  Project deadline is May 15
Flux: Got it, May 15.

You:  My sister's birthday is March 3rd, she loves vinyl
Flux: Locked in — March 3rd, vinyl-friendly.

         ... three weeks later ...

You:  what did I want to prototype for onboarding again?
Flux: A 60-second mode for power users. You mentioned it ~3w ago.

You:  what was that thing for my sister?
Flux: Her birthday's March 3rd and she loves vinyl.
```

It's not magic — it's just remembering, which turns out to be most of what makes an assistant feel intelligent.

---

## How it works

```
iMessage  ──►  imessage-kit watcher  ──►  FluxAgent  ──►  Claude
                                              │             │
                                              ▼             │
                                         SQLite store ◄─────┘
                                       (memories +
                                        conversation log)
```

1. **`src/index.ts`** — boots the iMessage SDK, watches incoming DMs, debounces concurrent messages from the same sender, and routes each one to the agent.
2. **`src/agent.ts`** — wraps Claude with a system prompt that forces every reply into a JSON object: `{ response, save[] }`. The `response` gets sent back; the `save[]` array gets appended to the user's memory store. On every call, recent memories and the last 8 conversation turns are loaded as context.
3. **`src/store.ts`** — a thin SQLite wrapper (using `bun:sqlite`, zero deps) for two tables: `memories` (per-sender, categorized, tagged) and `conversations` (rolling chat history for context windows).

The whole thing is ~300 lines of TypeScript.

---

## Setup

### Prerequisites
- macOS (iMessage only runs on macOS)
- [Bun](https://bun.sh) 1.0+ (`curl -fsSL https://bun.sh/install | bash`)
- An [Anthropic API key](https://console.anthropic.com)
- **Full Disk Access** for your terminal: System Settings → Privacy & Security → Full Disk Access → add Terminal (or your IDE)

### Install

```bash
git clone https://github.com/praptisharma28/flux-imessage.git
cd flux-imessage
bun install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
# Optional — only respond to specific numbers (recommended for testing)
ALLOWED_SENDERS=+15555555555
```

### Run

```bash
bun start
```

You'll see `Flux is awake. Listening for messages…` — now text yourself from another device. Flux will reply through your Messages app.

---

## Project structure

```
flux-imessage/
├── src/
│   ├── index.ts      # iMessage watcher + message router
│   ├── agent.ts      # Claude-powered brain with memory extraction
│   └── store.ts      # SQLite-backed memory + conversation store
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## Design notes

**Why JSON-structured responses?** Forcing Claude to output `{ response, save[] }` lets a single model call do two jobs at once: write a natural reply *and* extract any new facts worth keeping. No second pass, no tool-calling overhead, fast enough for iMessage.

**Why categorize memories?** Categories (`fact`, `idea`, `task`, `preference`, `contact`, `plan`, `general`) give Claude useful structure when scanning context — it can prioritize tasks differently from passing thoughts. They also make future filtering trivial if you want to add features like "show me all my open tasks."

**Why per-sender memory?** Each phone number gets its own isolated memory pool, so if you ever share Flux with a friend or family member, neither sees the other's notes.

**Why a concurrency lock?** iMessage is async and people send rapid bursts. The lock makes sure Flux finishes one reply before starting the next from the same sender, so memories save in order and the assistant doesn't trip over itself.

---

## What's next

Things this would gain from, in rough priority order:
- **Reminders** — "remind me to call mom Friday" → wire up `imessage-kit`'s `Reminders` API
- **Semantic recall** — embedding-based search for when keyword + recency isn't enough
- **Proactive nudges** — a daily morning text with stale tasks and "from this week last year" surfacing
- **Group chat support** — Flux as a shared brain for a household or team

---

## License

MIT
