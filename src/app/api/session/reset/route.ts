import { NextRequest } from "next/server";
import {
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { resetSession } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { confirm?: boolean };
  if (body.confirm !== true) {
    return jsonError("Reset requires { confirm: true }.", 400);
  }

  const ctx = await resolveSessionContext(req);
  const data = await resetSession(ctx.sessionId);

  return jsonWithSession(
    {
      success: true,
      sessionId: ctx.sessionId,
      data,
    },
    ctx
  );
}

