import { Node, mergeAttributes } from "@tiptap/react";

/**
 * Keeps the automatic signature block (see `wrapSignatureHtml`) intact in the
 * editor. Without it the editor has no node for the wrapper div and drops it
 * on the first edit, after which switching identity or toggling the signature
 * can no longer find the old signature to replace or remove.
 */
export const SignatureNode = Node.create({
  name: "signature",
  group: "block",
  content: "block+",
  // Pasting or splitting inside the block must not create new signature blocks.
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-signature="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "email-signature", "data-signature": "true" }),
      0,
    ];
  },
});
