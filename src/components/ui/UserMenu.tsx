'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { LogOut, User, ChevronDown, Trash2 } from 'lucide-react';

export function UserMenu() {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [email, setEmail] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const getUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email) {
                setEmail(session.user.email);
            }
        };
        getUser();

        // Close on click outside
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 p-1 pr-3 rounded-full bg-slate-800/50 hover:bg-slate-800 border border-white/5 transition-all group"
            >
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                    <User size={16} />
                </div>
                <span className="text-xs font-medium text-slate-300 group-hover:text-white max-w-[100px] truncate hidden md:block">
                    {email?.split('@')[0] || 'Usuario'}
                </span>
                <ChevronDown size={14} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="p-3 border-b border-slate-800">
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Conectado como</p>
                        <p className="text-sm text-slate-200 truncate font-semibold mt-0.5">{email}</p>
                    </div>
                    <div className="p-1">
                        <button
                            onClick={async () => {
                                setIsOpen(false);
                                if (!confirm("⚠️ ¿ESTÁS SEGURO? ⚠️\n\nSe borrarán TODOS los datos permanentemente.")) return;

                                const { error } = await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                                if (error) {
                                    alert("Error al borrar: " + error.message);
                                } else {
                                    alert("✅ Datos eliminados correctamente");
                                    window.location.reload();
                                }
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors mb-1"
                        >
                            <Trash2 size={16} />
                            Borrar Todo
                        </button>
                        <button
                            onClick={handleSignOut}
                            className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors"
                        >
                            <LogOut size={16} />
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
