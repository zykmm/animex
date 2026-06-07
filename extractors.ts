// Port fiel de Extractors.kt + ServerExtractor.kt (registry) a TypeScript/Deno.
// Misma lógica, mismos User-Agent/Referer por host, mismas regex. Cuando un host
// cambie su ofuscación, editas ESTE archivo y rediliegas — sin tocar el APK.

import { unpack } from "./jsunpacker.ts";

const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** GET sencillo con headers comunes; devuelve el body o null ante cualquier error. */
async function fetchHtml(
  url: string,
  opts: { referer?: string; ua?: string } = {},
): Promise<string | null> {
  const headers: Record<string, string> = { "User-Agent": opts.ua ?? UA_DESKTOP };
  if (opts.referer) headers["Referer"] = opts.referer;
  try {
    const r = await fetch(url, { headers, redirect: "follow" });
    if (!r.ok) return null;
    return await r.text();
  } catch (_e) {
    return null;
  }
}

export interface Extractor {
  name: string;
  extract(url: string): Promise<string | null>;
}

// ════════════════════════════════════════════════════════════════════════════
//  Streamtape (con rechazo de señuelos)
// ════════════════════════════════════════════════════════════════════════════

const ST_ASSIGN =
  /\.innerHTML\s*=\s*(["'])(.*?)\1\s*\+\s*(?:''\s*\+\s*)?\(\s*(["'])(.*?)\3\s*\)((?:\s*\.substring\(\d+\))+)/gs;
const ST_SUB_NUM = /\.substring\((\d+)\)/g;
const ST_VALID =
  /(?:\/\/|https?:\/\/)?(?:www\.)?streamtape\.com\/get_video\?id=[A-Za-z0-9=&_.%-]+/;

/** true si la URL get_video es la real (302 → CDN), no el señuelo (200 text/html). */
async function streamtapePlayable(videoUrl: string): Promise<boolean> {
  try {
    const r = await fetch(videoUrl, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": UA_DESKTOP, "Referer": "https://streamtape.com/" },
    });
    const ct = r.headers.get("content-type") ?? "";
    const isRedirect = r.status >= 300 && r.status < 400;
    return isRedirect || (r.ok && !ct.toLowerCase().includes("text/html"));
  } catch (_e) {
    return false;
  }
}

const streamtape: Extractor = {
  name: "streamtape",
  async extract(url) {
    const normalized = url.replace(/stape\.fun/g, "streamtape.com").replace(/\/v\//g, "/e/");
    const html = await fetchHtml(normalized, { referer: "https://streamtape.com/" });
    if (!html) return null;

    const candidates = new Set<string>();
    ST_ASSIGN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ST_ASSIGN.exec(html)) !== null) {
      const prefix = m[2];
      let inner = m[4];
      ST_SUB_NUM.lastIndex = 0;
      let s: RegExpExecArray | null;
      while ((s = ST_SUB_NUM.exec(m[5])) !== null) {
        const n = parseInt(s[1], 10) || 0;
        if (n >= 0 && n <= inner.length) inner = inner.slice(n);
      }
      const hit = (prefix + inner).match(ST_VALID)?.[0];
      if (!hit) continue;
      candidates.add(
        hit.startsWith("http") ? hit : hit.startsWith("//") ? "https:" + hit : "https://" + hit,
      );
    }

    const list = [...candidates];
    if (list.length === 0) return null;
    if (list.length === 1) return list[0];
    for (const c of list) if (await streamtapePlayable(c)) return c;
    return null;
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  Mp4Upload
// ════════════════════════════════════════════════════════════════════════════

const mp4upload: Extractor = {
  name: "mp4upload",
  async extract(url) {
    const embed = url.includes("/embed-")
      ? url
      : (url.match(/mp4upload\.com\/([\w-]+)/)?.[1]
        ? `https://www.mp4upload.com/embed-${url.match(/mp4upload\.com\/([\w-]+)/)![1]}.html`
        : url);
    const html = await fetchHtml(embed, { referer: "https://www.mp4upload.com/" });
    if (!html) return null;
    const unpacked = unpack(html);
    return (
      unpacked.match(/player\.src\(["']([^"']+)["']\)/)?.[1] ??
      unpacked.match(/"file"\s*:\s*"([^"]+\.mp4[^"]*)"/)?.[1] ??
      unpacked.match(/<source\s+src=["']([^"']+)["']\s+type=["']video\/mp4/)?.[1] ??
      null
    );
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  Filemoon
// ════════════════════════════════════════════════════════════════════════════

const filemoon: Extractor = {
  name: "filemoon",
  async extract(url) {
    const host = safeHost(url);
    if (!host) return null;
    const html = await fetchHtml(url, { referer: `https://${host}/` });
    if (!html) return null;
    const unpacked = unpack(html);
    return (
      unpacked.match(/"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/)?.[1] ??
      unpacked.match(/sources\s*:\s*\[\s*\{[^}]*"file"\s*:\s*"([^"]+)"/)?.[1] ??
      unpacked.match(/src\s*:\s*"([^"]+\.m3u8[^"]*)"/)?.[1] ??
      null
    );
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  YourUpload
// ════════════════════════════════════════════════════════════════════════════

const yourupload: Extractor = {
  name: "yourupload",
  async extract(url) {
    const html = await fetchHtml(url, { referer: "https://www.yourupload.com/" });
    if (!html) return null;
    const file = html.match(/file\s*:\s*['"]([^'"]+)['"]/)?.[1];
    if (!file) return null;
    if (file.startsWith("//")) return "https:" + file;
    if (file.startsWith("/")) return "https://www.yourupload.com" + file;
    if (file.startsWith("http")) return file;
    return null;
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  Streamwish (alias SW, wishfast, vidwish…)
// ════════════════════════════════════════════════════════════════════════════

const streamwish: Extractor = {
  name: "streamwish",
  async extract(url) {
    const candidates = [...new Set([url, url.replace(/\/v\//g, "/e/")])];
    for (const candidate of candidates) {
      const host = safeHost(candidate);
      if (!host) continue;
      const html = await fetchHtml(candidate, { referer: `https://${host}/` });
      if (!html) continue;
      const unpacked = unpack(html);
      const m3u8 =
        unpacked.match(/"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/)?.[1] ??
        unpacked.match(/sources\s*:\s*\[\s*\{[^}]*"file"\s*:\s*"([^"]+)"/)?.[1];
      if (m3u8) return m3u8;
    }
    return null;
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  Doodstream
// ════════════════════════════════════════════════════════════════════════════

const DOOD_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const doodstream: Extractor = {
  name: "dood",
  async extract(url) {
    const host = safeHost(url);
    if (!host) return null;
    const referer = `https://${host}/`;
    const html = await fetchHtml(url, { referer });
    if (!html) return null;

    const md5Path = html.match(/\/pass_md5\/([^'"\s]+)/)?.[1];
    const token = html.match(/\?token=([^&'"]+)/)?.[1];
    if (!md5Path || !token) return null;

    const passUrl = `https://${host}/pass_md5/${md5Path}`;
    let base: string | null = null;
    try {
      const r = await fetch(passUrl, { headers: { "User-Agent": UA_DESKTOP, "Referer": referer } });
      if (!r.ok) return null;
      base = (await r.text()).trim();
    } catch (_e) {
      return null;
    }
    if (!base) return null;

    const randomStr = Array.from({ length: 10 }, () =>
      DOOD_CHARS[Math.floor(Math.random() * DOOD_CHARS.length)]
    ).join("");
    return `${base}${randomStr}?token=${token}&expiry=${Date.now()}`;
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  Okru (Odnoklassniki)
// ════════════════════════════════════════════════════════════════════════════

const OKRU_QUALITY: Record<string, number> = {
  ultra: 7, quad: 6, full: 5, hd: 4, sd: 3, low: 2, lowest: 1, mobile: 0,
};

const okru: Extractor = {
  name: "okru",
  async extract(url) {
    const embed = url.includes("videoembed")
      ? url
      : url.replace("ok.ru/video/", "ok.ru/videoembed/");
    const html = await fetchHtml(embed, { referer: "https://ok.ru/" });
    if (!html) return null;

    const dataOptions = html.match(/data-options="([^"]+)"/)?.[1]?.replace(/&quot;/g, '"');
    if (!dataOptions) return null;
    try {
      const json = JSON.parse(dataOptions);
      const metadataStr: string = json?.flashvars?.metadata ?? "";
      if (!metadataStr) return null;
      const metadata = JSON.parse(metadataStr);

      const hls: string = metadata.hlsManifestUrl || metadata.hlsMasterPlaylistUrl || "";
      if (hls) return hls;

      const videos: Array<{ name?: string; url?: string }> = metadata.videos ?? [];
      let bestUrl: string | null = null;
      let bestRank = -1;
      for (const v of videos) {
        const link = (v.url ?? "").trim();
        if (!link) continue;
        const rank = OKRU_QUALITY[(v.name ?? "").toLowerCase()] ?? -1;
        if (rank > bestRank) {
          bestRank = rank;
          bestUrl = link;
        }
      }
      return bestUrl;
    } catch (_e) {
      return null;
    }
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  SendVid
// ════════════════════════════════════════════════════════════════════════════

const sendvid: Extractor = {
  name: "sendvid",
  async extract(url) {
    const html = await fetchHtml(url, { referer: "https://sendvid.com/" });
    if (!html) return null;
    return (
      html.match(/<source\s+src=["']([^"']+\.mp4[^"']*)/)?.[1] ??
      html.match(/video_source\s*=\s*["']([^"']+)["']/)?.[1] ??
      null
    );
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  Registry
// ════════════════════════════════════════════════════════════════════════════

const EXTRACTORS: Extractor[] = [
  streamtape, mp4upload, filemoon, yourupload, streamwish, doodstream, okru, sendvid,
];

const ALIASES: Record<string, string> = {
  streamtape: "streamtape", stape: "streamtape", "stp.to": "streamtape",
  filemoon: "filemoon", moonplayer: "filemoon",
  streamwish: "streamwish", wishfast: "streamwish", swhoi: "streamwish",
  embedwish: "streamwish", playerwish: "streamwish", vidwish: "streamwish",
  dood: "dood", ds2play: "dood", doodstream: "dood", ds2video: "dood",
  "ok.ru": "okru", okru: "okru", odnoklassniki: "okru",
  mp4upload: "mp4upload",
  yourupload: "yourupload", yupload: "yourupload",
  sendvid: "sendvid",
};

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch (_e) {
    return null;
  }
}

/** Resuelve un embed → URL directa (.mp4/.m3u8) o null. Mismo contrato que ExtractorRegistry.kt. */
export async function resolveEmbed(url: string): Promise<string | null> {
  const lower = url.toLowerCase();

  // Fast path: ya es directa.
  if (lower.includes(".mp4") || lower.includes(".m3u8") || lower.includes(".mkv")) return url;

  const canonical = Object.entries(ALIASES).find(([alias]) => lower.includes(alias))?.[1];
  const extractor =
    (canonical && EXTRACTORS.find((e) => e.name === canonical)) ||
    EXTRACTORS.find((e) => lower.includes(e.name));
  if (!extractor) return null;

  try {
    return await extractor.extract(url);
  } catch (_e) {
    return null;
  }
}
