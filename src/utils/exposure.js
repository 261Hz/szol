/**
 * parseExposure — converts a flat story into a structured Exposure.
 *
 * Design constraint: one chunk per line at construction time.
 * This gives the Echo Engine stable, addressable anchors.
 * Over-splitting now = broken echo tracking forever.
 * Under-splitting now = refine later without breaking memory.
 */

// Sentence-boundary pattern: split AFTER terminal punctuation followed by whitespace.
// Covers Latin (.!?) and Arabic (؟), Devanagari (।), CJK (。！？).
const SENTENCE_END = /(?<=[.!?؟।。！？])\s+/

export function parseExposure(story) {
  const raw = (story.content ?? story.text ?? '').replace(/\s+/g, ' ').trim()

  const lines = raw
    .split(SENTENCE_END)
    .filter(s => s.trim().length > 2)     // skip trivial fragments
    .map((text, i) => ({
      id:    `${story.id}:L${i}`,
      order: i,
      chunks: [{
        text:        text.trim(),
        translation: null,
        note:        null,
        lemma:       null,
        root:        null,
        tags:        [],             // filled by buildEchoIndex
      }],
      audioSegmentId: `${story.id}:A${i}`,
    }))

  return {
    id:       story.id,
    language: story.lang,
    lines,
    audio:    story.audio ?? null,
    metadata: { difficulty: 0, themes: [] },
  }
}
