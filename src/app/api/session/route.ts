import { NextRequest } from "next/server";
import { jsonWithSession, resolveSessionContext } from "@/lib/api/session-http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  return jsonWithSession(
    {
      sessionId: ctx.sessionId,
      isNew: ctx.isNew,
      data: ctx.data,
    },
    ctx
  );
}

