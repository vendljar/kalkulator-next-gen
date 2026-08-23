import { json } from '../lib/sdilene.mjs';
export default async () => json({ ok: true }, 200,
  { 'Set-Cookie': 'relace=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' });
export const config = { path: '/api/odhlaseni' };
