import { describe, it, expect } from 'vitest'
import { swipeReducer, captureStartsOn, initialSwipeState, REVEAL_WIDTH, type SwipeState, type SwipeAction } from '@/lib/gesture-swipe'

function run(actions: SwipeAction[], start: Partial<SwipeState> = {}): SwipeState {
  return actions.reduce((s, a) => swipeReducer(s, a), { ...initialSwipeState, ...start })
}

describe('swipeReducer', () => {
  it('keeps a sub-slop move a tap (no axis, no translate)', () => {
    const s = run([{ type: 'down', x: 100, y: 100 }, { type: 'move', x: 104, y: 103 }])
    expect(s.axis).toBeNull()
    expect(s.translateX).toBe(0)
  })

  it('locks horizontal on a leftward drag and tracks translateX', () => {
    const s = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 170, y: 104 }])
    expect(s.axis).toBe('x')
    expect(s.translateX).toBe(-30)
  })

  it('locks vertical and does not hijack scroll', () => {
    const s = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 204, y: 140 }])
    expect(s.axis).toBe('y')
    expect(s.translateX).toBe(0)
  })

  it('clamps the reveal to the button width (no overshoot)', () => {
    const s = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 20, y: 100 }])
    expect(s.translateX).toBe(-REVEAL_WIDTH)
  })

  it('does not slide right of rest when closed', () => {
    const s = run([{ type: 'down', x: 100, y: 100 }, { type: 'move', x: 150, y: 100 }])
    expect(s.axis).toBe('x')
    expect(s.translateX).toBe(0)
  })

  it('settles open when released past the ratio', () => {
    const s = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 140, y: 100 }, { type: 'up' }])
    expect(s.open).toBe(true)
    expect(s.translateX).toBe(-REVEAL_WIDTH)
  })

  it('settles closed when released before the ratio', () => {
    const s = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 180, y: 100 }, { type: 'up' }])
    expect(s.open).toBe(false)
    expect(s.translateX).toBe(0)
  })

  it('resumes from the open base on a second gesture', () => {
    const opened = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 130, y: 100 }, { type: 'up' }])
    expect(opened.open).toBe(true)
    const down = swipeReducer(opened, { type: 'down', x: 50, y: 100 })
    expect(down.baseX).toBe(-REVEAL_WIDTH)
    const moved = swipeReducer(down, { type: 'move', x: 70, y: 100 }) // dx=+20 from open base
    expect(moved.axis).toBe('x')
    expect(moved.translateX).toBe(-REVEAL_WIDTH + 20)
  })

  it('closes on a tap (no axis lock) while open', () => {
    const opened = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 130, y: 100 }, { type: 'up' }])
    const tapped = swipeReducer(swipeReducer(opened, { type: 'down', x: 50, y: 50 }), { type: 'up' })
    expect(tapped.open).toBe(false)
    expect(tapped.translateX).toBe(0)
  })

  it('reset returns to the closed initial state', () => {
    const opened = run([{ type: 'down', x: 200, y: 100 }, { type: 'move', x: 130, y: 100 }, { type: 'up' }])
    const reset = swipeReducer(opened, { type: 'reset' })
    expect(reset.open).toBe(false)
    expect(reset.translateX).toBe(0)
  })
})

// Chrome retargets the click that follows a pointer capture to the capturing
// element, so SwipeRow must only capture once a horizontal swipe has begun —
// never on the press itself, or every button inside the row stops working.
describe('captureStartsOn — pointer capture only when a horizontal swipe begins', () => {
  const down = { type: 'down', x: 200, y: 100 } as const

  it('never on a tap (press with no movement)', () => {
    const pressed = run([down])
    expect(captureStartsOn(initialSwipeState, pressed)).toBe(false)
    const released = swipeReducer(pressed, { type: 'up' })
    expect(captureStartsOn(pressed, released)).toBe(false)
  })

  it('never on a sub-slop wobble or a vertical scroll', () => {
    const pressed = run([down])
    const wobble = swipeReducer(pressed, { type: 'move', x: 204, y: 103 })
    expect(captureStartsOn(pressed, wobble)).toBe(false)
    const scroll = swipeReducer(pressed, { type: 'move', x: 203, y: 140 })
    expect(scroll.axis).toBe('y')
    expect(captureStartsOn(pressed, scroll)).toBe(false)
  })

  it('exactly once, on the move that locks the horizontal axis', () => {
    const pressed = run([down])
    const locked = swipeReducer(pressed, { type: 'move', x: 170, y: 104 })
    expect(locked.axis).toBe('x')
    expect(captureStartsOn(pressed, locked)).toBe(true)
    const further = swipeReducer(locked, { type: 'move', x: 140, y: 104 })
    expect(captureStartsOn(locked, further)).toBe(false)
  })
})
