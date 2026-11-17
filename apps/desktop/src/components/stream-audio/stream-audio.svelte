<script lang="ts">
  import { preferences } from "@/stores/preferences.svelte";

  type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

  let { stream, userId }: { stream: MediaStream | null; userId: string } = $props();

  let gain = $state<GainNode | null>(null);

  const volume = $derived(preferences.values.streamVolumes[userId] ?? 100);

  $effect(() => {
    if (!stream) {
      return;
    }
    const context = new AudioContext() as SinkContext;
    const node = context.createGain();
    node.connect(context.destination);
    context.setSinkId?.(preferences.values.outputDevice).catch(() => undefined);
    let source: MediaStreamAudioSourceNode | null = null;
    const attach = () => {
      if (!source && stream.getAudioTracks().length > 0) {
        source = context.createMediaStreamSource(stream);
        source.connect(node);
      }
    };
    attach();
    stream.addEventListener("addtrack", attach);
    gain = node;
    return () => {
      stream.removeEventListener("addtrack", attach);
      gain = null;
      context.close().catch(() => undefined);
    };
  });

  $effect(() => {
    if (gain) {
      gain.gain.value = (preferences.values.outputVolume / 100) * (volume / 100);
    }
  });
</script>
