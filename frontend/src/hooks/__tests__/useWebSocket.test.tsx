import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";

import { useWebSocket } from "../useWebSocket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.onopen?.();
  }

  drop() {
    this.onclose?.();
  }

  close() {
    this.onclose?.();
  }
}

function latestSocket() {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const hook = renderHook(() => useWebSocket(), { wrapper });
  const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { ...hook, invalidate, invalidatedKeys };
}

describe("useWebSocket recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not refetch on the first connect", () => {
    const { invalidate } = setup();
    act(() => latestSocket().open());
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("refetches mail after reconnecting from a dropped connection", () => {
    const { invalidatedKeys } = setup();
    act(() => latestSocket().open());
    act(() => latestSocket().drop());
    expect(invalidatedKeys()).toEqual([]);

    act(() => vi.advanceTimersByTime(1000));
    expect(FakeWebSocket.instances).toHaveLength(2);
    act(() => latestSocket().open());

    expect(invalidatedKeys()).toEqual([["messages"], ["folders"], ["outbox"]]);
  });

  it("reconnects immediately when coming back online instead of waiting out the backoff", () => {
    setup();
    act(() => latestSocket().open());
    // Build up backoff: 1s, then 2s pending.
    act(() => latestSocket().drop());
    act(() => vi.advanceTimersByTime(1000));
    act(() => latestSocket().drop());
    expect(FakeWebSocket.instances).toHaveLength(2);

    act(() => window.dispatchEvent(new Event("online")));
    expect(FakeWebSocket.instances).toHaveLength(3);

    // The cancelled backoff timer must not open a second socket.
    act(() => vi.advanceTimersByTime(5000));
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it("does not open a second socket while one is still connecting", () => {
    setup();
    act(() => window.dispatchEvent(new Event("online")));
    act(() => setVisibility("visible"));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("refetches after a long time in the background even if the socket stayed open", () => {
    const { invalidatedKeys } = setup();
    act(() => latestSocket().open());

    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(60_000));
    act(() => setVisibility("visible"));

    expect(invalidatedKeys()).toEqual([["messages"], ["folders"], ["outbox"]]);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("does not refetch after a short tab switch", () => {
    const { invalidate } = setup();
    act(() => latestSocket().open());

    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(5_000));
    act(() => setVisibility("visible"));

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("stops listening for resume events after unmount", () => {
    const { unmount } = setup();
    unmount();
    act(() => window.dispatchEvent(new Event("online")));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
