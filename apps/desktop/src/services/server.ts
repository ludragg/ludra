export const serverUrl: string = import.meta.env.VITE_LUDRA_SERVER ?? "ws://127.0.0.1:8080/ws";

const httpBase = serverUrl.replace(/^ws/, "http").replace(/\/ws$/, "");

export function avatarUrl(userId: string, avatar: string): string {
  return `${httpBase}/avatars/${userId}?v=${avatar}`;
}
