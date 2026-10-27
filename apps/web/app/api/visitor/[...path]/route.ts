import { visitorProxy } from "../../../../server/concierge/visitor-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (request: Request, ctx: Ctx) =>
  visitorProxy(request, (await ctx.params).path ?? []);

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;
