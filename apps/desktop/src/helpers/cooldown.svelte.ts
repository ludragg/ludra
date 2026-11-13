export class Cooldown {
  remaining = $state(0);

  #timer: ReturnType<typeof setInterval> | undefined;

  start(seconds = 60) {
    this.stop();
    this.remaining = seconds;
    this.#timer = setInterval(() => {
      this.remaining -= 1;
      if (this.remaining <= 0) {
        this.stop();
      }
    }, 1000);
  }

  stop() {
    clearInterval(this.#timer);
    this.#timer = undefined;
    this.remaining = Math.max(this.remaining, 0);
  }
}
