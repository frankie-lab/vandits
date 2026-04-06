import { cn } from "@/lib/utils";

function Skeleton({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
 return <div className={cn("rounded-md bg-muted animate-shimmer", className)} style={{ ...style, transition: 'background-color 1.5s ease-in-out' }} {...props} />;
}

export { Skeleton };
