import { NextRequest, NextResponse } from "next/server";
import { getDb, getEnv } from "@/lib/db/client";
import { applyManageAction, getManageView, type ManageAction } from "@/lib/service";

interface Body {
  token?: string;
  action?: ManageAction;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.token || !body.action) {
    return NextResponse.json({ error: "token and action are required." }, { status: 400 });
  }

  try {
    const [env, db] = await Promise.all([getEnv(), getDb()]);
    const ok = await applyManageAction(env, db, body.token, body.action);
    if (!ok) return NextResponse.json({ error: "Invalid or expired link." }, { status: 403 });
    const view = await getManageView(env, db, body.token);
    return NextResponse.json({ ok: true, view });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
