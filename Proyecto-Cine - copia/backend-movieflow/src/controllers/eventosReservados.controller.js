const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const USER    = process.env.DB_USER;
const PASSWORD= process.env.DB_PASSWORD;
const CONNECT = process.env.DB_CONNECTION_STRING;
const SCHEMA  = (process.env.DB_SCHEMA || USER || '').toUpperCase().trim();
const T = (name) => (SCHEMA ? `${SCHEMA}.${name}` : name);

async function getConn() {
  return oracledb.getConnection({ user: USER, password: PASSWORD, connectString: CONNECT });
}

// -------- Detección dinámica de columnas --------
let metaChecked = false;
let hasReservadoPor = false;

async function ensureMetadata(connOpt) {
  if (metaChecked) return;
  let conn = connOpt;
  try {
    if (!conn) conn = await getConn();
    const sql = `
      SELECT COUNT(*) AS CNT
      FROM ALL_TAB_COLUMNS
      WHERE OWNER = :owner AND TABLE_NAME = :table AND COLUMN_NAME = 'RESERVADO_POR'
    `;
    const r = await conn.execute(sql, { owner: SCHEMA, table: 'EVENTOS_RESERVADOS' });
    const cnt = (r.rows?.[0]?.CNT ?? r.rows?.[0]?.cnt ?? 0);
    hasReservadoPor = Number(cnt) > 0;
  } catch {
    hasReservadoPor = false;
  } finally {
    metaChecked = true;
    if (!connOpt && conn) try { await conn.close(); } catch(_) {}
  }
}

// --------- Crear ---------
exports.crearEventoReservado = async (req, res) => {
  const {
    salaId, titulo, tipo,
    descripcion = null,
    fecha, horaInicio, horaFinal,
    contactoNombre = null, contactoTelefono = null, contactoEmail = null,
    reservadoPor = null
  } = req.body || {};

  if (!salaId || !titulo || !tipo || !fecha || !horaInicio || !horaFinal) {
    return res.status(400).json({ message: 'salaId, titulo, tipo, fecha, horaInicio y horaFinal son obligatorios.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
    return res.status(400).json({ message: 'Formato de fecha inválido (use YYYY-MM-DD).' });
  }
  if (!/^\d{2}:\d{2}$/.test(String(horaInicio)) || !/^\d{2}:\d{2}$/.test(String(horaFinal))) {
    return res.status(400).json({ message: 'Formato de hora inválido (use HH:MM).' });
  }

  let conn;
  try {
    conn = await getConn();
    await ensureMetadata(conn);

    const cols = [
      'SALA_ID','TITULO','DESCRIPCION','TIPO',
      'FECHA','HORA_INICIO','HORA_FINAL','ESTADO',
      ...(hasReservadoPor?['RESERVADO_POR']:[]),
      'CONTACTO_NOMBRE','CONTACTO_TELEFONO','CONTACTO_EMAIL'
    ];
    const vals = [
      ':salaId',':titulo',':descripcion',':tipo',
      "TO_DATE(:fecha,'YYYY-MM-DD')",':horaInicio',':horaFinal',"'RESERVADO'" ,
      ...(hasReservadoPor?[':reservadoPor']:[]),
      ':contactoNombre',':contactoTelefono',':contactoEmail'
    ];

    const sql = `
      INSERT INTO ${T('EVENTOS_RESERVADOS')}
        (${cols.join(', ')})
      VALUES
        (${vals.join(', ')})
      RETURNING ID INTO :id
    `;

    const binds = {
      salaId:Number(salaId),
      titulo:String(titulo).trim(),
      descripcion,
      tipo:String(tipo).trim(),
      fecha:String(fecha),
      horaInicio:String(horaInicio),
      horaFinal:String(horaFinal),
      ...(hasReservadoPor?{reservadoPor: reservadoPor?Number(reservadoPor):null}:{ }),
      contactoNombre, contactoTelefono, contactoEmail,
      id:{ dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    };

    const result = await conn.execute(sql, binds, { autoCommit:true });
    return res.status(201).json({ id: result.outBinds.id?.[0], message:'Evento reservado creado.' });

  } catch (err) {
    console.error('[crearEventoReservado]', err);
    const code = err?.errorNum; const msg = String(err?.message||'');
    if (msg.includes('ORA-20000')) return res.status(400).json({ message:'La hora final debe ser mayor a la hora inicio.' });
    if (msg.includes('ORA-20001')) return res.status(409).json({ message:'Solapamiento con otro evento reservado en la misma sala.' });
    if (msg.includes('ORA-20002')) return res.status(409).json({ message:'Solapamiento con una función programada en la misma sala.' });
    if (code===942)  return res.status(500).json({ message:`Tabla no encontrada: ${T('EVENTOS_RESERVADOS')}.` });
    if (code===1031) return res.status(500).json({ message:`Permisos insuficientes para ${T('EVENTOS_RESERVADOS')}.` });
    if (code===4098) return res.status(500).json({ message:'Trigger inválido en EVENTOS_RESERVADOS (recompila).' });
    return res.status(500).json({ message:'Error al crear evento reservado.' });
  } finally { if (conn) try { await conn.close(); } catch(_){} }
};

// --------- Listar ---------
exports.listarEventosReservados = async (req, res) => {
  const { fecha, salaId } = req.query;
  let where = '1=1';
  const binds = {};
  if (fecha)  { where += ` AND FECHA = TO_DATE(:fecha, 'YYYY-MM-DD')`; binds.fecha = String(fecha); }
  if (salaId) { where += ` AND SALA_ID = :salaId`;                    binds.salaId = Number(salaId); }

  let conn;
  try {
    conn = await getConn();
    await ensureMetadata(conn);

    const selectCols = [
      'ID','SALA_ID','TITULO','DESCRIPCION','TIPO',
      "TO_CHAR(FECHA,'YYYY-MM-DD') AS FECHA_ISO",
      'HORA_INICIO','HORA_FINAL','ESTADO',
      ...(hasReservadoPor?['RESERVADO_POR']:[]),
      'CONTACTO_NOMBRE','CONTACTO_TELEFONO','CONTACTO_EMAIL'
    ];

    const sql = `
      SELECT ${selectCols.join(', ')}
      FROM ${T('EVENTOS_RESERVADOS')}
      WHERE ${where}
      ORDER BY SALA_ID, FECHA, HORA_INICIO
    `;
    const result = await conn.execute(sql, binds);
    const rows = (result.rows||[]).map(r => ({
      id:r.ID, salaId:r.SALA_ID, titulo:r.TITULO, descripcion:r.DESCRIPCION, tipo:r.TIPO,
      fecha:r.FECHA_ISO, horaInicio:r.HORA_INICIO, horaFinal:r.HORA_FINAL,
      estado:r.ESTADO,
      ...(hasReservadoPor?{reservadoPor:r.RESERVADO_POR}:{ }),
      contactoNombre:r.CONTACTO_NOMBRE, contactoTelefono:r.CONTACTO_TELEFONO, contactoEmail:r.CONTACTO_EMAIL
    }));
    return res.json(rows);

  } catch (err) {
    console.error('[listarEventosReservados]', err);
    const code = err?.errorNum;
    if (code===942)  return res.status(500).json({ message:`Tabla no encontrada: ${T('EVENTOS_RESERVADOS')}.` });
    if (code===1031) return res.status(500).json({ message:`Permisos insuficientes para leer ${T('EVENTOS_RESERVADOS')}.` });
    return res.status(500).json({ message:'Error al listar eventos reservados.' });
  } finally { if (conn) try { await conn.close(); } catch(_){} }
};

// --------- Actualizar ---------
exports.actualizarEventoReservado = async (req, res) => {
  const { id } = req.params;
  const {
    salaId, titulo, tipo,
    descripcion = null,
    fecha, horaInicio, horaFinal,
    contactoNombre = null, contactoTelefono = null, contactoEmail = null,
    reservadoPor = null
  } = req.body || {};

  if (!id)    return res.status(400).json({ message:'Id requerido.' });
  if (!salaId || !titulo || !tipo || !fecha || !horaInicio || !horaFinal) {
    return res.status(400).json({ message:'salaId, titulo, tipo, fecha, horaInicio y horaFinal son obligatorios.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
    return res.status(400).json({ message:'Formato de fecha inválido (use YYYY-MM-DD).' });
  }
  if (!/^\d{2}:\d{2}$/.test(String(horaInicio)) || !/^\d{2}:\d{2}$/.test(String(horaFinal))) {
    return res.status(400).json({ message:'Formato de hora inválido (use HH:MM).' });
  }

  let conn;
  try {
    conn = await getConn();
    await ensureMetadata(conn);

    // 1) Leer actual para saber si cambian horario/sala
    const qSel = `
      SELECT SALA_ID,
             TO_CHAR(FECHA,'YYYY-MM-DD') AS FECHA_ISO,
             HORA_INICIO, HORA_FINAL
      FROM ${T('EVENTOS_RESERVADOS')}
      WHERE ID = :id
    `;
    const sel = await conn.execute(qSel, { id: Number(id) });
    if (!sel.rows || !sel.rows.length) {
      return res.status(404).json({ message: 'Evento no encontrado.' });
    }
    const cur = sel.rows[0];
    const mismoHorarioYSala =
      Number(cur.SALA_ID) === Number(salaId) &&
      String(cur.FECHA_ISO) === String(fecha) &&
      String(cur.HORA_INICIO).slice(0,5) === String(horaInicio).slice(0,5) &&
      String(cur.HORA_FINAL ).slice(0,5) === String(horaFinal ).slice(0,5);

    // 2) Construir SET dinámico
    const sets = [
      'TITULO = :titulo',
      'DESCRIPCION = :descripcion',
      'TIPO = :tipo',
      'CONTACTO_NOMBRE = :contactoNombre',
      'CONTACTO_TELEFONO = :contactoTelefono',
      'CONTACTO_EMAIL = :contactoEmail'
    ];
    const binds = {
      id: Number(id),
      titulo: String(titulo).trim(),
      descripcion,
      tipo: String(tipo).trim(),
      contactoNombre, contactoTelefono, contactoEmail
    };

    // Solo si cambian sala/fecha/horas, agregamos esas columnas (esto dispara el trigger)
    if (!mismoHorarioYSala) {
      sets.unshift('SALA_ID = :salaId');
      sets.push("FECHA = TO_DATE(:fecha,'YYYY-MM-DD')");
      sets.push('HORA_INICIO = :horaInicio');
      sets.push('HORA_FINAL  = :horaFinal');
      Object.assign(binds, {
        salaId: Number(salaId),
        fecha: String(fecha),
        horaInicio: String(horaInicio),
        horaFinal: String(horaFinal)
      });
    }

    if (hasReservadoPor) {
      sets.push('RESERVADO_POR = :reservadoPor');
      binds.reservadoPor = reservadoPor ? Number(reservadoPor) : null;
    }

    const sql = `
      UPDATE ${T('EVENTOS_RESERVADOS')}
         SET ${sets.join(', ')}
       WHERE ID = :id
    `;

    const r = await conn.execute(sql, binds, { autoCommit: true });
    if ((r.rowsAffected || 0) === 0) return res.status(404).json({ message: 'Evento no encontrado.' });
    return res.json({ message: 'Evento actualizado.' });

  } catch (err) {
    console.error('[actualizarEventoReservado]', err);
    const code = err?.errorNum; const msg = String(err?.message || '');
    if (msg.includes('ORA-20000')) return res.status(400).json({ message: 'La hora final debe ser mayor a la hora inicio.' });
    if (msg.includes('ORA-20001')) return res.status(409).json({ message: 'Solapamiento con otro evento reservado en la misma sala.' });
    if (msg.includes('ORA-20002')) return res.status(409).json({ message: 'Solapamiento con una función programada en la misma sala.' });
    if (code === 942)  return res.status(500).json({ message: `Tabla no encontrada: ${T('EVENTOS_RESERVADOS')}.` });
    if (code === 1031) return res.status(500).json({ message: `Permisos insuficientes para actualizar ${T('EVENTOS_RESERVADOS')}.` });
    return res.status(500).json({ message: 'Error al actualizar evento reservado.' });
  } finally {
    if (conn) try { await conn.close(); } catch(_) {}
  }
};


// --------- Cancelar (soft-delete) ---------
exports.cancelarEventoReservado = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message:'Id requerido.' });

  let conn;
  try {
    conn = await getConn();
    const sql = `UPDATE ${T('EVENTOS_RESERVADOS')} SET ESTADO='CANCELADO' WHERE ID=:id`;
    const r = await conn.execute(sql, { id:Number(id) }, { autoCommit:true });
    if ((r.rowsAffected||0) === 0) return res.status(404).json({ message:'Evento no encontrado.' });
    return res.json({ message:'Evento cancelado.' });
  } catch (err) {
    console.error('[cancelarEventoReservado]', err);
    const code = err?.errorNum;
    if (code===942)  return res.status(500).json({ message:`Tabla no encontrada: ${T('EVENTOS_RESERVADOS')}.` });
    if (code===1031) return res.status(500).json({ message:`Permisos insuficientes para actualizar ${T('EVENTOS_RESERVADOS')}.` });
    return res.status(500).json({ message:'Error al cancelar evento reservado.' });
  } finally { if (conn) try { await conn.close(); } catch(_){} }
};
