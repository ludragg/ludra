import { calls } from "@/stores/call.svelte";
import { groupCall } from "@/stores/group-call.svelte";
import { preferences } from "@/stores/preferences.svelte";

export function setDirectCalls(enabled: boolean) {
  preferences.set("directCalls", enabled);
  calls.setDirect(enabled);
  groupCall.setDirect(enabled);
}
