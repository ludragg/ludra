<script lang="ts">
  import Avatar from "@/components/avatar/avatar.svelte";
  import type { User } from "@/protocol/ludra/v1/models_pb";

  let { user, stream = null }: { user: Pick<User, "id" | "username" | "avatar">; stream?: MediaStream | null } =
    $props();

  function play(video: HTMLVideoElement) {
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => undefined);
    }
  }
</script>

{#if stream}
  <video class="call-tile" autoplay muted playsinline disablepictureinpicture {@attach play}></video>
{:else}
  <span class="call-tile call-tile--photo">
    <Avatar {user} size="fill" />
  </span>
{/if}

<style>
  .call-tile {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: inherit;
    object-fit: cover;
    background: #000000;
    animation: call-tile-in 0.25s ease-out;
  }

  video.call-tile {
    transform: scaleX(-1);
  }

  .call-tile--photo {
    background: transparent;
  }

  .call-tile--photo :global(.avatar) {
    border-radius: inherit;
  }

  @keyframes call-tile-in {
    from {
      opacity: 0;
      scale: 0.94;
    }
  }
</style>
