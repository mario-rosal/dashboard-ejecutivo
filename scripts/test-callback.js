// Simple manual test for the pdf callback endpoint.
// Usage:
//   N8N_CALLBACK_SECRET=your_secret node scripts/test-callback.js
// Optionally override ENDPOINT=http://localhost:3000/api/pdf/callback

const crypto = require('crypto');

const ENDPOINT = process.env.ENDPOINT || 'http://localhost:3000/api/pdf/callback';
const SECRET = process.env.N8N_CALLBACK_SECRET;

if (!SECRET) {
  console.error('Missing N8N_CALLBACK_SECRET env var');
  process.exit(1);
}

const payload = {
  jobId: 'test-job-123',
  user_id: '00000000-0000-0000-0000-000000000000',
  file_source_id: 'pdf_sha256_test',
  transactions: [
    {
      date: '2024-01-01',
      amount: 100,
      type: 'income',
      category: 'Test',
      description: 'Test tx',
    },
  ],
};

const rawBody = JSON.stringify(payload);
const signature = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');

async function main() {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': signature,
      'x-job-id': payload.jobId,
    },
    body: rawBody,
  });

  console.log('status:', res.status);
  const body = await res.text();
  console.log('body:', body);
}

main().catch((err) => {
  console.error('Request failed:', err.message);
  process.exit(1);
});
