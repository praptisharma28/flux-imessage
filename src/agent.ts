import Anthropic from "@anthropic-ai/sdk";
import type { MemoryStore } from "./store";

const SYSTEM_PROMPT = `You are Flux, a personal second-brain assistant living inside someone's iMessage. You are warm, sharp, and concise — like texting a brilliant friend with perfect memory.

YOUR JOB
You do four things, and you decide which on every message:

1. REMEMBER — When the user shares anything worth keeping (facts, ideas, tasks, plans, preferences, contacts, deadlines), extract it into a memory. Acknowledge naturally.
2. RECALL — When the user asks about something they told you before, search their memories and answer using them.
3. THINK — When the user is working through a decision, idea, or problem, be a real thinking partner. Ask one good question. Offer a frame.
4. CHAT — Otherwise, just be a warm, helpful presence. Brief.

HARD RULES
- This is iMessage. Keep replies SHORT — usually 1-3 sentences. Never write paragraphs unless explicitly asked.
- No filler. No "Great question!", no "Absolutely!", no "I'd be happy to help!". Just answer.
- When saving a memory, don't say "Memory saved" — acknowledge the actual content. ("Got it — May 15th deadline." not "Saved!")
- When recalling, cite what they told you naturally. ("You mentioned the deadline is May 15th.")
- Only save NEW information. If something is already in their memories, don't re-save it.
- If they're venting or sharing emotion, lead with empathy, not utility.

OUTPUT FORMAT
You MUST respond with a single JSON object and nothing else, in this exact shape:

{
  "response": "the text message to send back to the user",
  "save": [
    { "content": "the fact/idea/task to remember, written as a clear standalone note", "category": "fact|idea|task|preference|contact|plan|general", "tags": ["short", "tags"] }
  ]
}

The "save" array can be empty. Only include items that are genuinely worth remembering long-term.`;

interface AgentSave {
  content: string;
  category: string;
  tags?: string[];
}

interface AgentResponse {
  response: string;
  save?: AgentSave[];
}

export class FluxAgent {
  private client: Anthropic;
  private store: MemoryStore;
  private model: string;

  constructor(store: MemoryStore) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set. Add it to your .env file.");
    }
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.store = store;
    this.model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
  }

  async processMessage(sender: string, text: string): Promise<string> {
    const memories = this.store.getMemories(sender, 50);
    const recentMessages = this.store.getRecentMessages(sender, 8);
    const memoryCount = this.store.getMemoryCount(sender);

    this.store.saveMessage(sender, "user", text);

    const memoryContext =
      memories.length > 0
        ? memories
            .map(
              (m) =>
                `[${m.category}] ${m.content} (saved ${this.formatRelative(m.created_at)})`
            )
            .join("\n")
        : "No memories yet — this is a fresh slate.";

    const conversationHistory = recentMessages
      .slice()
      .reverse()
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const contextBlock = `USER CONTEXT
Total memories stored: ${memoryCount}

STORED MEMORIES (most recent first):
${memoryContext}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 600,
      system: `${SYSTEM_PROMPT}\n\n${contextBlock}`,
      messages: [
        ...conversationHistory,
        { role: "user", content: text },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const parsed = this.parseResponse(raw);
    const reply = parsed.response.trim();

    if (parsed.save && Array.isArray(parsed.save)) {
      for (const mem of parsed.save) {
        if (mem.content && typeof mem.content === "string") {
          this.store.saveMemory(
            sender,
            mem.content.trim(),
            mem.category || "general",
            mem.tags ?? []
          );
        }
      }
    }

    this.store.saveMessage(sender, "assistant", reply);
    return reply;
  }

  private parseResponse(raw: string): AgentResponse {
    const trimmed = raw.trim();

    // Try direct parse first
    try {
      return JSON.parse(trimmed) as AgentResponse;
    } catch {
      // fall through
    }

    // Try to extract a JSON object from the text
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as AgentResponse;
      } catch {
        // fall through
      }
    }

    // Last resort: treat the whole thing as a plain text reply
    return { response: trimmed || "Sorry, I had a brain blip. Try again?" };
  }

  private formatRelative(timestamp: string): string {
    const then = new Date(timestamp + "Z").getTime();
    if (Number.isNaN(then)) return timestamp;

    const seconds = Math.floor((Date.now() - then) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }
}
