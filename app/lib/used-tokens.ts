import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function markTokenUsed(token: string) {

  await redis.set(`used_token:${token}`, "1", { ex: 60 * 60 * 24 * 7 });
}

export async function isTokenUsed(token: string): Promise<boolean> {
  const val = await redis.get(`used_token:${token}`);
  return val !== null;
}