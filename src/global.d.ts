declare module "cloudflare:browser" {
  const puppeteer: unknown;
  export default puppeteer;
}

declare module "puppeteer" {
  const puppeteer: unknown;
  export const launch: unknown;
  export default puppeteer;
}

declare module "turndown-plugin-gfm";
