import type { StackAdapter } from "./stack-adapter.js";
import type { Scope } from "../git.js";

/** Fallback: no schema/api intelligence — file-tree + raw diff only. */
export class GenericAdapter implements StackAdapter {
  name = "generic";
  async detect(): Promise<boolean> { return true; }
  async schemaDiff(_scope: Scope, _onWarn?: (msg: string) => void) { return null; }
  async apiDiff(_scope: Scope, _onWarn?: (msg: string) => void) { return []; }
}
