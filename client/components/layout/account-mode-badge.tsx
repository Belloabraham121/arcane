import type { AccountMode } from "@/lib/api/auth"

type AccountModeBadgeProps = {
  mode: AccountMode
}

export function AccountModeBadge({ mode }: AccountModeBadgeProps) {
  const isDemo = mode === "demo"

  return (
    <span
      className={`inline-flex shrink-0 items-center border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
        isDemo
          ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      }`}
    >
      {isDemo ? "Demo" : "Live"}
    </span>
  )
}
