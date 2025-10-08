import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import "../../styles/modals/verificar-admin.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

/**
 * Modal de verificación de administrador
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - onSuccess: (adminInfo) => void  // { id, usuario, rol, role_id }
 */
export default function VerificarAdmin({ open, onClose, onSuccess }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const userRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (open) {
      setUsuario("");
      setPassword("");
      setTimeout(() => userRef.current?.focus(), 50);

      const onKeyDown = (e) => {
        if (e.key === "Escape" && !loading) onClose?.();
        if (e.key === "Enter" && !loading) handleSubmit(e);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [open, loading, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e) => {
    if (!modalRef.current) return;
    if (modalRef.current === e.target || modalRef.current.contains(e.target)) return;
    if (!loading) onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const u = usuario.trim();
    const p = password.trim();

    if (!u || !p) {
      toast.error("Ingrese usuario y contraseña de administrador.");
      return;
    }

    try {
      setLoading(true);
      const { data } = await axios.post(`${API_BASE}/api/auth/verify-admin`, {
        username: u,
        password: p,
      });

      if (data?.ok && data?.admin) {
        toast.success("Administrador verificado.");
        onSuccess?.(data.admin);
      } else {
        toast.error(data?.message || "Credenciales inválidas.");
      }
    } catch (err) {
      const msg = err?.response?.data?.message || "No se pudo verificar admin.";
      toast.error(`❌ ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="va-backdrop"
      onMouseDown={handleBackdropClick}
      aria-modal="true"
      role="dialog"
      aria-labelledby="va-title"
      aria-describedby="va-desc"
    >
      <div className="va-card" ref={modalRef}>
        <h3 id="va-title" className="va-title">Confirmación de administrador</h3>
        <p id="va-desc" className="va-subtitle">
          Ingrese credenciales de administrador para autorizar el cierre o apertura de caja.
        </p>

        <form className="va-form" onSubmit={handleSubmit} autoComplete="off">
          <div className="va-field">
            <label className="va-label">Usuario</label>
            <input
              ref={userRef}
              type="text"
              className="va-input"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              disabled={loading}
              inputMode="text"
            />
          </div>

          <div className="va-field">
            <label className="va-label">Contraseña</label>
            <input
              type="password"
              className="va-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="va-actions">
            <button
              type="button"
              className="va-btn va-btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button type="submit" className="va-btn va-btn-primary" disabled={loading}>
              {loading ? "Verificando..." : "Autorizar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
