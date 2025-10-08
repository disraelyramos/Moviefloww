// src/pages/Combos/NuevoCombo.jsx
import React, { useMemo, useState } from "react";
import axios from "axios";
import ComboFormFields from "../../components/combos/ComboFormFields";
import ProductGallery from "../../components/combos/ProductGallery";
import ComboItemsTable from "../../components/combos/ComboItemsTable";
import FinancialSummary from "../../components/combos/FinancialSummary";
import { calcSummary } from "../../utils/combos";
import useFormErrors from "../../hooks/useFormErrors";
import { validarCamposObligatorios, mergeErrores } from "../../utils/validations";
import "../../styles/combos.css";
import { confirmarAccion } from "../../utils/confirmations";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export default function NuevoCombo() {
  const [mode, setMode] = useState("create"); // 'create' | 'edit'
  const [currentId, setCurrentId] = useState(null);
  const [generalError, setGeneralError] = useState("");

  const [form, setForm] = useState({
    nombre: "",
    descripcion: "",
    precioCombo: 0,
    cantidadDisponible: 0,
    activo: true,
    imagenFile: null,
  });

  const { errors, setErrors, clearField, clearAll } = useFormErrors();

  // [{ id, nombre, precio, img }]  // cantidad fija = 1 (no se guarda en estado)
  const [items, setItems] = useState([]);

  // Agregar si no existe (cantidad fija = 1)
  const upsertItem = (prod) => {
    setItems((prev) => {
      const exists = prev.some((p) => p.id === prod.id);
      if (exists) return prev;
      return [...prev, { id: prod.id, nombre: prod.nombre, precio: Number(prod.precio || 0), img: prod.img || null }];
    });
  };

  // Quitar item
  const removeItem = (id) => setItems((prev) => prev.filter((it) => it.id !== id));

  // Resumen: asume cantidad 1 por item
  const { suma, ahorro } = useMemo(() => {
    const precio = Number(form.precioCombo || 0);
    // calcSummary ya funciona si cada item tiene cantidad=1 por defecto
    return calcSummary(items.map(i => ({ ...i, cantidad: 1 })), Number.isFinite(precio) ? precio : 0);
  }, [items, form.precioCombo]);

  const selectedIds = useMemo(() => items.map((i) => i.id), [items]);

  // Modo edición: cargar combo (forzando cantidad = 1)
  const handleOpenCombo = (combo) => {
    setMode("edit");
    setCurrentId(Number(combo.id));
    clearAll();
    setGeneralError("");

    setForm({
      nombre: combo.nombre || "",
      descripcion: combo.descripcion || "",
      precioCombo: Number(combo.precioVenta || combo.precio || 0),
      cantidadDisponible: Number.isFinite(Number(combo.cantidadDisponible)) ? Number(combo.cantidadDisponible) : 0,
      activo: Number(combo.estadoId ?? 1) === 1,
      imagenFile: null,
    });

    const mapped = (combo.items || []).map((it) => ({
      id: it.productoId,
      nombre: it.nombre,
      precio: Number(it.precioUnitSnap || 0),
      img: it.imagen || null,
      // cantidad no se usa; si se requiere en cálculos/payload se fija a 1 al enviar
    }));
    setItems(mapped);
  };

  const resetAll = () => {
    setMode("create");
    setCurrentId(null);
    setForm({
      nombre: "",
      descripcion: "",
      precioCombo: 0,
      cantidadDisponible: 0,
      activo: true,
      imagenFile: null,
    });
    setItems([]);
    clearAll();
    setGeneralError("");
  };

  // Validaciones
  const validarAntesDeEnviar = () => {
    const base = validarCamposObligatorios(form, ["nombre"]);
    const cd = Number(form.cantidadDisponible);
    const errCant =
      Number.isFinite(cd) && cd >= 0 && Math.floor(cd) === cd
        ? {}
        : { cantidadDisponible: "Ingrese una cantidad disponible válida (entero ≥ 0)." };

    const reqImg =
      mode === "create" && !form.imagenFile
        ? { imagenFile: "La imagen es obligatoria" }
        : {};

    let itemsErr = {};
    if (items.length < 2) {
      itemsErr = { __items__: "El combo debe incluir al menos 2 productos." };
    } else if (items.length > 5) {
      itemsErr = { __items__: "El combo no puede tener más de 5 productos." };
    }

    const errs = mergeErrores(base, errCant, reqImg, itemsErr);
    setErrors(errs);
    setGeneralError(errs.__items__ || "");
    return Object.keys(errs).length === 0;
  };

  const onSave = async () => {
    setGeneralError("");
    if (!validarAntesDeEnviar()) return;

    const usuarioId = localStorage.getItem("userId") || 1;
    const precio = Number(form.precioCombo);

    if (mode === "create") {
      const fd = new FormData();
      fd.append("nombre", form.nombre.trim());
      fd.append("descripcion", form.descripcion?.trim() || "");
      fd.append("precioVenta", String(precio));
      fd.append("estado", form.activo ? "1" : "0");
      fd.append("usuarioId", String(usuarioId));
      fd.append("cantidadDisponible", String(form.cantidadDisponible));
      // cantidad fija = 1
      fd.append(
        "items",
        JSON.stringify(items.map((i) => ({ productoId: i.id, cantidad: 1 })))
      );
      fd.append("imagen", form.imagenFile);

      await confirmarAccion({
        title: "Crear combo",
        text: "¿Deseas guardar este nuevo combo?",
        confirmButtonText: "Sí, crear",
        onConfirm: async () => {
          await axios.post(`${API_BASE}/api/combos`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          resetAll();
        },
      });
    } else {
      const fd = new FormData();
      fd.append("nombre", form.nombre.trim());
      fd.append("descripcion", form.descripcion?.trim() || "");
      fd.append("precioVenta", String(precio));
      fd.append("estadoId", form.activo ? "1" : "0");
      fd.append("usuarioId", String(usuarioId));
      fd.append("cantidadDisponible", String(form.cantidadDisponible));
      if (form.imagenFile) fd.append("imagen", form.imagenFile);

      // cantidad fija = 1
      const itemsUpsert = items.map((i) => ({
        productoId: i.id,
        cantidad: 1,
      }));
      fd.append("itemsUpsert", JSON.stringify(itemsUpsert));

      await confirmarAccion({
        title: "Actualizar combo",
        text: "¿Deseas guardar los cambios?",
        confirmButtonText: "Sí, actualizar",
        onConfirm: async () => {
          await axios.put(`${API_BASE}/api/combos/${currentId}/cabecera`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          resetAll();
        },
      });
    }
  };

  return (
    <div className="container-fluid combo-grid">
      <div className="row">
        <div className="col-lg-8">
          {generalError && <div className="alert alert-danger">{generalError}</div>}

          <ComboFormFields
            form={form}
            setForm={setForm}
            errors={errors}
            onClearError={clearField}
          />

          {/* ComboItemsTable ya no recibe changeQty */}
          <ComboItemsTable items={items} removeItem={removeItem} />

          <FinancialSummary
            suma={suma}
            precioCombo={form.precioCombo}
            ahorro={ahorro}
            onCancel={resetAll}
            onSave={onSave}
          />
        </div>
        <div className="col-lg-4">
          <ProductGallery
            onPick={upsertItem}
            selectedIds={selectedIds}
            onOpenCombo={handleOpenCombo}
          />
        </div>
      </div>
    </div>
  );
}
