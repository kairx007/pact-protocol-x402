import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";

export interface AuthContext {
  userId: string;
  organizationId?: string;
  role: "owner" | "admin" | "agent";
}

function verifyToken(token: string): AuthContext | undefined {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return undefined;
  const expected = createHmac("sha256", config.AUTH_HMAC_SECRET)
    .update(encoded)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  )
    return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as AuthContext & { exp: number };
    if (
      !payload.userId ||
      !payload.role ||
      payload.exp <= Math.floor(Date.now() / 1000)
    )
      return undefined;
    return payload;
  } catch {
    return undefined;
  }
}

export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const context = verifyToken(token);
  if (!context) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
      error: { code: "UNAUTHENTICATED", details: {} },
      meta: { requestId: requestId(req) },
    });
    return;
  }
  res.locals.auth = context;
  next();
}

export function requireOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = res.locals.auth as AuthContext | undefined;
  if (auth?.role !== "owner" && auth?.role !== "admin") {
    res.status(403).json({
      success: false,
      message: "Organization owner authorization required",
      error: { code: "FORBIDDEN", details: {} },
      meta: { requestId: requestId(req) },
    });
    return;
  }
  next();
}

export function requireOrganizationAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestedOrg =
    req.params.orgId ?? req.params.organizationId ?? req.body.organizationId;
  if (req.method === "POST" && req.path === "/v1/organizations") {
    next();
    return;
  }
  const auth = res.locals.auth as AuthContext | undefined;
  if (requestedOrg && auth?.organizationId !== requestedOrg) {
    res.status(403).json({
      success: false,
      message: "Organization access denied",
      error: { code: "FORBIDDEN", details: {} },
      meta: { requestId: requestId(req) },
    });
    return;
  }
  next();
}

export function requestId(req: Request): string {
  return req.header("x-request-id")?.slice(0, 128) ?? "unknown";
}

export function authContext(res: Response): AuthContext {
  const context = res.locals.auth as AuthContext | undefined;
  if (!context) throw new Error("Authentication middleware was not applied");
  return context;
}
