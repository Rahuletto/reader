const UA_PRESETS: Record<string, string> = {
  chrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:133.0) Gecko/20100101 Firefox/133.0",
  googlebot:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Safari/537.36",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
};

function resolveUa(ua: string | undefined): string {
  if (!ua) return UA_PRESETS["chrome"]!;
  const preset = UA_PRESETS[ua.toLowerCase()];
  return preset ?? ua;
}

function browserHeaders(ua: string): Record<string, string> {
  const isBot = /bot|crawler|spider/i.test(ua);
  if (isBot) {
    return {
      "User-Agent": ua,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    };
  }
  return {
    "User-Agent": ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
}

export interface FetchOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  ua?: string;
  timeout?: number;
  cache?: "default" | "bypass" | "force";
  env?: CloudflareBindings;
}

export interface FetchResult {
  html: string;
  finalUrl: string;
  status: number;
  contentType: string;
  headers: Headers;
  redirects: string[];
}

export async function fetchPage(opts: FetchOptions): Promise<FetchResult> {
  const ua = resolveUa(opts.ua);
  const method = (opts.method ?? "GET").toUpperCase();
  const timeoutMs = opts.timeout ?? 15_000;

  const baseHeaders = new Headers(browserHeaders(ua));
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) baseHeaders.set(k, v);
  }

  const cf: RequestInitCfProperties | undefined =
    opts.cache === "bypass"
      ? { cacheTtl: 0, cacheEverything: false }
      : opts.cache === "force"
        ? { cacheEverything: true, cacheTtl: 300 }
        : undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const redirects: string[] = [];
  const maxHops = 10;

  const fetchHop = async (url: string, hop: number): Promise<{ res: Response; url: string }> => {
    const init: RequestInit<RequestInitCfProperties> = {
      method,
      headers: baseHeaders,
      redirect: "manual",
      signal: controller.signal,
    };
    if (method !== "GET" && method !== "HEAD" && opts.body !== undefined && hop === 0) {
      init.body = opts.body;
    }
    if (cf) init.cf = cf;

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      const e = err as Error;
      if (e.name === "AbortError") {
        throw new ReaderFetchError(`Upstream fetch timed out after ${timeoutMs}ms`, 504);
      }
      throw new ReaderFetchError(`Upstream fetch failed: ${e.message}`, 502);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (loc && hop < maxHops) {
        redirects.push(url);
        return fetchHop(new URL(loc, url).toString(), hop + 1);
      }
    }
    return { res, url };
  };

  let lastRes: Response;
  let currentUrl: string;
  try {
    const hopResult = await fetchHop(opts.url, 0);
    lastRes = hopResult.res;
    currentUrl = hopResult.url;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }

  clearTimeout(timer);

  if (redirects.length >= maxHops) {
    throw new ReaderFetchError("Too many redirects", 502);
  }

  const contentType = lastRes.headers.get("content-type") ?? "";
  const html = await lastRes.text();

  return {
    html,
    finalUrl: currentUrl,
    status: lastRes.status,
    contentType,
    headers: lastRes.headers,
    redirects,
  };
}

export class ReaderFetchError extends Error {
  override readonly name = "ReaderFetchError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
