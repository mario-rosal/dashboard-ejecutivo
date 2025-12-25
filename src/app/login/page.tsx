'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { GlassCard } from '@/components/ui/GlassCard';
import { Loader2, Lock, Mail, ChevronRight, AlertCircle, BarChart4 } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                setMessage('Cuenta creada. Revisa tu email para confirmar.');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                router.push('/');
                router.refresh();
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al autenticar';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects matching Dashboard */}
            <div className="absolute inset-0 bg-[#0f172a] bg-[radial-gradient(at_top_right,#1e1b4b_0%,#0f172a_60%)] -z-20" />

            <div className="w-full max-w-md animate-fade-in relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30 mb-4">
                        <BarChart4 className="text-white w-8 h-8" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">CFO Nexus</h1>
                    <p className="text-slate-400 mt-2">Inteligencia Financiera para tu negocio</p>
                </div>

                <GlassCard className="p-8 backdrop-blur-xl border-white/10 shadow-2xl">
                    <form onSubmit={handleAuth} className="space-y-6">
                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-200 text-sm">
                                <AlertCircle size={16} />
                                {error}
                            </div>
                        )}
                        {message && (
                            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-200 text-sm">
                                <AlertCircle size={16} />
                                {message}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-300 uppercase tracking-wider ml-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="nombre@empresa.com"
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-300 uppercase tracking-wider ml-1">Contraseña</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    {isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'}
                                    <ChevronRight size={16} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-slate-400 text-sm">
                            {isSignUp ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"}
                            <button
                                onClick={() => setIsSignUp(!isSignUp)}
                                className="ml-2 text-blue-400 hover:text-blue-300 font-medium transition-colors"
                            >
                                {isSignUp ? "Inicia Sesión" : "Regístrate"}
                            </button>
                        </p>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
