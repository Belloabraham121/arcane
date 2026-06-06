import jwt from "jsonwebtoken";
import type { Response } from "express";
import { getAuthEnv } from "../config/env";

export type SessionPayload = {
  sub: string;
  email: string;
};

export function signSession(payload: SessionPayload): string {
  const { jwtSecret, cookieMaxAgeSec } = getAuthEnv();
  return jwt.sign(payload, jwtSecret, { expiresIn: cookieMaxAgeSec });
}

export function verifySession(token: string): SessionPayload {
  const { jwtSecret } = getAuthEnv();
  return jwt.verify(token, jwtSecret) as SessionPayload;
}

export function setSessionCookie(res: Response, token: string): void {
  const { cookieName, cookieMaxAgeSec, corsOrigin, nodeEnv } = getAuthEnv();
  const isProduction = nodeEnv === "production";

  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    maxAge: cookieMaxAgeSec * 1000,
    path: "/",
    ...(isProduction && corsOrigin.startsWith("https://")
      ? { domain: new URL(corsOrigin).hostname }
      : {}),
  });
}

export function clearSessionCookie(res: Response): void {
  const { cookieName } = getAuthEnv();
  res.clearCookie(cookieName, { path: "/" });
}
