import { NextRequest, NextResponse } from "next/server";
import { getDb, getEnv } from "@/lib/db/client";
import { isValidEmail, subscribe, type Cadence } from "@/lib/service";

interface Body {
  email?: string;
  authorKey?: string;
  authorName?: string;
  hardcoverId?: number;
  cadence?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const cadence = body.cadence === "monthly" ? "monthly" : "weekly";
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!body.authorKey || !body.authorName) {
    return NextResponse.json({ error: "An author is required." }, { status: 400 });
  }

  try {
    const [env, db] = await Promise.all([getEnv(), getDb()]);
    const result = await subscribe(env, db, {
      email,
      authorKey: body.authorKey,
      authorName: body.authorName,
      ...(typeof body.hardcoverId === "number" ? { hardcoverId: body.hardcoverId } : {}),
      cadence: cadence as Cadence,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
