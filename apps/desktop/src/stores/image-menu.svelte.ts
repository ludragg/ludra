class ImageMenuStore {
  current = $state<{ x: number; y: number; source: string } | null>(null);

  show(x: number, y: number, source: string) {
    this.current = { x, y, source };
  }

  close() {
    this.current = null;
  }
}

export const imageMenu = new ImageMenuStore();
