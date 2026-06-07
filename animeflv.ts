// Port del parseo de servidores de AnimeFlvScraper.getVideoServers() (Kotlin).
// Bonus: permite mover también el listado de servidores al servidor. El cliente,
// por ahora, solo consume /api/extract; este endpoint queda listo para el futuro.

const BASE_URL = "https://www3.animeflv.net";
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export interface VideoServer {
  name: string;
  url: string;
  quality: string | null;
}

function qualityOf(url: string): string | null {
  if (url.includes("1080")) return "1080p";
  if (url.includes("720")) return "720p";
  if (url.includes("480")) return "480p";
  if (url.includes("360")) return "360p";
  if (/\.m3u8$/i.test(url)) return "Adaptable";
  if (/\.mp4$/i.test(url)) return "MP4";
  return null;
}

function parseVideoServers(jsonStr: string): VideoServer[] {
  const servers: VideoServer[] = [];
  const entry =
    /\{\s*"server"\s*:\s*"([^"]*)"[^}]*?"title"\s*:\s*"([^"]*)"[^}]*?(?:"url"\s*:\s*"([^"]*)")?[^}]*?(?:"code"\s*:\s*"([^"]*)")?[^}]*?\}/gs;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(jsonStr)) !== null) {
    const serverCode = m[1];
    const serverTitle = m[2] || serverCode;
    const directUrl = m[3] || "";
    const embedCode = m[4] || "";

    let videoUrl: string | null = null;
    if (directUrl) {
      videoUrl = directUrl.startsWith("//") ? "https:" + directUrl : directUrl;
    } else if (embedCode) {
      const fromCode = embedCode.match(/(?:src|href)=(?:\\?["'])([^"'\\]+)/)?.[1];
      videoUrl = fromCode ? (fromCode.startsWith("//") ? "https:" + fromCode : fromCode) : embedCode;
    }
    if (!videoUrl) continue;
    servers.push({ name: serverTitle, url: videoUrl, quality: qualityOf(videoUrl) });
  }

  if (servers.length === 0) {
    const alt = /"title"\s*:\s*"([^"]+)"[^}]*?"(?:url|code)"\s*:\s*"([^"]+)"/gs;
    let a: RegExpExecArray | null;
    while ((a = alt.exec(jsonStr)) !== null) {
      let url = a[2].replace(/\\\//g, "/");
      if (url.startsWith("//")) url = "https:" + url;
      servers.push({ name: a[1], url, quality: null });
    }
  }
  return servers;
}

/** Obtiene los servidores de un episodio de AnimeFLV. Devuelve [] ante Cloudflare/errores. */
export async function getVideoServers(episodeId: string): Promise<VideoServer[]> {
  const url = `${BASE_URL}/ver/${episodeId}`;
  let html: string;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA_DESKTOP,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": BASE_URL,
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
    if (!r.ok) return [];
    html = await r.text();
  } catch (_e) {
    return [];
  }

  const videosMatch = html.match(/var\s+videos\s*=\s*(\{.*?\});/s);
  const servers: VideoServer[] = videosMatch ? parseVideoServers(videosMatch[1]) : [];

  // Enlaces directos sueltos a .mp4/.m3u8.
  const directRe = /["'](https?:\/\/[^"']+\.(mp4|m3u8)[^"']*?)["']/gi;
  let d: RegExpExecArray | null;
  while ((d = directRe.exec(html)) !== null) {
    const videoUrl = d[1];
    if (!servers.some((s) => s.url === videoUrl)) {
      const ext = d[2].toUpperCase();
      servers.push({
        name: `Directo (${ext})`,
        url: videoUrl,
        quality: ext === "M3U8" ? "Adaptable" : null,
      });
    }
  }
  return servers;
}
