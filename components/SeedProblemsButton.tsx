"use client";

import React from "react";
import { useState } from "react";

type SeedStatus = "idle" | "loading" | "success" | "error";

type SeedProblemsButtonProps = {
  readonly onSeeded?: () => void;
};

type SeedResponse = {
  readonly ok: boolean;
  readonly error?: string;
};

export function SeedProblemsButton({ onSeeded }: SeedProblemsButtonProps) {
  const [status, setStatus] = useState<SeedStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function seedProblems(): Promise<void> {
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/problems/seed", { method: "POST" });
      const body: SeedResponse = await response.json();
      if (!response.ok || !body.ok) {
        setStatus("error");
        setMessage(body.error ?? "Failed to seed starter catalog");
        return;
      }
      setStatus("success");
      setMessage("Catalog seeded. Reloading problems...");
      if (onSeeded !== undefined) {
        onSeeded();
        return;
      }
      window.location.reload();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Failed to seed starter catalog");
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-slate-600">Seed the local starter catalog from bundled metadata. No external problem statements are copied.</p>
      <button
        className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={status === "loading"}
        type="button"
        onClick={() => void seedProblems()}
      >
        {status === "loading" ? "Seeding..." : "Seed starter catalog"}
      </button>
      {message !== null && <p className={status === "error" ? "mt-3 text-sm text-red-700" : "mt-3 text-sm text-slate-600"}>{message}</p>}
    </div>
  );
}
