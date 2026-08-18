import { mkdirSync, readFileSync, unlinkSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  type Session,
  createProductBrief,
  createSession,
  sessionSchema,
} from "./domain/models.ts";
import { sessionToJson } from "./domain/serialize.ts";

export class SessionStore {
  protected sessions = new Map<string, Session>();

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getOrCreate(sessionId: string): Session {
    const existing = this.get(sessionId);
    if (existing !== undefined) {
      return existing;
    }
    const session = createSession(sessionId, { brief: createProductBrief() });
    this.save(session);
    return session;
  }

  save(session: Session): void {
    this.sessions.set(session.id, session);
  }

  clear(): void {
    this.sessions.clear();
  }
}

export class FileSessionStore extends SessionStore {
  private readonly directory: string;

  constructor(directory: string) {
    super();
    this.directory = directory;
    mkdirSync(this.directory, { recursive: true });
  }

  private pathFor(sessionId: string): string {
    const safe = [...sessionId]
      .map((ch) => (/[A-Za-z0-9_-]/.test(ch) ? ch : "_"))
      .join("");
    return join(this.directory, `${safe}.json`);
  }

  override get(sessionId: string): Session | undefined {
    const cached = this.sessions.get(sessionId);
    if (cached !== undefined) {
      return cached;
    }
    const path = this.pathFor(sessionId);
    if (!existsSync(path)) {
      return undefined;
    }
    const session = sessionSchema.parse(
      JSON.parse(readFileSync(path, "utf-8")),
    );
    this.sessions.set(sessionId, session);
    return session;
  }

  override save(session: Session): void {
    this.sessions.set(session.id, session);
    writeFileSync(
      this.pathFor(session.id),
      JSON.stringify(sessionToJson(session)),
      "utf-8",
    );
  }

  override clear(): void {
    this.sessions.clear();
    for (const name of readdirSync(this.directory)) {
      if (name.endsWith(".json")) {
        unlinkSync(join(this.directory, name));
      }
    }
  }
}
