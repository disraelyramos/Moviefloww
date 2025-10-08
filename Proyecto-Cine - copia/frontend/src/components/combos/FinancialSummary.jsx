// src/components/combos/FinancialSummary.jsx
import React from "react";
import { formatMoney } from "../../utils/combos";

export default function FinancialSummary({ suma, precioCombo, ahorro, onCancel, onSave }) {
  const precio = Number(precioCombo || 0);
  // calcular ahorro real por si el padre envía otro criterio
  const ahorroCalc = Number(suma || 0) - precio; // >0 => sí hay ahorro

  return (
    <section className="card gradient-box mb-3">
      <div className="card-body">
        <div className="d-flex justify-content-between">
          <span>Suma de componentes</span>
          <strong>{formatMoney(Number(suma || 0))}</strong>
        </div>
        <div className="d-flex justify-content-between">
          <span>Precio del combo</span>
          <strong>{formatMoney(precio)}</strong>
        </div>
        <div className="d-flex justify-content-between">
          <span>Ahorro estimado</span>
          <strong className={ahorroCalc > 0 ? "text-success" : "text-danger"}>
            {formatMoney(ahorroCalc)}
          </strong>
        </div>
      </div>
      <div className="card-footer d-flex gap-2 justify-content-end">
        <button className="btn btn-outline-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" onClick={onSave}>Guardar combo</button>
      </div>
    </section>
  );
}
