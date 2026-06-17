import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type Target =
  | { kind: "branch"; ref: string; base?: string }
  | { kind: "commit"; ref: string }
  | { kind: "pr"; number: number }
  | { kind: "working" };

export interface Scope {
  repoRoot: string;
  baseRef: string;
  headRef: string;
  label: string;
  unifiedDiff: string;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

/** Best-effort default base: merge-base with the trunk (main, else master). */
async function defaultBase(headRef: string, cwd: string): Promise<string> {
  for (const trunk of ["main", "master"]) {
    try {
      const mb = (await git(["merge-base", trunk, headRef], cwd)).trim();
      if (mb) return mb;
    } catch { /* trunk missing — try next */ }
  }
  return `${headRef}^`;
}

export async function resolveScope(target: Target, opts: { repoRoot: string }): Promise<Scope> {
  const cwd = opts.repoRoot;
  let baseRef: string, headRef: string, label: string;

  switch (target.kind) {
    case "commit":
      headRef = target.ref; baseRef = `${target.ref}^`; label = `commit ${target.ref}`;
      break;
    case "branch":
      headRef = target.ref;
      baseRef = target.base ?? (await defaultBase(target.ref, cwd));
      label = `branch ${target.ref}`;
      break;
    case "working":
      headRef = ""; baseRef = "HEAD"; label = "working tree";
      break;
    case "pr": {
      try {
        await exec("gh", ["pr", "checkout", String(target.number)], { cwd });
      } catch {
        throw new Error(`PR scope needs the gh CLI: could not check out PR #${target.number}`);
      }
      headRef = "HEAD"; baseRef = await defaultBase("HEAD", cwd); label = `PR #${target.number}`;
      break;
    }
  }

  const diffArgs = target.kind === "working"
    ? ["diff", baseRef]
    : ["diff", `${baseRef}...${headRef}`];
  const unifiedDiff = await git(diffArgs, cwd);
  return { repoRoot: cwd, baseRef, headRef: headRef || "WORKTREE", label, unifiedDiff };
}

/** File contents at a ref, or "" if the path does not exist there. */
export async function fileAtRef(path: string, ref: string, cwd: string): Promise<string> {
  if (ref === "WORKTREE" || ref === "") {
    try { return await (await import("node:fs/promises")).readFile(`${cwd}/${path}`, "utf8"); }
    catch { return ""; }
  }
  try { return await git(["show", `${ref}:${path}`], cwd); }
  catch { return ""; }
}

/** `git diff --numstat` + `--name-status` merged into FileChange-friendly rows. */
export async function changedFiles(baseRef: string, headRef: string, cwd: string) {
  const range = headRef === "WORKTREE" ? [baseRef] : [`${baseRef}...${headRef}`];
  const numstat = await git(["diff", "--numstat", ...range], cwd);
  const nameStatus = await git(["diff", "--name-status", ...range], cwd);

  const status = new Map<string, "A" | "M" | "D" | "R">();
  for (const line of nameStatus.trim().split("\n").filter(Boolean)) {
    const [s, ...rest] = line.split("\t");
    const path = rest[rest.length - 1];
    status.set(path, (s[0] as "A" | "M" | "D" | "R") ?? "M");
  }

  return numstat.trim().split("\n").filter(Boolean).map((line) => {
    const [added, deleted, path] = line.split("\t");
    return {
      path,
      status: status.get(path) ?? "M",
      added: added === "-" ? 0 : Number(added),
      deleted: deleted === "-" ? 0 : Number(deleted),
    };
  });
}
