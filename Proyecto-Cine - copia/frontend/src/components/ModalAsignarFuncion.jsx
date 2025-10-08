import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

const hhmmToMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const minutesToHHMM = (min) => {
  let m = Math.max(0, min % (24 * 60));
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${String(h).padStart(2, '0')}:${mm}`;
};

export default function ModalAsignarFuncion({
  open,
  onClose,
  modo = 'crear',
  registro = null,
  onProgramar          // callback del page
}) {

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  const [peliculas, setPeliculas] = useState([]);
  const [salas,     setSalas]     = useState([]);
  const [formatos,  setFormatos]  = useState([]);
  const [idiomas,   setIdiomas]   = useState([]);

  // form
  const [id_pelicula, setIdPelicula] = useState('');
  const [id_sala,     setIdSala]     = useState('');
  const [id_formato,  setIdFormato]  = useState('');
  const [id_idioma,   setIdIdioma]   = useState('');

  const [fecha,       setFecha]      = useState('');
  const [horaInicio,  setHoraInicio] = useState('');
  const [horaFinal,   setHoraFinal]  = useState('');
  const [precio,      setPrecio]     = useState('');

  const peliSel = useMemo(() => peliculas.find(p => String(p.id) === String(id_pelicula)) || null, [peliculas, id_pelicula]);



  const handleDelete = async () => {
  if (!registro?.id) return;
  try {
    setDeleting(true);
    await axios.delete(`${API_BASE}/api/funciones/${registro.id}`);
    toast.success('Función eliminada');
    reset();
    onClose?.();
    onProgramar?.(); // recarga lista
  } catch (e) {
    toast.error('No se pudo eliminar');
  } finally {
    setDeleting(false);
    setConfirmOpen(false);
  }
};
  // Cargar catálogos
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    axios.get(`${API_BASE}/api/funciones/select-data`)
      .then(({ data }) => {
        setPeliculas(data.peliculas || []);
        setSalas(data.salas || []);
        setFormatos(data.formatos || []);
        setIdiomas(data.idiomas || []);
      })
      .catch(() => toast.error('No se pudieron cargar los catálogos'))
      .finally(() => setLoading(false));
  }, [open]);

  // Si eliges película y hay hora inicio, sugiere hora final = inicio + duracion
  useEffect(() => {
    if (!peliSel || !horaInicio) return;
    const fin = hhmmToMinutes(horaInicio) + Number(peliSel.duracion || 0);
    setHoraFinal(minutesToHHMM(fin));
  }, [peliSel, horaInicio]);

  // Si modo ver/editar, precargar (por ahora solo “crear”)
useEffect(() => {

  if (!open) return;
  if (modo === 'editar' && registro) {
    setIdPelicula(String(registro.peliculaId ?? ''));
    setIdSala(String(registro.salaId ?? ''));
    setIdFormato(String(registro.formatoId ?? ''));
    setIdIdioma(String(registro.idiomaId ?? ''));
    setFecha(registro.fecha ?? '');
    setHoraInicio(registro.horaInicio ?? '');
    setHoraFinal(registro.horaFinal ?? '');
    setPrecio(String(registro.precio ?? ''));
  }
}, [open, modo, registro]);

  const reset = () => {
    setIdPelicula(''); setIdSala(''); setIdFormato(''); setIdIdioma('');
    setFecha(''); setHoraInicio(''); setHoraFinal(''); setPrecio('');
  };

  const submit = async (e) => {
    e.preventDefault();

    if (!id_pelicula || !id_sala || !id_formato || !id_idioma) {
      return toast.warn('Completa película, sala, formato e idioma');
    }
    if (!fecha || !horaInicio || !horaFinal) {
      return toast.warn('Completa fecha y horas');
    }
    if (Number(precio) < 0) {
      return toast.warn('Precio inválido');
    }

    // Validación que permite cruzar medianoche
    const ini = hhmmToMinutes(horaInicio);
    const fin = hhmmToMinutes(horaFinal);
    const finAdj = fin <= ini ? fin + 1440 : fin;
    const dur = finAdj - ini;
    if (dur <= 0) return toast.warn('La hora final debe ser mayor a la inicial');
    if (dur > 1440) return toast.warn('Duración inválida');

    try {
      setSaving(true);

      const body = {
        id_pelicula: id_pelicula,
        id_sala: id_sala,
        id_formato: id_formato,
        id_idioma: id_idioma,
        fecha,               // 'YYYY-MM-DD'
        horaInicio,          // 'HH:MM'
        horaFinal,           // 'HH:MM'
        precio
      };

      let res;
      if (modo === 'editar' && registro?.id) {
        res = await axios.put(`${API_BASE}/api/funciones/${registro.id}`, body);
      } else {
        res = await axios.post(`${API_BASE}/api/funciones`, body);
      }

      // Si por alguna razón no viene 2xx, forzamos el error
      if (!res || res.status < 200 || res.status >= 300) {
        throw new Error(`status ${res?.status}`);
      }

      toast.success(modo === 'editar' ? 'Función actualizada' : 'Función creada');

      // Pide al page recargar; no dependemos de res.data
      onProgramar?.();

      reset();
      onClose?.();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        (modo === 'editar' ? 'No se pudo actualizar la función' : 'No se pudo crear la función');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };



  if (!open) return null;

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Programar función</h5>
              <button type="button" className="btn-close" onClick={() => { reset(); onClose?.(); }} />
            </div>

            <form onSubmit={submit} noValidate>
              <div className="modal-body">
                {loading ? (
                  <div className="text-muted">Cargando catálogos…</div>
                ) : (
                  <div className="row g-3">
                    {/* Película */}
                    <div className="col-12">
                      <label className="form-label">Película</label>
                      <select className="form-select" value={id_pelicula} onChange={e => setIdPelicula(e.target.value)} required>
                        <option value="">Seleccione…</option>
                        {peliculas.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
                      </select>
                      {peliSel?.duracion ? (
                        <small className="text-muted">Duración: {peliSel.duracion} min</small>
                      ) : null}
                    </div>

                    {/* Sala */}
                    <div className="col-md-6">
                      <label className="form-label">Sala</label>
                      <select className="form-select" value={id_sala} onChange={e => setIdSala(e.target.value)} required>
                        <option value="">Seleccione…</option>
                        {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>

                    {/* Formato */}
                    <div className="col-md-3">
                      <label className="form-label">Formato</label>
                      <select className="form-select" value={id_formato} onChange={e => setIdFormato(e.target.value)} required>
                        <option value="">Seleccione…</option>
                        {formatos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                      </select>
                    </div>

                    {/* Idioma */}
                    <div className="col-md-3">
                      <label className="form-label">Idioma</label>
                      <select className="form-select" value={id_idioma} onChange={e => setIdIdioma(e.target.value)} required>
                        <option value="">Seleccione…</option>
                        {idiomas.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                      </select>
                    </div>

                    {/* Fecha y horas */}
                    <div className="col-md-4">
                      <label className="form-label">Fecha</label>
                      <input type="date" className="form-control" value={fecha} onChange={e => setFecha(e.target.value)} required />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Hora inicio</label>
                      <input type="time" className="form-control" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} required />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Hora final</label>
                      <input type="time" className="form-control" value={horaFinal} onChange={e => setHoraFinal(e.target.value)} required />
                      <small className="text-muted">Se sugiere según la duración</small>
                    </div>

                    {/* Precio */}
                    <div className="col-md-4">
                      <label className="form-label">Precio</label>
                      <div className="input-group">
                        <span className="input-group-text">Q</span>
                        <input type="number" step="0.01" min="0" className="form-control"
                               value={precio} onChange={e => setPrecio(e.target.value)} required />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => { reset(); onClose?.(); }}>
                  Cancelar
                </button>
                 {modo === 'editar' && registro?.id && (
                   <button
                     type="button"
                     className="btn btn-outline-danger me-auto"
                     onClick={() => setConfirmOpen(true)}
                   >
                     Eliminar
                   </button>
                 )}
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar función'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      <div className="modal-backdrop fade show" />
      {/* Confirm de eliminación (overlay encima del modal) */}
{confirmOpen && (
  <div
    className="position-fixed top-0 start-0 w-100 h-100"
    style={{ zIndex: 1090 }}
    role="dialog"
    aria-modal="true"
    onKeyDown={(e) => {
      if (e.key === 'Escape' && !deleting) setConfirmOpen(false);
      if (e.key === 'Enter' && !deleting) handleDelete();
    }}
  >
    {/* Backdrop del confirm */}
    <div
      className="w-100 h-100 bg-dark bg-opacity-50"
      onClick={() => !deleting && setConfirmOpen(false)}
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
              <h6 className="fw-semibold mb-1">¿Eliminar esta función?</h6>
              <p className="text-muted small mb-0">
                Se eliminará de la sala y el horario seleccionados. Esta acción no se puede deshacer.
              </p>
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2 mt-4">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
              autoFocus
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDelete}
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

    </>
  );
}

