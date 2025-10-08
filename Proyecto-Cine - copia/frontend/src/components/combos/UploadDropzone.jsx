// src/components/combos/UploadDropzone.jsx
import React, { useRef } from "react";

export default function UploadDropzone({ value, onChange }) {
  const fileRef = useRef();
  return (
    <div className="upload-dropzone" onClick={()=>fileRef.current?.click()}>
      <input type="file" ref={fileRef} accept="image/*" hidden
             onChange={(e)=> onChange?.(e.target.files?.[0] || null)} />
      <div className="dz-placeholder">
        {value ? <span>{value.name}</span> : "⬆ Subir imagen o arrastrar aquí"}
      </div>
    </div>
  );
}
