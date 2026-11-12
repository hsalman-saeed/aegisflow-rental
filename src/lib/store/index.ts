import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";
import { createInitialSessionState } from "@/lib/store/seed-data";
import type { EventLogEntry, SessionData } from "@/types/domain";

export const SESSION_COOKIE_NAME = "af_session_id";
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const LOCAL_SESSIONS_DIR = path.resolve(process.cwd(), "data", "sessions");

const MEMORY_SESSIONS = new Map<string, SessionData>();
const MEMORY_RATE_BUCKETS = new Map<string, number[]>();

function hasUpstashEnv(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return Boolean(url && token);
}

let cachedRedis: Redis | null = null;
let cachedRatelimit: Ratelimit | null = null;

function getUpstashRedis(): Redis | null {
  if (!hasUpstashEnv()) return null;
  if (!cachedRedis) {
    cachedRedis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return cachedRedis;
}

function getLocalSessionPath(sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(LOCAL_SESSIONS_DIR, `${safeId}.json`);
}

function readLocalSession(sessionId: string): SessionData | null {
  const inMem = MEMORY_SESSIONS.get(sessionId);
  if (inMem) return structuredClone(inMem);

  const filePath = getLocalSessionPath(sessionId);
  if (!existsSync(filePath)) return null;

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as SessionData;
  MEMORY_SESSIONS.set(sessionId, parsed);
  return structuredClone(parsed);
}

function writeLocalSession(sessionId: string, data: SessionData): void {
  const clone = structuredClone(data);
  MEMORY_SESSIONS.set(sessionId, clone);
  try {
    mkdirSync(LOCAL_SESSIONS_DIR, { recursive: true });
    writeFileSync(getLocalSessionPath(sessionId), JSON.stringify(clone, null, 2));
  } catch {
    // Ephemeral serverless filesystems may be read-only; memory map remains active.
  }
}

/** Reads or creates an isolated session ID cookie in Next.js App Router context. */
export function getOrCreateSessionId(): { sessionId: string; isNew: boolean } {
  try {
    const cookieStore = cookies();
    const existing = cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim();
    if (existing) {
      return { sessionId: existing, isNew: false };
    }
  } catch {
    // Invoked outside a Next.js request context (e.g., direct unit test call).
  }
  return { sessionId: randomUUID(), isNew: true };
}

/** Retrieves an existing session or seeds a fresh Northside AV Rental session. */
export async function getSession(sessionId?: string): Promise<SessionData> {
  const resolvedId = sessionId || randomUUID();
  const redis = getUpstashRedis();

  if (redis) {
    try {
      const existing = await redis.get<SessionData>(`aegisflow:session:${resolvedId}`);
      if (existing) return existing;

      const fresh = createInitialSessionState(resolvedId);
      await redis.set(`aegisflow:session:${resolvedId}`, fresh, {
        ex: SESSION_TTL_SECONDS,
      });
      return fresh;
    } catch {
      // Fallback cleanly to local session store if Redis network hiccups.
    }
  }

  const local = readLocalSession(resolvedId);
  if (local) return local;

  const fresh = createInitialSessionState(resolvedId);
  writeLocalSession(resolvedId, fresh);
  return fresh;
}

/** Persists updated session state to Upstash Redis or local JSON fallback. */
export async function saveSession(
  sessionId: string,
  data: SessionData
): Promise<SessionData> {
  const updated: SessionData = {
    ...data,
    sessionId,
    updatedAt: new Date().toISOString(),
  };

  const redis = getUpstashRedis();
  if (redis) {
    try {
      await redis.set(`aegisflow:session:${sessionId}`, updated, {
        ex: SESSION_TTL_SECONDS,
      });
    } catch {
      // Continue and persist locally as backup
    }
  }

  writeLocalSession(sessionId, updated);
  return updated;
}

/** Resets a session back to the initial Northside AV seed state (< 500ms). */
export async function resetSession(sessionId: string): Promise<SessionData> {
  const fresh = createInitialSessionState(sessionId);
  return saveSession(sessionId, fresh);
}

/** Appends an immutable audit entry to the session event log (FR-080). */
export async function appendEventLog(
  sessionId: string,
  entry: Omit<EventLogEntry, "id" | "timestamp">,
  existingData?: SessionData
): Promise<SessionData> {
  const current = existingData ?? (await getSession(sessionId));
  const fullEntry: EventLogEntry = {
    ...entry,
    id: `evt_${randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
  };
  const next: SessionData = {
    ...current,
    eventLog: [fullEntry, ...current.eventLog],
  };
  return saveSession(sessionId, next);
}

/**
 * Enforces 30 AI/mutating calls per 10 minutes per IP/session (FR-082 / THR-005).
 */
export async function checkRateLimit(identifier: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const limit = 30;
  const redis = getUpstashRedis();

  if (redis) {
    try {
      if (!cachedRatelimit) {
        cachedRatelimit = new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(limit, "10 m"),
          prefix: "aegisflow:rl",
        });
      }
      const res = await cachedRatelimit.limit(identifier);
      return {
        allowed: res.success,
        remaining: res.remaining,
        limit: res.limit,
      };
    } catch {
      // Fallback to in-memory sliding window if Upstash is unreachable
    }
  }

  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const hits = (MEMORY_RATE_BUCKETS.get(identifier) ?? []).filter(
    (ts) => now - ts < windowMs
  );

  if (hits.length >= limit) {
    MEMORY_RATE_BUCKETS.set(identifier, hits);
    return { allowed: false, remaining: 0, limit };
  }

  hits.push(now);
  MEMORY_RATE_BUCKETS.set(identifier, hits);
  return { allowed: true, remaining: limit - hits.length, limit };
}

const MEMORY_LOCKS = new Map<string, number>();

export async function acquireActionLock(
  lockKey: string,
  ttlMs = 15000
): Promise<boolean> {
  const namespacedKey = `aegisflow:lock:${lockKey}`;
  const redis = getUpstashRedis();
  if (redis) {
    try {
      const result = await redis.set(namespacedKey, "1", { nx: true, px: ttlMs });
      return result === "OK";
    } catch {
      // Fallback to in-memory lock if Redis is unreachable
    }
  }

  const now = Date.now();
  const expiresAt = MEMORY_LOCKS.get(namespacedKey);
  if (expiresAt !== undefined && expiresAt > now) {
    return false;
  }
  MEMORY_LOCKS.set(namespacedKey, now + ttlMs);
  return true;
}

export async function releaseActionLock(lockKey: string): Promise<void> {
  const namespacedKey = `aegisflow:lock:${lockKey}`;
  MEMORY_LOCKS.delete(namespacedKey);
  const redis = getUpstashRedis();
  if (redis) {
    try {
      await redis.del(namespacedKey);
    } catch {
      // Ignore Redis transient cleanup failures; TTL bounds lock lifetime
    }
  }
}

