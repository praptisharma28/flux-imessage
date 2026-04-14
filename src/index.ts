import { IMessageSDK } from "@photon-ai/imessage-kit";
import { FluxAgent } from "./agent";
import { MemoryStore } from "./store";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "Missing ANTHROPIC_API_KEY. Copy .env.example to .env and paste your key from https://console.anthropic.com."
  );
  process.exit(1);
}

const store = new MemoryStore(process.env.FLUX_DB_PATH);
const agent = new FluxAgent(store);
const sdk = new IMessageSDK();

const allowedSenders = (process.env.ALLOWED_SENDERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const inFlight = new Set<string>();

console.log("Flux is awake. Listening for messages…");
if (allowedSenders.length > 0) {
  console.log(`Restricted to: ${allowedSenders.join(", ")}`);
}

await sdk.startWatching({
  onDirectMessage: async (msg) => {
    if (msg.isFromMe) return;
    if (msg.isReaction) return;
    const text = msg.text?.trim();
    if (!text) return;

    const sender = msg.sender;
    if (allowedSenders.length > 0 && !allowedSenders.includes(sender)) {
      return;
    }

    if (inFlight.has(sender)) {
      console.log(`Skipping concurrent message from ${sender}`);
      return;
    }

    inFlight.add(sender);
    console.log(`← ${sender}: ${text}`);

    try {
      const reply = await agent.processMessage(sender, text);
      await sdk.send(sender, reply);
      console.log(`→ ${sender}: ${reply}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error handling message from ${sender}:`, message);
      try {
        await sdk.send(
          sender,
          "Sorry, my brain hiccuped. Mind sending that again?"
        );
      } catch {
        // swallow — nothing more we can do
      }
    } finally {
      inFlight.delete(sender);
    }
  },
  onError: (error) => {
    console.error("Watcher error:", error.message);
  },
});

const shutdown = async () => {
  console.log("\nFlux shutting down…");
  try {
    sdk.stopWatching();
  } catch {}
  try {
    store.close();
  } catch {}
  try {
    await sdk.close();
  } catch {}
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
