import Link from "next/link";
import { getDb, getEnv } from "@/lib/db/client";
import { getManageView } from "@/lib/service";
import ManageForm from "./ManageForm";

export const dynamic = "force-dynamic";

export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const view = token
    ? await (async () => {
        const [env, db] = await Promise.all([getEnv(), getDb()]);
        return getManageView(env, db, token);
      })()
    : null;

  if (!token || !view) {
    return (
      <>
        <h1>Manage subscriptions</h1>
        <div className="notice error">
          <p>This management link is invalid or has expired.</p>
        </div>
        <p>
          <Link href="/">← Back to search</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Manage subscriptions</h1>
      <p className="subtitle">{view.email}</p>
      <ManageForm token={token} initialView={view} />
      <p>
        <Link href="/">← Back to search</Link>
      </p>
    </>
  );
}
