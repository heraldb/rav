import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Folder, FolderId } from "@/types/folder";
import { useUiStore } from "@/stores/useUiStore";

const folder = (name: string): Folder => ({
  id: `id-${name}` as FolderId,
  name,
  delimiter: "/",
  attributes: [],
  is_subscribed: true,
  total_count: 0,
  unread_count: 0,
  recent_messages: [],
});

vi.mock("@/hooks/useFolders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useFolders")>()),
  useFolders: () => ({
    data: { folders: [folder("INBOX"), folder("Archive")] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useQuota", () => ({ useQuota: () => ({ data: undefined }) }));
vi.mock("@/hooks/useMessages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useMessages")>()),
  useMoveMessage: () => ({ mutate: vi.fn() }),
}));
// Panels around the folder list that need their own data.
vi.mock("@/components/accounts/AccountSwitcher", () => ({ AccountSwitcher: () => null }));
vi.mock("@/components/mail/TagSection", () => ({ TagSection: () => null }));
vi.mock("@/components/shared/OutboxFolderRow", () => ({ OutboxFolderRow: () => null }));

import { FolderTree } from "../FolderTree";

function renderTree() {
  const queryClient = new QueryClient();
  render(createElement(QueryClientProvider, { client: queryClient }, createElement(FolderTree)));
}

describe("FolderTree with an active search", () => {
  beforeEach(() => {
    useUiStore.setState({ activeFolder: "INBOX", searchQuery: "invoice", searchActive: true });
  });

  it("clears the search when a folder is picked", () => {
    renderTree();
    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));

    const state = useUiStore.getState();
    expect(state.activeFolder).toBe("Archive");
    expect(state.searchActive).toBe(false);
    expect(state.searchQuery).toBe("");
  });
});
