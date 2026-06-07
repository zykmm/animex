// Resolver backend para Animex — Deno Deploy (gratis, sin tarjeta, sin cold-spindown).
//
// Endpoints:
//   GET /api/health                 → { ok: true }
//   GET /api/extract?url=<embed>    → { url: "<directa>" } | 404 { error }
//   GET /api/servers/{episodeId}    → { servers: [{name,url,quality}] }   (bonus)
//
// La app Kotlin llama a /api/extract ANTES de su resolución on-device. Si este
// servidor cae o no resuelve, la app cae a sus extractores nativos + WebView:
// nunca dependes 100% del backend (degradación elegante).

import { resolveEmbed } from "./extractors.ts";
import { getVideoServers } from "./animeflv.ts";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // CORS abierto: la app Android no lo necesita, pero permite probar desde el navegador.
  "access-control-allow-origin": "*",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function handler(req: Request): Promise<Response> {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/api/health" || pathname === "/") {
    return json({ ok: true, service: "animex-resolver", ts: Date.now() });
  }

  if (pathname === "/api/extract") {
    const url = searchParams.get("url");
    if (!url) return json({ error: "missing 'url' param" }, 400);
    try {
      const direct = await resolveEmbed(url);
      if (!direct) return json({ error: "could not resolve", url }, 404);
      return json({ url: direct });
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  }

  const serversMatch = pathname.match(/^\/api\/servers\/(.+)$/);
  if (serversMatch) {
    const episodeId = decodeURIComponent(serversMatch[1]);
    try {
      const servers = await getVideoServers(episodeId);
      return json({ servers });
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  }

  return json({ error: "not found" }, 404);
}

// Deno.serve es la API estable de servidor HTTP de Deno (y de Deno Deploy).
Deno.serve(handler);
