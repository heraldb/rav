"use client";

import { create } from "zustand";
import { useUiStore } from "@/stores/useUiStore";

export interface ReplyParams {
  to: string;
  cc: string;
  subject: string;
  /** The editable body - should be empty or just cursor position for a fresh reply. */
  body: string;
  /** The quoted original message HTML, shown collapsed in the compose UI. */
  quotedHtml?: string | null;
  /** The quoted original message plain text, used when sending in plain text mode. */
  quotedText?: string | null;
  inReplyTo: string | null;
  references: string | null;
  fromIdentityId?: number | null;
  isHtml?: boolean;
}

export interface ForwardParams {
  subject: string;
  body: string;
  isHtml?: boolean;
}

export interface DraftResumeParams {
  id: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
  references: string | null;
  attachments: ComposeAttachment[];
  isHtml?: boolean;
  /** Reconstructed quoted HTML from the original message, if available. */
  quotedHtml?: string | null;
  /** Reconstructed quoted plain text from the original message, if available. */
  quotedText?: string | null;
}

export interface ComposeAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
}

interface ComposeState {
  isOpen: boolean;
  /** Tracks whether this is a new message, reply, or forward - used for dialog title. */
  mode: "new" | "reply" | "forward";
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  /** Quoted original message HTML for replies, shown collapsed below the editor. Null for new messages and forwards. */
  quotedHtml: string | null;
  /** Quoted original message plain text for replies, appended when sending in plain text mode. */
  quotedText: string | null;
  inReplyTo: string | null;
  references: string | null;
  draftId: string | null;
  showCc: boolean;
  showBcc: boolean;
  attachments: ComposeAttachment[];
  fromIdentityId: number | null;
  isHtml: boolean;
  signatureHtml: string;
  signatureEnabled: boolean;
  pgpMode: 'off' | 'sign' | 'encrypt';

  openCompose: () => void;
  openReply: (params: ReplyParams) => void;
  openForward: (params: ForwardParams) => void;
  openDraft: (params: DraftResumeParams) => void;
  closeCompose: () => void;
  setField: (field: "to" | "cc" | "bcc" | "subject" | "body", value: string) => void;
  setShowCc: (show: boolean) => void;
  setShowBcc: (show: boolean) => void;
  setDraftId: (id: string) => void;
  setFromIdentityId: (id: number | null) => void;
  setIsHtml: (v: boolean) => void;
  setSignatureHtml: (html: string) => void;
  setSignatureEnabled: (enabled: boolean) => void;
  setPgpMode: (mode: 'off' | 'sign' | 'encrypt') => void;
  addAttachments: (atts: ComposeAttachment[]) => void;
  removeAttachment: (id: string) => void;
  reset: () => void;
}

/** Wraps signature HTML in the standard signature block marker. */
export function wrapSignatureHtml(signatureHtml: string): string {
  if (!signatureHtml) return "";
  return `<div class="email-signature" data-signature="true"><p>-- </p>${signatureHtml}</div>`;
}

/** Injects a signature block into body HTML, before any quoted content or at the end. */
export function injectSignature(body: string, signatureHtml: string): string {
  const sigBlock = wrapSignatureHtml(signatureHtml);
  if (!sigBlock) return body;

  // Leave an empty line above the signature to type in; otherwise the
  // cursor starts inside the signature block.
  if (!body.trim()) body = "<p></p>";

  // Try to insert before blockquote (quoted reply/forward content)
  const bqIndex = body.indexOf("<blockquote");
  if (bqIndex !== -1) {
    return body.slice(0, bqIndex) + sigBlock + body.slice(bqIndex);
  }
  return body + sigBlock;
}

/** The signature block of the body, ignoring signatures in quoted content. */
function findSignature(doc: Document): Element | null {
  const blocks = Array.from(doc.querySelectorAll('[data-signature="true"]'));
  return blocks.find((block) => !block.closest("blockquote")) ?? null;
}

/** Replaces or removes the signature block in the body HTML. */
export function replaceSignatureInBody(body: string, newSignatureHtml: string): string {
  const doc = new DOMParser().parseFromString(body, "text/html");
  const existing = findSignature(doc);

  // No existing signature — inject if we have one
  if (!existing) {
    return newSignatureHtml ? injectSignature(body, newSignatureHtml) : body;
  }

  if (newSignatureHtml) {
    existing.outerHTML = wrapSignatureHtml(newSignatureHtml);
  } else {
    existing.remove();
  }
  return doc.body.innerHTML;
}

/** Removes the signature block from the body HTML. */
export function removeSignatureFromBody(body: string): string {
  return replaceSignatureInBody(body, "");
}

/** Visible text (without whitespace) and image sources of an HTML fragment. */
function visibleContent(html: string): { text: string; images: string } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return {
    text: (doc.body.textContent ?? "").replace(/\s+/g, ""),
    images: Array.from(doc.body.querySelectorAll("img"), (img) => img.getAttribute("src") ?? "").join("\n"),
  };
}

/**
 * Whether the body holds anything beyond the automatic signature.
 *
 * The editor rewrites the injected signature markup (it drops the
 * delimiter's trailing space, for one), so this compares visible text and
 * images rather than markup. Any change to the signature's text counts as content.
 * A plain-text body is the signature's text without its images.
 */
export function bodyHasContent(body: string, signatureHtml: string, isHtml = true): boolean {
  const content = isHtml ? visibleContent(body) : { text: body.replace(/\s+/g, ""), images: "" };
  if (!content.text && !content.images) return false;
  if (!signatureHtml) return true;
  const signature = visibleContent(wrapSignatureHtml(signatureHtml));
  if (!isHtml) return content.text !== signature.text;
  return content.text !== signature.text || content.images !== signature.images;
}

const initialState = {
  isOpen: false,
  mode: "new" as "new" | "reply" | "forward",
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
  quotedHtml: null as string | null,
  quotedText: null as string | null,
  inReplyTo: null as string | null,
  references: null as string | null,
  draftId: null as string | null,
  showCc: false,
  showBcc: false,
  attachments: [] as ComposeAttachment[],
  fromIdentityId: null as number | null,
  isHtml: true,
  signatureHtml: "",
  signatureEnabled: true,
  pgpMode: 'off' as 'off' | 'sign' | 'encrypt',
};

export const useComposeStore = create<ComposeState>((set) => ({
  ...initialState,

  openCompose: () => set({
    ...initialState,
    isOpen: true,
    mode: "new",
    isHtml: useUiStore.getState().composeFormat !== "text",
  }),

  openReply: (params) =>
    set({
      ...initialState,
      isOpen: true,
      mode: "reply",
      to: params.to,
      cc: params.cc,
      subject: params.subject,
      body: params.body,
      quotedHtml: params.quotedHtml ?? null,
      quotedText: params.quotedText ?? null,
      inReplyTo: params.inReplyTo,
      references: params.references,
      showCc: params.cc.length > 0,
      fromIdentityId: params.fromIdentityId ?? null,
      isHtml: params.isHtml ?? true,
    }),

  openForward: (params) =>
    set({
      ...initialState,
      isOpen: true,
      mode: "forward",
      subject: params.subject,
      body: params.body,
      isHtml: params.isHtml ?? true,
    }),

  openDraft: (params) =>
    set({
      ...initialState,
      isOpen: true,
      draftId: params.id,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      body: params.body,
      inReplyTo: params.inReplyTo,
      references: params.references,
      showCc: params.cc.length > 0,
      showBcc: params.bcc.length > 0,
      attachments: params.attachments,
      isHtml: params.isHtml ?? true,
      quotedHtml: params.quotedHtml ?? null,
      quotedText: params.quotedText ?? null,
      mode: params.inReplyTo ? "reply" : "new",
    }),

  closeCompose: () => set({ isOpen: false }),

  setField: (field, value) => set({ [field]: value }),

  setShowCc: (show) => set({ showCc: show }),
  setShowBcc: (show) => set({ showBcc: show }),

  setDraftId: (id) => set({ draftId: id }),

  setFromIdentityId: (id) => set({ fromIdentityId: id }),

  setIsHtml: (v) => set({ isHtml: v }),

  setSignatureHtml: (html) => set({ signatureHtml: html }),

  setSignatureEnabled: (enabled) => set({ signatureEnabled: enabled }),

  setPgpMode: (mode) => set({ pgpMode: mode }),

  addAttachments: (atts) =>
    set((state) => ({ attachments: [...state.attachments, ...atts] })),

  removeAttachment: (id) =>
    set((state) => ({
      attachments: state.attachments.filter((a) => a.id !== id),
    })),

  reset: () => set(initialState),
}));
