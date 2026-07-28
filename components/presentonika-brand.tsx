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
          "relative shrink-0",
          compact ? "h-8 w-8" : "h-9 w-9",
        )}
        aria-hidden="true"
      >
        <Image
          src="/presentonika-logo.svg"
          alt=""
          width={128}
          height={128}
          priority
          className="h-full w-full object-contain"
        />
      </span>
      <span className={cn("truncate font-extrabold text-foreground [font-family:Manrope,system-ui,sans-serif]", compact ? "text-base" : "text-lg")}>Presentonika</span>
    </div>
  )
}
