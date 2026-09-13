'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { FormState } from '@/app/(auth)/setup/actions';
import { registrarEntradaAction, registrarSalidaAction } from './actions';

const FORM_INITIAL: FormState = { ok: false };

type CamaraEstado = 'inactiva' | 'activando' | 'transmitiendo' | 'capturada' | 'no_disponible';

export function CameraCapture({ accion }: { accion: 'checkin' | 'checkout' }) {
  const action = accion === 'checkin' ? registrarEntradaAction : registrarSalidaAction;
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, FORM_INITIAL);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camara, setCamara] = useState<CamaraEstado>('inactiva');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ultimoEnviado, setUltimoEnviado] = useState<'checkin' | 'checkout' | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Al cambiar de acción (p. ej. tras un check-in exitoso, la página pasa de
  // `checkin` a `checkout`) se resetea solo el estado de cámara/foto — nunca
  // se reutiliza la foto de una acción anterior en la siguiente. El banner de
  // éxito no depende de `accion` (ver `ultimoEnviado`), así que este efecto no
  // lo toca. Este efecto sincroniza con sistemas externos (el `MediaStream`
  // de la cámara y el nodo DOM nativo del `<input type="file">`, vía refs) —
  // no puede expresarse como estado derivado durante el render porque los
  // refs no son accesibles ahí (regla `react-hooks/refs`), así que el
  // `setState` que acompaña ese reset se deshabilita puntualmente abajo.
  useEffect(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    /* eslint-disable react-hooks/set-state-in-effect -- sincroniza estado de React con refs externos (stream/input) al cambiar `accion`; no puede derivarse en render porque los refs no son accesibles ahí */
    setCamara('inactiva');
    setPreviewUrl(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [accion]);

  async function activarCamara() {
    setCamara('activando');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamara('transmitiendo');
    } catch {
      // Permiso denegado, sin cámara, cámara ocupada, o contexto inseguro — se
      // continúa sin foto (spec §2/§9: nunca se bloquea el registro por esto).
      setCamara('no_disponible');
    }
  }

  function capturar() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const input = fileInputRef.current;
    if (!video || !canvas || !input) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'captura.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      setPreviewUrl(URL.createObjectURL(blob));
      setCamara('capturada');
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }, 'image/jpeg', 0.85);
  }

  const etiqueta = accion === 'checkin' ? 'Marcar entrada' : 'Marcar salida';

  return (
    <form
      action={formAction}
      onSubmit={() => setUltimoEnviado(accion)}
      className="space-y-4 rounded-card border border-line bg-surface p-4"
    >
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      {state.ok && ultimoEnviado && !pending ? (
        <p className="rounded-control bg-primary-soft px-3 py-2 text-sm text-ink">
          {ultimoEnviado === 'checkin' ? 'Entrada registrada.' : 'Salida registrada.'}
        </p>
      ) : null}

      <input ref={fileInputRef} type="file" name="foto" accept="image/jpeg" className="hidden" />

      {camara === 'inactiva' ? (
        <Button type="button" variant="secondary" className="w-full" onClick={activarCamara}>
          Activar cámara
        </Button>
      ) : null}
      {camara === 'activando' ? (
        <p className="text-sm text-ink-muted">Solicitando acceso a la cámara…</p>
      ) : null}
      {camara === 'no_disponible' ? (
        <p className="rounded-control bg-surface-raised px-3 py-2 text-sm text-ink-muted">
          No se pudo acceder a la cámara — se registrará sin foto.
        </p>
      ) : null}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={camara === 'transmitiendo' ? 'w-full rounded-control' : 'hidden'}
      />
      <canvas ref={canvasRef} className="hidden" />

      {camara === 'transmitiendo' ? (
        <Button type="button" variant="secondary" className="w-full" onClick={capturar}>
          Capturar foto
        </Button>
      ) : null}

      {camara === 'capturada' && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa local (object URL), no aplica next/image
        <img src={previewUrl} alt="Foto capturada" className="h-32 w-32 rounded-control object-cover" />
      ) : null}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={camara === 'activando'}
        pending={pending}
        pendingLabel="Registrando…"
      >
        {etiqueta}
      </Button>
    </form>
  );
}
