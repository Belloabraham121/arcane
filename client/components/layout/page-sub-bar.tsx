import Link from "next/link"

type PageSubBarProps = {
  title: string
  subtitle?: string | null
  action?: React.ReactNode
  backHref?: string
  backLabel?: string
}

export function PageSubBar({
  title,
  subtitle = null,
  action,
  backHref,
  backLabel,
}: PageSubBarProps) {
  return (
    <div className="border-b border-border bg-background/50 backdrop-blur">
      <div className="mx-auto max-w-7xl px-6 py-4 lg:px-12">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">{title}</p>
            {subtitle && (
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {action}
          {backHref && backLabel && (
            <Link
              href={backHref}
              className="shrink-0 font-mono text-xs uppercase tracking-widest transition-colors hover:text-foreground"
            >
              {backLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
