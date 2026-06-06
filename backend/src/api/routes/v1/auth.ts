import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { AuthError, getCurrentUser, login, register } from "../../../services/auth/auth.service";
import { fail, ok } from "../../../utils/http-response";
import { clearSessionCookie, setSessionCookie, signSession } from "../../../utils/session";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post("/api/v1/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(req, res, 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid registration payload",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await register(parsed.data.email, parsed.data.password);
    const token = signSession({ sub: result.user.id, email: result.user.email });
    setSessionCookie(res, token);
    return ok(req, res, result, 201);
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(req, res, err.status, { code: err.code, message: err.message });
    }
    throw err;
  }
});

authRouter.post("/api/v1/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(req, res, 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid login payload",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const user = await login(parsed.data.email, parsed.data.password);
    const token = signSession({ sub: user.id, email: user.email });
    setSessionCookie(res, token);
    return ok(req, res, { user });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(req, res, err.status, { code: err.code, message: err.message });
    }
    throw err;
  }
});

authRouter.post("/api/v1/auth/logout", (req, res) => {
  clearSessionCookie(res);
  return ok(req, res, { loggedOut: true });
});

authRouter.get("/api/v1/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await getCurrentUser(req.user.id);
    return ok(req, res, { user });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(req, res, err.status, { code: err.code, message: err.message });
    }
    throw err;
  }
});
