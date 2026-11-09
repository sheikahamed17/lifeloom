export const REVEAL_WIDTH = 88
export const SLOP = 8
export const OPEN_RATIO = 0.5

export type SwipeState = {
  startX: number
  startY: number
  baseX: number
  axis: 'x' | 'y' | null
  translateX: number
  open: boolean
}

export type SwipeAction =
  | { type: 'down'; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'up' }
  | { type: 'reset' }

export type SwipeConfig = { revealWidth: number }

export const initialSwipeState: SwipeState = {
  startX: 0, startY: 0, baseX: 0, axis: null, translateX: 0, open: false,
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * True on the move that locks the gesture to the horizontal axis — the one
 * moment SwipeRow should take pointer capture. Capturing any earlier (on
 * pointerdown) makes Chrome retarget the following `click` to the capturing
 * row, so taps on buttons inside the row never reach them.
 */
export function captureStartsOn(prev: SwipeState, next: SwipeState): boolean {
  return next.axis === 'x' && prev.axis !== 'x'
}

export function swipeReducer(
  state: SwipeState,
  action: SwipeAction,
  cfg: SwipeConfig = { revealWidth: REVEAL_WIDTH },
): SwipeState {
  const { revealWidth } = cfg
  switch (action.type) {
    case 'down': {
      const baseX = state.open ? -revealWidth : 0
      return { ...state, startX: action.x, startY: action.y, axis: null, baseX, translateX: baseX }
    }
    case 'move': {
      const dx = action.x - state.startX
      const dy = action.y - state.startY
      let axis = state.axis
      if (axis === null) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return state
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      if (axis === 'y') return { ...state, axis, translateX: state.baseX }
      return { ...state, axis, translateX: clamp(state.baseX + dx, -revealWidth, 0) }
    }
    case 'up': {
      if (state.axis === 'x') {
        const open = state.translateX <= -revealWidth * OPEN_RATIO
        return { ...state, axis: null, open, translateX: open ? -revealWidth : 0 }
      }
      if (state.open) return { ...state, axis: null, open: false, translateX: 0 }
      return { ...state, axis: null }
    }
    case 'reset':
      return initialSwipeState
    default:
      return state
  }
}
