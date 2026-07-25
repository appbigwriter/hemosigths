import { jwtVerify } from "jose";

export interface GoTrueClaims {
  sub: string;
  email?: string;
  role?: string;
  [claim: string]: unknown;
}

export interface Session {
  externalAuthId: string;
  email?: string;
  role?: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.GOTRUE_JWT_SECRET;
  if (!secret) {
    throw new Error("GOTRUE_JWT_SECRET nao configurado (necessario p/ GoTrue)");
  }
  return new TextEncoder().encode(secret);
}

export async function verifyToken(token: string): Promise<GoTrueClaims> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  });
  return payload as unknown as GoTrueClaims;
}

export function toSession(claims: GoTrueClaims): Session {
  return {
    externalAuthId: claims.sub,
    email: claims.email,
    role: claims.role,
  };
}

export async function getSessionFromRequest(
  request: Request,
): Promise<Session | null> {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  try {
    return toSession(await verifyToken(token));
  } catch {
    return null;
  }
}
