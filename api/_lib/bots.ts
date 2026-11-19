/**
 * Link-preview bots and crawlers. Their canary visits are shown but never
 * scored. Agents acting for a person (ChatGPT-User, Claude-User and so on)
 * are exactly what Tell tests, so they are never treated as bots.
 */

const AGENTS: [RegExp, string][] = [
  [/ChatGPT-User/i, 'ChatGPT-User'],
  [/Claude-User/i, 'Claude-User'],
  [/Perplexity-User/i, 'Perplexity-User'],
  [/MistralAI-User/i, 'MistralAI-User'],
  [/Google-Agent/i, 'Google-Agent'],
];

const PREVIEW_BOTS: [RegExp, string][] = [
  [/Slackbot|Slack-ImgProxy/i, 'Slackbot'],
  [/facebookexternalhit|Facebot|meta-externalagent/i, 'Facebook'],
  [/TelegramBot/i, 'TelegramBot'],
  [/Twitterbot/i, 'Twitterbot'],
  [/Discordbot/i, 'Discordbot'],
  [/WhatsApp/i, 'WhatsApp'],
  [/LinkedInBot/i, 'LinkedInBot'],
  [/SkypeUriPreview|MicrosoftPreview|Teams/i, 'Teams preview'],
  [/Applebot/i, 'Applebot'],
  [/Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google|AdsBot-Google|Google-PageRenderer|FeedFetcher-Google/i, 'Googlebot'],
  [/bingbot|BingPreview|msnbot/i, 'Bingbot'],
  [/YandexBot|YandexImages/i, 'YandexBot'],
  [/Baiduspider/i, 'Baiduspider'],
  [/DuckDuckBot|DuckAssistBot/i, 'DuckDuckBot'],
  [/redditbot/i, 'redditbot'],
  [/Pinterest/i, 'Pinterest'],
  [/Embedly|Iframely|vkShare|Quora Link Preview|Snapchat|Viber|Line\/|KakaoTalk-scrap|Mastodon|Bluesky|Cardyb|Zoom/i, 'Link preview'],
  [/GPTBot|ClaudeBot|anthropic-ai|PerplexityBot|OAI-SearchBot|CCBot|Bytespider|Amazonbot|Applebot-Extended/i, 'AI crawler'],
  [/AhrefsBot|SemrushBot|MJ12bot|PetalBot|DotBot|BLEXBot|DataForSeoBot/i, 'SEO crawler'],
];

const GENERIC = /\b(bot|crawler|spider|slurp|preview|scraper|unfurl)\b|bot\/|spider\//i;

export interface ClientInfo {
  bot: boolean;
  /** A short label, never the full user agent. */
  client: string;
}

export function identifyClient(ua: string | null | undefined): ClientInfo {
  const s = (ua ?? '').slice(0, 512);
  for (const [re, name] of AGENTS) if (re.test(s)) return { bot: false, client: name };
  for (const [re, name] of PREVIEW_BOTS) if (re.test(s)) return { bot: true, client: name };
  if (GENERIC.test(s)) return { bot: true, client: 'Crawler' };
  if (!s.trim()) return { bot: false, client: 'Unknown client' };
  if (/^curl\//i.test(s)) return { bot: false, client: 'curl' };
  if (/python-requests|aiohttp|httpx/i.test(s)) return { bot: false, client: 'Python' };
  if (/node-fetch|undici|axios|Node\.js/i.test(s)) return { bot: false, client: 'Node' };
  if (/HeadlessChrome/i.test(s)) return { bot: false, client: 'Headless Chrome' };
  if (/Edg\//.test(s)) return { bot: false, client: 'Edge' };
  if (/Firefox\//.test(s)) return { bot: false, client: 'Firefox' };
  if (/Chrome\//.test(s)) return { bot: false, client: 'Chrome' };
  if (/Safari\//.test(s)) return { bot: false, client: 'Safari' };
  return { bot: false, client: 'Other client' };
}

/**
 * Requests that are not a real visit at all: HEAD checks and browser
 * prefetches. These are answered but never recorded.
 */
export function isNonVisit(req: Request): boolean {
  if (req.method === 'HEAD') return true;
  const purpose = `${req.headers.get('sec-purpose') ?? ''} ${req.headers.get('purpose') ?? ''} ${req.headers.get('x-moz') ?? ''}`;
  return /prefetch|prerender/i.test(purpose);
}
