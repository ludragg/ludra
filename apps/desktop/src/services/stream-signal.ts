export const streamClosed = JSON.stringify({ type: "close" });

export function closesStream(payload: string): boolean {
  return (JSON.parse(payload) as { type?: string }).type === "close";
}
