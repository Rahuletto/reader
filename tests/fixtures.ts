export const FIXTURE_URL = {
  stable: "https://www.iana.org/help/example-domains",
  features: "https://en.wikipedia.org/wiki/Cloudflare",
  robotsOrigin: "https://www.iana.org",
  sitemapOrigin: "https://developers.cloudflare.com",
} as const;

export const BASE_URL = (process.env.READER_BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");

export function apiUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

const MAX_ATTEMPTS = 3;

async function fetchAttempt(
  url: string,
  init: RequestInit,
  attempt: number,
  lastRes: Response | null,
): Promise<Response> {
  if (attempt > MAX_ATTEMPTS) {
    return lastRes ?? fetch(url, init);
  }
  try {
    const res = await fetch(url, init);
    if (res.ok || res.status < 500) return res;
    if (attempt === MAX_ATTEMPTS) return res;
    await new Promise((r) => setTimeout(r, 500 * attempt));
    return fetchAttempt(url, init, attempt + 1, res);
  } catch {
    if (attempt === MAX_ATTEMPTS) return lastRes ?? fetch(url, init);
    await new Promise((r) => setTimeout(r, 500 * attempt));
    return fetchAttempt(url, init, attempt + 1, lastRes);
  }
}

export async function apiFetch(
  path: string,
  init?: RequestInit & { params?: Record<string, string | number | boolean | undefined> },
): Promise<Response> {
  const { params, ...rest } = init ?? {};
  const url = apiUrl(path, params);
  return fetchAttempt(
    url,
    { ...rest, signal: rest.signal ?? AbortSignal.timeout(60_000) },
    1,
    null,
  );
}
