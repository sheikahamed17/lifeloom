/**
 * A filter item as quiet text: muted when off, ink with an ink underline when on.
 * Shared by every `ToggleGroup` that narrows one list (task state, tags, projects, periods).
 */
export const QUIET_TOGGLE =
  'h-11 min-w-0 rounded-none border-b-2 border-transparent bg-transparent px-0 text-sm font-medium text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-transparent aria-pressed:font-bold aria-pressed:text-foreground lg:text-[15px]'
