import Image from "next/image"
import { cn } from "@/lib/utils"

type PresentonikaBrandProps = {
  className?: string
  compact?: boolean
}

export default function PresentonikaBrand({ className, compact = false }: PresentonikaBrandProps) {
  return (
    <div className={cn("flex min-w-0 items-center", compact ? "gap-2" : "gap-2.5", className)}>
      <span
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-black/5 dark:ring-white/10",
          compact ? "h-8 w-8" : "h-9 w-9",
        )}
        aria-hidden="true"
      >
        <Image
          src="/presentonika-brand-source.png"
          alt=""
          width={323}
          height={85}
          priority
          className={cn("absolute left-0 top-0 max-w-none", compact ? "h-8 w-auto" : "h-9 w-auto")}
        />
      </span>
      <span className={cn("truncate font-extrabold text-foreground [font-family:Manrope,system-ui,sans-serif]", compact ? "text-base" : "text-lg")}>Presentonika</span>
    </div>
  )
}
