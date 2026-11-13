export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) {
    return email;
  }

  const local = [...email.slice(0, at)];
  const visible = Math.min(2, Math.max(local.length - 1, 1));
  return local.slice(0, visible).join("") + "•••" + email.slice(at);
}
