// app/lib/used-tokens.ts
import redis from "./redis";

const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 7;

export async function markTokenUsed(token: string): Promise<void> {
  try {
    await redis.set(`used_token:${token.slice(-40)}`, "1", "EX", TOKEN_EXPIRY_SECONDS);
  } catch (err) {
    console.error("[Token] Failed to mark used:", err);
  }
}

export async function isTokenUsed(token: string): Promise<boolean> {
  try {
    const val = await redis.get(`used_token:${token.slice(-40)}`);
    return val === "1";
  } catch {
    return false;
  }
}