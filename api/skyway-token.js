import { SkyWayAuthToken } from '@skyway-sdk/token';

const uuidV4 = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random()*16)|0;
    const v = c === 'x' ? r : (r&0x3)|0x8;
    return v.toString(16);
  });
};
const nowInSec = () => Math.floor(Date.now()/1000);

export default async function handler(req, res) {
  try {
    console.log('[skyway-token] start', { query: req.query });

    const { room } = req.query;
    const appId = process.env.SKYWAY_APP_ID;
    const secret = process.env.SKYWAY_SECRET_KEY;

    console.log('[skyway-token] env check', {
      hasAppId: !!appId,
      hasSecret: !!secret,
      vercelEnv: process.env.VERCEL_ENV
    });

    if (!appId || !secret) {
      return res.status(500).json({ error: 'Missing SKYWAY_APP_ID or SKYWAY_SECRET_KEY' });
    }

    const targetRoom = room || '*';
    const iat = nowInSec();
    const exp = iat + 60 * 15;

    console.log('[skyway-token] building token payload', { targetRoom, iat, exp });

    const tokenObj = new SkyWayAuthToken({
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
    });

    console.log('[skyway-token] encoding');
    const token = tokenObj.encode(secret);

    console.log('[skyway-token] success');
    res.status(200).json({ token });
  } catch (e) {
    console.error('[skyway-token] error', e);
    res.status(500).json({ error: e.message, stack: e.stack?.split('\n').slice(0,3) });
  }
}