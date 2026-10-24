// What this device and browser can do, read once before a tool runs. Every probe is best effort: a probe that
// throws reports "not available" rather than failing the tool.

export interface Caps {
  webgpu: boolean;
  deviceMemoryGB?: number;
  mobile: boolean;
  /** On mobile data (only Chromium on Android reports this). */
  cellular: boolean;
  webcodecs: { decode: boolean; h264Encode: boolean };
}

interface NavigatorExtras {
  gpu?: { requestAdapter(): Promise<unknown> };
  deviceMemory?: number;
  connection?: { type?: string };
  userAgentData?: { mobile?: boolean };
}

/** Some drivers take seconds (or never answer) to hand out an adapter: past this, count WebGPU as absent. */
const ADAPTER_TIMEOUT_MS = 1500;

async function hasWebGpu(nav: NavigatorExtras): Promise<boolean> {
  if (!nav.gpu) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ADAPTER_TIMEOUT_MS)));
    return !!(await Promise.race([nav.gpu.requestAdapter(), timeout]));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function canEncodeH264(): Promise<boolean> {
  try {
    if (typeof VideoEncoder === 'undefined' || !VideoEncoder) return false;
    const { supported } = await VideoEncoder.isConfigSupported({
      codec: 'avc1.42001f', // H.264 Baseline 3.1
      width: 1280,
      height: 720,
      bitrate: 2_000_000,
      framerate: 30,
    });
    return supported === true;
  } catch {
    return false;
  }
}

function isMobile(nav: Navigator & NavigatorExtras): boolean {
  if (typeof nav.userAgentData?.mobile === 'boolean') return nav.userAgentData.mobile;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent)) return true;
  return /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1; // iPadOS asks for the desktop site
}

export async function detect(): Promise<Caps> {
  const nav = navigator as Navigator & NavigatorExtras;
  const [webgpu, h264Encode] = await Promise.all([hasWebGpu(nav), canEncodeH264()]);
  const caps: Caps = {
    webgpu,
    mobile: isMobile(nav),
    cellular: nav.connection?.type === 'cellular',
    webcodecs: { decode: typeof VideoDecoder === 'function', h264Encode },
  };
  if (typeof nav.deviceMemory === 'number') caps.deviceMemoryGB = nav.deviceMemory;
  return caps;
}
