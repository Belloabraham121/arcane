import { normalizeEmail } from "../../utils/email";
import { createLogger } from "../../shared/logger";
import { hashPassword, verifyPassword } from "../../utils/password";
import { emailWalletService } from "./email-wallet.service";
import { toAuthUserProfile, type AuthUserProfile } from "./user-account.service";
import * as userRepo from "./user.repository";

const log = createLogger("auth");

export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function register(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await userRepo.findUserByEmail(normalizedEmail);
  if (existing) {
    throw new AuthError("EMAIL_ALREADY_EXISTS", "An account with this email already exists", 409);
  }

  const passwordHash = await hashPassword(password);
  const walletRecord = emailWalletService.createWalletRecord(normalizedEmail);
  const created = await userRepo.createUser({
    email: walletRecord.email,
    passwordHash,
    wallet: walletRecord,
  });
  const user = await userRepo.findUserById(created.id);
  if (!user) {
    throw new AuthError("USER_NOT_FOUND", "User not found after registration", 500);
  }

  log.info("User registered", { userId: user.id, email: user.email, walletAddress: user.walletAddress });

  return {
    user: toAuthUserProfile(user),
    wallet: emailWalletService.toPublic(walletRecord),
  };
}

export async function login(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await userRepo.findUserByEmail(normalizedEmail);
  if (!user) {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  log.info("User signed in", { userId: user.id, email: user.email });

  return toAuthUserProfile(user);
}

export async function getCurrentUser(userId: string): Promise<AuthUserProfile> {
  const user = await userRepo.findUserById(userId);
  if (!user) {
    throw new AuthError("USER_NOT_FOUND", "User not found", 404);
  }

  return toAuthUserProfile(user);
}
