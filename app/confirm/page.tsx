import Link from "next/link";
import { getDb, getEnv } from "@/lib/db/client";
import { confirmSubscriber } from "@/lib/service";

export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let ok = false;
  let email = "";
  if (token) {
    const [env, db] = await Promise.all([getEnv(), getDb()]);
    const res = await confirmSubscriber(env, db, token);
    if (res) {
      ok = true;
      email = res.email;
    }
  }

  return (
    <>
      <h1>book-releases</h1>
      {ok ? (
        <div className="notice">
          <p>
            Thanks — <strong>{email}</strong> is confirmed. You&apos;ll start receiving digests on
            your chosen schedule.
          </p>
        </div>
      ) : (
        <div className="notice error">
          <p>This confirmation link is invalid or has expired. Try subscribing again.</p>
        </div>
      )}
      <p>
        <Link href="/">← Back to search</Link>
      </p>
    </>
  );
}
