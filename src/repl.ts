/**
 * REPL mode — chat with Flux from the terminal without touching iMessage.
 *
 * Useful for:
 *   - Verifying your ANTHROPIC_API_KEY works
 *   - Testing the agent and memory store in isolation
 *   - Debugging without needing Full Disk Access
 *
 * Run with: bun run src/repl.ts
 */
import { FluxAgent } from "./agent";
import { MemoryStore } from "./store";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "Missing ANTHROPIC_API_KEY. Copy .env.example to .env and paste your key from https://console.anthropic.com."
  );
  process.exit(1);
}

const SENDER = "cli-user";
const store = new MemoryStore(
  process.env.FLUX_DB_PATH ?? "./flux-repl.db"
);
const agent = new FluxAgent(store);

console.log("Flux REPL — chat with the agent locally.");
console.log("Type your message and hit Enter. Ctrl+C to quit.\n");

process.stdout.write("you: ");

for await (const chunk of console) {
  const text = chunk.toString().trim();
  if (!text) {
    process.stdout.write("you: ");
    continue;
  }

  try {
    const reply = await agent.processMessage(SENDER, text);
    console.log(`flux: ${reply}\n`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`error: ${msg}\n`);
  }

  process.stdout.write("you: ");
}

store.close();
