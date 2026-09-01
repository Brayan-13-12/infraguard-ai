import { cn } from "@/lib/cn";

type RevealProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Stagger the entrance by this many ms (ignored under reduced motion). */
  delayMs?: number;
};

/**
 * Small entrance-motion primitive: a soft fade + 6px rise, ~240ms. Use it to
 * bring page sections, cards and panels in without scattering one-off animation
 * classes. Under `prefers-reduced-motion` the animation is dropped entirely and
 * the content renders in its final state.
 */
export function Reveal({ delayMs = 0, className, style, children, ...rest }: RevealProps) {
  return (
    <div
      className={cn("motion-safe:animate-fade-in-up", className)}
      style={delayMs ? { animationDelay: `${delayMs}ms`, ...style } : style}
      {...rest}
    >
      {children}
    </div>
  );
}
