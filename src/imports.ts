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
