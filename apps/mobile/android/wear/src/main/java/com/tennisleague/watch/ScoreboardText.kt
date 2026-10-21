package com.tennisleague.watch

import java.text.BreakIterator

/**
 * The scoreboard's name shortening, with no Android types, so it can be checked
 * on a plain JVM. MainActivity then fits the result to the tile's measured width,
 * which is what handles wide scripts, large font scales, and small watches.
 *
 * Everything here counts user-perceived characters (grapheme clusters), never
 * UTF-16 units: `String.take()` cut emoji and accented names in half and drew a
 * broken glyph on the tile.
 */
internal object ScoreboardText {
  /** At most this many characters for a singles name, before measuring. */
  const val SHORT_NAME_MAX = 9

  /** Each partner's share of a doubles side's "Ann/Bob" label. */
  const val DOUBLES_PART_MAX = 4

  const val ELLIPSIS = "…"

  private val WHITESPACE = Regex("\\s+")

  /**
   * A name that fits half a watch face and still tells two players apart:
   * "Chris Lee" → "Chris L", "Ann Smith / Bob Jones" → "Ann/Bob", and
   * "Bartholomew Lee" → "Bartholo…". A blank name reads as [fallback].
   */
  fun shortName(name: String, fallback: String): String {
    val people = name.split(" / ").map { it.trim() }.filter { it.isNotEmpty() }
    if (people.isEmpty()) return fallback
    if (people.size > 1) {
      return people.joinToString("/") { person -> take(firstWord(person), DOUBLES_PART_MAX) }
    }
    val parts = people.first().split(WHITESPACE)
    val first = parts.first()
    val initial = if (parts.size > 1) take(parts.last(), 1) else null
    val withInitial = if (initial != null) "$first $initial" else first
    if (length(withInitial) <= SHORT_NAME_MAX) return withInitial
    return truncate(first, SHORT_NAME_MAX)
  }

  /** [text] cut to [max] characters, the last of them an ellipsis when anything was cut. */
  fun truncate(text: String, max: Int): String {
    if (length(text) <= max) return text
    return take(text, (max - 1).coerceAtLeast(1)) + ELLIPSIS
  }

  /** The number of user-perceived characters in [text]. */
  fun length(text: String): Int {
    val iterator = characters(text)
    var count = 0
    while (iterator.next() != BreakIterator.DONE) count += 1
    return count
  }

  /** The first [count] user-perceived characters of [text]. */
  fun take(text: String, count: Int): String {
    if (count <= 0) return ""
    val iterator = characters(text)
    var end = 0
    repeat(count) {
      val next = iterator.next()
      if (next == BreakIterator.DONE) return text
      end = next
    }
    return text.substring(0, end)
  }

  private fun firstWord(text: String): String = text.split(WHITESPACE).first()

  private fun characters(text: String): BreakIterator =
    BreakIterator.getCharacterInstance().apply { setText(text) }
}
