<script lang="ts">
  import { TitleBar } from "@/components";
  import ImageMenu from "@/components/image-menu/image-menu.svelte";
  import Tooltip from "@/components/tooltip/tooltip.svelte";
  import ForgotPassword from "@/pages/auth/forgot-password.svelte";
  import Login from "@/pages/auth/login.svelte";
  import Register from "@/pages/auth/register.svelte";
  import ResetPassword from "@/pages/auth/reset-password.svelte";
  import type { Screen } from "@/pages/auth/screen";
  import TwoFactor from "@/pages/auth/two-factor.svelte";
  import VerifyEmail from "@/pages/auth/verify-email.svelte";
  import Chat from "@/pages/chat/chat.svelte";
  import Reconnecting from "@/pages/reconnecting/reconnecting.svelte";
  import UpdateGate from "@/pages/updates/update-gate.svelte";
  import WhatsNew from "@/pages/updates/whats-new.svelte";
  import { calls } from "@/stores/call.svelte";
  import { chat } from "@/stores/chat.svelte";
  import { groupCall } from "@/stores/group-call.svelte";
  import { updates } from "@/stores/updates.svelte";

  let screen = $state<Screen>({ name: "login" });

  const inCall = $derived(
    (calls.current !== null && calls.current.status !== "incoming") || groupCall.current !== null || groupCall.joining,
  );
  const gated = $derived(updates.phase !== "idle" && (!inCall || updates.critical));

  $effect(() => {
    updates.start();
  });

  $effect(() => {
    if (updates.critical && inCall) {
      void groupCall.leave();
      void calls.hangUp();
    }
  });

  $effect(() => {
    if (chat.user) {
      screen = { name: "login" };
    }
  });

  function navigate(next: Screen) {
    chat.notice = "";
    screen = next;
  }
</script>

<div class="app">
  <TitleBar />
  <div class="app__content">
    {#if chat.user}
      <Chat />
    {:else if chat.restoring}
      <div class="app__loading"></div>
    {:else if screen.name === "register"}
      <Register {navigate} />
    {:else if screen.name === "verify"}
      <VerifyEmail email={screen.email} {navigate} />
    {:else if screen.name === "twoFactor"}
      <TwoFactor email={screen.email} {navigate} />
    {:else if screen.name === "forgot"}
      <ForgotPassword {navigate} />
    {:else if screen.name === "reset"}
      <ResetPassword email={screen.email} {navigate} />
    {:else}
      <Login {navigate} />
    {/if}
    {#if chat.offline}
      <Reconnecting />
    {/if}
  </div>
</div>

<Tooltip />
<ImageMenu />

{#if gated}
  <UpdateGate />
{:else if updates.release && updates.phase === "idle"}
  <WhatsNew release={updates.release} />
{/if}

<style>
  .app {
    height: 100%;
    overflow: clip;
    display: flex;
    flex-direction: column;
  }

  .app__content {
    position: relative;
    overflow: clip;
    min-height: 0;
    flex-grow: 1;
  }

  .app__loading {
    height: 100%;
    display: grid;
    place-items: center;
    background: linear-gradient(0deg, var(--dark-background-color) 50%, var(--background-color) 100%);
  }
</style>
