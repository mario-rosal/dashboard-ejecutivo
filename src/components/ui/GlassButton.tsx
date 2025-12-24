import { cn } from "@/lib/utils";
import React from "react";

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "danger" | "ghost";
    size?: "sm" | "md" | "lg";
}

export function GlassButton({
    className,
    variant = "primary",
    size = "md",
    children,
    ...props
}: GlassButtonProps) {
    const variants = {
        primary: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30 hover:shadow-emerald-500/10",
        secondary: "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10",
        danger: "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20",
        ghost: "bg-transparent border-transparent text-zinc-400 hover:text-white hover:bg-white/5",
    };

    const sizes = {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-base",
    };

    return (
        <button
            className={cn(
                "inline-flex items-center justify-center rounded-xl border backdrop-blur-md transition-all duration-200 font-medium",
                "active:scale-95 disabled:opacity-50 disabled:pointer-events-none gap-2",
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        >
            {children}
        </button>
    );
}
