import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  checkRateLimit,
  getSession,
} from "@/lib/store";
import type { SessionData } from "@/types/domain";

export interface SessionContext {
  sessionId: string;
  isNew: boolean;
  data: SessionData;
}

/**
 * Resolves the isolated session ID from cookie or x-aegisflow-session header,
 * creating one if absent (FR-001).
 */
export async function resolveSessionContext(
  req: NextRequest
): Promise<SessionContext> {
  const headerId = req.headers.get("x-aegisflow-session")?.trim();
  const cookieId = req.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
  const existingId = headerId || cookieId;
  const sessionId = existingId || randomUUID();
  const data = await getSession(sessionId);

  return {
    sessionId,
    isNew: !existingId,
    data,
  };
}

/** Attaches the HttpOnly SameSite=Lax session cookie onto a JSON response. */
export function jsonWithSession<T>(
  body: T,
  ctx: Pick<SessionContext, "sessionId">,
  status = 200
): NextResponse<T> {
  const res = NextResponse.json(body, { status });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: ctx.sessionId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return res;
}

export function jsonError(
  message: string,
  status: number,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { error: message, ...(extra ?? {}) },
    { status }
  );
}

/** Enforces the server-side sliding-window rate limiter (FR-082). */
export async function enforceRateLimit(
  req: NextRequest,
  sessionId: string
): Promise<NextResponse | null> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = await checkRateLimit(`${ip}:${sessionId}`);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded (max 30 AI/gateway calls per 10 minutes).",
        remaining: rl.remaining,
        limit: rl.limit,
      },
      { status: 429 }
    );
  }
  return null;
}

