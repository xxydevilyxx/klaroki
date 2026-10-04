export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
  const moneytizerConfigured = Boolean(process.env.MONEYTIZER_SITE_ID || process.env.MONEYTIZER_ID || process.env.THE_MONEYTIZER_SITE_ID);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ stripeConfigured, moneytizerConfigured });
}
