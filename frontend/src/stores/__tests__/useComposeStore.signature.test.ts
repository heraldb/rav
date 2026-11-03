import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { afterEach, describe, expect, it } from "vitest";

import { bodyHasContent, injectSignature } from "../useComposeStore";
import { stripHtml } from "@/components/mail/ComposeDialog/utils";

const SIGNATURE = '<p>Jane Doe</p><p><img src="https://example.com/logo.png"></p>';

// Same node types as RichTextEditor, so the body is rewritten the same way.
const editors: Editor[] = [];
function throughEditor(html: string, typed?: string): string {
  const editor = new Editor({
    extensions: [StarterKit, Image.configure({ inline: true })],
    content: html,
  });
  editors.push(editor);
  if (typed) {
    editor.commands.focus("end");
    editor.commands.insertContent(typed);
  }
  return editor.getHTML();
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe("bodyHasContent", () => {
  it("is false for an empty body", () => {
    expect(bodyHasContent("", SIGNATURE)).toBe(false);
    expect(bodyHasContent("<p></p>", "")).toBe(false);
  });

  it("ignores the injected signature on its own", () => {
    expect(bodyHasContent(injectSignature("", SIGNATURE), SIGNATURE)).toBe(false);
  });

  it("ignores the signature after the editor rewrote its markup", () => {
    const body = throughEditor(injectSignature("", SIGNATURE));
    expect(body).not.toContain("data-signature");
    expect(bodyHasContent(body, SIGNATURE)).toBe(false);
  });

  it("counts text typed before the signature", () => {
    expect(bodyHasContent(injectSignature("<p>Hi Bob</p>", SIGNATURE), SIGNATURE)).toBe(true);
  });

  it("counts text typed inside the signature block", () => {
    const body = throughEditor(injectSignature("", SIGNATURE), "see you");
    expect(bodyHasContent(body, SIGNATURE)).toBe(true);
  });

  it("counts an added image", () => {
    const body = injectSignature('<p><img src="https://example.com/photo.jpg"></p>', SIGNATURE);
    expect(bodyHasContent(body, SIGNATURE)).toBe(true);
  });

  it("counts an image-only body without a signature", () => {
    expect(bodyHasContent('<p><img src="https://example.com/photo.jpg"></p>', "")).toBe(true);
  });

  it("counts any text when there is no signature", () => {
    expect(bodyHasContent("<p>Hi</p>", "")).toBe(true);
  });

  it("handles plain-text bodies, where the signature has lost its images", () => {
    const body = stripHtml(injectSignature("", SIGNATURE));
    expect(bodyHasContent(body, SIGNATURE, false)).toBe(false);
    expect(bodyHasContent(`Hi Bob\n${body}`, SIGNATURE, false)).toBe(true);
    expect(bodyHasContent("a <b> c", "", false)).toBe(true);
  });
});
