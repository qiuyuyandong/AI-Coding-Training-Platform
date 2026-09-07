import { dirname, join } from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { openDatabase } from "@/lib/db/client";
import {
  CaptureRequestError,
  readBoundedJson,
  requireSameOrigin,
  statusForRangeError,
} from "@/lib/http/captureRequest";
import {
  deleteProjectArtifactEvidence,
  recordProjectArtifactEvidence,
  recordProjectRunEvidence,
} from "@/lib/services/projectEvidenceIntake";

const RunSchema = z.object({
  action: z.literal("run"),
  kind: z.enum(["build", "test", "check"]),
  result: z.enum(["passed", "failed", "not_run"]),
  exitCode: z.number().int().optional(),
  diagnostics: z.string().max(4000).optional(),
  provenance: z.enum(["user_entered", "explicit_import"]),
  supersedesResultId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).max(200),
}).strict();

const ArtifactSchema = z.object({
  action: z.literal("artifact"),
  kind: z.enum(["snapshot", "checksum", "diff", "test_summary", "commit_reference"]),
  purpose: z.string().min(1).max(200),
  captureMode: z.enum(["full", "basic", "minimal"]),
  relativePath: z.string().max(500).optional(),
  content: z.string().max(70_000).optional(),
  reference: z.string().max(500).optional(),
  idempotencyKey: z.string().min(1).max(200),
}).strict();

const DeleteSchema = z.object({
  action: z.literal("delete_artifact"),
  artifactId: z.string().min(1),
}).strict();

const EvidenceRequestSchema = z.discriminatedUnion("action", [RunSchema, ArtifactSchema, DeleteSchema]);
const RouteIdSchema = z.string().min(1).max(200);
type RouteContext = { readonly params: Promise<{ readonly id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireSameOrigin(request);
    const parsed = EvidenceRequestSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid evidence request", issues: parsed.error.issues }, { status: 400 });
    const sessionId = RouteIdSchema.parse((await context.params).id);
    const db = openDatabase();
    try {
      const now = new Date().toISOString();
      if (parsed.data.action === "run") {
        const saved = recordProjectRunEvidence(db, {
          projectSessionId: sessionId,
          kind: parsed.data.kind,
          result: parsed.data.result,
          exitCode: parsed.data.exitCode ?? null,
          diagnostics: parsed.data.diagnostics ?? null,
          provenance: parsed.data.provenance,
          supersedesResultId: parsed.data.supersedesResultId ?? null,
          idempotencyKey: parsed.data.idempotencyKey,
          recordedAt: now,
        });
        return NextResponse.json({ ok: true, ...saved });
      }
      const storageRoot = join(dirname(db.name), ".training-evidence");
      if (parsed.data.action === "delete_artifact") {
        const deleted = deleteProjectArtifactEvidence(db, storageRoot, {
          projectSessionId: sessionId,
          artifactId: parsed.data.artifactId,
          deletedAt: now,
        });
        if (!deleted) return NextResponse.json({ ok: false, error: "Artifact not found" }, { status: 404 });
        return NextResponse.json({ ok: true });
      }
      const saved = recordProjectArtifactEvidence(db, storageRoot, {
        projectSessionId: sessionId,
        kind: parsed.data.kind,
        purpose: parsed.data.purpose,
        captureMode: parsed.data.captureMode,
        relativePath: parsed.data.relativePath,
        content: parsed.data.content,
        reference: parsed.data.reference,
        idempotencyKey: parsed.data.idempotencyKey,
        recordedAt: now,
      });
      return NextResponse.json({ ok: true, ...saved });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (error instanceof RangeError) return NextResponse.json({ ok: false, error: error.message }, { status: statusForRangeError(error) });
    return NextResponse.json({ ok: false, error: "Failed to record project evidence" }, { status: 500 });
  }
}
