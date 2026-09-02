import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import { setMatchMedia } from "@/test/matchMedia";

// jsdom has no ResizeObserver; Recharts' ResponsiveContainer needs one.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

beforeEach(() => {
  setMatchMedia(false);
  try {
    window.localStorage.clear();
  } catch {
    /* jsdom storage may be unavailable in some setups */
  }
});

afterEach(() => {
  cleanup();
});
