import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { getAuthEnv } from "../config/env";
import { createLogger } from "../shared/logger";
import { verifySession } from "../utils/session";
import { setTradingSocketServer } from "./trading-events";

const log = createLogger("socket-server");

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function initTradingSocketServer(httpServer: HttpServer): Server {
  const { corsOrigin } = getAuthEnv();
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: [corsOrigin, "http://localhost:3000", "http://127.0.0.1:3000"],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const { cookieName } = getAuthEnv();
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token = cookies[cookieName];

    if (typeof token !== "string" || token.length === 0) {
      next(new Error("UNAUTHORIZED"));
      return;
    }

    try {
      const payload = verifySession(token);
      socket.data.userId = payload.sub;
      socket.data.email = payload.email;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    const room = `user:${userId}`;
    socket.join(room);

    log.info("Trading socket connected", { userId, socketId: socket.id });

    socket.on("disconnect", (reason) => {
      log.debug("Trading socket disconnected", { userId, reason });
    });
  });

  setTradingSocketServer(io);
  log.info("Trading Socket.IO server ready", { path: "/socket.io" });

  return io;
}
