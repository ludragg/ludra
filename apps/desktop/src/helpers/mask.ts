export type Mask = "password" | "username" | "groupName";

const allowed: Record<Mask, RegExp> = {
  password: /[!-~]/,
  username: /[a-zA-Z0-9_.]/,
  groupName: /[\p{L}\p{M}\p{N} _.,!?'&()#+:-]/u,
};

export function applyMask(value: string, mask: Mask): string {
  return [...value].filter((char) => allowed[mask].test(char)).join("");
}
