// src/components/combos/ProductGallery.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

/* =======================
   CONFIG
======================= */
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const PRODUCT_CATEGORY_ID_COMBO_ALIAS = 1;

/* =======================
   HELPERS
======================= */
const toNumberSafe = (v, def = 0) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : def;
  if (v == null) return def;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : def;
};

const mapProducto = (p) => ({
  id: p.id ?? p.ID,
  nombre: p.nombre ?? p.NOMBRE ?? "",
  precio: toNumberSafe(p.precio ?? p.PRECIO_VENTA),
  precioVenta: toNumberSafe(p.precio ?? p.precioVenta ?? p.PRECIO_VENTA),
  categoriaId: p.categoria ?? p.CATEGORIA_ID ?? null,
  categoriaNombre: p.categoriaNombre ?? p.CATEGORIA_NOMBRE ?? "",
  imagen: p.imagen ?? p.IMAGEN ?? null,
  estado: String(p.estado ?? p.ESTADO ?? "").toUpperCase(),
  cantidad: toNumberSafe(p.cantidad ?? p.CANTIDAD, 0),
  unidadMedida: p.unidad_medida ?? p.UNIDAD_MEDIDA ?? "",
  alerta: p.alerta ?? p.ALERTA ?? "",
  tipo: "PRODUCTO",
});

const mapCombo = (c) => {
  const precioNum = toNumberSafe(c.precio ?? c.precioVenta ?? c.PRECIO_VENTA);
  const cant = toNumberSafe(c.cantidadDisponible ?? c.CANTIDAD_DISPONIBLE, 0);
  const cantTexto = c.cantidadDisponibleTexto ?? `cantidad disponible : ${cant}`;
  return {
    id: c.id ?? c.ID,
    nombre: c.nombre ?? c.NOMBRE ?? "",
    descripcion: c.descripcion ?? c.DESCRIPCION ?? "",
    precio: precioNum,
    precioVenta: precioNum,
    imagen: c.imagen ?? c.IMAGEN ?? null,
    estado: toNumberSafe(c.estado ?? c.ESTADO_ID ?? 0),
    categoriaId: c.categoriaId ?? c.CATEGORIA_ID ?? null,
    categoriaNombre: c.categoriaNombre ?? c.CATEGORIA_NOMBRE ?? "",
    fechaCreacion: c.fechaCreacion ?? c.FECHA_CREACION ?? null,
    cantidadDisponible: cant,           // numérico
    cantidadDisponibleTexto: cantTexto, // “cantidad disponible : X”
    tipo: "COMBO",
  };
};

const badgeInfo = (p) => {
  const estado = (p.estado || "").toUpperCase();
  const sinStock = p.cantidad <= 0;
  if (sinStock) return { text: "Sin stock", cls: "badge-danger", disabled: true };
  if (estado === "BLOQUEADO") return { text: "Bloqueado", cls: "badge-danger", disabled: true };
  if (estado === "VENCIDO") return { text: "Vencido", cls: "badge-danger", disabled: true };
  if (estado === "POR_VENCER") return { text: "Por vencer", cls: "badge-warning", disabled: false };
  if (estado === "STOCK_BAJO") return { text: "Stock bajo", cls: "badge-warning", disabled: false };
  return { text: "", cls: "badge-neutral", disabled: false };
};

/* =======================
   COMPONENTE
======================= */
export default function ProductGallery({
  onPick,
  selectedIds = [],
  onOpenCombo = () => {}, // callback al padre con el combo completo
}) {
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("todos");

  const [categoriasProducto, setCategoriasProducto] = useState([]);
  const [productos, setProductos] = useState([]);

  const [combos, setCombos] = useState([]);
  const [loadingCombos, setLoadingCombos] = useState(false);
  const [openingId, setOpeningId] = useState(null); // loading por combo al abrir

  /* Cargar categorías + productos (sin combos) */
  useEffect(() => {
    (async () => {
      try {
        const [catProdRes, prodRes] = await Promise.all([
          axios.get(`${API_BASE}/api/categoria-productos`),
          axios.get(`${API_BASE}/api/personal-ventas/productos`),
        ]);

        setCategoriasProducto(Array.isArray(catProdRes.data) ? catProdRes.data : []);
        const productosNormalizados = (prodRes.data || []).map(mapProducto);
        setProductos(
          productosNormalizados.filter(
            (x) => Number(x.categoriaId) !== Number(PRODUCT_CATEGORY_ID_COMBO_ALIAS)
          )
        );
      } catch (err) {
        console.error("❌ Error cargando productos:", err);
        setCategoriasProducto([]);
        setProductos([]);
      }
    })();
  }, []);

  /* Cargar combos (buscar por nombre con /api/combos/buscar) */
  useEffect(() => {
    if (activeFilter !== "combos") return;

    let cancel;
    const timer = setTimeout(async () => {
      try {
        setLoadingCombos(true);
        const { data } = await axios.get(`${API_BASE}/api/combos/buscar`, {
          params: { q: q.trim() },
          cancelToken: new axios.CancelToken((c) => (cancel = c)),
        });
        setCombos((Array.isArray(data) ? data : []).map(mapCombo));
      } catch (err) {
        if (!axios.isCancel(err)) {
          console.error("❌ Error buscando combos:", err);
          setCombos([]);
        }
      } finally {
        setLoadingCombos(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      if (cancel) cancel();
    };
  }, [activeFilter, q]);

  /* Filtro de productos por texto y categoría */
  const filteredProductos = useMemo(() => {
    const txt = q.trim().toLowerCase();
    return productos.filter((p) => {
      const byCat =
        activeFilter === "todos" ||
        (activeFilter !== "combos" &&
          String(p.categoriaNombre || "").toLowerCase() === String(activeFilter).toLowerCase());
      const byTxt = !txt || String(p.nombre || "").toLowerCase().includes(txt);
      return byCat && byTxt;
    });
  }, [q, activeFilter, productos]);

  const handlePick = (p, disabled) => {
    if (disabled || activeFilter === "combos") return;
    onPick?.(p);
  };

  // Abrir combo completo al hacer click en la imagen
  const handleOpenCombo = async (combo) => {
    try {
      setOpeningId(combo.id);
      const { data } = await axios.get(`${API_BASE}/api/combos/${combo.id}`);
      onOpenCombo?.(data);
    } catch (err) {
      console.error("❌ Error obteniendo combo completo:", err);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <aside className="card h-100 d-flex flex-column">
      <div className="card-header d-flex align-items-center justify-content-between">
        <span>🧺 Galería de Productos</span>
      </div>

      <div className="card-body d-flex flex-column">
        <div className="pill-row mb-2" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <button
            type="button"
            className={`btn btn-sm ${activeFilter === "combos" ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setActiveFilter("combos")}
          >
            Combos
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeFilter === "todos" ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setActiveFilter("todos")}
          >
            Todos
          </button>
          {categoriasProducto.map((c) => (
            <button
              key={c.ID}
              type="button"
              className={`btn btn-sm ${activeFilter === c.NOMBRE ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setActiveFilter(c.NOMBRE)}
            >
              {c.NOMBRE}
            </button>
          ))}
        </div>

        {/* Buscador (aplica a ambos) */}
        <input
          className="form-control mb-2"
          placeholder={activeFilter === "combos" ? "Buscar combos por nombre..." : "Buscar productos..."}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="gallery-viewport" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {activeFilter === "combos" ? (
            <>
              <h6 className="mb-2">Combos</h6>
              <div className="gallery-grid">
                {loadingCombos && <div className="text-muted">Cargando combos…</div>}
                {!loadingCombos && combos.length === 0 && (
                  <div className="text-muted">No hay combos registrados.</div>
                )}

                {combos.map((c) => (
                  <div key={c.id} className="prod-card">
                    <div
                      className="prod-thumb"
                      style={{ cursor: "pointer", position: "relative" }}
                      onClick={() => handleOpenCombo(c)}
                      title="Ver detalle del combo"
                    >
                      {c.imagen ? <img src={c.imagen} alt={c.nombre} /> : null}
                      {openingId === c.id && (
                        <span
                          className="loading-overlay"
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            background: "rgba(255,255,255,0.5)",
                          }}
                        >
                          Cargando…
                        </span>
                      )}
                    </div>
                    <div className="prod-name">{c.nombre}</div>
                    <div className="prod-price">Q{toNumberSafe(c.precio ?? c.precioVenta).toFixed(2)}</div>

                    {c.descripcion && (
                      <div className="prod-meta" style={{ opacity: 0.8 }}>
                        {c.descripcion}
                      </div>
                    )}

                    {/* NUEVO: mostrar “cantidad disponible : X” */}
                    <div className="prod-meta" style={{ opacity: 0.9 }}>
                      {c.cantidadDisponibleTexto}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="gallery-grid">
              {filteredProductos.map((p) => {
                const { text: badgeText, cls: badgeClass, disabled } = badgeInfo(p);
                const isSelected = selectedIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`prod-card ${isSelected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                    onClick={() => handlePick(p, disabled)}
                    aria-disabled={disabled}
                    tabIndex={disabled ? -1 : 0}
                    title={disabled ? "No disponible para agregar" : "Agregar al combo"}
                  >
                    {badgeText && <span className={`estado-badge ${badgeClass}`}>{badgeText}</span>}
                    <div className="prod-thumb">
                      {p.imagen ? <img src={p.imagen} alt={p.nombre} /> : null}
                    </div>
                    <div className="prod-name">{p.nombre}</div>
                    <div className="prod-price">Q{toNumberSafe(p.precio ?? p.precioVenta).toFixed(2)}</div>
                    <div className="prod-meta">
                      Cantidad: {p.cantidad} {p.unidadMedida ? `| ${p.unidadMedida}` : ""}
                    </div>
                    {!badgeText && p.alerta && (
                      <div className="prod-meta" style={{ opacity: 0.75 }}>{p.alerta}</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
