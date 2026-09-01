import { vi } from "vitest";

/**
 * jsdom has no `matchMedia`. `setMatchMedia(true)` simulates an OS that prefers
 * dark; `setMatchMedia(false)` (the default installed in vitest.setup) reports
 * no match.
 */
export function setMatchMedia(prefersDark: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: prefersDark && query.includes("dark"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
