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

/** `git diff --numstat -z` + `--name-status -z` merged into FileChange-friendly rows.
 *  The -z (NUL-delimited) form expands renames into explicit old/new path tokens,
 *  so renamed files keep their real new path and an "R" status. */
export async function changedFiles(baseRef: string, headRef: string, cwd: string) {
  const range = headRef === "WORKTREE" ? [baseRef] : [`${baseRef}...${headRef}`];
  const nameStatusZ = await git(["diff", "--name-status", "-z", ...range], cwd);
  const numstatZ = await git(["diff", "--numstat", "-z", ...range], cwd);

  // name-status -z tokens: normal = [STATUS, path]; rename/copy = [Rxxx|Cxxx, old, new].
  const nsTokens = nameStatusZ.split("\0").filter((t) => t.length > 0);
  const statusByPath = new Map<string, "A" | "M" | "D" | "R">();
  const order: string[] = [];
  for (let i = 0; i < nsTokens.length; ) {
    const code = nsTokens[i++];
    const letter = code[0];
    if (letter === "R" || letter === "C") {
      i++; // old path (ignored)
      const newPath = nsTokens[i++];
      statusByPath.set(newPath, "R");
      order.push(newPath);
    } else {
      const path = nsTokens[i++];
      const status = letter === "A" || letter === "M" || letter === "D" ? letter : "M";
      statusByPath.set(path, status);
      order.push(path);
    }
  }

  // numstat -z tokens: normal = "added\tdeleted\tpath"; rename = "added\tdeleted\t" then old, new.
  const numTokens = numstatZ.split("\0").filter((t) => t.length > 0);
  const counts = new Map<string, { added: number; deleted: number }>();
  for (let i = 0; i < numTokens.length; ) {
    const stat = numTokens[i++];
    const [addedS, deletedS, inlinePath] = stat.split("\t");
    const added = addedS === "-" ? 0 : Number(addedS);
    const deleted = deletedS === "-" ? 0 : Number(deletedS);
    let path = inlinePath;
    if (!path) {
      i++; // old path (ignored)
      path = numTokens[i++];
    }
    counts.set(path, { added, deleted });
  }

  return order.map((path) => ({
    path,
    status: statusByPath.get(path) ?? "M",
    added: counts.get(path)?.added ?? 0,
    deleted: counts.get(path)?.deleted ?? 0,
  }));
}
