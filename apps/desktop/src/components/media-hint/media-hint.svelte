<script lang="ts">
  let { name, detail, visible }: { name: string; detail: string; visible: boolean } = $props();
</script>

<div class="media-hint" class:media-hint--visible={visible}>
  <span class="media-hint__name">{name}</span>
  <span class="media-hint__detail">{detail}</span>
</div>

<style>
  .media-hint {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    padding: 10px 48px 22px 12px;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.72), transparent);
    font-size: var(--small-font-size);
    line-height: 1.35;
    opacity: 0;
    pointer-events: none;
    transition: opacity ease 0.15s;
  }

  .media-hint--visible {
    opacity: 1;
  }

  .media-hint__name {
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    color: #f0f1f7;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .media-hint__detail {
    color: #d0d1d7;
    font-variant-numeric: tabular-nums;
  }
</style>
