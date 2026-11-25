// Prueba de extremo a extremo del ciclo de vida de una solicitud.
// Requisitos: servidor corriendo (npm run dev) y usuarios creados (npm run seed).
// Ejecutar en otra terminal:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.API_URL || 'http://localhost:3000/api';

async function api(ruta, { metodo = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const login = async (correo, password) => {
  const r = await api('/auth/login', { metodo: 'POST', body: { correo, password } });
  assert.equal(r.status, 200, `Login falló para ${correo}`);
  return r.data;
};

test('ciclo de vida completo de una solicitud', async (t) => {
  const correo = `usuario${Date.now()}@correo.com`;
  const otro = `otro${Date.now()}@correo.com`;
  let solicitudId, tecnico, usuario, admin, tokenOtro;

  await t.test('registro y login de usuarios', async () => {
    for (const c of [correo, otro]) {
      const r = await api('/auth/registro', { metodo: 'POST', body: { nombre: 'Prueba', correo: c, password: '12345678' } });
      assert.equal(r.status, 201);
    }
    usuario = await login(correo, '12345678');
    tokenOtro = (await login(otro, '12345678')).token;
    admin = await login('admin@soporte.com', 'Admin12345');
    tecnico = await login('tecnico@soporte.com', 'Tecnico12345');
  });

  await t.test('el usuario registra una solicitud en estado REGISTRADA', async () => {
    const cats = await api('/catalogos/categorias', { token: usuario.token });
    const r = await api('/solicitudes', {
      metodo: 'POST', token: usuario.token,
      body: { categoria_id: cats.data[0].id, descripcion: 'El PC-01 no enciende', prioridad: 'ALTA' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.estado, 'REGISTRADA');
    assert.match(r.data.codigo, /^SOP-\d{4}-\d{5}$/);
    solicitudId = r.data.id;
  });

  await t.test('no se puede registrar sin descripción', async () => {
    const r = await api('/solicitudes', { metodo: 'POST', token: usuario.token, body: { categoria_id: 1 } });
    assert.equal(r.status, 400);
  });

  await t.test('un usuario no puede ver la solicitud de otro', async () => {
    const r = await api(`/solicitudes/${solicitudId}`, { token: tokenOtro });
    assert.equal(r.status, 403);
  });

  await t.test('el usuario no puede saltarse el ciclo de vida', async () => {
    const r = await api(`/solicitudes/${solicitudId}/estado`, {
      metodo: 'PATCH', token: usuario.token, body: { estado: 'EN_PROCESO' },
    });
    assert.ok([403, 409].includes(r.status));
  });

  await t.test('solo admin/supervisor asignan', async () => {
    const malo = await api(`/solicitudes/${solicitudId}/asignar`, {
      metodo: 'PATCH', token: usuario.token, body: { responsable_id: tecnico.usuario.id },
    });
    assert.equal(malo.status, 403);

    const ok = await api(`/solicitudes/${solicitudId}/asignar`, {
      metodo: 'PATCH', token: admin.token, body: { responsable_id: tecnico.usuario.id },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.estado, 'ASIGNADA');
  });

  await t.test('el técnico atiende y resuelve (la solución es obligatoria)', async () => {
    const enProceso = await api(`/solicitudes/${solicitudId}/estado`, {
      metodo: 'PATCH', token: tecnico.token, body: { estado: 'EN_PROCESO' },
    });
    assert.equal(enProceso.status, 200);

    const sinSolucion = await api(`/solicitudes/${solicitudId}/estado`, {
      metodo: 'PATCH', token: tecnico.token, body: { estado: 'RESUELTA' },
    });
    assert.equal(sinSolucion.status, 400);

    const resuelta = await api(`/solicitudes/${solicitudId}/estado`, {
      metodo: 'PATCH', token: tecnico.token, body: { estado: 'RESUELTA', solucion: 'Se cambió la fuente de poder' },
    });
    assert.equal(resuelta.status, 200);
    assert.equal(resuelta.data.estado, 'RESUELTA');
  });

  await t.test('el usuario cierra y ya no se puede modificar', async () => {
    const cerrada = await api(`/solicitudes/${solicitudId}/estado`, {
      metodo: 'PATCH', token: usuario.token, body: { estado: 'CERRADA' },
    });
    assert.equal(cerrada.status, 200);
    assert.equal(cerrada.data.estado, 'CERRADA');

    const modificar = await api(`/solicitudes/${solicitudId}/estado`, {
      metodo: 'PATCH', token: tecnico.token, body: { estado: 'EN_PROCESO' },
    });
    assert.equal(modificar.status, 409);

    const obs = await api(`/solicitudes/${solicitudId}/observaciones`, {
      metodo: 'POST', token: admin.token, body: { texto: 'Nota tardía' },
    });
    assert.equal(obs.status, 409);
  });

  await t.test('el historial conserva los 5 cambios con usuario y motivo', async () => {
    const r = await api(`/solicitudes/${solicitudId}`, { token: usuario.token });
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.data.historial.map((h) => h.estado_nuevo),
      ['REGISTRADA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA']
    );
    assert.ok(r.data.historial.every((h) => h.usuario && h.motivo));
  });

  await t.test('se generaron notificaciones internas', async () => {
    const r = await api('/notificaciones', { token: usuario.token });
    assert.equal(r.status, 200);
    assert.ok(r.data.length >= 3);
  });
});
