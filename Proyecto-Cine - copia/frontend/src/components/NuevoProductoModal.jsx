import React, { useState, useEffect } from "react";
import axios from "axios";
import { validarCamposObligatorios } from "../utils/alerta";
import { compressImage } from "../utils/compressImage";
import { toast } from "react-toastify";
import GestionLotes from "../components/GestionLotes";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

const NuevoProductoModal = ({ onClose, onProductoGuardado }) => {
  // PASO (1 = datos producto, 2 = gestión de lotes)
  const [paso, setPaso] = useState(1);

  // ---- PASO 1: Producto ----
  const [formData, setFormData] = useState({
    nombre: "",
    precioVenta: "",
    categoria: "",
    unidad: "",
    estado: "",
    imagen: null
  });

  const [unidades, setUnidades] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [estados, setEstados] = useState([]);
  const [errores, setErrores] = useState({});
  const [loading, setLoading] = useState(false);

  // ---- PASO 2: Lote (dos secciones como en las fotos) ----
  const [loteForm, setLoteForm] = useState({
    numeroLoteId: "",
    codigoLote: "",
    fechaVencimiento: "",
    cantidad: ""
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resUnidades, resCategorias, resEstados] = await Promise.all([
          axios.get(`${API_BASE}/unidadmedida`),
          axios.get(`${API_BASE}/categoria-productos`),
          axios.get(`${API_BASE}/estados-productos`)
        ]);
        setUnidades(resUnidades.data);
        setCategorias(resCategorias.data);
        setEstados(resEstados.data);
      } catch (err) {
        console.error("Error cargando datos:", err);
        toast.error("Error al cargar catálogos");
      }
    };
    fetchData();
  }, []);

  // ---- Handlers paso 1 ----
  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === "imagen") {
      setFormData({ ...formData, imagen: files?.[0] || null });
    } else {
      setFormData({ ...formData, [name]: value });
    }
    setErrores({ ...errores, [name]: "" });
  };

  const validarPaso1 = () => {
    const camposObligatorios = [
      "nombre",
      "precioVenta",
      "categoria",
      "unidad",
      "estado"
    ];

    const erroresDetectados = validarCamposObligatorios(formData, camposObligatorios);

    if (!formData.imagen) {
      erroresDetectados.imagen = "La imagen es obligatoria";
    }

    setErrores(erroresDetectados);
    return Object.keys(erroresDetectados).length === 0;
  };

  const irAPaso2 = async (e) => {
    e.preventDefault();
    if (!validarPaso1()) return;
    setPaso(2);
  };

  // ---- Guardado final (producto + producto_por_lote) ----
  const handleSubmitCompleto = async () => {
    // Validar lote (como en diseño: número de lote requerido y cantidad > 0)
    const erroresLote = {};
    if (!loteForm.numeroLoteId) erroresLote.numeroLoteId = "Seleccione un número de lote";
    if (!loteForm.cantidad || Number(loteForm.cantidad) <= 0) erroresLote.cantidad = "Ingrese una cantidad válida";
    if (loteForm.fechaVencimiento) {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const fv = new Date(loteForm.fechaVencimiento);
      fv.setHours(0,0,0,0);
      if (isNaN(fv.getTime())) erroresLote.fechaVencimiento = "Fecha inválida";
      else if (fv < hoy) erroresLote.fechaVencimiento = "No puede ser anterior a hoy";
    }
    if (Object.keys(erroresLote).length > 0) {
      toast.error("Corrige los campos del lote.");
      return;
    }

    try {
      setLoading(true);

      // 1) Crear producto (sin precioCosto)
      const data = new FormData();
      data.append("nombre", formData.nombre);
      data.append("precioVenta", Number(formData.precioVenta));
      data.append("categoria", Number(formData.categoria));
      data.append("unidad", Number(formData.unidad));
      data.append("estado", Number(formData.estado));

      const usuarioId = localStorage.getItem("userId") || 1;
      data.append("usuarioId", usuarioId);

      const compressedFile = await compressImage(formData.imagen);
      data.append("imagen", compressedFile);

      const resProducto = await axios.post(`${API_BASE}/productos`, data, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      if (!(resProducto.status === 201 || resProducto.status === 200)) {
        toast.error("❌ Error al crear producto.");
        setLoading(false);
        return;
      }

      const productoId = resProducto.data?.id || resProducto.data?.productoId || resProducto.data?.ID;

      if (!productoId) {
        toast.error("No se obtuvo el ID del producto creado.");
        setLoading(false);
        return;
      }

      // 2) Registrar cantidad por lote (producto_por_lote)
      const payloadLote = {
        productoId,
        loteId: Number(loteForm.numeroLoteId),
        cantidad: Number(loteForm.cantidad),
        ...(loteForm.fechaVencimiento ? { fechaVencimiento: loteForm.fechaVencimiento } : {})
      };

      const resPPL = await axios.post(`${API_BASE}/producto-por-lote`, payloadLote);

      if (resPPL.status === 201 || resPPL.status === 200) {
        toast.success("Producto y lote guardados correctamente");
        onProductoGuardado?.({
          producto: resProducto.data,
          porLote: resPPL.data
        });
        onClose?.();
      } else {
        toast.error("❌ Error al registrar el lote del producto.");
      }
    } catch (error) {
      console.error("❌ Error en guardado completo:", error);
      const msg = error.response?.data?.message || "Error inesperado.";
      toast.error(`⚠️ ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (campo) => `form-control ${errores[campo] ? "is-invalid" : ""}`;
  const selectClass = (campo) => `form-select ${errores[campo] ? "is-invalid" : ""}`;

  return (
    <div className="modal show d-block" tabIndex="-1" role="dialog">
      <div className="modal-dialog modal-lg" role="document">
        <div className="modal-content">
          {/* HEADER */}
          <div className="modal-header">
            <h5 className="modal-title">
              {paso === 1 ? "Agregar Nuevo Producto" : "Gestión de Lotes"}
            </h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>

          {/* BODY */}
          <div className="modal-body">
            {paso === 1 ? (
              <form onSubmit={irAPaso2} noValidate>
                <div className="row g-3">
                  {/* Nombre */}
                  <div className="col-md-6">
                    <label className="form-label">Nombre</label>
                    <input
                      type="text"
                      name="nombre"
                      value={formData.nombre}
                      onChange={handleChange}
                      className={inputClass("nombre")}
                      required
                    />
                    {errores.nombre && <div className="invalid-feedback">{errores.nombre}</div>}
                  </div>

                  {/* Precio Venta */}
                  <div className="col-md-6">
                    <label className="form-label">Precio Venta</label>
                    <input
                      type="number"
                      name="precioVenta"
                      value={formData.precioVenta}
                      onChange={handleChange}
                      className={inputClass("precioVenta")}
                      required
                    />
                    {errores.precioVenta && <div className="invalid-feedback">{errores.precioVenta}</div>}
                  </div>

                  {/* Categoría */}
                  <div className="col-md-6">
                    <label className="form-label">Categoría</label>
                    <select
                      name="categoria"
                      value={formData.categoria}
                      onChange={handleChange}
                      className={selectClass("categoria")}
                      required
                    >
                      <option value="">Seleccione una categoría</option>
                      {categorias.map((cat) => (
                        <option key={cat.ID} value={cat.ID}>
                          {cat.NOMBRE}
                        </option>
                      ))}
                    </select>
                    {errores.categoria && <div className="invalid-feedback">{errores.categoria}</div>}
                  </div>

                  {/* Unidad */}
                  <div className="col-md-6">
                    <label className="form-label">Unidad de Medida</label>
                    <select
                      name="unidad"
                      value={formData.unidad}
                      onChange={handleChange}
                      className={selectClass("unidad")}
                      required
                    >
                      <option value="">Seleccione una unidad</option>
                      {unidades.map((um) => (
                        <option key={um.ID} value={um.ID}>
                          {um.NOMBRE}
                        </option>
                      ))}
                    </select>
                    {errores.unidad && <div className="invalid-feedback">{errores.unidad}</div>}
                  </div>

                  {/* Estado */}
                  <div className="col-md-6">
                    <label className="form-label">Estado</label>
                    <select
                      name="estado"
                      value={formData.estado}
                      onChange={handleChange}
                      className={selectClass("estado")}
                      required
                    >
                      <option value="">Seleccione un estado</option>
                      {estados.map((est) => (
                        <option key={est.ID} value={est.ID}>
                          {est.NOMBRE}
                        </option>
                      ))}
                    </select>
                    {errores.estado && <div className="invalid-feedback">{errores.estado}</div>}
                  </div>

                  {/* Imagen */}
                  <div className="col-md-6">
                    <label className="form-label">Cargar Imagen</label>
                    <input
                      type="file"
                      name="imagen"
                      onChange={handleChange}
                      className={`form-control ${errores.imagen ? "is-invalid" : ""}`}
                      accept="image/*"
                      required
                    />
                    {errores.imagen && <div className="invalid-feedback">{errores.imagen}</div>}
                  </div>
                </div>

                {/* Footer del paso 1 (solo navegación) */}
                <div className="d-flex justify-content-end mt-4">
                  <button type="submit" className="btn btn-primary">
                    Siguiente
                  </button>
                </div>
              </form>
            ) : (
              // PASO 2: Gestión de Lotes (dos secciones como en las fotos)
              <GestionLotes
                values={loteForm}
                onChange={({ field, value }) =>
                  setLoteForm((prev) => ({ ...prev, [field]: value }))
                }
                onAtras={() => setPaso(1)}
                onGuardar={handleSubmitCompleto}
                loading={loading}
              />
            )}
          </div>

          {/* FOOTER global (vacío porque cada paso muestra su propio pie según el diseño) */}
          <div className="modal-footer d-none"></div>
        </div>
      </div>
    </div>
  );
};

export default NuevoProductoModal;
