import { describe, it, expect } from "vitest";
import { createRouter } from "../../src/handlers/router";

describe("Router", () => {
  const routes = [
    {
      method: "GET",
      pattern: "/api/sii/auth",
      handler: async () => Response.json({ route: "getAuth" }),
    },
    {
      method: "PUT",
      pattern: "/api/sii/auth",
      handler: async () => Response.json({ route: "putAuth" }),
    },
    {
      method: "GET",
      pattern: "/api/sii/invoices/:id",
      handler: async (_req: Request, ctx: { tenantId: string; params: Record<string, string> }) =>
        Response.json({ route: "getInvoice", id: ctx.params.id }),
    },
  ];

  const router = createRouter(routes);

  it("matches GET route", async () => {
    const req = new Request("http://localhost/api/sii/auth");
    const res = await router(req, "tenant-1");
    const body = await res.json();
    expect(body.route).toBe("getAuth");
  });

  it("matches PUT route on same path", async () => {
    const req = new Request("http://localhost/api/sii/auth", { method: "PUT" });
    const res = await router(req, "tenant-1");
    const body = await res.json();
    expect(body.route).toBe("putAuth");
  });

  it("extracts params from :param patterns", async () => {
    const req = new Request("http://localhost/api/sii/invoices/abc-123");
    const res = await router(req, "tenant-1");
    const body = await res.json();
    expect(body.route).toBe("getInvoice");
    expect(body.id).toBe("abc-123");
  });

  it("returns 404 for unmatched route", async () => {
    const req = new Request("http://localhost/api/sii/nonexistent");
    const res = await router(req, "tenant-1");
    expect(res.status).toBe(404);
  });
});
