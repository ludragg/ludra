const edges = /^[\s\p{Cf}\u115f\u1160\u2800\u3164\uffa0]+|[\s\p{Cf}\u115f\u1160\u2800\u3164\uffa0]+$/gu;

export function clean(text: string): string {
  return text.replace(edges, "");
}

export type TextSpan = { text: string; href?: string; mention?: boolean };

const links = /(?<=^|[\s(<[{"'])(?:https?:\/\/|www\.)[^\s\p{Cf}]+/giu;
const trailing = ".,;:!?)]}'\"\u00bb\u201d\u2019\u2026";

function trim(url: string): string {
  let end = url.length;
  while (end > 0 && trailing.includes(url[end - 1])) {
    end--;
  }
  return url.slice(0, end);
}

export function linkify(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  let last = 0;

  for (const match of text.matchAll(links)) {
    const start = match.index;
    const raw = trim(match[0]);
    if (!/^(?:https?:\/\/|www\.)./i.test(raw)) {
      continue;
    }
    if (start > last) {
      spans.push({ text: text.slice(last, start) });
    }
    spans.push({ text: raw, href: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` });
    last = start + raw.length;
  }

  if (last < text.length) {
    spans.push({ text: text.slice(last) });
  }

  return spans;
}

const mentions = /(?<=^|[\s(<[{"'])@([a-zA-Z0-9_.]{3,32})/g;

function mentioned(name: string, names: Set<string>): string | null {
  let candidate = name;
  while (candidate.length >= 3) {
    if (names.has(candidate.toLowerCase())) {
      return candidate;
    }
    if (!candidate.endsWith(".")) {
      return null;
    }
    candidate = candidate.slice(0, -1);
  }
  return null;
}

export function markup(text: string, names: Set<string>): TextSpan[] {
  return linkify(text).flatMap((span) => {
    if (span.href || names.size === 0) {
      return [span];
    }
    const result: TextSpan[] = [];
    let last = 0;
    for (const match of span.text.matchAll(mentions)) {
      const name = mentioned(match[1], names);
      if (!name) {
        continue;
      }
      if (match.index > last) {
        result.push({ text: span.text.slice(last, match.index) });
      }
      result.push({ text: `@${name}`, mention: true });
      last = match.index + name.length + 1;
    }
    if (last < span.text.length) {
      result.push({ text: span.text.slice(last) });
    }
    return result;
  });
}
