// src/components/combos/ComboFormFields.jsx
import React, { useMemo } from "react";
import UploadDropzone from "./UploadDropzone";

export default function ComboFormFields({ form, setForm, errors = {}, onClearError }) {
  const onText = (e) => {
    const { name, value } = e.target;
    const v = value.replace(/\s+/g, " ");
    setForm((p) => ({ ...p, [name]: v }));
    onClearError?.(name);
  };

  const onPrice = (e) => {
    const n = Number(e.target.value);
    setForm((p) => ({ ...p, precioCombo: Number.isFinite(n) ? Math.max(0, n) : 0 }));
    onClearError?.("precioCombo");
  };

  const onImage = (file) => {
    setForm((p) => ({ ...p, imagenFile: file || null }));
    onClearError?.("imagenFile");
  };

  // ⬇️ NUEVO: handler simple para Cantidad disponible
  const onCantidadDisponible = (e) => {
    const n = Number(e.target.value);
    setForm((p) => ({ ...p, cantidadDisponible: Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0 }));
    onClearError?.("cantidadDisponible");
  };

  const charsDesc = useMemo(() => (form.descripcion || "").length, [form.descripcion]);

  return (
    <section className="card mb-3">
      <div className="card-header">Datos del Combo</div>
      <div className="card-body">
        {/* Nombre */}
        <div className="mb-3">
          <label className="form-label">Nombre del combo *</label>
          <input
            className={`form-control ${errors.nombre ? "is-invalid" : ""}`}
            name="nombre"
            value={form.nombre}
            onChange={onText}
            placeholder="Ej. Desayuno Familiar"
            maxLength={100}
            autoComplete="off"
          />
          {errors.nombre && <div className="invalid-feedback">{errors.nombre}</div>}
        </div>

        {/* Descripción */}
        <div className="mb-3">
          <label className="form-label">Descripción (máx. 400)</label>
          <textarea
            className="form-control"
            rows={3}
            maxLength={400}
            name="descripcion"
            value={form.descripcion}
            onChange={onText}
            placeholder="Detalle del combo (opcional)"
          />
          <small className="text-muted">{charsDesc}/400 caracteres</small>
        </div>

        {/* Precio */}
        <div className="mb-3">
          <label className="form-label">Precio del combo *</label>
          <input
            className={`form-control ${errors.precioCombo ? "is-invalid" : ""}`}
            name="precioCombo"
            type="number"
            step="0.01"
            min="0"
            value={form.precioCombo}
            onChange={onPrice}
            onWheel={(e) => e.currentTarget.blur()}
            inputMode="decimal"
            placeholder="0.00"
          />
          {errors.precioCombo && <div className="invalid-feedback">{errors.precioCombo}</div>}
        </div>

        {/* Cantidad disponible (independiente del stock) */}
        <div className="mb-3">
          <label className="form-label">Cantidad disponible *</label>
          <input
            className={`form-control ${errors.cantidadDisponible ? "is-invalid" : ""}`}
            name="cantidadDisponible"
            type="number"
            step="1"
            min="0"
            value={Number.isFinite(Number(form.cantidadDisponible)) ? form.cantidadDisponible : 0}
            onChange={onCantidadDisponible}
            onWheel={(e) => e.currentTarget.blur()}
            inputMode="numeric"
            placeholder="0"
          />
          {errors.cantidadDisponible && (
            <div className="invalid-feedback">{errors.cantidadDisponible}</div>
          )}
        </div>

        {/* Estado */}
        <div className="form-check form-switch mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="activo"
            checked={!!form.activo}
            onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))}
          />
          <label className="form-check-label" htmlFor="activo">Activo</label>
        </div>

        {/* Imagen */}
        <div className={`mb-2 ${errors.imagenFile ? "is-invalid" : ""}`}>
          <UploadDropzone value={form.imagenFile} onChange={onImage} accept="image/*" />
          {errors.imagenFile && (
            <div className="invalid-feedback d-block">{errors.imagenFile}</div>
          )}
        </div>
      </div>
    </section>
  );
}
