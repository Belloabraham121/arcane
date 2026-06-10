import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/arcane-logo.png";
const LOGO_WIDTH = 598;
const LOGO_HEIGHT = 100;

type ArcaneLogoProps = {
  href?: string | null;
  height?: number;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

export function ArcaneLogo({
  href = "/",
  height = 32,
  className,
  imageClassName,
  priority = false,
}: ArcaneLogoProps) {
  const image = (
    <Image
      src={LOGO_SRC}
      alt="Arcane"
      width={Math.round((height * LOGO_WIDTH) / LOGO_HEIGHT)}
      height={height}
      priority={priority}
      className={cn("w-auto object-contain", imageClassName)}
      style={{ height }}
    />
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex shrink-0 items-center transition-opacity hover:opacity-80",
          className,
        )}
        aria-label="Arcane home"
      >
        {image}
      </Link>
    );
  }

  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      {image}
    </span>
  );
}
