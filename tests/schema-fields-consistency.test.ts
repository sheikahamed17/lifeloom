import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { getPayloadSchemaForKind } from '@/lib/op-schemas'
import { InsightPayloadObject } from '@/lib/op-schemas/insight'
import { RecurringPayloadObject } from '@/lib/op-schemas/recurring'
import {
  MONEY_FIELDS,
  RECURRING_FIELDS,
  CATEGORY_FIELDS,
  TASK_FIELDS,
  INSIGHT_FIELDS,
  PERSON_FIELDS,
  EXPENSE_SHARE_FIELDS,
} from '@/lib/entity-fields'

type ZodObjectShape = Record<string, z.ZodTypeAny>

describe('Schema-keys ⊆ FIELDS consistency', () => {
  it('MONEY_FIELDS includes all MoneyPayloadSchema keys', () => {
    const schema = getPayloadSchemaForKind('money')
    if (!schema) throw new Error('money schema not found')
    const schemaObj = schema as z.ZodObject<ZodObjectShape>
    const keys = Object.keys(schemaObj.shape)
    const fieldsSet = new Set(MONEY_FIELDS as readonly string[])
    for (const key of keys) {
      expect(fieldsSet.has(key)).toBe(true)
    }
  })

  it('RECURRING_FIELDS includes all RecurringPayloadSchema keys', () => {
    const keys = Object.keys(RecurringPayloadObject.shape)
    const fieldsSet = new Set(RECURRING_FIELDS as readonly string[])
    for (const key of keys) {
      expect(fieldsSet.has(key)).toBe(true)
    }
  })

  it('CATEGORY_FIELDS includes all CategoryPayloadSchema keys', () => {
    const schema = getPayloadSchemaForKind('category')
    if (!schema) throw new Error('category schema not found')
    const schemaObj = schema as z.ZodObject<ZodObjectShape>
    const keys = Object.keys(schemaObj.shape)
    const fieldsSet = new Set(CATEGORY_FIELDS as readonly string[])
    for (const key of keys) {
      expect(fieldsSet.has(key)).toBe(true)
    }
  })

  it('TASK_FIELDS includes all TaskPayloadSchema keys', () => {
    const schema = getPayloadSchemaForKind('task')
    if (!schema) throw new Error('task schema not found')
    const schemaObj = schema as z.ZodObject<ZodObjectShape>
    const keys = Object.keys(schemaObj.shape)
    const fieldsSet = new Set(TASK_FIELDS as readonly string[])
    for (const key of keys) {
      expect(fieldsSet.has(key)).toBe(true)
    }
  })

  it('INSIGHT_FIELDS includes all InsightPayloadSchema keys', () => {
    const keys = Object.keys(InsightPayloadObject.shape)
    const fieldsSet = new Set(INSIGHT_FIELDS as readonly string[])
    for (const key of keys) {
      expect(fieldsSet.has(key)).toBe(true)
    }
  })

  // Bidirectional checks: FIELDS ⊆ schema (not just schema keys ⊆ FIELDS)
  it('All MONEY_FIELDS are present in MoneyPayloadSchema (bidirectional)', () => {
    const schema = getPayloadSchemaForKind('money')
    if (!schema) throw new Error('money schema not found')
    const schemaObj = schema as z.ZodObject<ZodObjectShape>
    const schemaKeys = new Set(Object.keys(schemaObj.shape))
    for (const field of MONEY_FIELDS) {
      expect(schemaKeys.has(field as string)).toBe(true)
    }
  })

  it('All RECURRING_FIELDS are present in RecurringPayloadSchema (bidirectional)', () => {
    const schemaKeys = new Set(Object.keys(RecurringPayloadObject.shape))
    for (const field of RECURRING_FIELDS) {
      expect(schemaKeys.has(field as string)).toBe(true)
    }
  })

  it('All CATEGORY_FIELDS are present in CategoryPayloadSchema (bidirectional)', () => {
    const schema = getPayloadSchemaForKind('category')
    if (!schema) throw new Error('category schema not found')
    const schemaObj = schema as z.ZodObject<ZodObjectShape>
    const schemaKeys = new Set(Object.keys(schemaObj.shape))
    for (const field of CATEGORY_FIELDS) {
      expect(schemaKeys.has(field as string)).toBe(true)
    }
  })

  it('All TASK_FIELDS are present in TaskPayloadSchema (bidirectional)', () => {
    const schema = getPayloadSchemaForKind('task')
    if (!schema) throw new Error('task schema not found')
    const schemaObj = schema as z.ZodObject<ZodObjectShape>
    const schemaKeys = new Set(Object.keys(schemaObj.shape))
    for (const field of TASK_FIELDS) {
      expect(schemaKeys.has(field as string)).toBe(true)
    }
  })

  it('All INSIGHT_FIELDS are present in InsightPayloadSchema (bidirectional)', () => {
    const schemaKeys = new Set(Object.keys(InsightPayloadObject.shape))
    for (const field of INSIGHT_FIELDS) {
      expect(schemaKeys.has(field as string)).toBe(true)
    }
  })

  for (const [kind, FIELDS] of [['person', PERSON_FIELDS], ['expense_share', EXPENSE_SHARE_FIELDS]] as const) {
    it(`${kind}: schema keys and FIELDS match in both directions`, () => {
      const schema = getPayloadSchemaForKind(kind)
      if (!schema) throw new Error(`${kind} schema not found`)
      const schemaKeys = Object.keys((schema as z.ZodObject<ZodObjectShape>).shape)
      expect(new Set(schemaKeys)).toEqual(new Set(FIELDS as readonly string[]))
    })
  }
})
