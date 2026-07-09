import { describe, expect, it } from "vitest";
import { parsePoem, flattenStanzas, stanzaText } from "../src/lib/poem";

describe("parsePoem", () => {
  it("splits stanzas on blank lines", () => {
    const poem = "Le matin plie sa brume\ncomme un drap\n\net la table attend\nle premier café";
    expect(parsePoem(poem)).toEqual([
      ["Le matin plie sa brume", "comme un drap"],
      ["et la table attend", "le premier café"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parsePoem("a\r\nb\r\n\r\nc")).toEqual([["a", "b"], ["c"]]);
  });

  it("treats whitespace-only lines as stanza breaks", () => {
    expect(parsePoem("a\n   \nb")).toEqual([["a"], ["b"]]);
  });

  it("collapses multiple blank lines into a single break", () => {
    expect(parsePoem("a\n\n\n\nb")).toEqual([["a"], ["b"]]);
  });

  it("trims per-line whitespace", () => {
    expect(parsePoem("  a  \n\tb\t")).toEqual([["a", "b"]]);
  });

  it("returns [] for empty or whitespace input", () => {
    expect(parsePoem("")).toEqual([]);
    expect(parsePoem("  \n\n  ")).toEqual([]);
  });

  it("keeps accented Québécois French intact", () => {
    expect(parsePoem("À l'aube, j'écoute\n\nMême l'hiver s'étire")).toEqual([
      ["À l'aube, j'écoute"],
      ["Même l'hiver s'étire"],
    ]);
  });
});

describe("flattenStanzas", () => {
  it("assigns each line its stanza index", () => {
    expect(flattenStanzas([["a", "b"], ["c"]])).toEqual([
      { text: "a", stanzaIndex: 0 },
      { text: "b", stanzaIndex: 0 },
      { text: "c", stanzaIndex: 1 },
    ]);
  });

  it("is empty for no stanzas", () => {
    expect(flattenStanzas([])).toEqual([]);
  });
});

describe("stanzaText", () => {
  it("joins a stanza's lines with newlines", () => {
    expect(stanzaText([["a", "b"], ["c"]], 0)).toBe("a\nb");
  });

  it("is empty for an out-of-range index", () => {
    expect(stanzaText([["a"]], 3)).toBe("");
  });
});
