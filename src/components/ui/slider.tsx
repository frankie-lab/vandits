import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /** Override classes for the track (e.g. `h-1` for a thinner bar). */
  trackClassName?: string;
  /** Override classes for the range fill. */
  rangeClassName?: string;
  /** Override classes for each thumb (e.g. smaller knob). */
  thumbClassName?: string;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(
  (
    {
      className,
      trackClassName,
      rangeClassName,
      thumbClassName,
      value,
      defaultValue,
      ...props
    },
    ref,
  ) => {
    const thumbCount = value?.length ?? defaultValue?.length ?? 1;
    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn(
          "relative flex w-full touch-none select-none items-center",
          className,
        )}
        value={value}
        defaultValue={defaultValue}
        {...props}
      >
        <SliderPrimitive.Track
          className={cn(
            "relative h-2 w-full grow overflow-hidden rounded-full bg-secondary",
            trackClassName,
          )}
        >
          <SliderPrimitive.Range
            className={cn("absolute h-full bg-primary", rangeClassName)}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbCount }).map((_, i) => (
          <SliderPrimitive.Thumb
            key={i}
            className={cn(
              "block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
              thumbClassName,
            )}
          />
        ))}
      </SliderPrimitive.Root>
    );
  },
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
