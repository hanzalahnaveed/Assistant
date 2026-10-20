function decodePart(data) {
  if (!data) return "";
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function collectBody(payload, output = { plain: [], html: [] }) {
  if (!payload) return output;
  const mimeType = (payload.mimeType || "").toLowerCase();
  const body = decodePart(payload.body?.data);
  if (body && mimeType === "text/plain") output.plain.push(body);
  else if (body && mimeType === "text/html") output.html.push(body);
  for (const part of payload.parts ?? []) collectBody(part, output);
  return output;
}

function cleanHtml(value) {
  return value
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractMessageText(message) {
  const body = collectBody(message.payload);
  return (body.plain.join("\n") || body.html.map(cleanHtml).join("\n") || message.snippet || "")
    .replace(/\u0000/g, "")
    .slice(0, 20000)
    .trim();
}

export function parseSender(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  const candidate = (match?.[1] || value).trim().replace(/^["']|["']$/g, "");
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(candidate) ? candidate.toLowerCase() : null;
}
