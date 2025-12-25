export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    updated_at: string | null
                    username: string | null
                    full_name: string | null
                    avatar_url: string | null
                }
                Insert: {
                    id: string
                    updated_at?: string | null
                    username?: string | null
                    full_name?: string | null
                    avatar_url?: string | null
                }
                Update: {
                    id?: string
                    updated_at?: string | null
                    username?: string | null
                    full_name?: string | null
                    avatar_url?: string | null
                }
                Relationships: []
            }
            transactions: {
                Row: {
                    id: string
                    created_at: string
                    user_id: string
                    date: string
                    amount: number
                    type: 'income' | 'expense'
                    category: string
                    channel: string | null
                    description: string | null
                    file_source_id: string | null
                    is_anomaly: boolean
                }
                Insert: {
                    id?: string
                    created_at?: string
                    user_id?: string
                    date: string
                    amount: number
                    type: 'income' | 'expense'
                    category: string
                    channel?: string | null
                    description?: string | null
                    file_source_id?: string | null
                    is_anomaly?: boolean
                }
                Update: {
                    id?: string
                    created_at?: string
                    user_id?: string
                    date?: string
                    amount?: number
                    type?: 'income' | 'expense'
                    category?: string
                    channel?: string | null
                    description?: string | null
                    file_source_id?: string | null
                    is_anomaly?: boolean
                }
                Relationships: []
            }
            forecast_settings: {
                Row: {
                    user_id: string
                    target_runway_months: number
                    safety_margin_percent: number
                    updated_at: string
                }
                Insert: {
                    user_id: string
                    target_runway_months?: number
                    safety_margin_percent?: number
                    updated_at?: string
                }
                Update: {
                    user_id?: string
                    target_runway_months?: number
                    safety_margin_percent?: number
                    updated_at?: string
                }
                Relationships: []
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}
