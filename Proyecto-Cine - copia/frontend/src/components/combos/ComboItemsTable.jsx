// src/components/combos/ComboItemsTable.jsx
import React from "react";
import { formatMoney } from "../../utils/combos";

export default function ComboItemsTable({ items, removeItem }) {
  return (
    <section className="card mb-3">
      <div className="card-header">Items del Combo</div>
      <div className="card-body p-0">
        <table className="table table-hover mb-0">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-center">Cantidad</th>
              <th className="text-end">Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const precio = Number(it.precio || 0);
              const cant = 1; // fijo
              const subtotal = precio * cant;

              return (
                <tr key={it.id}>
                  <td>
                    <div className="d-flex flex-column">
                      <span className="fw-semibold">{it.nombre}</span>
                      <small className="text-muted">{formatMoney(precio)} c/u</small>
                    </div>
                  </td>

                  {/* Cantidad fija = 1 */}
                  <td className="text-center">
                    <span className="badge bg-secondary" aria-label="Cantidad fija">
                      1
                    </span>
                  </td>

                  <td className="text-end">
                    <strong>{formatMoney(subtotal)}</strong>
                  </td>
                  <td className="text-end">
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => removeItem(it.id)}
                      aria-label={`Quitar "${it.nombre}" de la lista`}
                      title="Quitar de la lista"
                    >
                      Quitar de la lista
                    </button>
                  </td>
                </tr>
              );
            })}

            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-4">
                  Selecciona productos de la galería →
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
