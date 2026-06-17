"use client";

import { useEffect, useRef, useState } from "react";

interface AuthorResult {
  authorKey: string;
  name: string;
  hardcoverId: number;
  booksCount: number;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuthorResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AuthorResult | null>(null);
  const [email, setEmail] = useState("");
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selected) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/authors/search?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { results?: AuthorResult[] };
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, selected]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          authorKey: selected.authorKey,
          authorName: selected.name,
          hardcoverId: selected.hardcoverId,
          cadence,
        }),
      });
      const data = (await res.json()) as { status?: string; error?: string };
      if (!res.ok) {
        setMessage({ kind: "error", text: data.error ?? "Something went wrong." });
      } else if (data.status === "pending") {
        setMessage({
          kind: "ok",
          text: `Almost there — check ${email} for a confirmation link to start your ${cadence} digest for ${selected.name}.`,
        });
      } else {
        setMessage({ kind: "ok", text: `You're subscribed to ${selected.name} (${cadence}).` });
      }
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>book-releases</h1>
      <p className="subtitle">
        Search for an author and get an email when they announce or release a new book.
      </p>

      {!selected && (
        <>
          <input
            type="search"
            placeholder="Search authors (e.g. Brandon Sanderson)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {searching && <p className="subtitle">Searching…</p>}
          <ul className="results">
            {results.map((r) => (
              <li key={r.authorKey} className="result">
                <div>
                  <div>{r.name}</div>
                  <div className="meta">{r.booksCount} books</div>
                </div>
                <button onClick={() => setSelected(r)}>Subscribe</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {selected && (
        <form className="card" onSubmit={submit}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{selected.name}</strong>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setSelected(null);
                setMessage(null);
              }}
            >
              Change
            </button>
          </div>

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label htmlFor="cadence">Digest frequency</label>
          <select
            id="cadence"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as "weekly" | "monthly")}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>

          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={submitting}>
              {submitting ? "Subscribing…" : "Subscribe"}
            </button>
          </div>
        </form>
      )}

      {message && <div className={`notice ${message.kind === "error" ? "error" : ""}`}>{message.text}</div>}
    </>
  );
}
