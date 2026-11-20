<script lang="ts">
  import { useActivityTimer } from "@/helpers/activity-timer.svelte";
  import type { UserActivity } from "@/services/activity-providers";
  import GameIcon from "./game-icon.svelte";

  let {
    activity,
    accentColor = "#8b5cf6",
    showElapsed = true,
  }: {
    activity: UserActivity;
    accentColor?: string;
    showElapsed?: boolean;
  } = $props();

  const timer = useActivityTimer(() => (showElapsed ? activity.startedAt : null));
  const borderAccent = $derived(accentColor || "#8b5cf6");
</script>

{#key `${activity.gameId ?? activity.name}-${activity.startedAt}`}
  <section class="activity-card" style:--activity-accent={borderAccent} aria-label="Jogando {activity.name}">
    <span class="activity-card__heading">Jogando agora</span>
    <div class="activity-card__row">
      <GameIcon src={activity.iconUrl || activity.coverUrl || ""} name={activity.name} size={48} radius={10} />
      <div class="activity-card__body">
        <strong class="activity-card__name" title={activity.name}>{activity.name}</strong>
        {#if showElapsed && timer.label}
          <span class="activity-card__elapsed">{timer.label}</span>
        {/if}
      </div>
    </div>
  </section>
{/key}

<style>
  .activity-card {
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(139, 92, 246, 0.14);
    border: 1px solid color-mix(in srgb, var(--activity-accent, #8b5cf6) 40%, transparent);
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: activity-enter 150ms ease-out;
  }

  .activity-card__heading {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9ca3af;
  }

  .activity-card__row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .activity-card__body {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .activity-card__name {
    font-size: 14px;
    font-weight: 700;
    color: #ffffff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activity-card__elapsed {
    font-size: 12px;
    font-weight: 500;
    color: #9ca3af;
    font-variant-numeric: tabular-nums;
  }

  @keyframes activity-enter {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .activity-card {
      animation: none;
    }
  }
</style>
