"use client";

import { useState } from "react";
import type { ManageView, ManageAction } from "@/lib/service";

export default function ManageForm({
  token,
  initialView,
}: {
  token: string;
  initialView: ManageView;
}) {
  const [view, setView] = useState<ManageView>(initialView);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: ManageAction) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const data = (await res.json()) as { view?: ManageView; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else if (data.view) {
        setView(data.view);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const active = view.subscriptions.filter((s) => s.active);

  return (
    <>
      {error && <div className="notice error">{error}</div>}

      {active.length === 0 ? (
        <p>You have no active subscriptions.</p>
      ) : (
        <ul className="results">
          {active.map((s) => (
            <li key={s.id} className="result">
              <div>
                <div>{s.authorName}</div>
                <div className="meta">{s.cadence} digest</div>
              </div>
              <div className="row">
                <select
                  value={s.cadence}
                  disabled={busy}
                  onChange={(e) =>
                    send({
                      action: "set_cadence",
                      subscriptionId: s.id,
                      cadence: e.target.value as "weekly" | "monthly",
                    })
                  }
                  style={{ width: "auto" }}
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => send({ action: "unsubscribe", subscriptionId: s.id })}
                >
                  Unsubscribe
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {active.length > 0 && (
        <button className="secondary" disabled={busy} onClick={() => send({ action: "unsubscribe_all" })}>
          Unsubscribe from all
        </button>
      )}
    </>
  );
}
