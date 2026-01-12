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
            categories: {
                Row: {
                    id: string
                    parent_id: string | null
                    name: string
                    slug: string
                    type: Database['public']['Enums']['category_type']
                    created_at: string
                }
                Insert: {
                    id?: string
                    parent_id?: string | null
                    name: string
                    slug: string
                    type: Database['public']['Enums']['category_type']
                    created_at?: string
                }
                Update: {
                    id?: string
                    parent_id?: string | null
                    name?: string
                    slug?: string
                    type?: Database['public']['Enums']['category_type']
                    created_at?: string
                }
                Relationships: []
            }
            import_batches: {
                Row: {
                    id: string
                    user_id: string | null
                    bank_source: string
                    file_name: string
                    file_hash: string
                    imported_at: string
                    rows_total: number
                    rows_inserted: number
                    rows_skipped: number
                }
                Insert: {
                    id?: string
                    user_id?: string | null
                    bank_source: string
                    file_name: string
                    file_hash: string
                    imported_at?: string
                    rows_total?: number
                    rows_inserted?: number
                    rows_skipped?: number
                }
                Update: {
                    id?: string
                    user_id?: string | null
                    bank_source?: string
                    file_name?: string
                    file_hash?: string
                    imported_at?: string
                    rows_total?: number
                    rows_inserted?: number
                    rows_skipped?: number
                }
                Relationships: []
            }
            category_rules: {
                Row: {
                    id: string
                    user_id: string | null
                    name: string
                    priority: number
                    is_active: boolean
                    match_field: Database['public']['Enums']['category_match_field']
                    match_type: Database['public']['Enums']['category_match_type']
                    pattern: string
                    txn_type_filter: string[] | null
                    min_amount: number | null
                    max_amount: number | null
                    category_id: string
                    confidence: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id?: string | null
                    name: string
                    priority?: number
                    is_active?: boolean
                    match_field: Database['public']['Enums']['category_match_field']
                    match_type: Database['public']['Enums']['category_match_type']
                    pattern: string
                    txn_type_filter?: string[] | null
                    min_amount?: number | null
                    max_amount?: number | null
                    category_id: string
                    confidence?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string | null
                    name?: string
                    priority?: number
                    is_active?: boolean
                    match_field?: Database['public']['Enums']['category_match_field']
                    match_type?: Database['public']['Enums']['category_match_type']
                    pattern?: string
                    txn_type_filter?: string[] | null
                    min_amount?: number | null
                    max_amount?: number | null
                    category_id?: string
                    confidence?: number
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            merchant_category_overrides: {
                Row: {
                    id: string
                    user_id: string
                    merchant_normalized: string
                    category_id: string
                    scope: Database['public']['Enums']['override_scope']
                    account_id: string | null
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    merchant_normalized: string
                    category_id: string
                    scope?: Database['public']['Enums']['override_scope']
                    account_id?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    merchant_normalized?: string
                    category_id?: string
                    scope?: Database['public']['Enums']['override_scope']
                    account_id?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            category_audit: {
                Row: {
                    id: string
                    transaction_id: string
                    user_id: string | null
                    previous_category_id: string | null
                    new_category_id: string | null
                    source: Database['public']['Enums']['category_source']
                    rule_id: string | null
                    note: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    transaction_id: string
                    user_id?: string | null
                    previous_category_id?: string | null
                    new_category_id?: string | null
                    source?: Database['public']['Enums']['category_source']
                    rule_id?: string | null
                    note?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    transaction_id?: string
                    user_id?: string | null
                    previous_category_id?: string | null
                    new_category_id?: string | null
                    source?: Database['public']['Enums']['category_source']
                    rule_id?: string | null
                    note?: string | null
                    created_at?: string
                }
                Relationships: []
            }
            ai_usage: {
                Row: {
                    id: string
                    user_id: string
                    feature: string
                    model: string
                    prompt_tokens: number | null
                    completion_tokens: number | null
                    total_tokens: number | null
                    created_at: string
                    request_id: string | null
                    metadata: Json | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    feature: string
                    model: string
                    prompt_tokens?: number | null
                    completion_tokens?: number | null
                    total_tokens?: number | null
                    created_at?: string
                    request_id?: string | null
                    metadata?: Json | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    feature?: string
                    model?: string
                    prompt_tokens?: number | null
                    completion_tokens?: number | null
                    total_tokens?: number | null
                    created_at?: string
                    request_id?: string | null
                    metadata?: Json | null
                }
                Relationships: []
            }
            alert_rules: {
                Row: {
                    id: string
                    user_id: string
                    rule_key: string
                    is_active: boolean
                    config: Json
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    rule_key: string
                    is_active?: boolean
                    config?: Json
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    rule_key?: string
                    is_active?: boolean
                    config?: Json
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            alert_exclusions: {
                Row: {
                    id: string
                    user_id: string
                    rule_key: string | null
                    match_type: string
                    match_value: string
                    match_value_normalized: string
                    min_amount: number | null
                    max_amount: number | null
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    rule_key?: string | null
                    match_type: string
                    match_value: string
                    match_value_normalized: string
                    min_amount?: number | null
                    max_amount?: number | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    rule_key?: string | null
                    match_type?: string
                    match_value?: string
                    match_value_normalized?: string
                    min_amount?: number | null
                    max_amount?: number | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            alert_events: {
                Row: {
                    id: string
                    user_id: string
                    rule_key: string
                    dedupe_key: string
                    severity: Database['public']['Enums']['alert_severity']
                    title: string
                    message: string
                    detail: string | null
                    status: Database['public']['Enums']['alert_status']
                    event_at: string
                    last_seen_at: string
                    payload: Json
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    rule_key: string
                    dedupe_key: string
                    severity?: Database['public']['Enums']['alert_severity']
                    title: string
                    message: string
                    detail?: string | null
                    status?: Database['public']['Enums']['alert_status']
                    event_at?: string
                    last_seen_at?: string
                    payload?: Json
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    rule_key?: string
                    dedupe_key?: string
                    severity?: Database['public']['Enums']['alert_severity']
                    title?: string
                    message?: string
                    detail?: string | null
                    status?: Database['public']['Enums']['alert_status']
                    event_at?: string
                    last_seen_at?: string
                    payload?: Json
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            transactions: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string | null
                    user_id: string | null
                    account_id: string | null
                    bank_source: string | null
                    date: string
                    value_date: string | null
                    amount: number
                    currency: string | null
                    description_raw: string | null
                    description_clean: string | null
                    merchant_raw: string | null
                    merchant_normalized: string | null
                    txn_type: Database['public']['Enums']['txn_type'] | null
                    category_id: string | null
                    category_source: Database['public']['Enums']['category_source'] | null
                    category_confidence: number | null
                    rule_id: string | null
                    import_batch_id: string | null
                    external_hash: string | null
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
                    updated_at?: string | null
                    user_id?: string | null
                    account_id?: string | null
                    bank_source?: string | null
                    date: string
                    value_date?: string | null
                    amount: number
                    currency?: string | null
                    description_raw?: string | null
                    description_clean?: string | null
                    merchant_raw?: string | null
                    merchant_normalized?: string | null
                    txn_type?: Database['public']['Enums']['txn_type'] | null
                    category_id?: string | null
                    category_source?: Database['public']['Enums']['category_source'] | null
                    category_confidence?: number | null
                    rule_id?: string | null
                    import_batch_id?: string | null
                    external_hash?: string | null
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
                    updated_at?: string | null
                    user_id?: string | null
                    account_id?: string | null
                    bank_source?: string | null
                    date?: string
                    value_date?: string | null
                    amount?: number
                    currency?: string | null
                    description_raw?: string | null
                    description_clean?: string | null
                    merchant_raw?: string | null
                    merchant_normalized?: string | null
                    txn_type?: Database['public']['Enums']['txn_type'] | null
                    category_id?: string | null
                    category_source?: Database['public']['Enums']['category_source'] | null
                    category_confidence?: number | null
                    rule_id?: string | null
                    import_batch_id?: string | null
                    external_hash?: string | null
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
            get_uncategorized_merchants: {
                Args: {
                    p_user_id: string
                    p_limit?: number
                }
                Returns: {
                    merchant_key: string | null
                    merchant_normalized: string | null
                    description_clean: string | null
                    txn_count: number
                    total_amount: number | null
                }[]
            }
        }
        Enums: {
            alert_status: 'open' | 'ignored' | 'dismissed'
            alert_severity: 'info' | 'warning' | 'danger'
            txn_type: 'income' | 'expense' | 'transfer' | 'fee' | 'tax' | 'interest' | 'unknown'
            category_source: 'rule' | 'ml' | 'user' | 'unknown'
            category_type: 'income' | 'expense' | 'transfer' | 'financial' | 'other'
            category_match_field: 'description_clean' | 'merchant_normalized'
            category_match_type: 'contains' | 'regex' | 'starts_with' | 'equals'
            override_scope: 'user' | 'account'
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}
