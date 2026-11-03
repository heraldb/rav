import { act, render } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/react";

import { RichTextEditor } from "../RichTextEditor";
import {
  injectSignature,
  removeSignatureFromBody,
  replaceSignatureInBody,
} from "@/stores/useComposeStore";

const ALPHA = "<p>Signature Alpha</p>";
const BRAVO = "<p>Signature Bravo</p>";

// jsdom has no layout; ProseMirror asks for rects when scrolling the cursor into view.
beforeAll(() => {
  const noRects = () => [] as unknown as DOMRectList;
  const emptyRect = () => new DOMRect();
  Range.prototype.getClientRects = noRects;
  Range.prototype.getBoundingClientRect = emptyRect;
  Element.prototype.getClientRects = noRects;
});

/** Holds the body like ComposeDialog does: editor changes flow back into it. */
function renderCompose(initialBody: string) {
  const state: { body: string; setBody: (body: string) => void } = {
    body: initialBody,
    setBody: () => {},
  };
  function Harness() {
    const [body, setBody] = useState(initialBody);
    state.body = body;
    state.setBody = setBody;
    return <RichTextEditor content={body} onChange={setBody} />;
  }
  render(<Harness />);
  const editor = () =>
    (document.querySelector(".ProseMirror") as unknown as { editor: Editor }).editor;
  return {
    get body() {
      return state.body;
    },
    async type(text: string) {
      await act(async () => {
        editor().chain().focus("start").insertContent(text).run();
      });
    },
    async update(change: (body: string) => string) {
      await act(async () => state.setBody(change(state.body)));
    },
    html: () => editor().getHTML(),
  };
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("signature in the editor", () => {
  it("keeps the signature block after typing", async () => {
    const compose = renderCompose(injectSignature("", ALPHA));
    await compose.type("Hello");

    expect(compose.body).toContain('data-signature="true"');
    expect(compose.body).toContain("Signature Alpha");
  });

  it("starts a new message above the signature, not inside it", async () => {
    const compose = renderCompose(injectSignature("", ALPHA));
    await compose.type("Hello");

    const doc = new DOMParser().parseFromString(compose.body, "text/html");
    expect(doc.body.firstElementChild?.outerHTML).toBe("<p>Hello</p>");
    expect(doc.querySelector('[data-signature="true"]')?.textContent).not.toContain("Hello");
  });

  it("replaces the signature when switching identity after typing", async () => {
    const compose = renderCompose(injectSignature("", ALPHA));
    await compose.type("Hello");
    await compose.update((body) => replaceSignatureInBody(body, BRAVO));

    const html = compose.html();
    expect(html).not.toContain("Signature Alpha");
    expect(count(html, "Signature Bravo")).toBe(1);
    expect(count(html, "Hello")).toBe(1);
  });

  it("removes the signature when it is turned off after typing", async () => {
    const compose = renderCompose(injectSignature("", ALPHA));
    await compose.type("Hello");
    await compose.update(removeSignatureFromBody);

    const html = compose.html();
    expect(html).not.toContain("Signature Alpha");
    expect(html).not.toContain("data-signature");
    expect(html).toContain("Hello");
  });

  it("does not stack signatures when toggling off and on again", async () => {
    const compose = renderCompose(injectSignature("", ALPHA));
    await compose.type("Hello");
    await compose.update(removeSignatureFromBody);
    await compose.update((body) => injectSignature(removeSignatureFromBody(body), ALPHA));
    await compose.update(removeSignatureFromBody);
    await compose.update((body) => injectSignature(removeSignatureFromBody(body), ALPHA));

    expect(count(compose.html(), "Signature Alpha")).toBe(1);
  });
});
