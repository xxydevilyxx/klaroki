export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://klaroki3.vercel.app';

  if (!secretKey || !priceId) {
    return res.status(500).json({ error: 'Stripe ist auf dem Server noch nicht vollständig konfiguriert.' });
  }

  try {
    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('success_url', `${siteUrl}/?premium=success`);
    params.set('cancel_url', `${siteUrl}/?premium=cancelled`);
    params.set('billing_address_collection', 'auto');
    params.set('allow_promotion_codes', 'true');

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await stripeResponse.json();
    if (!stripeResponse.ok || !data.url) {
      return res.status(502).json({ error: data?.error?.message || 'Stripe konnte die Checkout-Session nicht erstellen.' });
    }

    return res.status(200).json({ url: data.url });
  } catch (error) {
    return res.status(500).json({ error: 'Der Stripe-Checkout konnte nicht gestartet werden.' });
  }
}
