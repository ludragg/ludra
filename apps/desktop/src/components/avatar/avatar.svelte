<script lang="ts">
  let { id, name, size = "medium" }: { id: string; name: string; size?: "small" | "medium" | "large" } = $props();

  const tone = $derived(parseInt(id.slice(-8), 16) % 6);
</script>

<span class="avatar avatar--{size} avatar--tone-{tone}" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>

<style>
  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--dark-background-color);
    font-weight: 600;
  }

  .avatar--small {
    width: 32px;
    height: 32px;
    font-size: var(--hint-font-size);
  }

  .avatar--medium {
    width: 36px;
    height: 36px;
  }

  .avatar--large {
    width: 40px;
    height: 40px;
  }

  .avatar--tone-0 {
    background: #16b195;
  }

  .avatar--tone-1 {
    background: #3e62c0;
    color: #ffffff;
  }

  .avatar--tone-2 {
    background: #f6746b;
  }

  .avatar--tone-3 {
    background: #d08a52;
  }

  .avatar--tone-4 {
    background: #30edc5;
  }

  .avatar--tone-5 {
    background: #f3c611;
  }
</style>
