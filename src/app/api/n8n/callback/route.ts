import { NextResponse } from 'next/server';
import { verifyHmac } from '@/lib/n8n/verifyHmac';
import { jobsRepo } from '@/lib/n8n/jobsRepo';

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

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Minimal validation
  const { jobId, status, result, meta } = payload || {};
  if (jobId === undefined || status === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Persist (replace with DB in production)
  jobsRepo.upsert(jobId, status, result, meta?.receivedAt);

  // Respond quickly; heavy work (DB, notifications) should be async/backgrounded
  return NextResponse.json({ ok: true });
}
