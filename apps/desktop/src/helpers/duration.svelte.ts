export class Elapsed {
  now = $state(Date.now());

  #timer = window.setInterval(() => (this.now = Date.now()), 1000);

  format(since: number): string {
    const total = Math.max(0, Math.floor((this.now - since) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (value: number) => String(value).padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
  }

  stop() {
    window.clearInterval(this.#timer);
  }
}
