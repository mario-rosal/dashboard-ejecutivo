'use client';

import React from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';
import type { Database } from '@/types/database.types';
import {
  ALERT_RULE_DEFINITIONS,
  type AlertRuleConfig,
  type AlertRuleKey,
} from '@/lib/alerts/definitions';

type AlertRuleRow = Database['public']['Tables']['alert_rules']['Row'];
type AlertExclusionRow = Database['public']['Tables']['alert_exclusions']['Row'];

type AlertRuleDraft = {
  rule_key: AlertRuleKey;
  is_active: boolean;
  config: AlertRuleConfig;
};

type ExclusionDraft = {
  match_type: string;
  match_value: string;
  rule_key: string;
  min_amount: string;
  max_amount: string;
};

interface AlertSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  rules: AlertRuleRow[];
  exclusions: AlertExclusionRow[];
  onSaveRules: (rules: AlertRuleDraft[]) => Promise<void>;
  onAddExclusion: (exclusion: {
    match_type: string;
    match_value: string;
    rule_key?: string | null;
    min_amount?: number | null;
    max_amount?: number | null;
  }) => Promise<void>;
  onRemoveExclusion: (id: string) => Promise<void>;
}

const buildDraftRules = (rules: AlertRuleRow[]) =>
  ALERT_RULE_DEFINITIONS.map((definition) => {
    const existing = rules.find((rule) => rule.rule_key === definition.key);
    const storedConfig =
      existing?.config && typeof existing.config === 'object' ? (existing.config as AlertRuleConfig) : {};
    const config = {
      ...definition.defaultConfig,
      ...storedConfig,
    };
    return {
      rule_key: definition.key,
      is_active: existing?.is_active ?? true,
      config,
    };
  });

export function AlertSettingsPanel({
  isOpen,
  onClose,
  rules,
  exclusions,
  onSaveRules,
  onAddExclusion,
  onRemoveExclusion,
}: AlertSettingsPanelProps) {
  const [draftRules, setDraftRules] = React.useState<AlertRuleDraft[]>(() => buildDraftRules(rules));
  const [isSaving, setIsSaving] = React.useState(false);
  const [exclusionDraft, setExclusionDraft] = React.useState<ExclusionDraft>({
    match_type: 'merchant',
    match_value: '',
    rule_key: 'all',
    min_amount: '',
    max_amount: '',
  });

  React.useEffect(() => {
    setDraftRules(buildDraftRules(rules));
  }, [rules]);

  const updateRule = (ruleKey: AlertRuleKey, update: Partial<AlertRuleDraft>) => {
    setDraftRules((prev) =>
      prev.map((rule) => (rule.rule_key === ruleKey ? { ...rule, ...update } : rule))
    );
  };

  const updateRuleConfig = (ruleKey: AlertRuleKey, configKey: keyof AlertRuleConfig, value?: number) => {
    setDraftRules((prev) =>
      prev.map((rule) => {
        if (rule.rule_key !== ruleKey) return rule;
        return {
          ...rule,
          config: {
            ...rule.config,
            [configKey]: value,
          },
        };
      })
    );
  };

  const handleSaveRules = async () => {
    setIsSaving(true);
    try {
      await onSaveRules(draftRules);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddExclusion = async () => {
    const matchValue = exclusionDraft.match_value.trim();
    if (!matchValue) return;

    const ruleKey =
      exclusionDraft.rule_key && exclusionDraft.rule_key !== 'all' ? exclusionDraft.rule_key : null;
    const minAmount = exclusionDraft.min_amount ? Number(exclusionDraft.min_amount) : null;
    const maxAmount = exclusionDraft.max_amount ? Number(exclusionDraft.max_amount) : null;

    await onAddExclusion({
      match_type: exclusionDraft.match_type,
      match_value: matchValue,
      rule_key: ruleKey,
      min_amount: Number.isFinite(minAmount) ? minAmount : null,
      max_amount: Number.isFinite(maxAmount) ? maxAmount : null,
    });

    setExclusionDraft((prev) => ({
      ...prev,
      match_value: '',
      min_amount: '',
      max_amount: '',
    }));
  };

  return (
    <div
      className={cn(
        "fixed inset-y-0 right-0 w-[360px] bg-zinc-950/90 backdrop-blur-xl border-l border-white/10 transform transition-transform duration-300 ease-in-out z-50",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="p-4 border-b border-white/10 flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-white">Configuracion de alertas</h3>
          <p className="text-[11px] text-zinc-500">Ajusta reglas y exclusiones.</p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="p-4 space-y-5 overflow-y-auto h-[calc(100vh-64px)]">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Reglas</h4>
          <button
            type="button"
            onClick={handleSaveRules}
            disabled={isSaving}
            className={cn(
              "text-[11px] px-3 py-1 rounded border transition-colors",
              isSaving
                ? "border-white/10 text-zinc-500 cursor-not-allowed"
                : "border-blue-500/40 text-blue-200 hover:border-blue-400 hover:text-blue-100"
            )}
          >
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>

        <div className="space-y-3">
          {ALERT_RULE_DEFINITIONS.map((definition) => {
            const draft = draftRules.find((rule) => rule.rule_key === definition.key);
            if (!draft) return null;
            return (
              <GlassCard key={definition.key} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white font-medium">{definition.label}</p>
                    <p className="text-[11px] text-zinc-500">{definition.description}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={draft.is_active}
                      onChange={(event) => updateRule(definition.key, { is_active: event.target.checked })}
                      className="accent-emerald-400"
                    />
                    Activa
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {definition.fields.map((field) => {
                    const rawValue = draft.config[field.key];
                    const displayValue =
                      rawValue === undefined || rawValue === null
                        ? ''
                        : field.isPercent
                          ? Number(rawValue) * 100
                          : rawValue;

                    return (
                      <label key={field.key} className="text-[11px] text-zinc-400 flex flex-col gap-1">
                        {field.label}
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step ?? 1}
                          value={displayValue}
                          onChange={(event) => {
                            const next = event.target.value === '' ? undefined : Number(event.target.value);
                            if (next === undefined || Number.isNaN(next)) {
                              updateRuleConfig(definition.key, field.key, undefined);
                              return;
                            }
                            const normalized = field.isPercent ? next / 100 : next;
                            updateRuleConfig(definition.key, field.key, normalized);
                          }}
                          className="w-full bg-zinc-900/60 border border-zinc-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-400"
                        />
                      </label>
                    );
                  })}
                </div>
              </GlassCard>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Exclusiones</h4>
        </div>

        <div className="space-y-2">
          {exclusions.length === 0 && (
            <p className="text-[11px] text-zinc-500">No hay exclusiones configuradas.</p>
          )}
          {exclusions.map((exclusion) => (
            <GlassCard key={exclusion.id} className="p-3 flex items-center justify-between">
              <div>
                {(() => {
                  const labelMap: Record<string, string> = {
                    merchant: 'Proveedor',
                    category: 'Categoria',
                    description: 'Descripcion',
                  };
                  const typeLabel = labelMap[exclusion.match_type] ?? exclusion.match_type;
                  return (
                    <>
                      <p className="text-xs text-white">
                        {exclusion.match_value}{' '}
                        {exclusion.rule_key ? (
                          <span className="text-[10px] text-zinc-500">
                            (
                            {ALERT_RULE_DEFINITIONS.find((definition) => definition.key === exclusion.rule_key)
                              ?.label ?? exclusion.rule_key}
                            )
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {typeLabel}
                        {(exclusion.min_amount || exclusion.max_amount) && (
                          <span>
                            {' '}
                            | {exclusion.min_amount ?? 0} - {exclusion.max_amount ?? 'sin limite'}
                          </span>
                        )}
                      </p>
                    </>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={() => onRemoveExclusion(exclusion.id)}
                className="text-zinc-500 hover:text-red-300 transition-colors"
                title="Eliminar exclusion"
              >
                <Trash2 size={14} />
              </button>
            </GlassCard>
          ))}
        </div>

        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-white font-medium">Nueva exclusion</p>
            <button
              type="button"
              onClick={handleAddExclusion}
              className="text-[11px] px-2 py-1 rounded border border-emerald-400/40 text-emerald-200 hover:border-emerald-300 hover:text-emerald-100 transition-colors flex items-center gap-1"
            >
              <Plus size={12} /> Agregar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] text-zinc-400 flex flex-col gap-1">
              Tipo
              <select
                value={exclusionDraft.match_type}
                onChange={(event) =>
                  setExclusionDraft((prev) => ({ ...prev, match_type: event.target.value }))
                }
                className="w-full bg-zinc-900/60 border border-zinc-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-400"
              >
                <option value="merchant">Proveedor</option>
                <option value="category">Categoria</option>
                <option value="description">Descripcion</option>
              </select>
            </label>

            <label className="text-[11px] text-zinc-400 flex flex-col gap-1">
              Regla
              <select
                value={exclusionDraft.rule_key}
                onChange={(event) =>
                  setExclusionDraft((prev) => ({ ...prev, rule_key: event.target.value }))
                }
                className="w-full bg-zinc-900/60 border border-zinc-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-400"
              >
                <option value="all">Todas</option>
                {ALERT_RULE_DEFINITIONS.map((definition) => (
                  <option key={definition.key} value={definition.key}>
                    {definition.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[11px] text-zinc-400 flex flex-col gap-1 col-span-2">
              Valor
              <input
                type="text"
                value={exclusionDraft.match_value}
                onChange={(event) =>
                  setExclusionDraft((prev) => ({ ...prev, match_value: event.target.value }))
                }
                className="w-full bg-zinc-900/60 border border-zinc-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-400"
                placeholder="Ej: Hipoteca, Iberdrola"
              />
            </label>

            <label className="text-[11px] text-zinc-400 flex flex-col gap-1">
              Min importe
              <input
                type="number"
                value={exclusionDraft.min_amount}
                onChange={(event) =>
                  setExclusionDraft((prev) => ({ ...prev, min_amount: event.target.value }))
                }
                className="w-full bg-zinc-900/60 border border-zinc-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-400"
              />
            </label>

            <label className="text-[11px] text-zinc-400 flex flex-col gap-1">
              Max importe
              <input
                type="number"
                value={exclusionDraft.max_amount}
                onChange={(event) =>
                  setExclusionDraft((prev) => ({ ...prev, max_amount: event.target.value }))
                }
                className="w-full bg-zinc-900/60 border border-zinc-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-400"
              />
            </label>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
