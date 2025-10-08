import React, { useEffect, useState } from "react";
import axios from "axios";

const DashboardCliente = () => {
  const [name, setName] = useState("");
  const [menu, setMenu] = useState([]); // 🔹 Menú dinámico desde backend
  const [vistaActiva, setVistaActiva] = useState(null); // 🔹 Vista actual seleccionada

  useEffect(() => {
    // 📌 Buscar datos guardados en login con Google
    const userData =
      JSON.parse(localStorage.getItem("userData")) ||
      JSON.parse(sessionStorage.getItem("userData"));

    if (userData && userData.name) {
      setName(userData.name);
    }

    // 📌 Cargar menú dinámico desde backend
    const fetchMenu = async () => {
      try {
        const res = await axios.get(
          "http://localhost:3001/api/modulos-clientes/activos"
        );
        setMenu(res.data);
      } catch (err) {
        console.error("❌ Error cargando menú cliente:", err);
      }
    };

    fetchMenu();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "linear-gradient(135deg, #1c1c1c, #333)",
        color: "#fff",
      }}
    >
      {/* 🔹 Menú lateral dinámico */}
      <aside
        style={{
          width: "250px",
          background: "#222",
          padding: "1rem",
          borderRight: "2px solid #444",
          overflowY: "auto",
        }}
      >
        <h3 style={{ marginBottom: "1rem", color: "#22c55e" }}>Menú Cliente</h3>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {menu.map((modulo) => (
            <li
              key={modulo.id_modulo}
              style={{
                marginBottom: "1rem",
                cursor: "pointer",
                fontWeight:
                  vistaActiva?.id_modulo === modulo.id_modulo ? "bold" : "normal",
                color:
                  vistaActiva?.id_modulo === modulo.id_modulo ? "#22c55e" : "#fff",
              }}
              onClick={() => setVistaActiva(modulo)}
            >
              <i className={`fa ${modulo.icono} me-2`}></i> {modulo.nombre}
            </li>
          ))}
        </ul>
      </aside>

      {/* 🔹 Contenido principal */}
      <main
        style={{
          flex: 1,
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>
          🎬 Bienvenido {name || "Cliente"}
        </h1>

        {/* Si no se selecciona módulo */}
        {!vistaActiva && (
          <p style={{ opacity: 0.7 }}>Selecciona un módulo del menú.</p>
        )}

        {/* Vista de módulo seleccionado */}
        {vistaActiva && (
          <div>
            <h2 style={{ color: "#22c55e" }}>
              <i className={`fa ${vistaActiva.icono} me-2`}></i>{" "}
              {vistaActiva.nombre}
            </h2>
            <div
              style={{
                display: "flex",
                gap: "1rem",
                marginTop: "1rem",
                flexWrap: "wrap",
              }}
            >
              {vistaActiva.opciones.map((op) => (
                <button
                  key={op.id_opcion}
                  style={{
                    padding: "1rem",
                    borderRadius: "10px",
                    border: "none",
                    background: "#444",
                    color: "#fff",
                    cursor: "pointer",
                    minWidth: "150px",
                    textAlign: "center",
                    transition: "0.3s",
                  }}
                  onClick={() => alert(`👉 Ejecutando: ${op.accion}`)}
                >
                  <i className={`fa ${op.icono} me-2`}></i>
                  {op.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default DashboardCliente;
