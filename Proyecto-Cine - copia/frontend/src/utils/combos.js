// src/utils/combos.js
// src/utils/combos.js
export const formatMoney = (n = 0) =>
  `Q${Number(n || 0).toFixed(2)}`;

export const calcSummary = (items = [], precioCombo = 0) => {
  const suma = items.reduce((acc, it) => acc + (Number(it.precio) * Number(it.cantidad || 1)), 0);
  const ahorro = Number(precioCombo) - suma; // positivo = combo más caro; negativo = ahorro
  return { suma, ahorro };
};
