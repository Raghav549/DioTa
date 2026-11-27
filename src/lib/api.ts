import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { csrfOk } from "@/lib/csrf";
import { clientIp, rateLimit } from "@/lib/security";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

type Opts = { rate?: { name: string; max: number; windowSec: number } };
type Ctx<P> = { params: Promise<P> };

const NO_STORE = { "Cache-Control": "no-store" };

async function run<P>(
  req: NextRequest,
  ctx: Ctx<P> | undefined,
  opts: Opts,
  needAuth: boolean,
  fn: (c: { req: NextRequest; user: SessionUser; params: P }) => Promise<unknown>,
) {
  try {
    if (!["GET", "HEAD"].includes(req.method) && !csrfOk(req)) throw new ApiError("forbidden", 403);
    if (opts.rate) {
      const ok = await rateLimit(`${opts.rate.name}:${await clientIp()}`, opts.rate.max, opts.rate.windowSec);
      if (!ok) throw new ApiError("rate", 429);
    }
    const user = await getCurrentUser();
    if (needAuth && !user) throw new ApiError("unauthorized", 401);
    const params = (ctx ? await ctx.params : {}) as P;
    const out = await fn({ req, user: user as SessionUser, params });
    if (out instanceof Response) return out;
    return NextResponse.json(out ?? { ok: true }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.code }, { status: e.status, headers: NO_STORE });
    if (e instanceof ZodError) return NextResponse.json({ error: "invalid_input" }, { status: 400, headers: NO_STORE });
    console.error("api error", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "generic" }, { status: 500, headers: NO_STORE });
  }
}

export function authRoute<P = Record<string, string>>(
  fn: (c: { req: NextRequest; user: SessionUser; params: P }) => Promise<unknown>,
  opts: Opts = {},
) {
  return (req: NextRequest, ctx: Ctx<P>) => run(req, ctx, opts, true, fn);
}

export function publicRoute<P = Record<string, string>>(
  fn: (c: { req: NextRequest; user: SessionUser | null; params: P }) => Promise<unknown>,
  opts: Opts = {},
) {
  return (req: NextRequest, ctx: Ctx<P>) =>
    run(req, ctx, opts, false, fn as Parameters<typeof run<P>>[4]);
}

export async function readBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const text = await req.text();
  if (text.length > 100_000) throw new ApiError("invalid_input", 413);
  let json: unknown;
  try {
    json = JSON.parse(text || "{}");
  } catch {
    throw new ApiError("invalid_input");
  }
  return schema.parse(json);
}
