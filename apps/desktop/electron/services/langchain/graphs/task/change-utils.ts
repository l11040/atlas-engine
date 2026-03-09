import type {
  GitDiffFileEntry,
  TaskUnit,
  VerificationCheck,
  VerificationResult
} from "../../../../../shared/ipc";

function escapeRegex(input: string): string {
  return input.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, "/");
  const withDoubleStar = normalized.split("**").map(escapeRegex).join("::DOUBLE_STAR::");
  const withSingleStar = withDoubleStar.split("*").join("[^/]*");
  const source = withSingleStar.split("::DOUBLE_STAR::").join(".*");
  return new RegExp(`^${source}$`);
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/");
}

export function isPathMatched(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);

  if (!normalizedPattern.includes("*")) {
    return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
  }
  return globToRegex(normalizedPattern).test(normalizedPath);
}

export function mapDiffStatus(status: GitDiffFileEntry["status"]): "create" | "modify" | "delete" {
  switch (status) {
    case "added":
      return "create";
    case "deleted":
      return "delete";
    default:
      return "modify";
  }
}

export function detectScopeViolations(
  changedPaths: string[],
  editablePaths: string[],
  forbiddenPaths: string[]
): string[] {
  const violations: string[] = [];
  for (const changedPath of changedPaths) {
    const normalized = normalizePath(changedPath);

    const forbidden = forbiddenPaths.find((p) => isPathMatched(normalized, p));
    if (forbidden) {
      violations.push(`Forbidden path modified: ${normalized} (pattern: ${forbidden})`);
      continue;
    }

    if (editablePaths.length > 0 && !editablePaths.some((p) => isPathMatched(normalized, p))) {
      violations.push(`Out of scope: ${normalized}`);
    }
  }
  return [...new Set(violations)];
}

function renderHunkLine(
  line: GitDiffFileEntry["hunks"][number]["lines"][number]
): string {
  if (line.type === "addition") return `+${line.content}`;
  if (line.type === "deletion") return `-${line.content}`;
  return ` ${line.content}`;
}

export function buildUnifiedDiff(files: GitDiffFileEntry[]): string | null {
  if (files.length === 0) return null;

  const chunks: string[] = [];
  for (const file of files) {
    chunks.push(`diff -- ${file.filePath}`);
    chunks.push(`status: ${file.status} (+${file.additions} -${file.deletions})`);

    for (const hunk of file.hunks) {
      chunks.push(hunk.header);
      for (const line of hunk.lines) {
        chunks.push(renderHunkLine(line));
      }
    }
  }

  return chunks.join("\n");
}

export function buildFailureReport(
  verification: VerificationResult | null
): string {
  if (!verification) return "No verification result available.";

  const failedChecks = verification.checks
    .filter((check) => !check.passed)
    .map((check) => `- ${check.name}: ${check.detail}`);
  const reasons = verification.failure_reasons.map((reason) => `- ${reason}`);

  return [
    `Verdict: ${verification.verdict}`,
    "",
    "Failed Checks:",
    failedChecks.length > 0 ? failedChecks.join("\n") : "- none",
    "",
    "Failure Reasons:",
    reasons.length > 0 ? reasons.join("\n") : "- none"
  ].join("\n");
}

export function normalizeChecks(
  parsedChecks: VerificationCheck[] | undefined,
  requiredNames: string[]
): VerificationCheck[] {
  const byName = new Map<string, VerificationCheck>();
  for (const check of parsedChecks ?? []) {
    if (!check?.name) continue;
    byName.set(check.name, check);
  }

  const normalized: VerificationCheck[] = [];
  for (const name of requiredNames) {
    const check = byName.get(name);
    if (check) {
      normalized.push(check);
    } else {
      normalized.push({
        name,
        passed: false,
        detail: `Missing verification check from model output: ${name}`
      });
    }
  }
  return normalized;
}

export function summarizeTaskScope(task: TaskUnit): string {
  const editable = task.scope.editable_paths.length > 0
    ? task.scope.editable_paths.join(", ")
    : "(not specified)";
  const forbidden = task.scope.forbidden_paths.length > 0
    ? task.scope.forbidden_paths.join(", ")
    : "(none)";
  return `Editable paths: ${editable}\nForbidden paths: ${forbidden}`;
}
