# Animex Resolver — backend gratis (Deno Deploy)

Mini-API que resuelve los enlaces de los hosts (Streamtape, Mp4Upload, Filemoon,
YourUpload, Streamwish, Doodstream, Ok.ru, SendVid) **en el servidor**. Es el port
fiel de tus extractores de `app/src/main/java/com/example/data/extractor/`.

**Por qué importa:** cuando un host cambie su ofuscación, editas estos `.ts` y
rediliegas en 5 min — **sin actualizar el APK ni pasar por Play Store**. Esa es la
fiabilidad "tipo ANIME CENTER", en tier 100% gratuito.

La app sigue funcionando aunque este servidor esté caído: cae a su resolución
on-device (nativa + WebView). Nunca dependes 100% del backend.

---

## Endpoints

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/extract?url=<embed>` | `{ url: "<directa>" }` o 404 |
| GET | `/api/servers/{episodeId}` | `{ servers: [...] }` (bonus) |

---

## Despliegue GRATIS en Deno Deploy (sin tarjeta)

> Deno Deploy: gratis, global, **sin cold-start/spindown** (a diferencia de Render).

### Opción A — desde GitHub (recomendada, se puede hacer desde el móvil)

1. Crea un repo en GitHub y sube **solo la carpeta `server/`** (o el repo entero).
2. Entra a <https://dash.deno.com> → inicia sesión con GitHub (gratis, sin tarjeta).
3. **New Project** → **Deploy from GitHub** → elige tu repo.
4. **Entrypoint**: `server/main.ts` (o `main.ts` si subiste solo la carpeta).
5. Deploy. Te da una URL tipo `https://tu-proyecto.deno.dev`.
6. Pruébala: abre `https://tu-proyecto.deno.dev/api/health` → debe responder `{ "ok": true }`.

### Opción B — desde tu PC con deployctl

```bash
deno install -gArf jsr:@deno/deployctl
cd server
deployctl deploy --project=animex-resolver main.ts
```

### Probar en local antes de desplegar

```bash
cd server
deno task dev            # arranca en http://localhost:8000
# en otra terminal:
curl "http://localhost:8000/api/extract?url=https://streamtape.com/e/XXXX"
```

---

## Conectar la app

1. Copia tu URL de Deno Deploy (ej. `https://animex-resolver.deno.dev`).
2. En `app/build.gradle.kts`, dentro de `defaultConfig`, pon esa URL en:
   ```kotlin
   buildConfigField("String", "RESOLVER_BASE_URL", "\"https://animex-resolver.deno.dev\"")
   ```
   (Por defecto está vacío `""` → la app usa solo resolución on-device.)
3. Recompila el APK. Listo: la app pedirá primero al backend y, si falla, usa lo de siempre.

---

## Notas

- **Streamwish y clones (render-JS)** no se resuelven por HTTP puro (ni aquí ni en tu
  extractor nativo): para esos, la app sigue usando su **WebView sniffer** on-device.
  El backend cubre los hosts HTTP, que son los que más se rompen al cambiar ofuscación.
- **Cloudflare**: si AnimeFLV pone challenge a la IP del datacenter, `/api/servers`
  puede devolver `[]`. No afecta a `/api/extract` (los hosts de vídeo no suelen tener CF).
  El listado de episodios/servidores sigue resolviéndose on-device con tu
  `WebViewHtmlResolver`.
- Sin estado, sin base de datos, sin secretos. Nada que pagar.
