const idPattern = /^[\w-]{11}$/;
const pathPattern = /^\/(?:shorts|embed|live)\/([\w-]{11})/;

export function youtubeId(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com") {
    id = url.pathname === "/watch" ? url.searchParams.get("v") : (url.pathname.match(pathPattern)?.[1] ?? null);
  }
  return id && idPattern.test(id) ? id : null;
}

export function youtubeEmbed(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}
