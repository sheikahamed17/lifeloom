'use client'

import type { ReactNode } from 'react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

/** NativeSelect wrapper classes: full width, 40px touch target, 16px text on phones. */
export const SELECT_CLASS = 'w-full [&_select]:h-10 [&_select]:text-base md:[&_select]:text-sm [&_select]:glass-soft'

/** A titled settings section: Card + header (optional icon and action) + stacked content. */
export function SettingsCard({
  title, icon, action, children, className, contentClassName, ...rest
}: {
  title?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
} & Omit<React.ComponentProps<'div'>, 'title' | 'children' | 'className'>) {
  return (
    <Card className={className} {...rest}>
      {title && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            {icon}
            <h2>{title}</h2>
          </CardTitle>
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn('flex flex-col gap-3', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

/** The "Archived (n)" disclosure: a Card holding a Collapsible; children is the restore list. */
export function ArchivedCollapsible({ count, children }: { count: number; children: ReactNode }) {
  return (
    <Card>
      <Collapsible className="flex flex-col gap-2">
        <CardContent>
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                className="-mx-2 h-11 w-[calc(100%+1rem)] justify-between px-2 text-sm font-semibold text-muted-foreground hover:text-foreground [&[data-panel-open]>svg]:rotate-180"
              />
            }
          >
            <span>Archived ({count})</span>
            <ChevronDown className="size-4 transition-transform" aria-hidden />
          </CollapsibleTrigger>
        </CardContent>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
