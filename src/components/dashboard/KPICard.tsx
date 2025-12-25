import { cn } from "@/lib/utils";

interface KPICardProps {
    title: string;
    value: string;
    icon?: React.ReactNode;
    progressColor?: "green" | "red" | "blue";
    progressValue?: number; // 0 to 100
    subText?: string;
    className?: string;
}

export function KPICard({ title, value, icon, progressColor = "green", progressValue = 0, subText, className }: KPICardProps) {

    const barColors = {
        green: "bg-emerald-500",
        red: "bg-red-500",
        blue: "bg-blue-500"
    };

    return (
        <div className={cn("glass-panel p-4 flex flex-col justify-between h-32 relative overflow-hidden group", className)}>
            {/* Background Icon Watermark */}
            <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none">
                {icon}
            </div>

            <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{title}</p>
                <h2 className="text-2xl font-bold text-slate-100 mt-1">{value}</h2>
            </div>

            <div className="mt-auto">
                {subText && <p className="text-xs text-blue-400 mb-1">{subText}</p>}
                <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className={cn("h-full transition-all duration-1000 ease-out", barColors[progressColor])}
                        style={{ width: `${Math.min(100, Math.max(0, progressValue))}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
