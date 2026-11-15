<script lang="ts">
  import Slider from "@/components/slider/slider.svelte";
  import { t } from "@/i18n";
  import type { User } from "@/protocol/ludra/v1/models_pb";
  import { calls } from "@/stores/call.svelte";
  import { groupCall } from "@/stores/group-call.svelte";

  let { user, x, y, onclose }: { user: User; x: number; y: number; onclose: () => void } = $props();

  let menu = $state<HTMLElement>();
  const volume = $derived(calls.peerVolume(user.id));

  const width = 240;
  const left = $derived(Math.min(x, window.innerWidth - width - 8));
  const top = $derived(Math.min(y, window.innerHeight - 96));

  function change(percent: number) {
    calls.setPeerVolume(user.id, percent);
    groupCall.setPeerVolume(user.id, percent);
  }

  function onpointerdown(event: PointerEvent) {
    if (!menu?.contains(event.target as Node)) {
      onclose();
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onclose();
    }
  }
</script>

<svelte:window {onpointerdown} {onkeydown} />

<div
  class="call-volume-menu"
  role="dialog"
  aria-label={t("call.userVolume", { name: user.username })}
  style:left="{left}px"
  style:top="{top}px"
  style:width="{width}px"
  bind:this={menu}
>
  <Slider id="user-volume" label={t("call.userVolume", { name: user.username })} value={volume} onchange={change} />
</div>

<style>
  .call-volume-menu {
    position: fixed;
    z-index: 20;
    padding: 12px 14px;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
</style>
