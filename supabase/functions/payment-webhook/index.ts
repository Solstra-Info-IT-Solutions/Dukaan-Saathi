// payment-webhook (Phase 12, BL-1206; provider decision OD-05).
// Receives subscription events from the payment provider, verifies the signature over the raw body, and applies
// them with process_verified_subscription_event (service role only; S-09). Razorpay's format is implemented:
//   header X-Razorpay-Signature = hex HMAC-SHA256(raw body, RAZORPAY_WEBHOOK_SECRET)
//   the subscription's `notes` carry { shopId, planCode } (set when sales creates the subscription / payment link).
// The same event id twice is harmless (the database returns the first result).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const STATUS: Record<string, 'active' | 'past_due' | 'cancelled'> = {
  'subscription.activated': 'active',
  'subscription.charged': 'active',
  'subscription.resumed': 'active',
  'subscription.pending': 'past_due',
  'subscription.halted': 'past_due',
  'subscription.cancelled': 'cancelled',
  'subscription.completed': 'cancelled',
};

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' });
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  if (!secret) return json(503, { code: 'DS_NOT_CONFIGURED' });

  const raw = await req.text();
  const signature = req.headers.get('X-Razorpay-Signature') ?? '';
  if (!sameHex(await hmacHex(secret, raw), signature.toLowerCase())) {
    return json(401, { code: 'DS_SIGNATURE_INVALID' });
  }

  let event: {
    event?: string;
    created_at?: number;
    payload?: { subscription?: { entity?: Record<string, unknown> } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return json(400, { code: 'DS_VALIDATION_FAILED' });
  }
  const status = event.event ? STATUS[event.event] : undefined;
  const sub = event.payload?.subscription?.entity;
  if (!status || !sub) return json(200, { ignored: event.event ?? 'unknown' }); // not a subscription event

  const notes = (sub.notes ?? {}) as Record<string, unknown>;
  const eventId =
    req.headers.get('X-Razorpay-Event-Id') ?? `${String(sub.id)}:${event.event}:${event.created_at}`;
  const periodEnd =
    typeof sub.current_end === 'number' ? new Date(sub.current_end * 1000).toISOString() : undefined;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc('process_verified_subscription_event', {
    p_event: {
      provider: 'razorpay',
      eventId,
      shopId: notes.shopId,
      planCode: notes.planCode,
      status,
      ...(periodEnd ? { periodEnd } : {}),
      providerSubscriptionId: sub.id,
    },
  });
  // A bad shop or plan in the notes will not fix itself on retry: answer 200 so the provider stops, and log it.
  if (error) {
    console.error('payment-webhook', eventId, error.message);
    return json(error.message === 'DS_VALIDATION_FAILED' ? 200 : 500, { code: error.message });
  }
  return json(200, data);
});
