'use client';

import { GlassCard } from "@/components/ui/GlassCard";
import { X, AlertTriangle, TrendingDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NotificationAction {
    label: string;
    onClick: () => void;
}

export interface Notification {
    id: string;
    type: "warning" | "danger" | "info";
    title: string;
    message: string;
    timestamp: string;
    detail?: string;
    action?: NotificationAction;
}

interface NotificationPanelProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: Notification[];
}

export function NotificationPanel({ isOpen, onClose, notifications }: NotificationPanelProps) {

    return (
        <div
            className={cn(
                "fixed inset-y-0 right-0 w-80 bg-zinc-900/90 backdrop-blur-xl border-l border-white/10 transform transition-transform duration-300 ease-in-out z-50",
                isOpen ? "translate-x-0" : "translate-x-full"
            )}
        >
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
                <h3 className="font-semibold text-white">Alertas</h3>
                <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto h-[calc(100vh-64px)]">
                {notifications.map((notif) => (
                    <GlassCard key={notif.id} className="p-4 border-l-4" style={{
                        borderLeftColor: notif.type === 'danger' ? '#ef4444' : notif.type === 'warning' ? '#f59e0b' : '#3b82f6'
                    }}>
                        <div className="flex justify-between items-start mb-1">
                            <span className={cn(
                                "text-xs font-bold uppercase",
                                notif.type === 'danger' && "text-red-400",
                                notif.type === 'warning' && "text-amber-400",
                                notif.type === 'info' && "text-blue-400",
                            )}>
                                {notif.type === 'danger' && <AlertTriangle size={12} className="inline mr-1" />}
                                {notif.type === 'warning' && <TrendingDown size={12} className="inline mr-1" />}
                                {notif.type === 'info' && <Info size={12} className="inline mr-1" />}
                                {notif.type}
                            </span>
                            <span className="text-[10px] text-zinc-500">{notif.timestamp}</span>
                        </div>
                        <h4 className="text-sm font-medium text-white mb-1">{notif.title}</h4>
                        <p className="text-xs text-zinc-400 leading-relaxed">{notif.message}</p>
                        {notif.detail && (
                            <p className="text-[11px] text-zinc-500 mt-2">{notif.detail}</p>
                        )}
                        {notif.action && (
                            <button
                                type="button"
                                onClick={notif.action.onClick}
                                className="mt-3 text-[11px] px-2 py-1 rounded border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 transition-colors"
                            >
                                {notif.action.label}
                            </button>
                        )}
                    </GlassCard>
                ))}
            </div>
        </div>
    );
}
