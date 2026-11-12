import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { searchChannel3ReplacementPrice } from "@/lib/channel3/client";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  const rateBlocked = await enforceRateLimit(req, ctx.sessionId);
  if (rateBlocked) return rateBlocked;

  const body = (await req.json().catch(() => ({}))) as {
    queries?: string[];
  };

  if (!Array.isArray(body.queries) || body.queries.length === 0) {
    return jsonError("Missing non-empty queries array.", 400);
  }

  const results = await Promise.all(
    body.queries.slice(0, 6).map(async (query) => {
      try {
        const res = await searchChannel3ReplacementPrice(query);
        return {
          query,
          cached: res.cached,
          candidates: res.candidates,
        };
      } catch (err) {
        return {
          query,
          cached: false,
          candidates: [],
          error: err instanceof Error ? err.message : "Channel3 lookup failed",
        };
      }
    })
  );

  return jsonWithSession({ results }, ctx);
}

