<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Button, Checkbox, Select } from "@/components";
  import Slider from "@/components/slider/slider.svelte";
  import { t } from "@/i18n";
  import { Microphone, levelPercent, suppressionStrength } from "@/services/microphone";
  import { calls } from "@/stores/call.svelte";
  import { preferences } from "@/stores/preferences.svelte";

  type Option = { value: string; label: string };

  let inputs = $state<Option[]>([]);
  let outputs = $state<Option[]>([]);
  let meter = $state(0);
  let transmitting = $state(false);
  let unavailable = $state(false);

  let microphone: Microphone | null = null;
  let playing = $state(false);
  const player = new Audio() as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  let timer: number | undefined;
  let generation = 0;

  onMount(() => {
    test();
    navigator.mediaDevices.addEventListener("devicechange", listDevices);
  });

  onDestroy(() => {
    navigator.mediaDevices.removeEventListener("devicechange", listDevices);
    generation++;
    stopTest();
    if (playing) {
      calls.endVoiceTest();
    }
  });

  async function listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const system = { value: "", label: t("settings.systemDefault") };
    const options = (kind: MediaDeviceKind) => [
      system,
      ...devices
        .filter((device) => device.kind === kind && !["default", "communications", ""].includes(device.deviceId))
        .map((device) => ({ value: device.deviceId, label: device.label || device.deviceId.slice(0, 8) })),
    ];
    inputs = options("audioinput");
    outputs = options("audiooutput");
  }

  async function test() {
    const current = ++generation;
    stopTest();

    let opened: Microphone;
    try {
      opened = await Microphone.open();
    } catch {
      unavailable = true;
      await listDevices();
      return;
    }
    if (current !== generation) {
      opened.close();
      return;
    }

    microphone = opened;
    if (playing) {
      play();
    }
    unavailable = false;
    await listDevices();
    timer = window.setInterval(() => {
      meter = levelPercent(opened.level());
      transmitting = opened.transmitting;
    }, 60);
  }

  function play() {
    if (!microphone) {
      return;
    }
    player.srcObject = new MediaStream([microphone.track]);
    player.volume = Math.min(1, preferences.values.outputVolume / 100);
    player.setSinkId?.(preferences.values.outputDevice).catch(() => undefined);
    player.play().catch(() => undefined);
  }

  function togglePlayback() {
    playing = !playing;
    if (playing) {
      calls.beginVoiceTest();
      play();
    } else {
      player.pause();
      player.srcObject = null;
      calls.endVoiceTest();
    }
  }

  function stopTest() {
    player.pause();
    player.srcObject = null;
    window.clearInterval(timer);
    microphone?.close();
    microphone = null;
    meter = 0;
  }

  function chooseInput(deviceId: string) {
    preferences.set("inputDevice", deviceId);
    test();
  }

  function chooseOutput(deviceId: string) {
    preferences.set("outputDevice", deviceId);
    player.setSinkId?.(deviceId).catch(() => undefined);
    calls.setOutputDevice(deviceId);
  }

  function setInputVolume(percent: number) {
    preferences.set("inputVolume", percent);
    microphone?.setVolume(percent);
    calls.setInputVolume(percent);
  }

  function setSensitivity(event: Event) {
    const percent = Number((event.currentTarget as HTMLInputElement).value);
    preferences.set("sensitivity", percent);
    microphone?.setSensitivity(percent);
    calls.setSensitivity(percent);
  }

  function applySuppression() {
    microphone?.setSuppression(suppressionStrength()).catch(() => undefined);
    calls.setNoiseSuppression(suppressionStrength());
  }

  function setSuppressionLevel(percent: number) {
    preferences.set("suppressionLevel", percent);
    applySuppression();
  }

  function toggleSuppression(enabled: boolean) {
    preferences.set("suppression", enabled);
    applySuppression();
  }

  function setOutputVolume(percent: number) {
    preferences.set("outputVolume", percent);
    player.volume = Math.min(1, percent / 100);
    calls.setOutputVolume(percent);
  }
</script>

<div class="settings-voice">
  <Select
    id="microphone"
    label={t("settings.microphone")}
    options={inputs}
    value={preferences.values.inputDevice}
    onchange={chooseInput}
  />
  <Select
    id="output"
    label={t("settings.output")}
    options={outputs}
    value={preferences.values.outputDevice}
    onchange={chooseOutput}
  />
  <div class="settings-voice__group">
    <Slider
      id="input-volume"
      label={t("settings.inputVolume")}
      value={preferences.values.inputVolume}
      onchange={setInputVolume}
    />
    <div class="settings-voice__meter">
      <div class="settings-voice__track" aria-hidden="true">
        <div
          class="settings-voice__level"
          class:settings-voice__level--open={transmitting}
          style:width="{meter}%"
        ></div>
      </div>
      <input
        class="settings-voice__sensitivity"
        type="range"
        min="0"
        max="100"
        aria-label={t("settings.sensitivity")}
        value={preferences.values.sensitivity}
        oninput={setSensitivity}
      />
    </div>
    <span class="settings-voice__hint" class:settings-voice__hint--error={unavailable}>
      {unavailable ? t("settings.micUnavailable") : t("settings.micTest")}
    </span>
    <div class="settings-voice__test">
      <Button size="small" theme={playing ? "outline" : "primary"} disabled={unavailable} onclick={togglePlayback}>
        {playing ? t("settings.stopVoiceTest") : t("settings.voiceTest")}
      </Button>
    </div>
  </div>
  <div class="settings-voice__group">
    <Checkbox
      label={t("settings.noiseSuppression")}
      checked={preferences.values.suppression}
      onchange={toggleSuppression}
    />
    {#if preferences.values.suppression}
      <Slider
        id="noise-suppression"
        label={t("settings.suppressionLevel")}
        max={100}
        value={preferences.values.suppressionLevel}
        onchange={setSuppressionLevel}
      />
    {/if}
  </div>
  <Slider
    id="output-volume"
    label={t("settings.outputVolume")}
    max={100}
    value={preferences.values.outputVolume}
    onchange={setOutputVolume}
  />
</div>

<style>
  .settings-voice {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .settings-voice__group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .settings-voice__meter {
    position: relative;
    height: 16px;
    display: flex;
    align-items: center;
  }

  .settings-voice__track {
    width: 100%;
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--border-color);
  }

  .settings-voice__level {
    height: 100%;
    border-radius: 3px;
    background: var(--subtle-color);
    transition: width linear 0.06s;
  }

  .settings-voice__level--open {
    background: var(--success-color);
  }

  .settings-voice__sensitivity {
    position: absolute;
    inset: 0;
    width: 100%;
    margin: 0;
    appearance: none;
    background: transparent;
    cursor: ew-resize;
  }

  .settings-voice__sensitivity::-webkit-slider-thumb {
    width: 4px;
    height: 16px;
    appearance: none;
    border-radius: 2px;
    background: var(--muted-color);
    box-shadow: 0 0 0 2px var(--dark-background-color);
  }

  .settings-voice__test {
    margin-top: 6px;
  }

  .settings-voice__hint {
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .settings-voice__hint--error {
    color: var(--error-color);
  }
</style>
