'use client'

import { useEffect, useReducer, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { swipeReducer, captureStartsOn, initialSwipeState, REVEAL_WIDTH, type SwipeState, type SwipeAction } from '@/lib/gesture-swipe'

const LONG_PRESS_MS = 500

type SwipeRowProps = {
  onDelete: () => void
  /** A plain tap on the row (not on a control inside it): opens the editor. */
  onTap?: () => void
  /** Touch shortcut to the row menu. The visible menu button is the keyboard path. */
  onLongPress?: () => void
  deleteLabel: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  className?: string
  children: React.ReactNode
}

export function SwipeRow({ onDelete, onTap, onLongPress, deleteLabel, isOpen, onOpenChange, className, children }: SwipeRowProps) {
  const [state, dispatch] = useReducer(
    (s: SwipeState, a: SwipeAction) => swipeReducer(s, a),
    initialSwipeState,
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const downRef = useRef(false)
  const consumedRef = useRef(false)
  const longPressedRef = useRef(false)

  function clearTimer() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  // Parent closed this row (another row opened) → reset without reporting back.
  useEffect(() => {
    if (!isOpen && state.open) dispatch({ type: 'reset' })
  }, [isOpen, state.open])

  // Clean up a pending long-press timer on unmount.
  useEffect(() => () => clearTimer(), [])

  function handleDown(e: React.PointerEvent) {
    downRef.current = true
    consumedRef.current = false
    longPressedRef.current = false
    // Do NOT capture the pointer here. Chrome retargets the `click` that
    // follows a capture to the capturing element, so capturing on every press
    // made every button inside the row (Set category, Delete, receipt…) dead
    // to mouse clicks. Capture starts in handleMove once a horizontal swipe
    // is under way — the only time we need move events from outside the row.
    dispatch({ type: 'down', x: e.clientX, y: e.clientY })
    if (onLongPress) {
      clearTimer()
      timerRef.current = setTimeout(() => { clearTimer(); longPressedRef.current = true; onLongPress() }, LONG_PRESS_MS)
    }
  }

  function handleMove(e: React.PointerEvent) {
    if (!downRef.current) return
    const next = swipeReducer(state, { type: 'move', x: e.clientX, y: e.clientY })
    if (next.axis !== null) clearTimer()  // any directional lock cancels long-press
    if (captureStartsOn(state, next)) {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* capture unsupported */ }
    }
    dispatch({ type: 'move', x: e.clientX, y: e.clientY })
  }

  function handleUp() {
    if (!downRef.current) return
    downRef.current = false
    clearTimer()
    const next = swipeReducer(state, { type: 'up' })
    // Suppress the trailing click when the gesture swiped or closed-on-tap,
    // so a settle/close never also fires an inner button (complete, receipt…).
    // A long-press already opened the menu: its trailing click must not also edit.
    consumedRef.current = state.axis === 'x' || (state.open && !next.open) || longPressedRef.current
    dispatch({ type: 'up' })
    if (next.open !== state.open) onOpenChange(next.open)
  }

  // Taps on a control inside the row (category pill, receipt, share link, menu)
  // belong to that control; only a tap on the row's own surface edits.
  function handleClick(e: React.MouseEvent) {
    if (!onTap) return
    const control = (e.target as HTMLElement).closest('button, a, input, select, textarea, label, [role="menuitem"]')
    if (control && e.currentTarget.contains(control)) return
    onTap()
  }

  return (
    <div className="relative overflow-hidden rounded-2xl focus-within:ring-2 focus-within:ring-accent-2">
      {state.translateX < 0 && (
        <button
          type="button"
          aria-label={deleteLabel}
          tabIndex={isOpen ? 0 : -1}
          onClick={onDelete}
          style={{ width: REVEAL_WIDTH }}
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive text-white focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
        >
          <Trash2 className="h-5 w-5" aria-hidden />
        </button>
      )}
      <div
        onClick={handleClick}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onClickCapture={e => { if (consumedRef.current) { e.stopPropagation(); e.preventDefault(); consumedRef.current = false } }}
        style={{ transform: `translateX(${state.translateX}px)` }}
        className={cn(
          className,
          // The focus ring lives on the container (focus-within) so overflow-hidden
          // does not clip this layer's box-shadow ring.
          'relative touch-pan-y outline-none',
          onTap && 'cursor-pointer',
          state.axis === 'x' ? '' : 'transition-transform duration-200 motion-reduce:transition-none',
        )}
      >
        {children}
      </div>
    </div>
  )
}
