/**
 * Chart color palette.
 * Validated against the dataviz reference palette on the light surface (white background).
 * Categorical order is CVD-safe; never cycle or reorder.
 */

/** Single-series magnitude (sequential): the app accent blue (5:1 on white) */
export const SEQUENTIAL_HUE = 'rgb(37 99 235)'

/** Diverging pair: positive/income, negative/spend, neutral */
export const DIVERGING = {
  positive: '#0ca30c', // success/income
  negative: '#e66767', // spend/critical
  neutral: '#d4d4d8', // gray midpoint
}

/** Series colors for dual-series charts (not in CATEGORICAL, reserved for small multiples) */
export const SPEND_COLOR = '#e66767' // critical red, matches DIVERGING.negative
export const INCOME_COLOR = '#0891b2' // cyan, distinct from spend and CATEGORICAL hues

/**
 * Categorical colors (fixed order, CVD-safe adjacent pairs).
 * Used in fixed index order for identity consistency.
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
