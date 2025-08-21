import { SkyWayAuthToken } from '@skyway-sdk/token';
import { uuidV4, nowInSec } from '@skyway-sdk/room';

export default async function handler(req, res){
  try {
    const { room } = req.query;
    const appId = process.env.SKYWAY_APP_ID;
    const secret = process.env.SKYWAY_SECRET_KEY;

    if(!appId || !secret){
      return res.status(500).json({ error: 'Missing SKYWAY_APP_ID or SKYWAY_SECRET_KEY' });
    }

    const token = new SkyWayAuthToken({
      jti: uuidV4(),
      iat: nowInSec(),
      exp: nowInSec() + 60 * 15,
      scope: {
        app: {
          id: appId,
          turn: true,
          actions: ['read'],
          channels: [{
            name: room || '*',
            actions: ['read','write'],
            members: [{
              name: '*',
              actions: ['read','write'],
              publication: { actions: ['read','write'] },
              subscription: { actions: ['read','write'] }
            }],
            sfuBots: [{
              actions: ['read','write'],
              forwardings: [{ actions: ['read','write'] }]
            }]
          }]
        }
      }
    }).encode(secret);

    res.status(200).json({ token });
  } catch(e){
    res.status(500).json({ error: e.message });
  }
}