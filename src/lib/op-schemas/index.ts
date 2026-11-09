import type { z } from 'zod'
import { MoneyPayloadSchema } from './money'
import { RecurringPayloadSchema } from './recurring'
import { CategoryPayloadSchema } from './category'
import { TaskPayloadSchema } from './task'
import { InsightPayloadSchema } from './insight'
import { LearningPayloadSchema } from './learning'
import { NotePayloadSchema } from './note'
import { BudgetPayloadSchema } from './budget'
import { WidgetPayloadSchema } from './widget'
import { PersonPayloadSchema } from './person'
import { ExpenseSharePayloadSchema } from './expense-share'
import type { ENTITY_KINDS } from '@/types/ops'

export { MoneyPayloadSchema, RecurringPayloadSchema, CategoryPayloadSchema, TaskPayloadSchema, InsightPayloadSchema, LearningPayloadSchema, NotePayloadSchema, BudgetPayloadSchema, WidgetPayloadSchema, PersonPayloadSchema, ExpenseSharePayloadSchema }
export type { MoneyPayload } from './money'
export type { RecurringPayload } from './recurring'
export type { CategoryPayload } from './category'
export type { TaskPayload } from './task'
export type { InsightPayload } from './insight'
export type { LearningPayload } from './learning'
export type { NotePayload } from './note'
export type { BudgetPayload } from './budget'
export type { WidgetPayload } from './widget'
export type { PersonPayload } from './person'
export type { ExpenseSharePayload } from './expense-share'

type Kind = typeof ENTITY_KINDS[number]

export function getPayloadSchemaForKind(kind: Kind): z.ZodTypeAny | null {
  switch (kind) {
    case 'money':    return MoneyPayloadSchema
    case 'recurring':return RecurringPayloadSchema
    case 'category': return CategoryPayloadSchema
    case 'task':     return TaskPayloadSchema
    case 'insight':  return InsightPayloadSchema
    case 'learning': return LearningPayloadSchema
    case 'note':     return NotePayloadSchema
    case 'budget':   return BudgetPayloadSchema
    case 'widget':   return WidgetPayloadSchema
    case 'person':   return PersonPayloadSchema
    case 'expense_share': return ExpenseSharePayloadSchema
    default:         return null
  }
}
