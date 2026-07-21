import { execFileSync } from "node:child_process";

/** True when a ref resolves to a commit — false on shallow clones missing the parent.
 *  Used to skip history-dependent tests on `git clone --depth 1` / CI checkouts. */
export function hasCommit(ref: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "-q", "--verify", `${ref}^{commit}`], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
