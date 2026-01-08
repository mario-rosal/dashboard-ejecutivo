This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Sabadell import

### Migraciones

Aplica el SQL en `supabase/migrations/20250112000100_canonical_transactions.sql` usando tu flujo habitual (Supabase CLI o SQL editor).

### API

Endpoint: `POST /api/imports/sabadell` (multipart/form-data).

Campos requeridos:
- `file`: Excel (XLS/XLSX)
- `account_id`: cuenta interna

Opcionales:
- `bank_source` (default `sabadell`)

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/imports/sabadell \
  -H "Authorization: Bearer <access_token>" \
  -F "file=@Res. cuenta Noviembre Sabadell.xlsx" \
  -F "account_id=cuenta-principal"
```

### CLI

Requiere variables de entorno: `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

```bash
node scripts/import-sabadell.js "Res. cuenta Noviembre Sabadell.xlsx" --user <uuid> --account <id>
```

### Tests

```bash
npm test
```

## Categorization (reglas + overrides)

### Migraciones y seeds

Aplica la migracion `supabase/migrations/20250112000200_categorization_rules.sql` y luego ejecuta el seed:

`supabase/seeds/20250112000210_seed_categories_rules.sql`

### Endpoints

1) Categorizar por lote:

```bash
curl -X POST "http://localhost:3000/api/imports/<import_batch_id>/categorize?force=false" \
  -H "Authorization: Bearer <access_token>"
```

2) Backfill + recategorizacion global (incluye historicos con import_batch_id null):

```bash
curl -X POST "http://localhost:3000/api/transactions/categorize?force=false" \
  -H "Authorization: Bearer <access_token>"
```

3) Correccion manual + override opcional:

```bash
curl -X PATCH "http://localhost:3000/api/transactions/<id>/category" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"category_id":"<uuid>","apply_to_merchant":true,"scope":"user"}'
```

4) Merchants sin categorizar:

```bash
curl -X GET "http://localhost:3000/api/merchants/uncategorized?limit=50" \
  -H "Authorization: Bearer <access_token>"
```

### Notas de matching

- `contains/starts_with/equals` comparan texto normalizado (mayusculas, sin acentos).
- `regex` se evalua sobre el texto normalizado.
- `min_amount/max_amount` usan `abs(amount)` para filtrar.
