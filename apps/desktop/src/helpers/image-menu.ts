import { imageMenu } from "@/stores/image-menu.svelte";

export function copyMenu(source: () => string | null) {
  return (node: HTMLElement) => {
    const open = (event: MouseEvent) => {
      const current = source();
      if (!current) {
        return;
      }
      event.preventDefault();
      imageMenu.show(event.clientX, event.clientY, current);
    };
    node.addEventListener("contextmenu", open);
    return () => node.removeEventListener("contextmenu", open);
  };
}
