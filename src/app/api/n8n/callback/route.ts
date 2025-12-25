import { NextResponse } from 'next/server';
import { verifyHmac } from '@/lib/n8n/verifyHmac';
import { jobsRepo } from '@/lib/n8n/jobsRepo';

type CallbackPayload = {
  jobId: string | number;
  status: string;
  result?: unknown;
  meta?: {
    receivedAt?: string;
  } | null;
};

/**
 * Callback endpoint for n8n PDF processing.
 * Uses raw body for HMAC validation to avoid mismatches introduced by JSON parsing.
 */
export async function POST(request: Request) {
  const secret = process.env.N8N_CALLBACK_SECRET;
  const signature = request.headers.get('x-n8n-signature');

  // Read raw body for HMAC verification
  const rawBody = await request.text();

  if (!verifyHmac(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Minimal validation
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { jobId, status, result, meta } = payload as Partial<CallbackPayload>;

  if (jobId === undefined || status === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (typeof jobId !== 'string' && typeof jobId !== 'number') {
    return NextResponse.json({ error: 'Invalid jobId type' }, { status: 400 });
  }

  if (typeof status !== 'string') {
    return NextResponse.json({ error: 'Invalid status type' }, { status: 400 });
  }

  // Persist (replace with DB in production)
  const receivedAt = meta && typeof meta === 'object' ? meta?.receivedAt : undefined;
  jobsRepo.upsert(jobId, status, result, receivedAt);

  // Respond quickly; heavy work (DB, notifications) should be async/backgrounded
  return NextResponse.json({ ok: true });
}
