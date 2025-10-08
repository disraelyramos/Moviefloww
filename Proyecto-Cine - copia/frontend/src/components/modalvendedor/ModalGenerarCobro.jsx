// src/components/modalvendedor/ModalGenerarCobro.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import { confirmarAccion } from "../../utils/confirmations";
import { toast } from "react-toastify";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const ModalGenerarCobro = ({ visible, onClose, pedido, onGenerarTicket }) => {
  const [dineroRecibido, setDineroRecibido] = useState("");
  const [estadoPago, setEstadoPago] = useState(null); // "faltante" | "ok" | null
  const [faltante, setFaltante] = useState(0);
  const [cambio, setCambio] = useState(0);

  // Totales
  const subtotal = pedido.reduce(
    (acc, item) => acc + Number(item.precio || 0) * Number(item.cantidad || 0),
    0
  );
  const total = subtotal;

  // Validar pago en tiempo real
  useEffect(() => {
    if (dineroRecibido === "" || isNaN(dineroRecibido)) {
      setEstadoPago(null);
      return;
    }
    const recibido = parseFloat(dineroRecibido);
    if (recibido < total) {
      setEstadoPago("faltante");
      setFaltante((total - recibido).toFixed(2));
      setCambio(0);
    } else {
      setEstadoPago("ok");
      setCambio((recibido - total).toFixed(2));
      setFaltante(0);
    }
  }, [dineroRecibido, total]);

  const handleGenerarTicket = async () => {
    if (estadoPago !== "ok") return;

    await confirmarAccion({
      title: "¿Desea generar el ticket?",
      text: "Se procesará la venta y se generará el comprobante.",
      confirmButtonText: "Sí, generar",
      onConfirm: async () => {
        const usuario_id =
          JSON.parse(localStorage.getItem("userData"))?.id ||
          JSON.parse(sessionStorage.getItem("userData"))?.id;

        try {
          // 1) Verificar caja abierta
          const { data } = await axios.get(`${API_BASE}/api/cajas/estado`, {
            params: { usuario_id },
          });

          if (!data.abierta) {
            toast.error(data?.message || "❌ No tienes ninguna caja abierta.");
            return;
          }

          const caja_id = data.datos.CAJA_ID;

          // 2) Procesar venta — mapeo correcto de PRODUCTOS vs COMBOS
          const payloadCarrito = pedido.map((item) => {
            const base = {
              cantidad: Number(item.cantidad),
              precio_unitario: Number(item.precio),
            };
            if (String(item?.tipo || "").toUpperCase() === "COMBO") {
              return { ...base, combo_id: Number(item.id) }; // 👈 combo
            }
            return { ...base, producto_id: Number(item.id) }; // 👈 producto
          });

          const res = await axios.post(`${API_BASE}/api/personal-ventas/procesar`, {
            usuario_id,
            caja_id,
            dinero_recibido: parseFloat(dineroRecibido),
            cambio: parseFloat(cambio),
            carrito: payloadCarrito,
          });

          // Callback al padre
          onGenerarTicket?.(res.data);

          // Abrir PDF del ticket
          const idVenta =
            res.data?.venta?.ID_VENTA ||
            res.data?.venta?.id_venta ||
            res.data?.id_venta;

          if (idVenta) {
            window.open(`${API_BASE}/api/ticket-pdf/${idVenta}`, "_blank");
          } else {
            throw new Error(
              "No se pudo obtener el ID de la venta para generar el ticket PDF."
            );
          }

          // Limpiar y cerrar
          setDineroRecibido("");
          onClose();
        } catch (error) {
          const msg =
            error?.response?.data?.message ||
            error?.message ||
            "Error procesando la venta";
          toast.error(msg);
        }
      },
    });
  };

  if (!visible) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-contenido">
        <h2 className="titulo-modal">💳 Procesar Venta</h2>

        {/* Resumen del pedido estilo ticket */}
        <div className="resumen-pedido">
          <h4>Resumen del Pedido:</h4>

          {/* Encabezados */}
          <div className="resumen-item resumen-head" aria-hidden="true">
            <span className="descripcion"><strong>Descripción</strong></span>
            <span className="cantidad"><strong>Cantidad</strong></span>
            <span className="precio"><strong>Precio</strong></span>
            <span className="subtotal"><strong>Subtotal</strong></span>
          </div>

          {pedido.map((item) => (
            <div key={item.id} className="resumen-item">
              <span className="descripcion">
                {item.nombre}
                {String(item?.tipo || "").toUpperCase() === "COMBO" ? " (Combo)" : ""}
              </span>
              <span className="cantidad">{Number(item.cantidad || 0)}</span>
              <span className="precio">Q{Number(item.precio || 0).toFixed(2)}</span>
              <span className="subtotal">
                Q{(Number(item.precio || 0) * Number(item.cantidad || 0)).toFixed(2)}
              </span>
            </div>
          ))}

          <hr />
          <p className="total">
            TOTAL: <span>Q{total.toFixed(2)}</span>
          </p>
        </div>

        {/* Ingreso de dinero */}
        <div className="dinero-recibido">
          <label>Dinero Recibido:</label>
          <input
            type="number"
            placeholder="Q0.00"
            value={dineroRecibido}
            onChange={(e) => setDineroRecibido(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && estadoPago === "ok") handleGenerarTicket();
            }}
          />
        </div>

        {/* Estado del pago */}
        {estadoPago === "faltante" && (
          <div className="alerta alerta-error">
            ❌ Dinero insuficiente: Faltan Q{faltante}
          </div>
        )}
        {estadoPago === "ok" && (
          <div className="alerta alerta-ok">Cambio a entregar: Q{cambio}</div>
        )}

        {/* Acciones */}
        <div className="acciones">
          <button
            className="btn-generar"
            disabled={estadoPago !== "ok"}
            onClick={handleGenerarTicket}
          >
            Generar Ticket
          </button>
          <button className="btn-cancelar" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalGenerarCobro;
