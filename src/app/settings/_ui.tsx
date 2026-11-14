'use client'

import type { ReactNode } from 'react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

/** NativeSelect wrapper classes: full width; the white borderless 48px field, 16px text on phones. */
export const SELECT_CLASS = 'w-full [&_select]:h-12 [&_select]:rounded-[14px] [&_select]:text-base md:[&_select]:text-sm'

/** Label above a field (use on the shadcn `Label`). */
export const LABEL_CLASS = 'text-[13px] font-semibold text-muted-foreground'

/** One ruled row in a settings list: put it on each `<li>` of a `<ul>`. */
export const ROW_CLASS = 'flex min-h-[60px] items-center gap-3 border-b border-border py-2'

/** The small muted count or note on the right of a section heading. */
export const COUNT_CLASS = 'text-[13px] font-normal text-muted-foreground'

/** A visible label above one field, with an optional muted hint below it. */
export function FormField({
  label, htmlFor, hint, className, children,
}: { label: ReactNode; htmlFor: string; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} className={LABEL_CLASS}>{label}</Label>
      {children}
      {hint && <p className="pt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * A titled settings section: a flat section on the page ground with a ruled heading
 * and stacked content. `icon` is accepted so call sites keep compiling, but it is not
 * drawn: headings in this design are plain text (15 Nov 2026).
 */
export function SettingsCard({
  title, icon: _icon, action, children, className, contentClassName, ...rest
}: {
  title?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
} & Omit<React.ComponentProps<'div'>, 'title' | 'children' | 'className'>) {
  void _icon
  return (
    <Card className={className} {...rest}>
      {title && (
        <CardHeader>
          <CardTitle>
            <h2>{title}</h2>
          </CardTitle>
          {action && <CardAction className="self-end">{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn('flex flex-col gap-4', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

/** The "Archived (n)" disclosure: a quiet ruled row that opens the restore list (children). */
export function ArchivedCollapsible({ count, children }: { count: number; children: ReactNode }) {
  return (
    <Collapsible className="flex flex-col border-t border-border">
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            className="h-13 w-full justify-between rounded-none border-b border-b-border px-0 text-[15px] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground [&[data-panel-open]>svg]:rotate-180"
          />
        }
      >
        <span>Archived ({count})</span>
        <ChevronDown className="size-4 transition-transform" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
