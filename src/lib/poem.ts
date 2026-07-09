// Poem parsing: the pasted text is the source of truth. A blank line separates
// stanzas; leading/trailing whitespace per line is trimmed away.

export function parsePoem(raw: string): string[][] {
  return raw
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .filter((stanza) => stanza.length > 0);
}

/** Flat list of lines with the stanza each belongs to (alignment works per line). */
export function flattenStanzas(stanzas: string[][]): { text: string; stanzaIndex: number }[] {
  return stanzas.flatMap((stanza, stanzaIndex) => stanza.map((text) => ({ text, stanzaIndex })));
}

export function stanzaText(stanzas: string[][], index: number): string {
  return (stanzas[index] ?? []).join("\n");
}
