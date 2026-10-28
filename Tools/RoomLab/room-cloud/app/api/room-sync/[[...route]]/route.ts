import { env } from 'cloudflare:workers';
import { handle } from '../../../../lib/sync-handler.mjs';
export const GET = (request: Request) => handle(request, env);
export const POST = GET;
export const PUT = GET;
