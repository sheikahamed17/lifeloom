import { describe, it, expect } from 'vitest'
import { pickDefaultAccountId, resolveDraftAccountId, defaultToggleUpdates, type DefaultableAccount } from './default-account'

const a = (over: Partial<DefaultableAccount> & { id: string }): DefaultableAccount => ({
  is_default: 0, is_archived: 0, deleted_at: null, updated_at: '2026-01-01T00:00:00Z', ...over,
})

describe('pickDefaultAccountId', () => {
  it('returns null when nothing is starred', () => {
    expect(pickDefaultAccountId([a({ id: 'x' }), a({ id: 'y', is_default: undefined })])).toBeNull()
  })

  it('returns the starred active account', () => {
    expect(pickDefaultAccountId([a({ id: 'x' }), a({ id: 'y', is_default: 1 })])).toBe('y')
  })

  it('ignores a starred account that is archived or deleted', () => {
    expect(pickDefaultAccountId([a({ id: 'x', is_default: 1, is_archived: 1 })])).toBeNull()
    expect(pickDefaultAccountId([a({ id: 'x', is_default: 1, deleted_at: '2026-02-01T00:00:00Z' })])).toBeNull()
  })

  it('picks the most recently updated when two devices both starred one', () => {
    expect(pickDefaultAccountId([
      a({ id: 'old', is_default: 1, updated_at: '2026-01-01T00:00:00Z' }),
      a({ id: 'new', is_default: 1, updated_at: '2026-03-01T00:00:00Z' }),
    ])).toBe('new')
  })

  it('prefers the later STAR (is_default HLC) over a later unrelated edit', () => {
    expect(pickDefaultAccountId([
      a({ id: 'starred-last', is_default: 1, updated_at: '2026-01-01T00:00:00Z', field_hlcs: { is_default: '0001761000000000-0000' } }),
      a({ id: 'edited-last', is_default: 1, updated_at: '2026-09-01T00:00:00Z', field_hlcs: { is_default: '0001750000000000-0000' } }),
    ])).toBe('starred-last')
  })
})

describe('resolveDraftAccountId', () => {
  it('pre-selects the default on a new entry with no account', () => {
    expect(resolveDraftAccountId({ draftAccountId: null, touched: false, isEdit: false, defaultId: 'd' })).toBe('d')
    expect(resolveDraftAccountId({ draftAccountId: undefined, touched: false, isEdit: false, defaultId: 'd' })).toBe('d')
  })

  it('keeps an account the draft already carries', () => {
    expect(resolveDraftAccountId({ draftAccountId: 'card', touched: false, isEdit: false, defaultId: 'd' })).toBe('card')
  })

  it('respects an explicit "No account" choice', () => {
    expect(resolveDraftAccountId({ draftAccountId: null, touched: true, isEdit: false, defaultId: 'd' })).toBeNull()
  })

  it('never applies the default when editing an existing entry', () => {
    expect(resolveDraftAccountId({ draftAccountId: null, touched: false, isEdit: true, defaultId: 'd' })).toBeNull()
  })

  it('is null when there is no default', () => {
    expect(resolveDraftAccountId({ draftAccountId: null, touched: false, isEdit: false, defaultId: null })).toBeNull()
  })
})

describe('defaultToggleUpdates', () => {
  it('starring one un-stars every other starred account', () => {
    const accounts = [a({ id: 'x', is_default: 1 }), a({ id: 'y' }), a({ id: 'z', is_default: 1, is_archived: 1 })]
    expect(defaultToggleUpdates(accounts, 'y')).toEqual([
      { id: 'y', is_default: 1 },
      { id: 'x', is_default: 0 },
      { id: 'z', is_default: 0 },
    ])
  })

  it('un-stars the account when it is already the default', () => {
    expect(defaultToggleUpdates([a({ id: 'x', is_default: 1 }), a({ id: 'y' })], 'x')).toEqual([{ id: 'x', is_default: 0 }])
  })

  it('after a two-device double-star, tapping the HIDDEN star makes it the default in one tap', () => {
    const accounts = [
      a({ id: 'old', is_default: 1, updated_at: '2026-01-01T00:00:00Z' }),
      a({ id: 'new', is_default: 1, updated_at: '2026-03-01T00:00:00Z' }),   // shown as default
    ]
    expect(defaultToggleUpdates(accounts, 'old')).toEqual([{ id: 'old', is_default: 1 }, { id: 'new', is_default: 0 }])
  })

  it('after a double-star, tapping the SHOWN default clears every star', () => {
    const accounts = [
      a({ id: 'old', is_default: 1, updated_at: '2026-01-01T00:00:00Z' }),
      a({ id: 'new', is_default: 1, updated_at: '2026-03-01T00:00:00Z' }),
    ]
    expect(defaultToggleUpdates(accounts, 'new')).toEqual([{ id: 'new', is_default: 0 }, { id: 'old', is_default: 0 }])
  })
})
