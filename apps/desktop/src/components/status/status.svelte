<script lang="ts">
  import StatusDot from "@/components/profile/status-dot.svelte";
  import { fromProtoPresence, PRESENCE_STATUSES, type PresenceStatus } from "@/constants/presence";
  import type { Presence } from "@/protocol/ludra/v1/models_pb";

  let {
    status = undefined,
    presence = undefined,
    labelOverride = "",
  }: {
    status?: PresenceStatus;
    presence?: Presence;
    labelOverride?: string;
  } = $props();

  const resolved = $derived<PresenceStatus>(
    status ?? (presence !== undefined ? fromProtoPresence(presence) : "online"),
  );
  const label = $derived(labelOverride || PRESENCE_STATUSES[resolved].label);
</script>

<span class="status">
  <StatusDot status={resolved} size="small" bordered={false} ringColor="transparent" />
  <span class="status__label">{label}</span>
</span>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .status__label {
    transform: translateY(1px);
  }
</style>
