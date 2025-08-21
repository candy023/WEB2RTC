export default function handler(req, res) {
  res.status(200).json({
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    hasAppId: !!process.env.SKYWAY_APP_ID,
    hasSecret: !!process.env.SKYWAY_SECRET_KEY,
    sampleAppIdFirst8: process.env.SKYWAY_APP_ID ? process.env.SKYWAY_APP_ID.slice(0,8) : null
  });
}