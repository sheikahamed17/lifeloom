"use client"

import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Below `lg` the dock and the capture field are fixed to the bottom edge; toasts clear both.
const DESKTOP = "(min-width: 1024px)"
const DOCK_OFFSET = "calc(9.75rem + env(safe-area-inset-bottom))"

function subscribe(cb: () => void) {
  const mq = window.matchMedia(DESKTOP)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}
const isDesktop = () => window.matchMedia(DESKTOP).matches

// Light-only app: the toaster never follows a system or theme switch.
const Toaster = ({ ...props }: ToasterProps) => {
  const desktop = useSyncExternalStore(subscribe, isDesktop, () => true)
  const offset = desktop ? 24 : DOCK_OFFSET

  return (
    <Sonner
      theme="light"
      position="bottom-center"
      offset={{ bottom: offset, left: 12, right: 12 }}
      mobileOffset={{ bottom: offset, left: 12, right: 12 }}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast glass! text-sm!",
          actionButton: "h-10! rounded-lg! bg-transparent! px-3! text-sm! font-semibold! text-foreground! underline! underline-offset-4! hover:bg-accent!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
