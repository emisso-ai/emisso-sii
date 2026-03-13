/**
 * Simple pattern-matching router for framework-agnostic handlers.
 * Supports `:param` patterns for URL parameters.
 */

export interface HandlerContext {
  tenantId: string;
  params: Record<string, string>;
}

export type HandlerFn = (req: Request, ctx: HandlerContext) => Promise<Response>;

export interface Route {
  method: string;
  pattern: string;
  handler: HandlerFn;
}

interface CompiledRoute {
  method: string;
  regex: RegExp;
  paramNames: string[];
  handler: HandlerFn;
}

function compilePattern(pattern: string): {
  regex: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const regexStr = pattern
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment;
    })
    .join("/");
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

export function createRouter(routes: Route[]) {
  const compiled: CompiledRoute[] = routes.map((r) => {
    const { regex, paramNames } = compilePattern(r.pattern);
    return { method: r.method, regex, paramNames, handler: r.handler };
  });

  return async (req: Request, tenantId: string): Promise<Response> => {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const path = url.pathname;

    for (const route of compiled) {
      if (route.method !== method) continue;
      const match = path.match(route.regex);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1]!;
      });

      return route.handler(req, { tenantId, params });
    }

    return Response.json(
      { error: { _type: "NotFoundError", message: "Route not found" } },
      { status: 404 },
    );
  };
}
