# FASE 6 — Rediseño UI/UX del POS (Diseño)

**Fecha:** 2026-09-05
**Depende de:** Bloques 1-6 (ya en `master`), auditados en FASE 1 sin errores funcionales. Este trabajo es **exclusivamente visual/UX** — no agrega, quita ni modifica funcionalidad ni reglas de negocio, salvo las excepciones explícitas listadas en la Sección 8.

## 1. Resumen

El POS debe sentirse como software empresarial neutral y profesional, usable por cualquier tipo de negocio, sin identidad visual atada a una industria. Hoy no existe una capa de componentes o tokens compartida: se contaron **16 variantes distintas** del mismo "botón primario" repetidas por todo el código, cero paleta de colores definida (solo utilidades sueltas de Tailwind), y la tipografía Geist se carga pero nunca se aplica (`globals.css` la pisa con Arial/Helvetica). Este documento define el sistema de diseño que reemplaza eso, y la guía de aplicación por pantalla.

## 2. Filosofía (verbatim del brief aprobado)

Orden de prioridad: **Simple → Intuitivo → Minimalista → Rápido → Claro → Profesional → Consistente → Estéticamente agradable.**

Principio rector: *"El usuario debe saber qué hacer a continuación de manera natural"* — sin manual. Menos elementos, mejor organizados. Ante la duda entre una solución vistosa y una sencilla-pero-intuitiva, siempre la sencilla.

Evitar explícitamente: menús complejos, exceso de botones/colores/tarjetas/sombras, iconos ambiguos, información repetida, ventanas emergentes innecesarias, animaciones excesivas, texto técnico, configuraciones escondidas.

## 3. Fundamentos visuales (tokens)

### 3.1 Color

Todos los colores de esta sección son la paleta **estándar de Tailwind v4** (`slate`, `indigo`, `green`, `amber`, `red`) — ya disponibles vía `@import "tailwindcss"` sin necesidad de definir variables `@theme` ni valores hexadecimales a mano. Esta sección es una convención de USO (qué familia/tono para qué significado), no una paleta custom que haya que construir.

- **Neutro (base):** escala `slate` de Tailwind (50→900) — ya es la que usa todo el sistema hoy; se formaliza, no se reemplaza.
- **Acento único (acciones principales, foco, navegación activa):** **índigo** (`indigo-600` default / `indigo-700` hover-activo / `indigo-50`+`indigo-700` para superficies suaves). Aprobado sobre azul en la sesión de diseño.
- **Semánticos, uso moderado (badge/banner de superficie suave — nunca como fondo grande de pantalla):**
  - Éxito: `green-600` texto / `green-50` fondo (ej. `green-800` sobre `green-100`)
  - Advertencia: `amber-700` texto / `amber-100` fondo
  - Error/peligro: `red-700` texto / `red-100` fondo (más `red-600` sólido para el botón de confirmación de una acción destructiva)
  - Información: **se usa el neutro slate**, no un quinto color — un aviso informativo ("no hay caja abierta") es `slate-50`/`slate-700`, no un azul aparte que compita con el acento.
- Total de familias de color en todo el sistema: **5** (slate, índigo, verde, ámbar, rojo). Nada de un color por tarjeta/módulo.

### 3.2 Tipografía

- Familia: **Geist Sans** (ya cargada vía `next/font/google` en `layout.tsx`, actualmente ignorada por `globals.css`). Se corrige `globals.css` para que `body` use `var(--font-geist-sans)` de verdad. Geist Mono se conserva para folios/códigos si aplica (`tabular-nums` ya se usa para alinear cifras — se mantiene).
- Escala mapeada a roles concretos (no tamaños sueltos por archivo):

  | Rol | Tamaño/peso | Dónde |
  |---|---|---|
  | Total de venta / cifra crítica | 34–36px, 800 | TOTAL en Ventas/POS, diferencia de arqueo en Caja |
  | Título de página | 24px, 700 | `<h1>` de cada pantalla |
  | Encabezado de sección | 18px, 600 | `<h2>`/tarjetas ("Totales", "Movimientos") |
  | Cuerpo / celdas de tabla | 14–15px, 400 | contenido normal, formularios |
  | Etiqueta / auxiliar | 12–13px, 500, `slate-500` | metadatos, ayudas de campo |

### 3.3 Espaciado, radios, sombras (restricción deliberada)

- Radios: `rounded-md` (6px) en controles pequeños, `rounded-lg` (8px) en tarjetas/contenedores — dos valores, no más.
- Sombras: `shadow-sm` únicamente en botones primarios y elementos flotantes (menús, modales); el resto usa borde `border-slate-200`, no sombra. Evita el "exceso de sombras" que pide el brief.
- Espaciado: escala de Tailwind sin modificar (4px base); tarjetas con `p-4`/`p-5`, separación entre secciones `space-y-6` — ya es el patrón dominante hoy, se vuelve regla explícita en vez de accidental.

## 4. Primitivos compartidos (`src/components/ui/`)

Reemplazan las clases sueltas repetidas. Cada uno es un componente de presentación pura (sin lógica de negocio), consumido por todas las pantallas.

- **`Button`** — variantes `primary | secondary | danger | danger-solid`, tamaños `sm | md`. Una sola pantalla tiene, como máximo, **un** botón `primary` visible a la vez (la acción principal). Soporta un estado `pending` con `pendingLabel` (consolida los `SubmitBtn` locales duplicados en varios formularios hoy).
- **`Badge`** — tono `success | warning | danger | neutral`. Un tono = un significado, igual en todo el sistema (ej. `warning` siempre es "stock bajo"/"retiro", nunca otra cosa en otra pantalla).
- **`Card`** — contenedor `rounded-lg border border-slate-200 bg-white`, reemplaza el `<div className="rounded-lg border ...">` repetido a mano en cada archivo.
- **`ConfirmDialog`** — reemplaza los `confirm()` nativos del navegador (usados hoy para cancelar/archivar/ajustar) con un diálogo modal real (elemento HTML `<dialog>`, sin dependencia nueva) que muestra título, descripción del efecto, y dos acciones (`danger-solid` + `secondary`). Se usa en: cancelar venta, cerrar caja, archivar producto/cliente/categoría, ajustar inventario, desactivar usuario, borrar rol.
- **`EmptyState`** — mensaje + acción opcional, para toda tabla sin resultados (reemplaza los textos sueltos "Sin resultados." de cada tabla).

`DataTable`, `Pagination`, `Field` (ya existentes) se conservan y se ajustan solo para adoptar los nuevos tokens de color/tipografía, sin cambiar su API.

## 5. Guía por pantalla

### 5.1 `Sidebar` / `Topbar` / layout raíz
Ítem de navegación activo usa el acento índigo (fondo suave `indigo-50` + texto `indigo-700` + borde izquierdo, no relleno sólido — más sobrio). `<title>` real de la pestaña (hoy dice "Create Next App"). El resto de la estructura (menú lateral fijo, barra superior con usuario/rol) se conserva — ya es simple.

### 5.2 Ventas / POS (máxima prioridad)
Layout de dos columnas: buscador/escáner a todo lo ancho arriba; carrito (tabla) a la izquierda; columna fija a la derecha con Subtotal/Descuentos/IVA y el **TOTAL en la tipografía crítica** (34px), método de pago seleccionado resaltado con el acento, y el botón `primary` de cobro siempre visible sin necesidad de scroll. Ningún otro elemento de la pantalla compite visualmente con el TOTAL ni con el botón de cobro.

### 5.3 Caja
Sesión abierta: fondo de apertura como cifra destacada aparte (no una línea más), lista de movimientos con `Badge` (ámbar=retiro, verde=ingreso), botón `primary` único ("Cerrar caja"). El arqueo a ciegas **no cambia**: cero cifras de "esperado" mientras la sesión sigue abierta. El corte final muestra la diferencia como el elemento más grande de la tarjeta, coloreado con el `Badge` semántico (verde=cuadra, ámbar=sobrante, rojo=faltante). Confirmación de cierre usa `ConfirmDialog`.

### 5.4 Dashboard
Reemplaza "Hola, {nombre}" por 4 tarjetas KPI que responden preguntas concretas, usando **funciones de servicio ya existentes** (Reportes de Ventas/Inventario, `getOpenCashSession` de Caja) — sin gráficas, sin lógica nueva:
1. ¿Cuánto vendí hoy? (ingreso neto del día)
2. ¿Cuántas ventas hice hoy? (conteo + ticket promedio)
3. ¿Hay productos con poco stock? (conteo bajo/agotado, enlaza a `/inventario/stock-bajo`)
4. ¿Caja abierta? (estado + quién/cuándo, enlaza a `/caja`)

Cada tarjeta enlaza a su pantalla completa. Esto es lectura pura de datos que ya existen — no es una regla de negocio nueva.

### 5.5 Inventario / Productos / Clientes
Tablas: mismas columnas ya priorizadas por el brief (producto, SKU/código de barras, categoría, precio, costo cuando corresponda, existencia, estado con `Badge`), usando el `DataTable` existente. Acciones de fila como menú contextual, no una fila de botones repetida. Formularios: campos esenciales primero, sección "opcional" claramente separada para el resto, validación inmediata con mensajes ya existentes (Zod) presentados de forma consistente vía `Field`.

### 5.6 Reportes
Conserva su estructura (Bloque 6: selector de período, tarjetas KPI, gráficas SVG propias, tabla detalle, export). Se re-tematizan con la paleta índigo/gris (las gráficas hoy son grises genéricos) y se migran tarjetas/botones a los primitivos.

### 5.7 Admin (Usuarios/Roles/Auditoría/Configuración) + Login/Setup/Cambiar contraseña
Mismos primitivos. Acciones irreversibles (desactivar usuario, borrar rol) usan `ConfirmDialog`. La tabla de auditoría prioriza fecha/actor/acción/entidad; el detalle de metadata técnica queda expandible, no visible por defecto.

## 6. Responsive

Un solo breakpoint real (`md`, ya usado): bajo `md` la barra lateral colapsa a menú superior; las tablas anchas hacen scroll horizontal contenido dentro de su propio contenedor (nunca desbordan la página); los elementos interactivos (botones, filas clicables) miden al menos 40px de alto — pensado para pantalla táctil en el punto de venta, no solo mouse/teclado.

## 7. Accesibilidad

Contraste AA en texto sobre color (slate oscuro sobre blanco ya lo cumple; se verifica en los nuevos badges/botones). Estado de foco visible y consistente: anillo índigo (`focus-visible:ring-2 focus-visible:ring-indigo-500`) en todo control interactivo — hoy es inconsistente/ausente en varios botones. Estados `disabled` muestran texto explicativo del estado (ej. "Cobrando…") además de opacidad reducida, no solo opacidad. Acciones destructivas siempre distinguibles por color (`danger`) y siempre con `ConfirmDialog`.

## 8. Qué NO cambia

- Ninguna regla de negocio, permiso, validación de datos o cálculo (IVA, descuentos, arqueo, folios, etc.).
- El arqueo a ciegas de Caja: `computeExpectedCash` sigue sin exponerse antes del cierre.
- Ninguna funcionalidad existente se elimina.
- **Única excepción explícita:** el Dashboard pasa de estático a mostrar datos reales — es lectura pura de funciones de servicio ya existentes (Reportes, Inventario, Caja), no una regla de negocio nueva ni una pantalla nueva.

## 9. Riesgo: pruebas automatizadas acopladas a texto/markup exacto

602 pruebas automatizadas (233 unit + 334 integración + 35 E2E) ya pasan sobre el sistema actual. Varias E2E usan `getByRole('button', { name: 'Cobrar $232.00' })`, `getByText(...)` literal, o roles/etiquetas específicas. Regla para los 3 planes de implementación: **si un cambio visual requiere renombrar un texto o rol accesible que un test usa como selector, el mismo commit actualiza ese selector** (nunca queda un test roto "para después"). Ningún test de negocio (montos, permisos, flujos) se debilita ni se borra para que pase — si un cambio visual rompe una aserción de negocio, se revisa el cambio visual, no el test.

## 10. Plan de ejecución

Tres planes de implementación secuenciales, cada uno con su propio ciclo brainstorming→plan→subagent-driven-development→revisión→merge local a `master`, igual que los Bloques 1-6:

1. **Plan 1 — Fundación:** tokens (`globals.css`), primitivos (`Button`/`Badge`/`Card`/`ConfirmDialog`/`EmptyState`), `Sidebar`/`Topbar`, metadata del `<head>`, Dashboard con KPIs reales.
2. **Plan 2 — Pantallas críticas del cajero:** Ventas/POS, Caja (todas sus pantallas: apertura, panel, movimientos, cierre, corte, historial).
3. **Plan 3 — Resto del sistema:** Inventario, Productos, Clientes, Reportes, Admin (Usuarios/Roles/Auditoría/Configuración), Login/Setup/Cambiar contraseña.

Cada plan se implementa, se prueba (602+ pruebas existentes deben seguir en verde, más las que cada plan agregue) y se integra localmente antes de empezar el siguiente. Sin push, sin remoto, sin deploy — mismo criterio que el resto del proyecto.
