import { toast } from "sonner";

import { useAuthStore } from "@/stores/useAuthStore";

const API_BASE = (process.env.NEXT_PUBLIC_BASE_PATH || "") + "/api";

interface ApiError {
  code?: string;
  message?: string;
  status?: number;
  accountId?: string;
}

interface ErrorResponse {
  error?: ApiError;
}

interface AccountsResponse {
  accounts: Array<{
    id: string;
    email: string;
    imapHost: string;
    smtpHost: string;
  }>;
  browserSessionExpired?: boolean;
}

function handleAccountSessionExpired(error: ApiError): void {
  if (error.code === "ACCOUNT_SESSION_EXPIRED" && error.accountId) {
    useAuthStore.getState().removeAccount(error.accountId);
    toast.error(error.message ?? "Account session expired");
    fetch(`${API_BASE}/auth/accounts/${error.accountId}`, {
      method: "DELETE",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
    }).catch(() => {});
  }
}

let checkingSession = false;

/**
 * Leave a page whose login is gone for the login page.
 *
 * The server keeps sessions in memory, so a restart (e.g. a deploy) ends
 * them all and every request then fails with 401: ACCOUNT_SESSION_EXPIRED
 * while the browser still sends its session cookies, UNAUTHORIZED once they
 * are gone. A 401 can also mean a wrong password (adding an account,
 * changing the password), and an expired account may leave others that
 * still work, so ask the server whether this browser still has a session
 * before leaving. The full page load also picks up a newly deployed frontend.
 *
 * `wasLoggedIn` is taken before `handleAccountSessionExpired` removes the
 * account: on the login page a 401 is a normal answer.
 */
function handleUnauthorized(status: number, wasLoggedIn: boolean): void {
  if (status !== 401 || !wasLoggedIn || checkingSession) return;
  checkingSession = true;
  fetchAccounts()
    .then((data) => {
      if (data.accounts.length === 0) {
        window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/`);
      }
    })
    .catch(() => {})
    .finally(() => {
      checkingSession = false;
    });
}

async function parseErrorResponse(res: Response): Promise<Error> {
  const data: ErrorResponse = await res.json();
  const error = data.error ?? {};
  const wasLoggedIn = useAuthStore.getState().accounts.length > 0;
  handleAccountSessionExpired(error);
  handleUnauthorized(res.status, wasLoggedIn);
  return new Error(error.message ?? "An unexpected error occurred");
}

function getActiveAccountHeader(): Record<string, string> {
  const activeId = useAuthStore.getState().activeAccountId;
  return activeId ? { "X-Active-Account": activeId } : {};
}

export async function fetchAccounts(): Promise<AccountsResponse> {
  const res = await fetch(`${API_BASE}/auth/accounts`, {
    credentials: "same-origin",
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  const data: AccountsResponse = await res.json();
  
  if (data.browserSessionExpired) {
    useAuthStore.getState().setAccounts([]);
  }
  
  return data;
}

export async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...getActiveAccountHeader(),
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...getActiveAccountHeader(),
    },
    credentials: "same-origin",
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  return res.json();
}

export async function apiPatch<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...getActiveAccountHeader(),
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  return res.json();
}

export async function apiPostFormData<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      ...getActiveAccountHeader(),
    },
    credentials: "same-origin",
    body: formData,
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  return res.json();
}

export async function apiPut<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...getActiveAccountHeader(),
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  return res.json();
}

/** Fetch a binary resource with auth headers and trigger a browser download. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      ...getActiveAccountHeader(),
    },
    credentials: "same-origin",
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function apiDelete<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...getActiveAccountHeader(),
    },
    credentials: "same-origin",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  return res.json();
}
