"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/useAuthStore";

export type WsStatus = "connected" | "connecting" | "disconnected";

export interface MailEvent {
  type: "FolderStateChanged" | "NewMail" | "FlagsChanged" | "FolderUpdated" | "OutboxStateChanged";
  data?: {
    folder?: string;
    count?: number;
    latest_sender?: string;
    latest_subject?: string;
    id?: string;
    state?: string;
    fail_reason?: string;
  };
}

interface WebSocketMessage {
  accountId: string;
  event: MailEvent;
}

/** Hidden for at least this long, the page may have missed pushed events. */
const RESUME_REFRESH_AFTER_MS = 30_000;

/**
 * Connects to the backend WebSocket endpoint for real-time mail events.
 * Automatically reconnects with exponential backoff on disconnect.
 * Invalidates React Query caches when events arrive.
 *
 * Events sent while the socket was down are lost, so after a reconnect, or
 * when the page comes back from the background (sleep, mobile tab switch),
 * mail data is refetched. Coming back online or visible reconnects at once
 * instead of waiting out the backoff.
 */
export function useWebSocket(onEvent?: (event: MailEvent) => void) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const [failCount, setFailCount] = useState(0);
  const onEventRef = useRef(onEvent);
  // Sync ref on every render so the WebSocket handler always calls the latest
  // callback without restarting the connection (intentionally no dep array).
  useEffect(() => {
    onEventRef.current = onEvent;
  });
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const connectRef = useRef<(() => void) | null>(null);

  // Debounce WebSocket-driven cache invalidations (300ms quiet period).
  const pendingInvalidationsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleInvalidation = useCallback(
    (key: string) => {
      pendingInvalidationsRef.current.add(key);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        for (const k of pendingInvalidationsRef.current) {
          queryClient.invalidateQueries({ queryKey: k === "folders" ? ["folders"] : ["messages", k] });
        }
        pendingInvalidationsRef.current.clear();
        flushTimerRef.current = null;
      }, 300);
    },
    [queryClient],
  );

  useEffect(() => {
    mountedRef.current = true;
    // Set once a connection is lost; the next successful open refetches.
    let missedEvents = false;
    let hiddenSince: number | null = null;

    const refreshMail = () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["outbox"] });
    };

    const connect = () => {
      if (!mountedRef.current) return;

      setStatus("connecting");

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const ws = new WebSocket(`${protocol}//${window.location.host}${basePath}/api/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus("connected");
        setFailCount(0);
        backoffRef.current = 1000; // Reset backoff on successful connect
        if (missedEvents) {
          missedEvents = false;
          refreshMail();
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          const mailEvent = message.event;
          const accountId = message.accountId;

          const activeAccountId = useAuthStore.getState().activeAccountId;
          if (accountId !== activeAccountId) {
            return;
          }

          onEventRef.current?.(mailEvent);

          switch (mailEvent.type) {
            case "FolderStateChanged":
            case "NewMail":
              if (mailEvent.data?.folder) {
                scheduleInvalidation(mailEvent.data.folder);
              }
              scheduleInvalidation("folders");
              break;
            case "FlagsChanged":
              if (mailEvent.data?.folder) {
                scheduleInvalidation(mailEvent.data.folder);
              }
              scheduleInvalidation("folders");
              break;
            case "FolderUpdated":
              if (mailEvent.data?.folder) {
                scheduleInvalidation(mailEvent.data.folder);
              }
              scheduleInvalidation("folders");
              break;
            case "OutboxStateChanged":
              queryClient.invalidateQueries({ queryKey: ["outbox"] });
              break;
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current || wsRef.current !== ws) return;
        missedEvents = true;
        setStatus("disconnected");
        setFailCount((c) => c + 1);
        wsRef.current = null;

        // Reconnect with exponential backoff
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, 30000);
        reconnectTimerRef.current = setTimeout(() => connectRef.current?.(), delay);
      };

      ws.onerror = () => {
        // onclose will fire after onerror, which handles reconnection
      };
    };

    connectRef.current = connect;
    connect();

    // Skip the backoff wait when the page is usable again.
    const reconnectNow = () => {
      if (wsRef.current || !navigator.onLine) return;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      backoffRef.current = 1000;
      connect();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenSince = Date.now();
        return;
      }
      // An open socket can still have missed events while the page was
      // suspended, so refetch after a long absence either way.
      if (hiddenSince !== null && Date.now() - hiddenSince >= RESUME_REFRESH_AFTER_MS) {
        refreshMail();
      }
      hiddenSince = null;
      reconnectNow();
    };

    window.addEventListener("online", reconnectNow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("online", reconnectNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [queryClient, scheduleInvalidation]);

  return { status, failCount };
}
