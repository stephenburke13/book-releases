import { NextRequest, NextResponse } from "next/server";
import { getDb, getEnv } from "@/lib/db/client";
import { searchAuthors } from "@/lib/hardcover-search";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const [env, db] = await Promise.all([getEnv(), getDb()]);
    const results = await searchAuthors(db, env.HARDCOVER_TOKEN, q);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
