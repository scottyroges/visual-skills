import ts from "typescript";
import type { ApiProcedure } from "./blocks.js";

/**
 * Parse a tRPC router source into procedures. Looks for `router({ ... })` and
 * treats each property as a procedure, walking its call chain to find the
 * procedure builder (public/protected), the .input(...) arg, and query/mutation.
 */
export function parseRouter(source: string, routerName: string): ApiProcedure[] {
  const sf = ts.createSourceFile("router.ts", source, ts.ScriptTarget.Latest, true);
  const procs: ApiProcedure[] = [];

  function findRouterObject(node: ts.Node): ts.ObjectLiteralExpression | undefined {
    let found: ts.ObjectLiteralExpression | undefined;
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) && n.expression.text === "router" &&
        n.arguments.length === 1 && ts.isObjectLiteralExpression(n.arguments[0])
      ) {
        found ??= n.arguments[0] as ts.ObjectLiteralExpression;
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
  }

  const obj = findRouterObject(sf);
  if (!obj) return procs;

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    const procName = prop.name.text;
    let auth: ApiProcedure["auth"] = "unknown";
    let kind: ApiProcedure["kind"] = "unknown";
    let input = "";

    const walk = (expr: ts.Node) => {
      if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
        const method = expr.expression.name.text;
        if (method === "query" || method === "mutation" || method === "subscription") {
          kind = method as ApiProcedure["kind"];
        } else if (method === "input" && expr.arguments[0]) {
          input = expr.arguments[0].getText(sf);
        }
        walk(expr.expression.expression);
      } else if (ts.isPropertyAccessExpression(expr)) {
        walk(expr.expression);
      } else if (ts.isIdentifier(expr)) {
        if (expr.text === "publicProcedure") auth = "public";
        else if (expr.text === "protectedProcedure") auth = "protected";
      }
    };
    walk(prop.initializer);

    procs.push({ name: `${routerName}.${procName}`, auth, kind, input });
  }
  return procs;
}
