import assert from 'node:assert/strict';

export const BASE = process.env.API_URL || 'http://localhost:3000/api';

export async function api(ruta, { metodo = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

export async function login(correo, password) {
  const r = await api('/auth/login', { metodo: 'POST', body: { correo, password } });
  assert.equal(r.status, 200, `Login falló para ${correo}`);
  return r.data;
}
