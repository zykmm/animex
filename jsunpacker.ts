// Port fiel de JsUnpacker.kt — des-ofuscador del p,a,c,k,e,d de Dean Edwards.
// Muchos CDNs (Filemoon, Streamwish, Doodstream…) sirven el <script> empaquetado así.
// Self-contained, sin V8/Rhino. Licencia del algoritmo: Apache 2.0 (aniyomi/Tachiyomi).

const PACKED_REGEX =
  /eval\(function\(p,a,c,k,e,[rd]\)\{.*?\}\((['"])(.+?)\1,(\d+),(\d+),(['"])(.+?)\5\.split\(['"]\|['"]\)/gs;

const IDENTIFIER = /\b\w+\b/g;

/** Decodifica un token en base [radix]: 0-9, luego a-z, luego A-Z. -1 si fuera de rango. */
function decodeBase(token: string, radix: number): number {
  let result = 0;
  for (const ch of token) {
    const code = ch.charCodeAt(0);
    let digit: number;
    if (code >= 48 && code <= 57) digit = code - 48; // 0-9
    else if (code >= 97 && code <= 122) digit = 10 + (code - 97); // a-z
    else if (code >= 65 && code <= 90) digit = 36 + (code - 65); // A-Z
    else return -1;
    if (digit >= radix) return -1;
    result = result * radix + digit;
  }
  return result;
}

function unpackOne(payload: string, radix: number, count: number, tokens: string[]): string {
  const script = payload
    .replace(/\\\\/g, "\\")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"');

  return script.replace(IDENTIFIER, (raw) => {
    const idx = decodeBase(raw, radix);
    if (idx >= 0 && idx < count && idx < tokens.length) {
      const token = tokens[idx];
      return token.length > 0 ? token : raw;
    }
    return raw;
  });
}

/**
 * Devuelve el JS original si [source] contiene uno o varios bloques empaquetados;
 * si no, devuelve [source] tal cual (idempotente).
 */
export function unpack(source: string): string {
  if (!source.includes("eval(function(p,a,c,k,e,")) return source;

  let out = "";
  let last = 0;
  PACKED_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PACKED_REGEX.exec(source)) !== null) {
    out += source.slice(last, match.index);
    const payload = match[2];
    const radix = parseInt(match[3], 10);
    const count = parseInt(match[4], 10);
    const tokens = match[6].split("|");
    out += unpackOne(payload, radix, count, tokens);
    last = match.index + match[0].length;
  }
  out += source.slice(last);
  return out;
}
