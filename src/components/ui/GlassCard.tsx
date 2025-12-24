import { cn } from "@/lib/utils";
import React from "react";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    gradient?: boolean;
}

export function GlassCard({ children, className, gradient = false, ...props }: GlassCardProps) {
    return (
        <div
            className={cn(
                "relative overflow-hidden rounded-2xl border border-glass-border bg-glass-surface backdrop-blur-xl transition-all duration-300",
                gradient && "bg-gradient-to-br from-glass-surface to-transparent",
                "hover:border-white/20 hover:shadow-lg hover:shadow-emerald-500/5",
                className
            )}
            {...props}
        >
            {/* Noise Texture Overlay (Optional - currently disabled for cleanliness) */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('/noise.png')]" />

            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
}
