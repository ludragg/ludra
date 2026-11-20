<script lang="ts">
  import VolumeMenu from "@/components/volume-menu/volume-menu.svelte";
  import { t } from "@/i18n";
  import type { User } from "@/protocol/ludra/v1/models_pb";
  import { calls } from "@/stores/call.svelte";
  import { chat } from "@/stores/chat.svelte";
  import { groupCall } from "@/stores/group-call.svelte";

  let { user, x, y, onclose }: { user: User; x: number; y: number; onclose: () => void } = $props();

  const latency = $derived.by(() => {
    if (user.id === chat.user?.id) {
      return undefined;
    }
    if (groupCall.current) {
      return groupCall.latencies[user.id] ?? null;
    }
    return calls.latency;
  });

  function change(percent: number) {
    calls.setPeerVolume(user.id, percent);
    groupCall.setPeerVolume(user.id, percent);
  }
</script>

<VolumeMenu
  id="user-volume"
  label={t("call.userVolume", { name: user.username })}
  value={calls.peerVolume(user.id)}
  {latency}
  {x}
  {y}
  onchange={change}
  {onclose}
/>
