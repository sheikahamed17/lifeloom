/**
 * Chart color palette ("quiet ledger").
 * Charts are drawn in ink on the page ground; blue is the one second series.
 * There is no red/green pair anywhere: direction is carried by sign and position.
 * Categorical order is CVD-safe; never cycle or reorder.
 */

/** Single-series magnitude (sequential): ink */
export const SEQUENTIAL_HUE = '#10261F'

/** Tracks, gridlines and the neutral "Other" bucket */
export const TRACK_COLOR = '#E1E4DB'

/** Diverging pair: favourable change in ink, unfavourable change in the attention colour, neutral track */
export const DIVERGING = {
  positive: '#10261F', // ink
  negative: '#B93C0A', // attention: a change the wrong way
  neutral: TRACK_COLOR,
}

/** Series colors for dual-series charts (not in CATEGORICAL) */
export const SPEND_COLOR = '#10261F' // ink, the main series
export const INCOME_COLOR = '#1D5E8C' // blue, money coming in

/**
 * Categorical colors (fixed order, CVD-safe adjacent pairs).
 * Used in fixed index order for identity consistency: color follows the entity
 * (hash its name), never its rank. Labelled small multiples do not need these
 * and draw in ink; they are for charts where several categories share one plot.
 * Reference: dataviz palette.md 2026 eight-slot order.
 */
export const CATEGORICAL = [
  '#3987e5', // 1: blue
  '#d95926', // 2: orange
  '#199e70', // 3: aqua
  '#c98500', // 4: yellow
  '#d55181', // 5: magenta
  '#008300', // 6: green
  '#9085e9', // 7: violet
  '#e66767', // 8: red
]
