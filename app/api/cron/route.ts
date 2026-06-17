// Manual trigger for the cron jobs, guarded by CRON_SECRET. The scheduled
// Worker handler is the real driver; this exists for local testing and ad-hoc
// runs. POST { job: "track" | "dispatch" } with Authorization: Bearer <secret>.

import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/db/client";
import { trackAuthors } from "@/lib/jobs/trackAuthors";
import { dispatchDigests } from "@/lib/jobs/dispatchDigests";

export async function POST(req: NextRequest) {
  const env = await getEnv();
  const secret = env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job } = (await req.json().catch(() => ({}))) as { job?: string };
  try {
    if (job === "track") {
      const events = await trackAuthors(env);
      return NextResponse.json({ ok: true, job, events });
    }
    if (job === "dispatch") {
      const sent = await dispatchDigests(env);
      return NextResponse.json({ ok: true, job, sent });
    }
    return NextResponse.json({ error: 'job must be "track" or "dispatch"' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
