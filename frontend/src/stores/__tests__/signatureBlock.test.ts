import { describe, expect, it } from "vitest";

import {
  injectSignature,
  removeSignatureFromBody,
  replaceSignatureInBody,
} from "../useComposeStore";

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("signature block helpers", () => {
  it("leaves an empty line above the signature of an empty body", () => {
    expect(injectSignature("", "<p>Sig</p>")).toMatch(/^<p><\/p><div class="email-signature"/);
    expect(injectSignature("<p>Hi</p>", "<p>Sig</p>")).toMatch(/^<p>Hi<\/p><div/);
  });

  it("replaces a signature that contains its own divs completely", () => {
    const body = injectSignature("<p>Hi</p>", "<div><p>Jane</p></div><div>ACME Corp</div>");
    const replaced = replaceSignatureInBody(body, "<p>John</p>");

    expect(replaced).not.toContain("Jane");
    expect(replaced).not.toContain("ACME Corp");
    expect(count(replaced, "John")).toBe(1);
    expect(replaced).toContain("<p>Hi</p>");
  });

  it("removes a signature that contains its own divs completely", () => {
    const body = injectSignature("<p>Hi</p>", "<div><p>Jane</p></div><div>ACME Corp</div>");
    const removed = removeSignatureFromBody(body);

    expect(removed).toBe("<p>Hi</p>");
  });

  it("leaves signatures inside quoted text alone", () => {
    const quoted =
      '<blockquote><div class="email-signature" data-signature="true"><p>Their sig</p></div></blockquote>';
    const body = `<p>Hi</p>${quoted}`;

    expect(removeSignatureFromBody(body)).toBe(body);
    const replaced = replaceSignatureInBody(body, "<p>Mine</p>");
    expect(replaced).toContain("Their sig");
    expect(replaced.indexOf("Mine")).toBeLessThan(replaced.indexOf("<blockquote"));
  });

  it("does nothing when there is no signature to remove", () => {
    expect(removeSignatureFromBody("<p>Hi</p>")).toBe("<p>Hi</p>");
    expect(replaceSignatureInBody("<p>Hi</p>", "")).toBe("<p>Hi</p>");
  });
});
