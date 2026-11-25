type PlatformData = {
  getHighEntropyValues(hints: string[]): Promise<{ platformVersion?: string }>;
};

const firstWindows11 = 13;

let description: Promise<string> | null = null;

export function systemDescription(): Promise<string> {
  description ??= describe();
  return description;
}

async function describe(): Promise<string> {
  const webview = /Edg\/(\d+)/.exec(navigator.userAgent)?.[1];
  return [await windowsVersion(), webview && `WebView2 ${webview}`, graphicsCard()].filter(Boolean).join("; ");
}

async function windowsVersion(): Promise<string> {
  const data = (navigator as Navigator & { userAgentData?: PlatformData }).userAgentData;
  const values = await data?.getHighEntropyValues(["platformVersion"]).catch(() => null);
  const major = Number.parseInt(values?.platformVersion ?? "", 10);
  if (Number.isNaN(major)) {
    return "Windows";
  }
  return major >= firstWindows11 ? "Windows 11" : "Windows 10";
}

function graphicsCard(): string {
  const context = document.createElement("canvas").getContext("webgl");
  const extension = context?.getExtension("WEBGL_debug_renderer_info");
  const name = extension ? String(context?.getParameter(extension.UNMASKED_RENDERER_WEBGL) ?? "") : "";
  context?.getExtension("WEBGL_lose_context")?.loseContext();
  return name;
}
