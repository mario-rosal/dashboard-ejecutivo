type Rule = {
  category: string;
  keywords: (string | RegExp)[];
  weight?: number;
};

type TransactionLike = {
  amount: number | string;
  category?: string | null;
  description?: string | null;
  concept?: string | null;
};

// Labels that we treat as "uncategorized" so we can safely auto-fill.
const UNCATEGORIZED_LABELS = [
  'general',
  'sin categoria',
  'otros ingresos',
  'otros',
  'uncategorized'
];

const EXPENSE_RULES: Rule[] = [
  {
    category: 'Infraestructura',
    weight: 2,
    keywords: [
      'aws', 'amazon web services', 'gcp', 'google cloud', 'gcloud', 'azure',
      'digital ocean', 'docean', 'vercel', 'netlify', 'heroku', 'render',
      'railway', 'fly.io', 'flyio', 'supabase', 'planetscale', 'neon',
      'firebase', 'cloudflare', 'hosting', 'dns', 'ovh', 'linode', 'vultr',
      'mongodb', 'atlas'
    ]
  },
  {
    category: 'Software & IA',
    keywords: [
      'openai', 'chatgpt', 'claude', 'anthropic', 'perplexity', 'midjourney',
      'github', 'copilot', 'gitlab', 'cursor', 'jetbrains', 'slack', 'zoom',
      'notion', 'figma', 'miro', 'adobe', 'canva', 'office 365', 'microsoft 365',
      'google workspace', 'gsuite', 'dropbox', 'onedrive', 'loom', 'descript',
      'sentry', 'datadog', 'new relic', 'linear', 'jira', 'confluence',
      'trello', 'asana', 'zapier', 'make.com', 'airtable'
    ]
  },
  {
    category: 'Equipo & Nominas',
    keywords: [
      'nomina', 'nominas', 'seguridad social', 'ss', 'mutua', 'mutualidad',
      'caser', 'sanitas', 'adeslas', 'dkv', 'mapfre', 'valentina', 'federico',
      'leandro', 'oscar', 'transferencia a', 'remesa', 'payroll',
      'ticket restaurant', 'sodexo', 'edenred'
    ]
  },
  {
    category: 'Marketing & Publicidad',
    keywords: [
      'linkedin', 'google ads', 'adwords', 'facebook', 'meta', 'instagram',
      'tiktok', 'bing ads', 'sortlist', 'hubspot', 'mailchimp', 'lemlist',
      'octopus', 'taboola', 'outbrain', 'semrush', 'ahrefs'
    ]
  },
  {
    category: 'Impuestos & Legal',
    keywords: [
      'agencia tributaria', 'aeat', 'hacienda', 'impuesto', 'iva', 'irpf',
      'trimestral', 'retencion', 'notaria', 'registro mercantil', 'tasas',
      /modelo\s*\d+/
    ]
  },
  {
    category: 'Oficina & Suministros',
    keywords: [
      'alquiler', 'renta', 'luz', 'energia', 'electricidad', 'agua', 'internet',
      'fibra', 'movistar', 'vodafone', 'orange', 'jazztel', 'yoigo', 'limpieza',
      'mercadona', 'amazon', 'ikea', 'lidl', 'carrefour', 'papeleria',
      'material oficina', 'catering', 'cafeteria', 'glovo', 'just eat',
      'uber eats', 'ubereats', 'mensajeria', 'envio', 'paqueteria'
    ]
  },
  {
    category: 'Viajes & Transporte',
    keywords: [
      'renfe', 'iryo', 'ave', 'uber', 'cabify', 'taxi', 'bolt', 'parking',
      'hotel', 'airbnb', 'vuelo', 'iberia', 'ryanair', 'vueling', 'easyjet',
      'lufthansa', 'booking', 'avis', 'hertz', 'sixt', 'alamo', 'hostel',
      'metro', 'billete', 'peaje'
    ]
  },
  {
    category: 'Comisiones Bancarias',
    keywords: [
      'comision', 'commission', 'fee', 'mantenimiento', 'maintenance',
      'intereses', 'interest', 'interes', 'descubierto', 'overdraft', 'banco',
      'sabadell', 'bbva', 'santander', 'caixa', 'caixabank', 'ing direct',
      'stripe fee', 'paypal fee'
    ]
  }
];

const INCOME_RULES: Rule[] = [
  {
    category: 'Ventas Consultoria',
    keywords: [
      'consultoria', 'consulting', 'proyecto', 'honorarios', 'servicio',
      'retainer', 'mantenimiento', 'implementacion', 'advisory', 'asesoria',
      'soporte'
    ]
  },
  {
    category: 'Ventas Licencias',
    keywords: [
      'licencia', 'licencias', 'saas', 'suscripcion', 'subscription', 'plan',
      'renewal', 'license', 'cuota', 'mensualidad'
    ]
  },
  {
    category: 'Devoluciones',
    keywords: ['devolucion', 'abono', 'rectificativa', 'refund', 'reembolso', 'chargeback']
  },
  {
    category: 'Otros Ingresos',
    keywords: ['intereses', 'interest', 'subvencion', 'ayuda', 'grant', 'dividendos', 'dividendo', 'financiacion', 'financing']
  }
];

/**
 * Normalize text (lowercase, strip accents and trim) to make keyword matching resilient.
 */
function normalizeText(text?: string | number | null): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function scoreKeyword(keyword: string | RegExp, text: string): number {
  if (keyword instanceof RegExp) {
    return keyword.test(text) ? 2 : 0;
  }

  // Keywords are already lowercase/ascii friendly
  if (!text.includes(keyword)) return 0;

  // Longer keywords usually mean higher intent (e.g., "amazon web services").
  return keyword.length > 8 ? 2 : 1;
}

function bestMatch(text: string, amount: number): string {
  const isExpense = amount < 0;
  const rules = isExpense ? EXPENSE_RULES : INCOME_RULES;
  const defaultCategory = isExpense ? 'General' : 'Otros Ingresos';

  let bestCategory = defaultCategory;
  let bestScore = 0;

  for (const rule of rules) {
    const score = rule.keywords.reduce((acc, keyword) => acc + scoreKeyword(keyword, text), 0) + (rule.weight ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  return bestCategory;
}

export function isUncategorizedCategory(category?: string | number | null) {
  if (!category) return true;
  const normalized = normalizeText(category);
  return UNCATEGORIZED_LABELS.includes(normalized);
}

export function categorizeTransaction(concept: string | number, amount: number) {
  const cleanConcept = normalizeText(concept);
  const numericAmount = Number(amount) || 0;
  return bestMatch(cleanConcept, numericAmount);
}

export function autoCategorizeAll<T extends TransactionLike>(transactions: T[]): T[] {
  return transactions.map((tx) => {
    const amount = Number(tx.amount ?? 0);
    const concept = tx.description ?? tx.concept ?? '';
    const suggested = categorizeTransaction(concept, amount);
    const category = isUncategorizedCategory(tx.category)
      ? suggested
      : tx.category || suggested;

    return {
      ...tx,
      category
    };
  });
}
