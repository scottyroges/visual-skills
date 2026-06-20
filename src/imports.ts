import ts from "typescript";

/** Extract module specifiers from import/export-from/dynamic-import in TS/JS source. */
export function importsOf(source: string): string[] {
  const sf = ts.createSourceFile("f.ts", source, ts.ScriptTarget.Latest, true);
  const specs: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      specs.push(n.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(n) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      specs.push(n.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments.length > 0 &&
      ts.isStringLiteral(n.arguments[0])
    ) {
      specs.push((n.arguments[0] as ts.StringLiteral).text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...new Set(specs)];
}

/** Extract exported binding names from TS/JS source: named decls, `export { ... }`,
 *  re-exports (`export { x } from`), and `export default` (as "default"). Dedups. */
export function exportsOf(source: string): string[] {
  const sf = ts.createSourceFile("f.ts", source, ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) {
      const mods = ts.getModifiers(n) ?? [];
      const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (exported) names.push(isDefault ? "default" : n.name?.text ?? "default");
    } else if (ts.isVariableStatement(n)) {
      const exported = (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (exported)
        for (const d of n.declarationList.declarations)
          if (ts.isIdentifier(d.name)) names.push(d.name.text);
    } else if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) {
      for (const el of n.exportClause.elements) names.push(el.name.text);
    } else if (ts.isExportAssignment(n)) {
      names.push("default");
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...new Set(names)];
}
