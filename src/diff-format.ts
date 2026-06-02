import type { DiffResult } from "./diff";

function escapeFileLabel(value: string): string {
  return value.replace(/\t/g, "\\t").replace(/\n/g, "\\n");
}

function emitLines(prefix: "+" | "-" | " ", text: string, out: string[]): void {
  const lines = text.split("\n");
  if (lines.length === 1 && lines[0] === "") return;
  for (const line of lines) {
    out.push(`${prefix}${line}`);
  }
}

export function formatDiffUnified(diff: DiffResult): string {
  const out: string[] = [];

  out.push(`diff --reader ${escapeFileLabel(diff.url)}`);
  out.push(`--- ${diff.previousAt ?? "/dev/null"}`);
  out.push(`+++ ${diff.currentAt}`);
  out.push(
    `@@ +${diff.summary.added} -${diff.summary.removed} ~${diff.summary.changed} (${diff.summary.unchanged} unchanged) @@`,
  );
  out.push("");

  if (diff.changes.length === 0) {
    out.push(" (no changes)");
    return out.join("\n") + "\n";
  }

  for (const change of diff.changes) {
    const label = change.classification ?? change.type;
    out.push(`@@ ${label} @@`);

    if (change.type === "removed") {
      emitLines("-", change.before ?? "", out);
    } else if (change.type === "added") {
      emitLines("+", change.after ?? "", out);
    } else if (change.type === "changed") {
      emitLines("-", change.before ?? "", out);
      emitLines("+", change.after ?? "", out);
    }

    out.push("");
  }

  return out.join("\n").trimEnd() + "\n";
}

export function resolveDiffOutput(format: string | undefined): "unified" | "json" {
  if (format === "json") return "json";
  return "unified";
}

export const DIFF_OUTPUT_FORMATS = new Set(["unified", "json", "markdown", "text"]);
