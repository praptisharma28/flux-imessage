import { IMessageSDK } from "@photon-ai/imessage-kit";
import { FluxAgent } from "./agent";
import { MemoryStore } from "./store";

const store = new MemoryStore();
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
    if (!msg.text || !msg.text.trim()) return;

    if (
      allowedSenders.length > 0 &&
      !allowedSenders.includes(msg.participant)
    ) {
      return;
    }

    // Dedup: ignore if we're already processing a message from this sender
    if (inFlight.has(msg.participant)) {
      console.log(`Skipping concurrent message from ${msg.participant}`);
      return;
    }

    inFlight.add(msg.participant);
    console.log(`← ${msg.participant}: ${msg.text}`);

    try {
      const reply = await agent.processMessage(msg.participant, msg.text);
      await sdk.send(msg.participant, reply);
      console.log(`→ ${msg.participant}: ${reply}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error handling message from ${msg.participant}:`, message);
      try {
        await sdk.send(
          msg.participant,
          "Sorry, my brain hiccuped. Mind sending that again?"
        );
      } catch {
        // swallow — nothing more we can do
      }
    } finally {
      inFlight.delete(msg.participant);
    }
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
