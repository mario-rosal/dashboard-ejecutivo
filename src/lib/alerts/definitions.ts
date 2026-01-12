export type AlertRuleKey =
  | 'expense_outlier'
  | 'income_drop'
  | 'category_spike'
  | 'merchant_concentration'
  | 'duplicate_charge'
  | 'uncategorized'
  | 'runway_low';

export type AlertRuleConfig = {
  window_days?: number;
  baseline_days?: number;
  min_amount?: number;
  min_pct?: number;
  min_total?: number;
  min_share?: number;
  min_count?: number;
  max_alerts?: number;
  multiplier?: number;
  warning_months?: number;
  danger_months?: number;
};

export type AlertRuleField = {
  key: keyof AlertRuleConfig;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  isPercent?: boolean;
};

export type AlertRuleDefinition = {
  key: AlertRuleKey;
  label: string;
  description: string;
  defaultConfig: AlertRuleConfig;
  fields: AlertRuleField[];
};

export const ALERT_RULE_DEFINITIONS: AlertRuleDefinition[] = [
  {
    key: 'expense_outlier',
    label: 'Gastos inusuales',
    description: 'Detecta gastos que superan el promedio reciente.',
    defaultConfig: {
      window_days: 90,
      multiplier: 3,
      min_amount: 200,
      max_alerts: 3,
    },
    fields: [
      { key: 'window_days', label: 'Ventana (dias)', min: 14, max: 365, step: 1 },
      { key: 'multiplier', label: 'Multiplicador sobre promedio', min: 2, max: 10, step: 0.5 },
      { key: 'min_amount', label: 'Importe minimo', min: 0, step: 10 },
      { key: 'max_alerts', label: 'Max alertas', min: 1, max: 10, step: 1 },
    ],
  },
  {
    key: 'income_drop',
    label: 'Ingresos a la baja',
    description: 'Compara ingresos del ultimo periodo con el anterior.',
    defaultConfig: {
      window_days: 30,
      baseline_days: 30,
      min_pct: 0.2,
      min_amount: 500,
    },
    fields: [
      { key: 'window_days', label: 'Ventana (dias)', min: 14, max: 120, step: 1 },
      { key: 'baseline_days', label: 'Periodo comparacion (dias)', min: 14, max: 120, step: 1 },
      { key: 'min_pct', label: 'Caida minima (%)', min: 5, max: 90, step: 1, isPercent: true },
      { key: 'min_amount', label: 'Impacto minimo', min: 0, step: 10 },
    ],
  },
  {
    key: 'category_spike',
    label: 'Pico por categoria',
    description: 'Detecta subidas fuertes en una categoria.',
    defaultConfig: {
      window_days: 30,
      baseline_days: 30,
      min_pct: 0.5,
      min_amount: 200,
      min_total: 300,
    },
    fields: [
      { key: 'window_days', label: 'Ventana (dias)', min: 14, max: 120, step: 1 },
      { key: 'baseline_days', label: 'Periodo comparacion (dias)', min: 14, max: 120, step: 1 },
      { key: 'min_pct', label: 'Subida minima (%)', min: 10, max: 200, step: 5, isPercent: true },
      { key: 'min_amount', label: 'Impacto minimo', min: 0, step: 10 },
      { key: 'min_total', label: 'Total minimo actual', min: 0, step: 10 },
    ],
  },
  {
    key: 'merchant_concentration',
    label: 'Concentracion por proveedor',
    description: 'Detecta cuando un proveedor concentra el gasto.',
    defaultConfig: {
      window_days: 30,
      min_share: 0.4,
      min_total: 500,
      min_amount: 300,
    },
    fields: [
      { key: 'window_days', label: 'Ventana (dias)', min: 14, max: 120, step: 1 },
      { key: 'min_share', label: 'Share minimo (%)', min: 10, max: 90, step: 5, isPercent: true },
      { key: 'min_total', label: 'Total gasto minimo', min: 0, step: 10 },
      { key: 'min_amount', label: 'Total proveedor minimo', min: 0, step: 10 },
    ],
  },
  {
    key: 'duplicate_charge',
    label: 'Posibles duplicados',
    description: 'Detecta cargos repetidos en pocos dias.',
    defaultConfig: {
      window_days: 14,
      min_count: 2,
      min_total: 200,
    },
    fields: [
      { key: 'window_days', label: 'Ventana (dias)', min: 7, max: 60, step: 1 },
      { key: 'min_count', label: 'Repeticiones minimas', min: 2, max: 10, step: 1 },
      { key: 'min_total', label: 'Total minimo', min: 0, step: 10 },
    ],
  },
  {
    key: 'uncategorized',
    label: 'Sin categoria',
    description: 'Alertas por movimientos sin categoria.',
    defaultConfig: {
      window_days: 60,
      min_count: 5,
      min_total: 200,
    },
    fields: [
      { key: 'window_days', label: 'Ventana (dias)', min: 30, max: 180, step: 1 },
      { key: 'min_count', label: 'Movimientos minimos', min: 1, max: 50, step: 1 },
      { key: 'min_total', label: 'Total minimo', min: 0, step: 10 },
    ],
  },
  {
    key: 'runway_low',
    label: 'Runway bajo',
    description: 'Advierte cuando la caja no cubre los meses objetivo.',
    defaultConfig: {
      warning_months: 6,
      danger_months: 3,
    },
    fields: [
      { key: 'warning_months', label: 'Umbral warning (meses)', min: 1, max: 24, step: 1 },
      { key: 'danger_months', label: 'Umbral danger (meses)', min: 1, max: 24, step: 1 },
    ],
  },
];

export const ALERT_RULE_DEFAULTS = ALERT_RULE_DEFINITIONS.map(({ key, defaultConfig }) => ({
  rule_key: key,
  is_active: true,
  config: defaultConfig,
}));
