import { publicMutation } from "../../../server/content/public-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => publicMutation(request, "leads");
export const OPTIONS = POST;
