function normalizeImageUrls(markdown: string) {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "![$1](image)");
}

function normalizeWhitespace(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function normalizeFlashcardContent(markdown: string) {
  return normalizeWhitespace(normalizeImageUrls(markdown));
}

export async function createCardFingerprint(front: string, back: string) {
  const payload = `${normalizeFlashcardContent(front)}\n---\n${normalizeFlashcardContent(back)}`;
  const encoded = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
