<script lang="ts">
  import CensorCover from "@/components/censor-cover/censor-cover.svelte";

  let { source, onuncensor }: { source: string; onuncensor: () => void } = $props();
</script>

<div class="censored-video">
  <video class="censored-video__media" src="{source}#t=0.1" preload="metadata" muted></video>
  <CensorCover {onuncensor} />
</div>

<style>
  .censored-video {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 8px;
    background: #000000;
  }

  .censored-video__media {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    filter: blur(28px);
    transform: scale(1.2);
  }
</style>
