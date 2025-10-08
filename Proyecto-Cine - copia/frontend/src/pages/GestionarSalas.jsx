import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

export default function GestionarSalas() {
  const [salas, setSalas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [nombre, setNombre] = useState('');
  const [capacidad, setCapacidad] = useState('');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [salaToDelete, setSalaToDelete] = useState(null);


  const titulo = useMemo(() => editing ? 'Editar sala' : 'Agregar sala', [editing]);

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(`${API_BASE}/api/salas`);
      setSalas(data || []);
    } catch {
      toast.error('No se pudieron cargar las salas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const abrirCrear = () => {
    setEditing(null);
    setNombre('');
    setCapacidad('');
    setModalOpen(true);
  };

  const abrirEditar = (s) => {
    setEditing(s);
    setNombre(s.nombre);
    setCapacidad(String(s.capacidad));
    setModalOpen(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return toast.warn('Nombre requerido');
    if (Number(capacidad) <= 0) return toast.warn('Capacidad debe ser > 0');

    try {
      if (editing) {
        await axios.put(`${API_BASE}/api/salas/${editing.id}`, { nombre, capacidad });
        toast.success('Sala actualizada');
      } else {
        await axios.post(`${API_BASE}/api/salas`, { nombre, capacidad });
        toast.success('Sala creada');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al guardar');
    }
  };

  const solicitarEliminar = (s) => {
  setSalaToDelete(s);
  setConfirmOpen(true);
    };

    const cancelarEliminar = () => {
  if (deleting) return;
  setConfirmOpen(false);
  setSalaToDelete(null);
    };

    const confirmarEliminar = async () => {
  if (!salaToDelete) return;
  try {
    setDeleting(true);
    await axios.delete(`${API_BASE}/api/salas/${salaToDelete.id}`);
    toast.success('Sala eliminada');
    cancelarEliminar();
    await load(); // recarga la tabla
  } catch (err) {
    toast.error(err?.response?.data?.message || 'No se pudo eliminar');
  } finally {
    setDeleting(false);
  }
};


  return (
    <div className="container py-3">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Salas</h2>
        <button className="btn btn-success" onClick={abrirCrear}>
          <i className="fas fa-plus me-2" /> Agregar sala
        </button>
      </div>

      {loading ? (
        <div className="text-muted">Cargando…</div>
      ) : salas.length === 0 ? (
        <div className="text-muted">No hay salas registradas.</div>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th style={{width:'60%'}}>Nombre</th>
                <th style={{width:'20%'}}>Capacidad</th>
                <th style={{width:'20%'}} className="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {salas.map(s => (
                <tr key={s.id}>
                  <td>{s.nombre}</td>
                  <td>{s.capacidad}</td>
                  <td className="text-end">
                    <button className="btn btn-sm btn-outline-primary me-2" onClick={() => abrirEditar(s)}>
                      <i className="fas fa-pen" /> Editar
                    </button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => solicitarEliminar(s)}>
                      <i className="fas fa-trash" /> Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <>
          <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true">
            <div className="modal-dialog">
              <div className="modal-content">
                <form onSubmit={guardar} noValidate>
                  <div className="modal-header">
                    <h5 className="modal-title">{titulo}</h5>
                    <button type="button" className="btn-close" onClick={() => setModalOpen(false)} />
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label">Nombre</label>
                      <input className="form-control" value={nombre} onChange={e => setNombre(e.target.value)} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Capacidad</label>
                      <input type="number" min="1" className="form-control" value={capacidad} onChange={e => setCapacidad(e.target.value)} />
                    </div>
                    {editing && (
                      <small className="text-muted">
                        Nota: No podrás eliminar la sala si tiene funciones asignadas.
                      </small>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary">Guardar</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}

        {confirmOpen && (
            <div
                className="position-fixed top-0 start-0 w-100 h-100"
                style={{ zIndex: 1090 }}
                role="dialog"
                aria-modal="true"
                onKeyDown={(e) => {
                if (e.key === 'Escape' && !deleting) cancelarEliminar();
                if (e.key === 'Enter' && !deleting) confirmarEliminar();
                }}
            >
                {/* Backdrop */}
                <div
                className="w-100 h-100 bg-dark bg-opacity-50"
                onClick={() => !deleting && cancelarEliminar()}
                />
                {/* Panel */}
                <div className="position-absolute top-50 start-50 translate-middle" style={{ minWidth: 380 }}>
                <div className="card shadow-lg rounded-3">
                    <div className="card-body">
                    <div className="d-flex align-items-start gap-3">
                        <div className="rounded-circle bg-danger bg-opacity-10 p-2">
                        <i className="fas fa-exclamation-triangle text-danger"></i>
                        </div>
                        <div className="flex-grow-1">
                        <h6 className="fw-semibold mb-1">¿Eliminar esta sala?</h6>
                        <p className="text-muted small mb-0">
                            Se eliminará la sala “{salaToDelete?.nombre}”. Esta acción no se puede deshacer.
                        </p>
                        </div>
                    </div>

                    <div className="d-flex justify-content-end gap-2 mt-4">
                        <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={cancelarEliminar}
                        disabled={deleting}
                        autoFocus
                        >
                        Cancelar
                        </button>
                        <button
                        type="button"
                        className="btn btn-danger"
                        onClick={confirmarEliminar}
                        disabled={deleting}
                        >
                        {deleting ? 'Eliminando…' : 'Eliminar'}
                        </button>
                    </div>
                    </div>
                </div>
                </div>
            </div>
            )}


    </div>
  );
}
