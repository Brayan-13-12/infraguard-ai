import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useVisualHistory } from "./useVisualHistory";

const initial: import("./useVisualHistory").Positions = { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } };
it("records a whole drag as one step, then undoes and redoes its final positions", () => {
  const { result, rerender } = renderHook(() => useVisualHistory(initial));
  expect(result.current.canUndo).toBe(false);
  act(() => { result.current.begin(); result.current.move({ a: { x: 10, y: 20 } }); result.current.move({ a: { x: 40, y: 50 } }); result.current.commit(); });
  rerender();
  expect(result.current.positions.a).toEqual({ x: 40, y: 50 });
  act(() => result.current.undo());
  expect(result.current.positions).toEqual(initial);
  expect(result.current.canUndo).toBe(false);
  expect(result.current.canRedo).toBe(true);
  act(() => result.current.redo());
  expect(result.current.positions.a).toEqual({ x: 40, y: 50 });
  expect(result.current.positions.b).toEqual(initial.b);
});

it("ignores no-op gestures and clears redo after a new movement", () => {
  const { result } = renderHook(() => useVisualHistory(initial));
  act(() => { result.current.begin(); result.current.commit(); });
  expect(result.current.canUndo).toBe(false);
  act(() => { result.current.begin(); result.current.move({ a: { x: 1, y: 1 } }); result.current.commit(); });
  act(() => result.current.undo());
  act(() => { result.current.begin(); result.current.move({ b: { x: 250, y: 30 } }); result.current.commit(); });
  expect(result.current.canRedo).toBe(false);
  act(() => result.current.undo());
  expect(result.current.positions).toEqual(initial);
});

it("discards visual history when a different query or expanded graph is loaded", () => {
  const { result } = renderHook(() => useVisualHistory(initial));
  act(() => { result.current.begin(); result.current.move({ a: { x: 1, y: 1 } }); result.current.commit(); });
  const next = { c: { x: 20, y: 20 } };
  act(() => result.current.reset(next));
  act(() => result.current.undo());
  expect(result.current.positions).toEqual(next);
  expect(result.current.canUndo).toBe(false);
  expect(result.current.canRedo).toBe(false);
  expect(initial.a).toEqual({ x: 0, y: 0 });
});
