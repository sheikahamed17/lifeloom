import { z } from 'zod'

// Someone who can owe you money (a flatmate, a friend). Names are matched
// case-insensitively at capture time, like categories; archived people are
// hidden from pickers but kept so history still resolves.
export const PersonPayloadSchema = z.object({
  name: z.string().min(1).max(60),
  is_archived: z.literal(0).or(z.literal(1)).optional(),   // never null: NOT NULL DEFAULT 0 column
})

export type PersonPayload = z.infer<typeof PersonPayloadSchema>
