import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "secondary";
type Size = "md" | "lg";

const base =
  "group relative inline-flex items-center justify-center gap-2 rounded-full font-[500] tracking-[-0.01em] " +
  "transition-[transform,background-color,color,border-color,box-shadow] duration-300 ease-premium " +
  "active:scale-[0.98] focus-visible:outline-none disabled:opacity-60 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "btn-gold hover:-translate-y-0.5",
  secondary:
    "btn-neu text-foreground hover:-translate-y-0.5",
  ghost:
    "text-foreground hover:text-gold hover:bg-muted/60 ring-1 ring-transparent hover:ring-border",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[0.94rem]",
  lg: "h-[3.25rem] px-7 text-[1rem]",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

type ButtonAsButton = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type ButtonAsLink = CommonProps &
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type ButtonProps = ButtonAsButton | ButtonAsLink;

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button({ variant = "primary", size = "md", className, children, ...props }, ref) {
    const classes = cn(base, variants[variant], sizes[size], className);

    if ("href" in props && props.href !== undefined) {
      return (
        <a ref={ref as React.Ref<HTMLAnchorElement>} className={classes} {...props}>
          {children}
        </a>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        className={classes}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    );
  }
);

/** Decorative arrow that nudges on hover. */
export function ArrowRight({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block transition-transform duration-300 ease-premium group-hover:translate-x-1",
        className
      )}
    >
      →
    </span>
  );
}
