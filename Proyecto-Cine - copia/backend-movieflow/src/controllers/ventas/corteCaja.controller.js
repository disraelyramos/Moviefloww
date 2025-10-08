// src/controllers/ventas/corteCaja.controller.js
const db = require("../../config/db");
const oracledb = require("oracledb");

/** ====== Helpers de fechas (JS) ====== */
function yyyymmdd(date) {
  const z = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${z(date.getMonth()+1)}-${z(date.getDate())}`;
}
function startOfToday() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}
function endOfToday() {
  const d = new Date();
  d.setHours(23,59,59,999);
  return d;
}
function startOfWeek() {
  const d = new Date();
  const day = d.getDay(); // 0=domingo
  const diff = (day === 0 ? -6 : 1 - day); // lunes como inicio
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}
function endOfWeek() {
  const s = startOfWeek();
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(23,59,59,999);
  return e;
}
function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0,0,0,0);
  return d;
}
function endOfMonth() {
  const d = new Date();
  d.setMonth(d.getMonth()+1, 0);
  d.setHours(23,59,59,999);
  return d;
}

/**
 * GET /api/corte-caja/filtros
 * Devuelve opciones para los selects.
 * - cajas: IDs distintos en VENTAS.CAJA_ID (si no hay tabla de cajas).
 * - roles: SOLO los roles de usuarios que han vendido.
 * - vendedores: SOLO usuarios que han vendido (filtrable por role_id).
 * - rangos y tipos: estáticos.
 */
exports.obtenerFiltros = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();

    // --- Cajas disponibles (de ventas) ---
    const rsCajas = await cn.execute(
      `SELECT DISTINCT CAJA_ID AS ID
         FROM VENTAS
        WHERE CAJA_ID IS NOT NULL
        ORDER BY CAJA_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const cajas = (rsCajas.rows || []).map(r => ({
      id: Number(r.ID),
      nombre: `Caja ${Number(r.ID)}`
    }));

    // --- Roles presentes SOLO entre usuarios que han vendido ---
    const rsRoles = await cn.execute(
      `SELECT DISTINCT r.ID, r.NOMBRE
         FROM VENTAS v
         JOIN USUARIOS u ON u.ID = v.USUARIO_ID
         LEFT JOIN ROLES r ON r.ID = u.ROLE_ID
        WHERE NVL(u.ESTADO,1) = 1
        ORDER BY r.NOMBRE NULLS LAST`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const roles = (rsRoles.rows || []).filter(r => r.ID != null).map(r => ({
      id: Number(r.ID),
      nombre: r.NOMBRE
    }));

    // --- Vendedores (usuarios) SOLO los que tienen ventas ---
    const roleId = Number(req.query.role_id) || null;
    const vendSql = `
      SELECT DISTINCT u.ID, u.NOMBRE
        FROM VENTAS v
        JOIN USUARIOS u ON u.ID = v.USUARIO_ID
       WHERE NVL(u.ESTADO,1) = 1
         ${roleId ? "AND u.ROLE_ID = :roleId" : ""}
       ORDER BY u.NOMBRE
    `;
    const rsVend = await cn.execute(
      vendSql,
      roleId ? { roleId } : {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const vendedores = (rsVend.rows || []).map(r => ({
      id: Number(r.ID),
      nombre: r.NOMBRE
    }));

    // --- Rangos y tipos (estáticos) ---
    const rangos = [
      { value: "hoy", label: "Hoy" },
      { value: "semana", label: "Esta Semana" },
      { value: "mes", label: "Este Mes" },
      { value: "personalizado", label: "Personalizado" },
    ];
    const tipos = [
      { value: "productos", label: "Solo Productos" },
      { value: "combos", label: "Solo Combos" },
      { value: "todos", label: "Todos" },
    ];

    return res.status(200).json({
      rangos,
      cajas,
      roles,       // roles sólo de usuarios con ventas
      vendedores,  // usuarios sólo si tienen ventas
      tipos,
    });
  } catch (err) {
    console.error("❌ Error obteniendo filtros corte de caja:", err);
    return res.status(500).json({ message: "Error al obtener filtros." });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};

/**
 * GET /api/corte-caja/rangos
 * Devuelve fechas calculadas (ISO yyyy-mm-dd) para referencia del front.
 * No aplica para “personalizado”.
 */
// src/controllers/ventas/corteCaja.controller.js
exports.obtenerRangosFecha = async (req, res) => {
  try {
    // Parser flexible: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, yyyy/mm/dd
    const parseDateFlexible = (s) => {
      if (!s) return null;
      const str = String(s).trim();
      let y, m, d;

      if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(str)) {
        const sep = str.includes("/") ? "/" : "-";
        [d, m, y] = str.split(sep).map(Number);
      } else if (/^\d{4}[\/-]\d{2}[\/-]\d{2}$/.test(str)) {
        const sep = str.includes("/") ? "/" : "-";
        [y, m, d] = str.split(sep).map(Number);
      } else {
        const tmp = new Date(str);
        if (!isNaN(tmp)) {
          tmp.setHours(0, 0, 0, 0);
          return tmp;
        }
        return null;
      }

      const dt = new Date(y, (m || 1) - 1, d || 1);
      if (isNaN(dt)) return null;
      dt.setHours(0, 0, 0, 0);
      return dt;
    };

    // Si te pasan ?fecha=..., anclamos a esa fecha; si no, hoy.
    const anchorParam = (req.query.fecha || "").trim();
    const anchor =
      parseDateFlexible(anchorParam) || (d => { d.setHours(0,0,0,0); return d; })(new Date());

    // Helpers locales
    const z = (n) => String(n).padStart(2, "0");
    const iso = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
    const atStart = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const atEnd   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

    // Hoy / Ayer
    const hoyIni   = atStart(anchor), hoyFin = atEnd(anchor);
    const ayerBase = new Date(anchor); ayerBase.setDate(anchor.getDate() - 1);
    const ayerIni  = atStart(ayerBase), ayerFin = atEnd(ayerBase);

    // Semana (Lunes a Domingo)
    const wkBase = new Date(anchor);
    const dow = wkBase.getDay();                 // 0=Dom, 1=Lun...
    const diff = (dow === 0 ? -6 : 1 - dow);     // Lunes como inicio
    const wkStart = new Date(wkBase); wkStart.setDate(wkBase.getDate() + diff);
    const wkEnd   = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 6);
    const semIni  = atStart(wkStart), semFin = atEnd(wkEnd);

    // Mes
    const mStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const mEnd   = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const mesIni = atStart(mStart), mesFin = atEnd(mEnd);

    // Últimos 7 / 30 días (ventanas que terminan en 'anchor')
    const u7s  = new Date(anchor);  u7s.setDate(anchor.getDate() - 6);
    const u30s = new Date(anchor); u30s.setDate(anchor.getDate() - 29);

    return res.status(200).json({
      anchor:     iso(hoyIni),                            // referencia visual en front
      hoy:        { desde: iso(hoyIni),   hasta: iso(hoyFin) },
      ayer:       { desde: iso(ayerIni),  hasta: iso(ayerFin) },
      semana:     { desde: iso(semIni),   hasta: iso(semFin) },
      mes:        { desde: iso(mesIni),   hasta: iso(mesFin) },
      ultimos7:   { desde: iso(atStart(u7s)),  hasta: iso(hoyFin) },
      ultimos30:  { desde: iso(atStart(u30s)), hasta: iso(hoyFin) },
    });
  } catch (err) {
    console.error("❌ Error rangos fecha:", err);
    return res.status(500).json({ message: "Error al calcular rangos." });
  }
};


exports.obtenerResumen = async (req, res) => {
  const rango       = String(req.query.rango || "");
  const cajaId      = Number(req.query.caja_id) || null;
  const tipo        = String(req.query.tipo || "productos"); // default: productos
  const vendedorId  = Number(req.query.vendedor_id) || null;

  // --- helpers SOLO para parsear fechas locales (sin UTC) ---
  const parseLocalYmd = (s) => {
    if (!s) return null;
    const str = String(s).trim();
    let y, m, d;

    // dd/mm/yyyy o dd-mm-yyyy
    if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(str)) {
      const sep = str.includes('/') ? '/' : '-';
      [d, m, y] = str.split(sep).map(Number);
      return new Date(y, m - 1, d); // LOCAL
    }
    // yyyy-mm-dd o yyyy/mm/dd
    if (/^\d{4}[\/-]\d{2}[\/-]\d{2}$/.test(str)) {
      const sep = str.includes('/') ? '/' : '-';
      [y, m, d] = str.split(sep).map(Number);
      return new Date(y, m - 1, d); // LOCAL
    }

    // último intento por si viene con timestamp completo
    const t = new Date(str);
    return isNaN(t) ? null : t;
  };
  const atStart = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const atEnd   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

  // resolver fechas
  let dDesde, dHasta;
  if (rango === "hoy") {
    dDesde = startOfToday();  dHasta = endOfToday();
  } else if (rango === "semana") {
    dDesde = startOfWeek();   dHasta = endOfWeek();
  } else if (rango === "mes") {
    dDesde = startOfMonth();  dHasta = endOfMonth();
  } else if (rango === "personalizado") {
    const d1 = parseLocalYmd(req.query.desde);
    const d2 = parseLocalYmd(req.query.hasta);
    if (!d1 || !d2) return res.status(400).json({ message: "Fechas inválidas" });
    dDesde = atStart(d1);
    dHasta = atEnd(d2);
  } else {
    return res.status(400).json({ message: "rango inválido" });
  }

  if (!cajaId)      return res.status(400).json({ message: "caja_id requerido" });
  if (!vendedorId)  return res.status(400).json({ message: "vendedor_id requerido" });

  let cn;
  try {
    cn = await db.getConnection();

    const bindsBase = { f1: dDesde, f2: dHasta, cajaId, vendedorId };

    // ⬇️ Añadimos una columna literal TIPO en cada SELECT
    const qProductos = `
      SELECT
        p.NOMBRE                                   AS NOMBRE,
        'Producto'                                 AS TIPO,
        SUM(dv.CANTIDAD)                           AS CANTIDAD,
        dv.PRECIO_UNITARIO                         AS PRECIO,
        SUM(dv.SUBTOTAL_LINEA)                     AS SUBTOTAL
      FROM VENTAS v
      JOIN DETALLE_VENTA dv   ON dv.ID_VENTA = v.ID_VENTA
      JOIN PRODUCTO_NUEVO p   ON p.ID        = dv.PRODUCTO_ID
      WHERE v.FECHA BETWEEN :f1 AND :f2
        AND v.CAJA_ID   = :cajaId
        AND v.USUARIO_ID = :vendedorId
      GROUP BY p.NOMBRE, dv.PRECIO_UNITARIO
    `;

    const qCombos = `
      SELECT
        c.NOMBRE                                   AS NOMBRE,
        'Combo'                                    AS TIPO,
        SUM(vc.CANTIDAD)                           AS CANTIDAD,
        vc.PRECIO_UNITARIO                         AS PRECIO,
        SUM(vc.SUBTOTAL_LINEA)                     AS SUBTOTAL
      FROM VENTAS v
      JOIN VENTA_COMBO vc ON vc.ID_VENTA = v.ID_VENTA
      JOIN COMBO c        ON c.ID       = vc.COMBO_ID
      WHERE v.FECHA BETWEEN :f1 AND :f2
        AND v.CAJA_ID   = :cajaId
        AND v.USUARIO_ID = :vendedorId
      GROUP BY c.NOMBRE, vc.PRECIO_UNITARIO
    `;

    let rows = [];
    if (tipo === "productos") {
      const rs = await cn.execute(qProductos, bindsBase, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      rows = rs.rows || [];
    } else if (tipo === "combos") {
      const rs = await cn.execute(qCombos, bindsBase, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      rows = rs.rows || [];
    } else { // "todos": union de ambos
      const rsP = await cn.execute(qProductos, bindsBase, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const rsC = await cn.execute(qCombos,    bindsBase, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      rows = [...(rsP.rows || []), ...(rsC.rows || [])];
    }

    // Normalizar números + incluir tipo
    const data = rows.map(r => ({
      nombre:   r.NOMBRE,
      tipo:     r.TIPO || (tipo === "productos" ? "Producto" : tipo === "combos" ? "Combo" : ""),
      cantidad: Number(r.CANTIDAD || 0),
      precio:   Number(r.PRECIO || 0),
      subtotal: Number(r.SUBTOTAL || 0),
    }))
    .sort((a,b) => b.subtotal - a.subtotal || a.nombre.localeCompare(b.nombre));

    const total = data.reduce((a, x) => a + x.subtotal, 0);

    return res.status(200).json({ ok: true, rows: data, total });
  } catch (err) {
    console.error("❌ Error obtenerResumen:", err);
    return res.status(500).json({ message: "Error al obtener resumen." });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};
