# Asistente de IA embebido

Chat flotante disponible en toda pantalla autenticada del ERP (`src/app/(app)/layout.tsx`).
Resuelve dudas de uso y errores comunes citando el manual del sistema; si no puede
resolver algo, ofrece el contacto de soporte.

## Piezas

| Archivo | Rol |
|---|---|
| `src/components/assistant/AssistantWidget.tsx` | UI del chat (cliente). Detecta el módulo actual con `usePathname()`, guarda el historial en memoria de React (se pierde al recargar — no se persiste en BD). |
| `src/app/api/asistente/route.ts` | Route Handler `POST`. Exige sesión, valida el body, limita por usuario y llama a Gemini. |
| `src/lib/assistant/knowledge.ts` | Mapa `pathname → módulo` + límites reales del sistema (`SYSTEM_BOUNDARIES`), para que el agente nunca ofrezca una función que el ERP no tiene. |
| `src/lib/assistant/manual.ts` | Parsea `docs/manual-de-usuario.md` en secciones por encabezado; memoizado en proceso. |
| `src/lib/assistant/prompt.ts` | Arma la instrucción de sistema (persona, tono, contexto, marcador de escalamiento). |
| `src/lib/assistant/gemini.ts` | Cliente REST de la Generative Language API de Google. |
| `src/lib/assistant/rate-limit.ts` | Límite fijo de 8 preguntas/minuto por usuario (protege el costo de la API, no es control de acceso). |
| `src/lib/validation/assistant.ts` | Schema zod del body del chat. |

## Cómo usar

1. Copia tu API key de Gemini a `.env` como `GEMINI_API_KEY` (nunca a `.env.example` ni al repo).
2. Opcional: `GEMINI_MODEL` (default `gemini-flash-latest`, el alias de Google que sigue apuntando al flash vigente), `SUPPORT_EMAIL`, `SUPPORT_PHONE`
   (se muestran al usuario cuando el agente no puede resolver algo).
3. `npm run dev` — el botón "?" aparece abajo a la derecha en cualquier pantalla dentro de `(app)`.

Si `GEMINI_API_KEY` no está configurada, o la llamada a Gemini falla, el endpoint
responde igual con `200` y un mensaje de respaldo que invita a contactar soporte
(`escalate: true`) — el widget nunca se rompe por eso.

## Cómo personalizar

- **Nuevo módulo o ruta**: agrega una entrada a `MODULE_MAP` en `knowledge.ts` con el
  prefijo de la ruta y las palabras clave del encabezado del manual que quieres citar.
- **Tono o alcance de las respuestas**: edita `buildSystemInstruction` en `prompt.ts`.
- **Límites del sistema**: si el ERP gana una función nueva (p. ej. timbrado real de
  CFDI), quita la línea correspondiente de `SYSTEM_BOUNDARIES` — si no, el agente
  seguirá diciendo (correctamente) que no existe.
- **Contacto de soporte**: variables de entorno `SUPPORT_EMAIL` / `SUPPORT_PHONE`, sin
  tocar código.

## Cómo escalar

- **Otra fuente de conocimiento** (además del manual de usuario): agrega un segundo
  `findSectionByKeywords`-like helper apuntando a otro documento, o combina extractos
  en `getModuleContext`.
- **Persistir conversaciones** (auditoría, analítica): hoy el historial vive solo en
  el estado de React del widget. Para guardarlo, agrega una tabla y escribe desde
  `route.ts` tras la respuesta de Gemini — decisión deliberadamente fuera de este
  alcance inicial por privacidad (no se guarda sin pedirlo explícitamente).
- **Streaming de la respuesta**: `askGemini` usa `generateContent` (una sola
  respuesta). Cambiar a `streamGenerateContent` + Server-Sent Events es la vía si se
  necesita feedback token a token.
- **RBAC por rol**: el agente hoy es visible para cualquier usuario autenticado. Si se
  quiere limitar (p. ej. solo Administradores en `/admin/*`), añade un chequeo `can()`
  en `AssistantWidget` o en el route handler.

## Qué NO hace (a propósito)

- No hay RAG/embeddings/vector DB: el "contexto relevante" es una sección del manual
  elegida por la ruta actual, no una búsqueda semántica. Es determinista, barato y
  suficiente para el tamaño actual del manual.
- No ejecuta acciones en el sistema (no cierra cajas, no cancela ventas): solo
  instruye. Cualquier automatización real es una ampliación de alcance deliberada,
  no un descuido.
