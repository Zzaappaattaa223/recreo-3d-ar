const OFFSET_STORAGE_KEY = "recreo_rx_compass_offset";
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Circular low-pass filter over sin/cos components to avoid 359° -> 0° wrap-around jumps.
 */
export class CircularLowPassFilter {
  private readonly alpha: number;
  private sinSum = 0;
  private cosSum = 0;
  private initialized = false;

  constructor(alpha = 0.15) {
    this.alpha = alpha;
  }

  update(angleDeg: number): number {
    const rad = angleDeg * DEG_TO_RAD;
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    if (!this.initialized) {
      this.sinSum = s;
      this.cosSum = c;
      this.initialized = true;
    } else {
      this.sinSum = this.alpha * s + (1 - this.alpha) * this.sinSum;
      this.cosSum = this.alpha * c + (1 - this.alpha) * this.cosSum;
    }
    return ((Math.atan2(this.sinSum, this.cosSum) * RAD_TO_DEG) + 360) % 360;
  }
}

export function loadSavedCompassOffset(): number {
  try {
    const raw = localStorage.getItem(OFFSET_STORAGE_KEY);
    if (!raw) return 0;
    const num = Number(raw);
    return Number.isFinite(num) ? Math.max(-180, Math.min(180, num)) : 0;
  } catch {
    return 0;
  }
}

export function saveCompassOffset(offsetDeg: number): void {
  try {
    localStorage.setItem(OFFSET_STORAGE_KEY, String(Math.round(offsetDeg)));
  } catch {
    // Ignore storage errors
  }
}

export function needsIosOrientationPermission(): boolean {
  const ctor = window.DeviceOrientationEvent as unknown as
    | { requestPermission?: () => Promise<"granted" | "denied"> }
    | undefined;
  return typeof ctor?.requestPermission === "function";
}

export async function requestOrientationPermission(): Promise<boolean> {
  const ctor = window.DeviceOrientationEvent as unknown as
    | { requestPermission?: () => Promise<"granted" | "denied"> }
    | undefined;
  if (typeof ctor?.requestPermission !== "function") {
    return true;
  }
  try {
    const state = await ctor.requestPermission();
    return state === "granted";
  } catch {
    return false;
  }
}

export function extractCompassHeading(
  event: DeviceOrientationEvent & { webkitCompassHeading?: number }
): number | null {
  if (typeof event.webkitCompassHeading === "number" && Number.isFinite(event.webkitCompassHeading)) {
    return ((event.webkitCompassHeading % 360) + 360) % 360;
  }
  if (event.absolute && typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
    return ((360 - event.alpha) % 360 + 360) % 360;
  }
  return null;
}

export function watchCompassHeading(onHeading: (headingDeg: number) => void): () => void {
  const filter = new CircularLowPassFilter(0.15);

  const handler = (ev: Event) => {
    const heading = extractCompassHeading(
      ev as DeviceOrientationEvent & { webkitCompassHeading?: number }
    );
    if (heading !== null) {
      onHeading(filter.update(heading));
    }
  };

  window.addEventListener("deviceorientationabsolute", handler, true);
  window.addEventListener("deviceorientation", handler, true);

  return () => {
    window.removeEventListener("deviceorientationabsolute", handler, true);
    window.removeEventListener("deviceorientation", handler, true);
  };
}
