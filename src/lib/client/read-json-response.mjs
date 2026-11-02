export async function readJsonResponse(response, label = "Request") {
  let body;
  try { body = await response.text(); }
  catch { throw new Error(label + " response could not be read (HTTP " + response.status + ")."); }
  if (!body.trim()) {
    throw new Error(label + " returned an empty response (HTTP " + response.status + "). " +
      "Check the Next.js server terminal for the underlying API error.");
  }
  let data;
  try { data = JSON.parse(body); }
  catch {
    const contentType = response.headers.get("content-type") || "unknown content type";
    throw new Error(label + " returned a non-JSON response (HTTP " + response.status + "; " + contentType + "). " +
      "Check the Next.js server terminal for the underlying API error.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(label + " returned an unexpected JSON payload (HTTP " + response.status + ").");
  }
  return data;
}
