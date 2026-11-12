<script lang="ts">
  import { presenceLabel } from "@/helpers/presence";
  import { Presence } from "@/protocol/ludra/v1/models_pb";

  let { presence }: { presence: Presence } = $props();
</script>

<span class="status">
  <span class="status__dot" class:status__dot--online={presence === Presence.ONLINE}></span>
  {presenceLabel[presence]}
</span>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .status__dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: var(--subtle-color);
  }

  .status__dot--online {
    background: var(--success-color);
  }
</style>
