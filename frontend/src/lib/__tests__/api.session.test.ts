import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiGet, apiPost } from "../api";
import { useAuthStore } from "@/stores/useAuthStore";

const ACCOUNT = { id: "acc-1", email: "jane@example.com", imapHost: "imap", smtpHost: "smtp" };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const unauthorized = (message: string) =>
  json(401, { error: { code: "UNAUTHORIZED", message, status: 401 } });

/** Answer API calls by path; /auth/accounts with the given account list. */
function stubServer(accounts: unknown[], answer: (path: string) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.endsWith("/api/auth/accounts")) {
      return json(200, accounts.length ? { accounts } : { accounts: [], browserSessionExpired: true });
    }
    return answer(path);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const accountChecks = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/auth/accounts")).length;

let assign: ReturnType<typeof vi.fn>;
const originalLocation = window.location;

beforeEach(() => {
  assign = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, assign } });
  useAuthStore.setState({ accounts: [ACCOUNT], activeAccountId: ACCOUNT.id });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  vi.unstubAllGlobals();
});

describe("401 handling", () => {
  it("goes to the login page when the server no longer knows the session", async () => {
    stubServer([], () => unauthorized("Invalid or expired session"));

    await expect(apiGet("/folders")).rejects.toThrow("Invalid or expired session");
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("stays put on a wrong password while the session is still valid", async () => {
    const fetchMock = stubServer([ACCOUNT], () => unauthorized("Invalid credentials"));

    await expect(apiPost("/auth/login", { email: "other@example.com" })).rejects.toThrow("Invalid credentials");
    await vi.waitFor(() => expect(accountChecks(fetchMock)).toBe(1));
    expect(assign).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accounts).toEqual([ACCOUNT]);
  });

  it("leaves 401s on the login page alone", async () => {
    useAuthStore.setState({ accounts: [], activeAccountId: null });
    const fetchMock = stubServer([], () => unauthorized("Invalid credentials"));

    await expect(apiPost("/auth/login", {})).rejects.toThrow();
    expect(accountChecks(fetchMock)).toBe(0);
    expect(assign).not.toHaveBeenCalled();
  });

  it("checks the session once for a burst of failing requests", async () => {
    const fetchMock = stubServer([], () => unauthorized("Invalid or expired session"));

    await Promise.allSettled([apiGet("/folders"), apiGet("/messages"), apiGet("/quota")]);
    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(accountChecks(fetchMock)).toBe(1);
  });
});
