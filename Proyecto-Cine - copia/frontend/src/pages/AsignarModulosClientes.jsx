import React, { useState, useEffect } from "react";
import axios from "axios";
import "../styles/asignar-modulos-Clientes.css";

const AsignarModulos = () => {
  const [busqueda, setBusqueda] = useState("");
  const [modulos, setModulos] = useState([]);
  const [mensaje, setMensaje] = useState(""); 
  const [tipoMensaje, setTipoMensaje] = useState(""); 

  // 🔹 Cargar módulos desde backend
  useEffect(() => {
    const fetchModulos = async () => {
      try {
        const res = await axios.get("http://localhost:3001/api/modulos-clientes");
        setModulos(res.data);
      } catch (error) {
        console.error("Error cargando módulos:", error);
      }
    };
    fetchModulos();
  }, []);

  // 🔎 Filtrar por búsqueda
  const modulosFiltrados = modulos.map((modulo) => ({
    ...modulo,
    opciones: modulo.opciones.filter((op) =>
      op.nombre.toLowerCase().includes(busqueda.toLowerCase())
    ),
  }));

  // 🔄 Toggle de módulo
  const toggleModulo = (id_modulo) => {
    setModulos((prev) =>
      prev.map((m) => {
        if (m.id_modulo === id_modulo) {
          const nuevoEstado = m.activo ? 0 : 1;
          return {
            ...m,
            activo: nuevoEstado,
            opciones: m.opciones.map((op) => ({
              ...op,
              activo: nuevoEstado, 
            })),
          };
        }
        return m;
      })
    );
  };

  // 🔄 Toggle de opción (solo si padre está activo)
  const toggleOpcion = (id_modulo, id_opcion) => {
    setModulos((prev) =>
      prev.map((m) => {
        if (m.id_modulo === id_modulo && m.activo) {
          return {
            ...m,
            opciones: m.opciones.map((op) =>
              op.id_opcion === id_opcion
                ? { ...op, activo: op.activo ? 0 : 1 }
                : op
            ),
          };
        }
        return m;
      })
    );
  };

  // 📌 Guardar cambios en backend
  const handleGuardar = async () => {
    try {
      const rol_id = 1; // ⚠️ aquí pasas el rol del admin autenticado
      await axios.post("http://localhost:3001/api/modulos-clientes/guardar", {
        rol_id,
        modulos,
      });

      setTipoMensaje("success");
      setMensaje("✅ Estados guardados correctamente");
      setTimeout(() => setMensaje(""), 3000);
    } catch (error) {
      console.error("Error guardando estados:", error);
      setTipoMensaje("error");
      setMensaje("❌ Error al guardar los estados");
      setTimeout(() => setMensaje(""), 3000);
    }
  };

  return (
    <div className="contenedor-asignar-modulos">
      {/* 🔎 Barra de búsqueda */}
      <div className="search-bar mb-3">
        <input
          type="text"
          className="form-control"
          placeholder="🔍 Buscar módulos u opciones..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {/* 🔹 Listado de módulos */}
      {modulosFiltrados.map((modulo) => (
        <div key={modulo.id_modulo} className="modulo-bloque mb-4">
          {/* Encabezado del módulo */}
          <div className="modulo-header d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center">
              <span className="modulo-icono me-2">
                <i className={`fa ${modulo.icono}`}></i>
              </span>
              <h5 className="mb-0">{modulo.nombre}</h5>
            </div>

            {/* Switch del módulo */}
            <div className="form-check form-switch">
              <input
                type="checkbox"
                className="form-check-input"
                checked={!!modulo.activo}
                onChange={() => toggleModulo(modulo.id_modulo)}
              />
            </div>
          </div>

          {/* Opciones dentro del módulo */}
          <div className="opciones-lista mt-3">
            {modulo.opciones.map((op) => (
              <div
                key={op.id_opcion}
                className="opcion-item d-flex align-items-center justify-content-between"
              >
                <div className="d-flex align-items-center">
                  <i className={`fa ${op.icono} me-2`}></i>
                  <span>{op.nombre}</span>
                </div>
                <div className="form-check form-switch">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={!!op.activo}
                    disabled={!modulo.activo} 
                    onChange={() => toggleOpcion(modulo.id_modulo, op.id_opcion)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 🔘 Botón Guardar */}
      <div className="text-center mt-4">
        <button
          className="btn btn-success px-4 py-2"
          onClick={handleGuardar}
        >
          💾 Guardar cambios
        </button>
      </div>

      {/* 🔔 Mensaje de alerta */}
      {mensaje && (
        <div
          className={`alert mt-3 ${
            tipoMensaje === "success" ? "alert-success" : "alert-danger"
          }`}
          role="alert"
        >
          {mensaje}
        </div>
      )}
    </div>
  );
};

export default AsignarModulos;
