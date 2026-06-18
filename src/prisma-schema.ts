import type { SchemaBlock } from "./blocks.js";

export interface PrismaField { name: string; type: string; }
export interface PrismaModel { name: string; fields: PrismaField[]; }
export interface ModelDiff {
  model: string;
  addedFields: PrismaField[];
  removedFields: PrismaField[];
  keptFields: PrismaField[];
}

/** Parse `model X { ... }` blocks into models with (name, type) fields. */
export function parsePrismaModels(schema: string): Map<string, PrismaModel> {
  const models = new Map<string, PrismaModel>();
  const re = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) {
    const name = m[1];
    const fields: PrismaField[] = [];
    for (const raw of m[2].split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 2) fields.push({ name: parts[0], type: parts[1] });
    }
    models.set(name, { name, fields });
  }
  return models;
}

export function diffModels(
  before: Map<string, PrismaModel>,
  after: Map<string, PrismaModel>,
): ModelDiff[] {
  const names = new Set([...before.keys(), ...after.keys()]);
  const diffs: ModelDiff[] = [];
  for (const name of names) {
    const b = before.get(name)?.fields ?? [];
    const a = after.get(name)?.fields ?? [];
    const bNames = new Set(b.map((f) => f.name));
    const aNames = new Set(a.map((f) => f.name));
    const addedFields = a.filter((f) => !bNames.has(f.name));
    const removedFields = b.filter((f) => !aNames.has(f.name));
    const keptFields = a.filter((f) => bNames.has(f.name));
    if (addedFields.length || removedFields.length || !before.has(name) || !after.has(name)) {
      diffs.push({ model: name, addedFields, removedFields, keptFields });
    }
  }
  return diffs;
}

/** Render changed models as a single D2 ERD with +/- change markers in labels. */
export function schemaDiffToBlock(diffs: ModelDiff[], id = "schema-diff"): SchemaBlock {
  const tables = diffs.map((d) => {
    const rows: string[] = [];
    for (const f of d.keptFields) rows.push(`  "${f.name}": "${f.type}"`);
    for (const f of d.addedFields) rows.push(`  "${f.name}": "${f.type}  (+ added)"`);
    for (const f of d.removedFields) rows.push(`  "${f.name} (removed)": "${f.type}"`);
    return `${d.model}: {\n  shape: sql_table\n  class: changed\n${rows.join("\n")}\n}`;
  });
  return {
    type: "schema", id, title: "Schema changes", kind: "erd",
    d2: tables.join("\n\n") || "empty: { shape: sql_table\n  note: no model changes\n}",
  };
}
