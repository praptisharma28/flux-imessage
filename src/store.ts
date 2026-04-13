import { Database } from "bun:sqlite";

export interface MemoryRow {
  id: number;
  sender: string;
  content: string;
  category: string;
  tags: string;
  created_at: string;
}

export interface MessageRow {
  id: number;
  sender: string;
  role: string;
  content: string;
  created_at: string;
}

export class MemoryStore {
  private db: Database;

  constructor(path = "./flux.db") {
    this.db = new Database(path);
    this.db.run("PRAGMA journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at DATETIME NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_memories_sender ON memories(sender)"
    );
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_conversations_sender ON conversations(sender)"
    );
  }

  // ── Memories ──────────────────────────────────────────────

  saveMemory(
    sender: string,
    content: string,
    category: string,
    tags: string[]
  ) {
    this.db
      .query(
        "INSERT INTO memories (sender, content, category, tags) VALUES (?1, ?2, ?3, ?4)"
      )
      .run(sender, content, category, JSON.stringify(tags));
  }

  getMemories(sender: string, limit = 50): MemoryRow[] {
    return this.db
      .query<MemoryRow, [string, number]>(
        "SELECT * FROM memories WHERE sender = ?1 ORDER BY created_at DESC LIMIT ?2"
      )
      .all(sender, limit);
  }

  searchMemories(sender: string, keywords: string[]): MemoryRow[] {
    if (keywords.length === 0) return this.getMemories(sender, 20);

    const conditions = keywords.map(
      (_, i) => `content LIKE ?${i + 2}`
    );
    const params = [sender, ...keywords.map((k) => `%${k}%`)];

    return this.db
      .query<MemoryRow, string[]>(
        `SELECT * FROM memories WHERE sender = ?1 AND (${conditions.join(" OR ")}) ORDER BY created_at DESC LIMIT 20`
      )
      .all(...params);
  }

  getMemoryCount(sender: string): number {
    const row = this.db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) as count FROM memories WHERE sender = ?1"
      )
      .get(sender);
    return row?.count ?? 0;
  }

  getMemoryStats(sender: string): Record<string, number> {
    const rows = this.db
      .query<{ category: string; count: number }, [string]>(
        "SELECT category, COUNT(*) as count FROM memories WHERE sender = ?1 GROUP BY category"
      )
      .all(sender);

    const stats: Record<string, number> = {};
    for (const row of rows) stats[row.category] = row.count;
    return stats;
  }

  // ── Conversation History ──────────────────────────────────

  saveMessage(sender: string, role: "user" | "assistant", content: string) {
    this.db
      .query(
        "INSERT INTO conversations (sender, role, content) VALUES (?1, ?2, ?3)"
      )
      .run(sender, role, content);
  }

  getRecentMessages(sender: string, limit = 10): MessageRow[] {
    return this.db
      .query<MessageRow, [string, number]>(
        "SELECT * FROM conversations WHERE sender = ?1 ORDER BY created_at DESC LIMIT ?2"
      )
      .all(sender, limit);
  }

  // ── Lifecycle ─────────────────────────────────────────────

  close() {
    this.db.close();
  }
}
