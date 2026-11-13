const edges = /^[\s\p{Cf}\u115f\u1160\u2800\u3164\uffa0]+|[\s\p{Cf}\u115f\u1160\u2800\u3164\uffa0]+$/gu;

export function clean(text: string): string {
  return text.replace(edges, "");
}
