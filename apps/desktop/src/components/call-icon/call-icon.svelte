<script lang="ts">
  type CallIconName = "phone" | "hangUp" | "mic" | "micOff" | "headphones" | "headphonesOff" | "signal" | "dash";

  let { name }: { name: CallIconName } = $props();

  const phone =
    "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z";
  const headphones = [
    "M3 18v-6a9 9 0 0 1 18 0v6",
    "M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z",
  ];

  const paths: Record<CallIconName, string[]> = {
    phone: [phone],
    hangUp: [phone],
    mic: ["M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 19v4M8 23h8"],
    micOff: [
      "M1 1l22 22",
      "M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6",
      "M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23",
      "M12 19v4M8 23h8",
    ],
    headphones,
    headphonesOff: [...headphones, "M1 1l22 22"],
    signal: ["M2 20h.01", "M7 20v-4", "M12 20v-8", "M17 20V8"],
    dash: ["M5 12h14"],
  };
</script>

<svg
  class="call-icon"
  class:call-icon--hang-up={name === "hangUp"}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={name === "signal" ? 2.4 : 2}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each paths[name] as path (path)}
    <path d={path} />
  {/each}
</svg>

<style>
  .call-icon {
    width: 100%;
    height: 100%;
  }

  .call-icon--hang-up {
    transform: rotate(135deg);
  }
</style>
