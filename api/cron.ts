import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!supabaseUrl || !supabaseKey || !vapidPublicKey || !vapidPrivateKey) {
  console.error('Missing environment variables');
} else {
  webPush.setVapidDetails(
    'mailto:your-email@example.com',
    vapidPublicKey,
    vapidPrivateKey
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  
  // Basic security check (Optional: Vercel cron triggers include a secret header you could verify)
  
  if (!supabaseUrl || !supabaseKey) {
     return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check if prayed today
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  
  const { data: historyData, error: historyError } = await supabase
    .from('prayer_history')
    .select('date')
    .eq('date', todayStr);

  if (historyError) {
    return res.status(500).json({ error: 'Failed to query history' });
  }

  // If already prayed today, do not send notification
  if (historyData && historyData.length > 0) {
    return res.status(200).json({ message: 'Already prayed today. No notification sent.' });
  }

  // If not prayed, get subscriptions
  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('*');

  if (subsError) {
    return res.status(500).json({ error: 'Failed to query subscriptions' });
  }

  if (!subs || subs.length === 0) {
    return res.status(200).json({ message: 'No push subscriptions found.' });
  }

  const notificationPayload = {
    title: 'Waktunya Sembahyang Malam',
    body: 'Terus jaga sradha dan bhakti Anda. Jangan lupa sembahyang malam ini!',
  };

  const pushPromises = subs.map((sub) => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        auth: sub.auth,
        p256dh: sub.p256dh,
      },
    };

    return webPush.sendNotification(pushSubscription, JSON.stringify(notificationPayload)).catch((err) => {
      console.error('Error sending push notification to endpoint', sub.endpoint, err);
      // Optional: if error is 410 Gone, delete subscription from Supabase
    });
  });

  await Promise.all(pushPromises);

  return res.status(200).json({ message: 'Push notifications sent successfully!' });
}
