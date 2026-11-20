<script lang="ts">
  import type { UserActivity } from "@/services/activity-providers";
  import GameIcon from "./game-icon.svelte";

  let { activity }: { activity: UserActivity } = $props();
</script>

<span class="activity-inline" title={activity.name}>
  <GameIcon src={activity.iconUrl || activity.coverUrl || ""} name={activity.name} size={16} radius={4} />
  <span class="activity-inline__name">{activity.name}</span>
</span>

<style>
  .activity-inline {
    max-width: 100%;
    padding: 2px 7px 2px 4px;
    border-radius: 7px;
    background: rgba(139, 92, 246, 0.14);
    border: 1px solid rgba(139, 92, 246, 0.28);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    line-height: 1.25;
    animation: activity-inline-in 150ms ease-out;
  }

  .activity-inline__name {
    font-size: 12px;
    font-weight: 600;
    color: #e5e7eb;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @keyframes activity-inline-in {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .activity-inline {
      animation: none;
    }
  }
</style>
