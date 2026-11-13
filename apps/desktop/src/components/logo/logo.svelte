<script lang="ts">
  import logo from "@/assets/logo.png";

  let { size = "small" }: { size?: "tiny" | "small" | "large" } = $props();
</script>

<img class="logo logo--{size}" src={logo} alt="" aria-hidden="true" draggable="false" />

<style>
  .logo {
    flex: none;
    user-select: none;
  }

  .logo--tiny {
    width: 18px;
    height: 18px;
  }

  .logo--small {
    width: 28px;
    height: 28px;
  }

  .logo--large {
    width: 56px;
    height: 56px;
  }
</style>
