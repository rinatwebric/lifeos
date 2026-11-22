/** The search button shows the shortcut of the platform the reader is on. */
export function commandKeyLabel(isApple: boolean): string {
  return isApple ? "⌘K" : "Ctrl K";
}

export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}
