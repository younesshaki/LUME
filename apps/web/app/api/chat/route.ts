import { conciergeChat } from "../../../server/concierge/chat-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => conciergeChat(request);
export const OPTIONS = POST;
