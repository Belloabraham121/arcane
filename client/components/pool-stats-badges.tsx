type PoolStatsBadgesProps = {
  tvlUsd: string
  volumeUsd: string
  liquidity: string
  apy: string
  layout?: "inline" | "stacked"
  size?: "xs" | "sm"
}

export function PoolStatsBadges({
  tvlUsd,
  volumeUsd,
  liquidity,
  apy,
  layout = "inline",
  size = "xs",
}: PoolStatsBadgesProps) {
  const textClass =
    size === "sm" ? "font-mono text-xs text-muted-foreground" : "font-mono text-[10px] text-muted-foreground"

  if (layout === "stacked") {
    return (
      <div className={`space-y-0.5 ${textClass}`}>
        <p>
          <span className="text-foreground/70">TVL</span> {tvlUsd}
        </p>
        <p>
          <span className="text-foreground/70">Volume</span> {volumeUsd}
        </p>
        <p>
          <span className="text-foreground/70">Liquidity</span> {liquidity}
        </p>
        <p>
          <span className="text-foreground/70">APY</span> {apy}
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-0.5 ${textClass}`}>
      <p>
        <span className="text-foreground/70">TVL</span> {tvlUsd}
        <span className="mx-1.5 text-border">·</span>
        <span className="text-foreground/70">Volume</span> {volumeUsd}
      </p>
      <p>
        <span className="text-foreground/70">Liquidity</span> {liquidity}
        <span className="mx-1.5 text-border">·</span>
        <span className="text-foreground/70">APY</span> {apy}
      </p>
    </div>
  )
}
