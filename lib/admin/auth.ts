// Login do painel (somente servidor). Senha em ADMIN_PASSWORD; assinatura do cookie com ADMIN_SECRET.
// Usa Web Crypto para funcionar também no middleware.
export const ADMIN_COOKIE = "im_admin";
const TTL_MS = 8 * 3600 * 1000;

function secret(): string {
  return process.env.ADMIN_SECRET || `${process.env.ADMIN_PASSWORD ?? ""}::invest-moment-admin`;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const adminConfigured = () => (process.env.ADMIN_PASSWORD ?? "").length >= 12;

export async function checkPassword(input: string): Promise<boolean> {
  if (!adminConfigured()) return false;
  // Compara os hashes para não vazar o tamanho da senha pelo tempo de resposta.
  return safeEqual(await hmac(`pw:${input}`), await hmac(`pw:${process.env.ADMIN_PASSWORD}`));
}

export async function createSession(): Promise<string> {
  const exp = Date.now() + TTL_MS;
  return `${exp}.${await hmac(`session:${exp}`)}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token || !adminConfigured()) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !sig) return false;
  return safeEqual(sig, await hmac(`session:${exp}`));
}

export const sessionMaxAge = TTL_MS / 1000;
