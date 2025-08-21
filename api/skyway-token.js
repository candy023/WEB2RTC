import { SkyWayAuthToken } from '@skyway-sdk/token';

// Node 標準で UUID と現在時刻(秒)
const uuidV4 = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 古い Node の場合 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
const nowInSec = () => Math.floor(Date.now() / 1000);

export default async function handler(req, res) {
  try {
    const { room } = req.query;
    const appId = process.env.SKYWAY_APP_ID;
    const secret = process.env.SKYWAY_SECRET_KEY;

    if (!appId || !secret) {
      return res.status(500).json({ error: 'Missing SKYWAY_APP_ID or SKYWAY_SECRET_KEY' });
    }

    // 必要に応じて room 名をバリデーション（英数字のみ等）
    // const safeRoom = (room || '').replace(/[^a-zA-Z0-9_-]/g, '') || '*';
    const targetRoom = room || '*';

    const iat = nowInSec();
    const exp = iat + 60 * 15; // 15分

    const token = new SkyWayAuthToken({
      jti: uuidV4(),
      iat,
      exp,
      scope: {
        app: {
          id: appId,
          turn: true,
          actions: ['read'],
          channels: [
            {
              name: targetRoom,
              actions: ['read', 'write'],
              members: [
                {
                  name: '*',
                  actions: ['read', 'write'],
                  publication: { actions: ['read', 'write'] },
                  subscription: { actions: ['read', 'write'] }
                }
              ],
              sfuBots: [
                {
                  actions: ['read', 'write'],
                  forwardings: [{ actions: ['read', 'write'] }]
                }
              ]
            }
          ]
        }
      }
    }).encode(secret);

    res.status(200).json({ token });
  } catch (e) {
    console.error('[skyway-token] error:', e);
    res.status(500).json({ error: e.message });
  }
}