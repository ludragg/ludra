/**
 * Hook reativo `useActivityTimer(startedAt)`
 * Calcula o tempo decorrido ao vivo ("há 42 min" ou "01:25:10")
 * e atualiza a cada 30 segundos com limpeza automática do setInterval no unmount.
 */
export function formatActivityElapsed(startedAt: number, now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (diffSec < 60) {
    return "agora mesmo";
  }

  const totalMin = Math.floor(diffSec / 60);
  if (totalMin < 60) {
    return `há ${totalMin} min`;
  }

  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

export function useActivityTimer(getStartedAt: () => number | null | undefined) {
  let now = $state(Date.now());

  $effect(() => {
    const startedAt = getStartedAt();
    if (!startedAt) return;
    now = Date.now();
    const intervalId = window.setInterval(() => {
      now = Date.now();
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  });

  return {
    get label(): string {
      const startedAt = getStartedAt();
      return startedAt ? formatActivityElapsed(startedAt, now) : "";
    },
  };
}
