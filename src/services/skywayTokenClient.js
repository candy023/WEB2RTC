/**
 * SkyWay トークンを Serverless Function (/api/skyway-token) から取得する
 * roomId: 省略時は ワイルドカード権限トークン (実験用)
 */
export async function fetchSkywayToken(roomId) {
  const url = `/api/skyway-token${roomId ? `?room=${encodeURIComponent(roomId)}` : ''}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Failed token: ${res.status}`);
  }
  const { token } = await res.json();
  return token;
}