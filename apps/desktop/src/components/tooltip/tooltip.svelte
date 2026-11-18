<script lang="ts">
  type Tip = { text: string; anchor: DOMRect };

  const delay = 400;
  const margin = 8;
  const titleBar = 32;

  let tip = $state<Tip | null>(null);
  let target: HTMLElement | null = null;
  let timer: number | undefined;

  function owner(node: EventTarget | null): HTMLElement | null {
    return node instanceof Element ? node.closest<HTMLElement>("[data-tooltip]") : null;
  }

  function show(element: HTMLElement) {
    const text = element.dataset.tooltip;
    tip = text && element.isConnected ? { text, anchor: element.getBoundingClientRect() } : null;
  }

  function schedule(element: HTMLElement | null, wait: number) {
    window.clearTimeout(timer);
    target = element;
    tip = null;
    if (element) {
      timer = window.setTimeout(() => show(element), wait);
    }
  }

  function hide() {
    schedule(null, 0);
  }

  function onpointerover(event: PointerEvent) {
    const element = owner(event.target);
    if (element !== target) {
      schedule(element, delay);
    }
  }

  function onpointerout(event: PointerEvent) {
    if (target && !(event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) {
      hide();
    }
  }

  function onfocusin(event: FocusEvent) {
    const element = owner(event.target);
    if (element && element.matches(":focus-visible")) {
      schedule(element, 0);
    }
  }

  function place(bubble: HTMLElement) {
    if (!tip) {
      return;
    }
    const { anchor } = tip;
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const center = anchor.left + anchor.width / 2;
    const left = Math.min(Math.max(center - width / 2, margin), window.innerWidth - width - margin);
    const above = anchor.top - height - margin;
    const below = above < titleBar + margin;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${below ? anchor.bottom + margin : above}px`;
    bubble.style.setProperty("--arrow", `${center - left}px`);
    bubble.classList.toggle("tooltip--below", below);
  }
</script>

<svelte:document
  {onpointerover}
  {onpointerout}
  {onfocusin}
  onfocusout={hide}
  onpointerdown={hide}
  onkeydown={hide}
  onwheel={hide}
/>

{#if tip}
  <div class="tooltip" role="tooltip" {@attach place}>
    {tip.text}
  </div>
{/if}

<style>
  .tooltip {
    position: fixed;
    z-index: 100;
    max-width: 280px;
    padding: 6px 10px;
    border-radius: 6px;
    background: #1f1f1f;
    border: 1px solid var(--border-color);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
    color: var(--muted-color);
    font-size: var(--small-font-size);
    font-weight: 600;
    line-height: 1.4;
    pointer-events: none;
    animation: tooltip-in 0.12s ease-out;
  }

  .tooltip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: var(--arrow);
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    transform: rotate(45deg);
    background: #1f1f1f;
    border-right: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
  }

  .tooltip:global(.tooltip--below)::after {
    top: auto;
    bottom: 100%;
    margin: 0 0 -4px -4px;
    transform: rotate(225deg);
  }

  @keyframes tooltip-in {
    from {
      opacity: 0;
    }
  }
</style>
