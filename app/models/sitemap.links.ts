// Sitemap entries are crawlable web pages; action URLs and fragments are not pages.
export function isCrawlableSitemapUrl(value: string) {
  const url = value.trim();
  if ([...url].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })) return false;

  if (url.startsWith("/")) {
    return !url.startsWith("//") && !url.includes("\\");
  }

  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
