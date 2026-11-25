const ownHosts = /^(?:https?|wss?):\/\/(?:tauri\.localhost|localhost:6767)\//i;

const rules: [RegExp, string | ((match: string) => string)][] = [
  [/\bdata:[^\s"')]+/gi, "<data>"],
  [/\ba=(ice-pwd|ice-ufrag|fingerprint|candidate):[^\r\n]*/gi, "a=$1:<hidden>"],
  [
    /\b(?:https?|wss?|turns?|stun|blob|file):[^\s"'<>()]+/gi,
    (url) => (ownHosts.test(url) ? url.replace(/[?#][^:]*/, "") : "<url>"),
  ],
  [/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi, "<email>"],
  [/(?<![a-z])[a-z]:[\\/][^:"'<>|?*\r\n]*/gi, (path) => sourcePath(path)],
  [/\\\\[^\\\s"']+\\[^"'\r\n:]*/g, "<path>"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>"],
  [/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, "<ip>"],
  [/\b(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4}\b/gi, "<ip>"],
  [/\b(?=[a-z0-9_+=-]*\d)(?=[a-z0-9_+=-]*[a-z])[a-z0-9_+=-]{24,}/gi, "<id>"],
  [/"(?:[^"\\\r\n]|\\.){17,}"|"[^"\r\n]*\s[^"\r\n]*"/g, '"<text>"'],
];

function sourcePath(path: string): string {
  const crate = /[\\/]registry[\\/]src[\\/][^\\/]+[\\/](.+)$/i.exec(path);
  return crate ? crate[1] : "<path>";
}

export function redact(text: string): string {
  return rules.reduce(
    (result, [pattern, replacement]) =>
      typeof replacement === "string"
        ? result.replace(pattern, replacement)
        : result.replace(pattern, (match) => replacement(match)),
    text,
  );
}
