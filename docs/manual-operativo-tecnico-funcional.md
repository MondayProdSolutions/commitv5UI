# Manual Operativo / Técnico‑Funcional — Sistema POS

> **Propósito.** Este documento describe, módulo por módulo, **qué hace el sistema, para qué sirve, quién puede usar cada parte, qué información maneja, qué valida, qué efectos produce en otros módulos, sus casos especiales y qué queda registrado en auditoría.**
>
> **Alcance.** Cubre la funcionalidad realmente implementada en el código de la aplicación (Bloques 1–7). No describe funciones planificadas ni mejoras futuras. Cada afirmación de este manual está verificada contra el código fuente.
>
> **A quién va dirigido.** Personal técnico‑funcional: administradores del sistema, responsables de operación, soporte y quien deba entender el comportamiento exacto del sistema. Para instrucciones paso a paso orientadas al usuario final, véase el *Manual de Usuario* (documento aparte).

---

## Cómo leer este manual

Cada módulo se documenta con la misma estructura fija:

| Sección | Contenido |
|---|---|
| **Qué hace** | Descripción funcional del módulo. |
| **Para qué sirve** | Necesidad de negocio que resuelve. |
| **Usuarios y permisos** | Roles y claves de permiso que dan acceso. |
| **Información que maneja** | Datos que lee y persiste. |
| **Acciones que permite** | Operaciones disponibles y su efecto. |
| **Qué valida** | Reglas y comprobaciones que aplica antes de aceptar una operación. |
| **Efectos en otros módulos** | Consecuencias fuera del propio módulo. |
| **Casos especiales** | Excepciones, límites y comportamientos no obvios. |
| **Qué se audita** | Eventos que quedan registrados en el historial de actividad. |

### Convenciones

- **Permiso** — clave con forma `modulo.accion` (p. ej. `usuarios.crear`). El acceso a una página o acción se comprueba con `requirePermission('<clave>')` como primera instrucción del servidor; si el usuario no la tiene, la operación se rechaza y se registra un evento `auth.forbidden`.
- **Rol** — conjunto de permisos. Hay cuatro roles de sistema (Administrador, Gerente, Cajero, Empleado) y se pueden crear roles personalizados.
- **Auditoría** — todo evento citado en “Qué se audita” se guarda en la tabla `ActivityLog` con: autor, acción, entidad afectada, metadatos, IP y fecha/hora. En la mayoría de las operaciones el registro de auditoría se escribe **dentro de la misma transacción** que el cambio, de modo que o se guardan ambos o ninguno.
- **“Sistema”** — cuando una acción no tiene autor identificable (p. ej. un intento de inicio de sesión fallido) el registro se guarda con autor nulo y se muestra como *Sistema*.

---

## Referencia: Roles y permisos del sistema

Esta tabla es transversal a todos los módulos. Es la **fuente de verdad** de la asignación de permisos por rol de sistema (compartida por la semilla de la base de datos y las pruebas).

### Catálogo de permisos

| Módulo | Permiso | Qué habilita |
|---|---|---|
| Usuarios | `usuarios.ver` | Ver usuarios |
| Usuarios | `usuarios.crear` | Crear usuarios |
| Usuarios | `usuarios.editar` | Editar usuarios y su rol |
| Usuarios | `usuarios.desactivar` | Activar/desactivar usuarios |
| Usuarios | `usuarios.reset_password` | Restablecer contraseñas |
| Roles y permisos | `roles.ver` | Ver roles |
| Roles y permisos | `roles.gestionar` | Crear, editar y borrar roles |
| Auditoría | `auditoria.ver` | Ver el historial de actividad |
| Configuración | `config.editar` | Editar la configuración del sistema |
| Productos | `productos.ver` | Ver catálogo y detalle |
| Productos | `productos.crear` | Alta de productos y variantes |
| Productos | `productos.editar` | Editar datos, precios, disponibilidad, variantes |
| Productos | `productos.archivar` | Archivar / restaurar productos y variantes |
| Categorías | `categorias.gestionar` | Crear, editar y archivar categorías y subcategorías |
| Inventario | `inventario.ver` | Ver stock, movimientos y alertas |
| Inventario | `inventario.entrada` | Registrar entradas |
| Inventario | `inventario.salida` | Registrar salidas |
| Inventario | `inventario.ajustar` | Ajustar stock a un valor |
| Clientes | `clientes.ver` | Ver clientes y su detalle |
| Clientes | `clientes.crear` | Alta de clientes |
| Clientes | `clientes.editar` | Editar datos de contacto y facturación |
| Clientes | `clientes.archivar` | Archivar / restaurar clientes |
| Ventas | `ventas.crear` | Registrar ventas en el punto de venta |
| Ventas | `ventas.descuento` | Aplicar descuentos (línea y ticket) |
| Ventas | `ventas.cancelar` | Cancelar una venta mientras la caja siga abierta |
| Ventas | `ventas.devolver` | Registrar devoluciones |
| Ventas | `ventas.ver` | Ver historial y detalle de ventas y devoluciones |
| Caja | `caja.gestionar` | Abrir y cerrar caja, registrar movimientos y ver cortes |
| Reportes | `reportes.ver` | Ver reportes de ventas, inventario y clientes |
| Reportes | `reportes.margen` | Ver el reporte de utilidad y margen (incluye costos) |
| Asistencia | `asistencia.registrar` | Registrar la propia entrada y salida |
| Asistencia | `asistencia.ver` | Ver el dashboard de asistencia de todos los empleados |
| Asistencia | `asistencia.corregir` | Editar o cerrar manualmente un registro de asistencia |

### Permisos por rol de sistema

| Permiso | Administrador | Gerente | Cajero | Empleado |
|---|:---:|:---:|:---:|:---:|
| `usuarios.ver` | ✅ | ✅ | — | — |
| `usuarios.crear` | ✅ | ✅ | — | — |
| `usuarios.editar` | ✅ | ✅ | — | — |
| `usuarios.desactivar` | ✅ | — | — | — |
| `usuarios.reset_password` | ✅ | ✅ | — | — |
| `roles.ver` | ✅ | ✅ | — | — |
| `roles.gestionar` | ✅ | — | — | — |
| `auditoria.ver` | ✅ | ✅ | — | — |
| `config.editar` | ✅ | — | — | — |
| `productos.ver` | ✅ | ✅ | ✅ | ✅ |
| `productos.crear` | ✅ | ✅ | — | — |
| `productos.editar` | ✅ | ✅ | — | — |
| `productos.archivar` | ✅ | ✅ | — | — |
| `categorias.gestionar` | ✅ | ✅ | — | — |
| `inventario.ver` | ✅ | ✅ | ✅ | ✅ |
| `inventario.entrada` | ✅ | ✅ | — | — |
| `inventario.salida` | ✅ | ✅ | — | — |
| `inventario.ajustar` | ✅ | ✅ | — | — |
| `clientes.ver` | ✅ | ✅ | ✅ | ✅ |
| `clientes.crear` | ✅ | ✅ | ✅ | — |
| `clientes.editar` | ✅ | ✅ | — | — |
| `clientes.archivar` | ✅ | ✅ | — | — |
| `ventas.crear` | ✅ | ✅ | ✅ | — |
| `ventas.descuento` | ✅ | ✅ | — | — |
| `ventas.cancelar` | ✅ | ✅ | — | — |
| `ventas.devolver` | ✅ | ✅ | ✅ | — |
| `ventas.ver` | ✅ | ✅ | ✅ | — |
| `caja.gestionar` | ✅ | ✅ | ✅ | — |
| `reportes.ver` | ✅ | ✅ | ✅ | — |
| `reportes.margen` | ✅ | ✅ | — | — |
| `asistencia.registrar` | ✅ | ✅ | ✅ | ✅ |
| `asistencia.ver` | ✅ | ✅ | — | — |
| `asistencia.corregir` | ✅ | — | — | — |

- **Administrador** tiene **todos** los permisos, siempre (se define como “todas las claves del catálogo”).
- **Gerente** administra la operación completa (productos, inventario, clientes, ventas, caja, reportes con costos, alta/edición de usuarios y consulta de auditoría) pero **no** puede desactivar usuarios, **no** puede gestionar roles y **no** puede editar la configuración del sistema.
- **Cajero** opera el punto de venta y la caja, da de alta clientes y consulta ventas y reportes sin costos. **No** puede aplicar descuentos ni cancelar ventas.
- **Empleado** es un rol de solo lectura de catálogo, inventario y clientes; su única acción de escritura es registrar su propia entrada/salida de asistencia.

### Salvaguardas sobre roles

- **Permisos bloqueados del Administrador** (`roles.gestionar`, `usuarios.editar`, `usuarios.desactivar`): al editar el rol *Administrador* estos permisos se vuelven a añadir automáticamente aunque se hayan desmarcado. El rol Administrador nunca puede quedarse sin ellos.
- **Guardián del sistema** (`roles.gestionar` + `usuarios.editar`): el sistema exige que **siempre exista al menos un usuario activo cuyo rol tenga los dos permisos**. Cualquier operación que dejaría el sistema sin ese “guardián” se rechaza (véanse los módulos *Usuarios* y *Roles*). En la configuración de fábrica ese guardián es el rol Administrador.

---

## Módulo 1 — Autenticación y Sesiones

### Qué hace

Controla el acceso al sistema: alta del primer administrador, inicio y cierre de sesión, vigencia y caducidad de las sesiones, cambio de contraseña (voluntario u obligatorio), protección contra ataques de fuerza bruta y cierre automático por inactividad.

### Para qué sirve

Garantiza que solo personal autorizado use el sistema, que cada acción quede vinculada a una persona, y que una sesión abandonada no quede accesible.

### Usuarios y permisos

- **No requiere permisos**: `/login`, `/setup` (solo mientras no exista ningún usuario), `/cambiar-password`, cierre de sesión y la consulta del propio perfil.
- Todo el resto de la aplicación exige **una sesión válida**; la ausencia de sesión redirige a `/login`.
- La configuración del tiempo de inactividad la gestiona el módulo *Configuración* y requiere `config.editar`.

### Información que maneja

- **Cookie de sesión** `pos_session`: `httpOnly`, `secure`, `SameSite=Lax`, `path=/`, vigencia 8 horas. Contiene un token aleatorio de 32 bytes (base64url).
- **Tabla `Session`**: identificador, **hash SHA‑256** del token (el token en claro nunca se guarda), usuario, fecha de creación, fecha de expiración, fecha de última actividad, IP, `User‑Agent` y fecha de revocación.
- **Contraseñas**: se guardan como hash **argon2id** (parámetros `memoryCost 19456`, `timeCost 2`, `parallelism 1`). Nunca se almacena ni se registra la contraseña en claro.
- **Limitador de intentos**: contador en memoria del proceso por clave `correo|IP` (no persiste en base de datos).
- **Ajuste `session.idleTimeoutMinutes`** (tabla `AppSetting`): minutos de inactividad tolerados; valor por defecto **15**.

### Acciones que permite

| Acción | Descripción |
|---|---|
| **Configuración inicial (`/setup`)** | Crea el primer usuario Administrador cuando la base no tiene ningún usuario. Crea (o asegura) el rol *Administrador* de sistema, deja al usuario sin obligación de cambiar contraseña e inicia sesión automáticamente. |
| **Iniciar sesión (`/login`)** | Valida correo + contraseña, crea una sesión, guarda IP y `User‑Agent`, actualiza “último acceso”. Si el usuario tiene contraseña temporal, redirige de inmediato a `/cambiar-password`; si no, al panel de inicio. |
| **Cerrar sesión** | Revoca la sesión actual y borra la cookie. |
| **Cambiar contraseña (`/cambiar-password`)** | Cambia la contraseña del usuario en sesión. Si el cambio es voluntario, pide y verifica la contraseña actual; si es obligatorio (contraseña temporal), no la pide. Al terminar, **revoca todas las demás sesiones** del usuario. |
| **Renovación automática de sesión** | Mientras el usuario interactúa con la aplicación, un “latido” cada 30 s (máx.) desliza la última actividad y extiende la expiración otras 8 h. La escritura real en base de datos está limitada a una vez cada 60 s. |
| **Aviso y cierre por inactividad** | Un vigilante en el cliente muestra una cuenta atrás en los últimos 60 s antes del límite; “Seguir conectado” renueva la sesión. Alcanzado el límite, la sesión se cierra y la página va a `/login?motivo=inactividad`. |

### Qué valida

- **Formulario de login**: correo con formato válido (se normaliza a minúsculas y sin espacios) y contraseña no vacía. Un fallo de formato devuelve el mensaje genérico “Credenciales inválidas”.
- **Autenticación**:
  - Se ejecuta **siempre** una verificación argon2 real, incluso si el correo no existe (se usa un hash señuelo). Así el tiempo de respuesta no revela si una cuenta existe.
  - Se rechaza el acceso si: el correo no existe, **o** el usuario está inactivo, **o** la contraseña es incorrecta. En los tres casos el mensaje al usuario es el mismo (“Credenciales inválidas”); un usuario inactivo no recibe un mensaje distinto.
- **Límite de intentos**: 5 fallos dentro de una ventana deslizante de 15 minutos para una misma clave `correo|IP` provocan un bloqueo de 15 minutos. Durante el bloqueo el login devuelve “Demasiados intentos. Inténtalo de nuevo en N min.”. Un inicio de sesión correcto limpia el contador.
- **Política de contraseñas** (se aplica en `/setup` y en `/cambiar-password`):
  - mínimo **10 caracteres**;
  - **no** puede ser igual al correo del usuario;
  - **no** puede figurar en la lista de contraseñas comunes prohibidas.
- **Confirmación**: en alta y cambio de contraseña, el campo de confirmación debe coincidir.
- **`/setup`**: solo funciona si no hay ningún usuario; en caso contrario responde “El sistema ya está configurado.”
- **Latido de sesión (`/api/session/heartbeat`)**: comprueba que la petición es del mismo origen (rechazo 403 si no) y que la sesión sigue vigente (401 si no).

### Efectos en otros módulos

- **Todos los módulos**: la sesión válida es requisito previo. El usuario cargado en cada petición aporta su conjunto de permisos, que condiciona menús y acciones visibles.
- **Usuarios**: “último acceso” se actualiza en cada inicio de sesión correcto. Desactivar un usuario o cambiarle el rol tiene efecto **en la siguiente petición** (el usuario se recarga en cada request; si deja de estar activo, su sesión deja de resolver).
- **Auditoría**: la autenticación es una de las mayores fuentes de eventos (`auth.*`).
- **Configuración**: el valor de `session.idleTimeoutMinutes` gobierna tanto el cierre por inactividad del servidor como la cuenta atrás del cliente.

### Casos especiales

- **Contraseña temporal**: los usuarios creados desde administración y los que sufren un “restablecer contraseña” reciben una contraseña temporal y quedan marcados como “debe cambiar contraseña”. Hasta que la cambian, el sistema los fuerza a `/cambiar-password` en cada navegación y **no** se les pide la contraseña anterior.
- **Cambio de contraseña y sesiones**: tras cambiarla, todas las sesiones **excepto la actual** se revocan. Un atacante con una sesión robada pierde el acceso cuando la víctima cambia su contraseña.
- **Cierre por inactividad**: al detectarse en el servidor, la sesión se revoca y se registra `auth.logout_idle` con los minutos de inactividad (registro “best‑effort”: si fallara, no rompe la petición). El motivo `inactividad` se distingue de `sesion_cerrada` (sesión inválida/revocada) en la URL de login.
- **Expiración vs. inactividad**: son límites distintos. La sesión caduca a las 8 h de la última renovación (expiración dura), y además se cierra si pasan más de *N* minutos sin actividad (inactividad).
- **Límite de intentos en memoria**: el contador vive en el proceso del servidor; un reinicio del servicio lo limpia. Es una medida de contención, no un bloqueo persistente.
- **Redirecciones automáticas**: con sesión válida, entrar a `/login` o `/setup` redirige al panel de inicio; con “debe cambiar contraseña” pendiente, cualquier ruta que no sea `/cambiar-password` redirige a esa página.
- **Perfil propio (`/perfil`)**: cualquier usuario con sesión puede editar su **nombre** y **teléfono** (no su correo ni su rol), ver sus **sesiones activas** (IP, dispositivo, última actividad, cuál es la actual), cerrar una sesión concreta o “todas las demás”, y consultar su propio historial de actividad en `/perfil/actividad`.

### Qué se audita

| Evento | Cuándo | Datos registrados |
|---|---|---|
| `auth.login` | Inicio de sesión correcto | Autor, IP. Desde `/setup`: `metadata.via = "setup"`. |
| `auth.login_failed` | Intento fallido (cuenta inexistente, inactiva o contraseña incorrecta) | Autor nulo (*Sistema*), IP, `metadata.email`. |
| `auth.logout` | Cierre de sesión manual | Autor, IP. |
| `auth.logout_idle` | Cierre automático por inactividad | Autor, `metadata.minutosInactivo`. |
| `auth.password_changed` | Cambio de contraseña | Autor, IP, `metadata.forzado` (`true` si era obligatorio). |
| `auth.forbidden` | Intento de acción sin el permiso requerido | Autor, IP, `metadata.ruta`, `metadata.permisoRequerido`. |
| `usuarios.crear` | Alta del primer admin en `/setup` | Autor, `metadata.bootstrap = true`, correo, nombre, rol. |

---

## Módulo 2 — Usuarios

### Qué hace

Gestiona las cuentas de acceso al sistema: alta, edición de datos y rol, activación/desactivación, restablecimiento de contraseña y cierre remoto de sesiones. Incluye el listado con búsqueda y filtros, y la ficha de detalle de cada usuario.

### Para qué sirve

Mantener el padrón de personas que pueden entrar al sistema y con qué nivel de acceso, y disponer de herramientas para responder ante bajas, olvidos de contraseña o accesos comprometidos.

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Ver listado y ficha (`/admin/usuarios`) | `usuarios.ver` | Administrador, Gerente |
| Crear usuario | `usuarios.crear` | Administrador, Gerente |
| Editar datos y rol | `usuarios.editar` | Administrador, Gerente |
| Activar / desactivar | `usuarios.desactivar` | **Solo Administrador** |
| Restablecer contraseña | `usuarios.reset_password` | Administrador, Gerente |
| Cerrar todas las sesiones de un usuario | `usuarios.editar` | Administrador, Gerente |

Cada acción del servidor vuelve a comprobar su permiso; ocultar un botón en la interfaz no es la única barrera.

### Información que maneja

- **Tabla `User`**: nombre, correo (único), teléfono (opcional), hash de contraseña, rol, estado activo/inactivo, indicador “debe cambiar contraseña”, fecha de último acceso, quién lo creó, fechas de alta y modificación.
- **Datos derivados** en el listado: nombre de rol, número de sesiones activas (en la ficha).
- La contraseña se maneja siempre como hash (véase *Autenticación*); las contraseñas temporales se muestran **una sola vez** en pantalla tras generarse.

### Acciones que permite

| Acción | Efecto |
|---|---|
| **Crear usuario** | Da de alta la cuenta con una **contraseña temporal generada** (12 caracteres, alfabeto sin caracteres ambiguos), marca “debe cambiar contraseña”, registra quién la creó. La contraseña temporal se muestra al operador para entregarla al nuevo usuario. |
| **Editar usuario** | Cambia nombre, correo, teléfono y/o rol. Si cambia el rol, se registra como evento aparte. |
| **Desactivar usuario** | Impide el acceso. **Revoca todas sus sesiones** de inmediato. Requiere confirmación explícita en la interfaz. |
| **Reactivar usuario** | Restaura el acceso. No re‑crea sesiones (el usuario debe volver a iniciar sesión). |
| **Restablecer contraseña** | Genera una nueva contraseña temporal, marca “debe cambiar contraseña”, **revoca todas las sesiones** del usuario y exige un **motivo** que queda auditado. |
| **Cerrar todas las sesiones** | Revoca todas las sesiones activas del usuario sin cambiar su contraseña ni su estado. Devuelve cuántas se cerraron. |

### Qué valida

- **Alta y edición**: nombre con mínimo 2 caracteres; correo con formato válido (normalizado a minúsculas y sin espacios); teléfono opcional, máximo 30 caracteres (vacío se guarda como “sin teléfono”); rol obligatorio.
- **Correo único**: un correo ya en uso devuelve “Ya existe un usuario con ese correo.”
- **No auto‑desactivación**: un usuario no puede desactivar su propia cuenta (“No puedes desactivar tu propia cuenta.”). La ficha de detalle ni siquiera muestra la sección de estado cuando el usuario se está viendo a sí mismo.
- **Guardián del sistema**: se rechaza toda operación que dejaría el sistema **sin ningún usuario activo con los permisos `roles.gestionar` + `usuarios.editar`**. Esto afecta a:
  - **desactivar** al último usuario guardián;
  - **cambiar de rol** al último usuario guardián a un rol que no tenga ambos permisos.
  El mensaje es “Esta acción dejaría al sistema sin ningún administrador con permisos de gestión.”
- **Restablecer contraseña**: el motivo es obligatorio (“Indica el motivo del restablecimiento.”).

### Efectos en otros módulos

- **Autenticación / Sesiones**: desactivar, restablecer contraseña y “cerrar todas las sesiones” revocan sesiones; el cambio de estado o de rol se refleja en la siguiente petición del usuario afectado.
- **Roles**: el número de usuarios por rol que muestra el módulo de Roles proviene de aquí; la validación de guardián se coordina con las reglas del módulo de Roles.
- **Auditoría**: cada usuario aparece como “autor” en los eventos que genera; el listado de auditoría ofrece un filtro por usuario alimentado con este padrón.
- **Ventas, Caja, Inventario, etc.**: los registros históricos (ventas, movimientos, cortes) referencian al usuario; por eso los usuarios **no se borran**, solo se desactivan.

### Casos especiales

- **Sin borrado**: no existe “eliminar usuario”. La baja es siempre lógica (desactivar), para preservar la trazabilidad histórica.
- **Contraseña temporal visible una vez**: si el operador no la copia en el momento, deberá volver a restablecerla.
- **Edición del propio perfil**: el nombre y el teléfono también se pueden cambiar desde `/perfil` sin `usuarios.editar`; ese cambio se audita con `metadata.propio = true`. El correo y el rol propios **no** son editables desde el perfil.
- **“Debe cambiar contraseña”**: se activa al crear el usuario y al restablecer su contraseña; se desactiva cuando el usuario completa el cambio.
- **Primer administrador**: no se crea desde este módulo sino desde `/setup` (véase *Autenticación*).

### Qué se audita

| Evento | Cuándo | Datos registrados |
|---|---|---|
| `usuarios.crear` | Alta de usuario | Autor, IP, nombre, correo, teléfono, rol asignado. |
| `usuarios.editar` | Cambio de nombre / correo / teléfono | Autor, IP, `antes` y `despues` de los campos cambiados. Desde el perfil propio: `metadata.propio = true`. |
| `usuarios.rol_cambiado` | Cambio de rol | Autor, IP, rol anterior y rol nuevo. |
| `usuarios.desactivar` | Desactivación | Autor, IP, usuario objetivo. |
| `usuarios.activar` | Reactivación | Autor, IP, usuario objetivo. |
| `usuarios.reset_password` | Restablecimiento de contraseña | Autor, IP, `metadata.motivo`. |
| `usuarios.sesiones_revocadas` | Cierre remoto de sesiones (por administración o por el propio usuario) | Autor, IP, `metadata.objetivoUserId`, `metadata.cantidad`, y `propio = true` si lo hizo el propio usuario. |

---

## Módulo 3 — Roles y Permisos

### Qué hace

Define los roles del sistema y el conjunto de permisos que cada uno concede. Permite consultar el catálogo de roles, ver el detalle de cada uno, crear roles personalizados, editar sus permisos y descripción, y borrar roles que no estén en uso.

### Para qué sirve

Adaptar los niveles de acceso a la estructura real del negocio sin tocar código: se pueden crear perfiles a medida (p. ej. “Encargado de almacén”) combinando permisos del catálogo.

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Ver catálogo y detalle (`/admin/roles`) | `roles.ver` | Administrador, Gerente |
| Crear, editar, borrar roles | `roles.gestionar` | **Solo Administrador** |

El Gerente **ve** los roles (para entender qué puede hacer cada usuario) pero **no** los modifica.

### Información que maneja

- **Tabla `Role`**: nombre (único), descripción (opcional), indicador `esSistema`, fechas.
- **Tabla `RolePermission`**: la lista de claves de permiso concedidas a cada rol (relación N a N con el catálogo).
- **Datos derivados**: número de usuarios que tienen el rol, lista de permisos ordenada.

### Acciones que permite

| Acción | Efecto |
|---|---|
| **Crear rol** | Alta de un rol no‑sistema con nombre, descripción y permisos seleccionados. Los permisos desconocidos o duplicados se descartan silenciosamente. |
| **Editar rol** | Cambia descripción y permisos; en roles no‑sistema también el nombre. Guarda el conjunto de permisos completo (reemplaza el anterior). |
| **Borrar rol** | Elimina el rol y, en cascada, sus asignaciones de permiso. Requiere confirmación explícita en la interfaz. |

### Qué valida

- **Nombre**: mínimo 2 caracteres; único (“Ya existe un rol con ese nombre.”).
- **Descripción**: opcional, máximo 200 caracteres.
- **Permisos**: solo se aceptan claves que existan en el catálogo; el resto se ignora.
- **Roles de sistema** (Administrador, Gerente, Cajero, Empleado):
  - **no se pueden renombrar** (“No se puede renombrar un rol de sistema.”);
  - **no se pueden borrar** (“No se puede borrar un rol de sistema.”);
  - **sí** se pueden ajustar su descripción y sus permisos.
- **Rol Administrador**: los permisos `roles.gestionar`, `usuarios.editar` y `usuarios.desactivar` se **vuelven a añadir automáticamente** si se intenta guardar sin ellos.
- **Guardián del sistema**: si un rol **tenía** los dos permisos guardián (`roles.gestionar` + `usuarios.editar`), la edición se los quita, y el rol tiene usuarios asignados, la operación solo se permite si **otro rol con usuarios** conserva ambos permisos. Si no, se rechaza (“Esta edición dejaría al sistema sin un administrador con permisos de gestión.”).
- **Borrado con usuarios**: un rol con al menos un usuario no se puede borrar (“Reasigna primero los usuarios de este rol.”).

### Efectos en otros módulos

- **Usuarios**: al alta/edición de usuario, la lista de roles disponibles sale de aquí. Cambiar los permisos de un rol cambia lo que pueden hacer **todos** los usuarios que lo tienen, en su siguiente petición.
- **Toda la aplicación**: los menús visibles y las acciones permitidas se recalculan a partir de los permisos del rol en cada carga de página.
- **Autenticación**: el conjunto de permisos del usuario se arma leyendo `RolePermission` de su rol en cada petición.

### Casos especiales

- **Ruta de alta**: se accede en `/admin/roles/new`; el formulario es el mismo que el de edición.
- **Reasignación previa al borrado**: no hay borrado forzado ni reasignación automática; hay que mover manualmente a los usuarios a otro rol antes de borrar.
- **Cambios silenciosos de permisos**: enviar claves inválidas no produce error, simplemente no se guardan.
- **Orden del catálogo**: en pantalla los roles de sistema se listan primero y luego por nombre.
- **Coherencia con la semilla**: la asignación de permisos de los cuatro roles de sistema tiene una definición canónica única; conviene no divergir de ella al re‑sembrar la base.

### Qué se audita

| Evento | Cuándo | Datos registrados |
|---|---|---|
| `roles.crear` | Alta de rol | Autor, IP, `metadata.despues` con nombre y permisos concedidos. |
| `roles.editar` | Edición de rol | Autor, IP, nombre antes/después, permisos antes/después. |
| `roles.borrar` | Borrado de rol | Autor, IP, nombre y permisos que tenía. |

---

## Módulo 4 — Auditoría

### Qué hace

Es el registro central e **inmutable** de la actividad del sistema. Ofrece una pantalla de consulta con filtros (usuario, tipo de acción, rango de fechas) y paginación, y la exportación del resultado filtrado a CSV.

### Para qué sirve

Trazabilidad y control: saber quién hizo qué, cuándo y desde dónde. Sirve para investigar incidencias, verificar operaciones sensibles (cambios de rol, restablecimientos de contraseña, cancelaciones de venta, cierres de caja) y como evidencia ante discrepancias.

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Ver el historial (`/admin/auditoria`) | `auditoria.ver` | Administrador, Gerente |
| Exportar a CSV (`/admin/auditoria/export`) | `auditoria.ver` | Administrador, Gerente |
| Ver **el propio** historial (`/perfil/actividad`) | — (solo sesión) | Todos |

La exportación comprueba el permiso igual que la pantalla; sin permiso responde con un error 403.

### Información que maneja

- **Tabla `ActivityLog`** (solo se inserta, nunca se modifica ni se borra):
  - `actorId` — usuario que ejecutó la acción, o nulo (*Sistema*);
  - `accion` — código del evento (p. ej. `ventas.cancelar`);
  - `entidad` / `entidadId` — tipo y clave del objeto afectado (p. ej. `User` / id);
  - `metadata` — objeto JSON con el detalle específico del evento (valores antes/después, motivos, importes, etc.);
  - `ip` — IP de origen cuando está disponible;
  - `createdAt` — fecha y hora.
- **Catálogo de acciones conocidas**: cada código tiene una etiqueta legible en español; un código no catalogado se muestra tal cual.

### Acciones que permite

| Acción | Efecto |
|---|---|
| **Consultar** | Lista los eventos más recientes primero, 20 por página, con el nombre del autor resuelto. |
| **Filtrar** | Por usuario, por tipo de acción (desplegable alimentado con el catálogo), y por rango de fechas “desde/hasta”. |
| **Exportar CSV** | Devuelve hasta 5.000 filas del resultado **con los filtros aplicados**, con BOM UTF‑8 para que Excel lo abra correctamente. Nombre de archivo `auditoria-AAAA-MM-DD.csv`. Columnas: Fecha, Acción, Usuario, Entidad, ID entidad, IP, Detalle (el `metadata` serializado como JSON). |

### Qué valida

- **Fechas**: un parámetro de fecha inválido se ignora (se trata como “sin filtro”) en lugar de provocar un error.
- **Página**: valores no numéricos o menores que 1 se normalizan a la página 1.
- **Permiso**: tanto la vista como la exportación exigen `auditoria.ver`; el intento sin permiso queda a su vez registrado como `auth.forbidden`.

### Efectos en otros módulos

- **Recibe de todos los módulos**: cada operación relevante escribe aquí su registro. En la mayoría de los casos la escritura ocurre **dentro de la misma transacción** que el cambio de datos, de modo que el historial no puede quedar “descuadrado” respecto a lo que realmente pasó.
- **No modifica nada**: es un módulo de solo lectura hacia el resto del sistema. Consultar o exportar auditoría **no** genera a su vez un evento de auditoría.
- **Usuarios**: usa el padrón de usuarios para el filtro por autor y para mostrar nombres.

### Casos especiales

- **Inmutable y sin purga**: no hay ninguna función para editar o borrar registros de auditoría, ni un proceso de retención/limpieza. El historial crece indefinidamente.
- **Autor “Sistema”**: eventos sin usuario identificable (p. ej. `auth.login_failed`) se guardan con autor nulo y se muestran/exportan como *Sistema*.
- **Eventos de acceso denegado**: `auth.forbidden` se registra cada vez que alguien intenta una acción para la que no tiene permiso, con la ruta y el permiso que faltaba.
- **Historial propio**: `/perfil/actividad` reutiliza el mismo motor de consulta, pero fijando el filtro de autor al propio usuario; muestra acción, fecha/hora e IP.
- **Límite de exportación**: la exportación tope es de 5.000 filas por descarga; para volúmenes mayores hay que acotar con filtros de fecha.

### Qué se audita (catálogo completo de eventos del sistema)

Todos los eventos que el sistema puede registrar, agrupados por módulo de origen:

| Módulo de origen | Eventos |
|---|---|
| Autenticación | `auth.login`, `auth.logout`, `auth.login_failed`, `auth.logout_idle`, `auth.forbidden`, `auth.password_changed` |
| Usuarios | `usuarios.crear`, `usuarios.editar`, `usuarios.rol_cambiado`, `usuarios.desactivar`, `usuarios.activar`, `usuarios.reset_password`, `usuarios.sesiones_revocadas` |
| Roles | `roles.crear`, `roles.editar`, `roles.borrar` |
| Configuración | `config.editar` |
| Categorías | `categorias.crear`, `categorias.editar`, `categorias.archivar`, `categorias.restaurar` |
| Productos | `productos.crear`, `productos.editar`, `productos.precio_cambiado`, `productos.archivar`, `productos.restaurar`, `productos.disponibilidad`, `productos.variante_agregada`, `productos.variante_archivada` |
| Inventario | `inventario.movimiento` |
| Clientes | `clientes.crear`, `clientes.editar`, `clientes.archivar`, `clientes.restaurar`, `clientes.datos_fiscales` |
| Ventas | `ventas.crear`, `ventas.cancelar`, `ventas.devolver` |
| Caja | `caja.abrir`, `caja.cerrar`, `caja.movimiento` |

El detalle de qué guarda cada evento (metadatos) se documenta en la sección “Qué se audita” del módulo que lo genera.

---

## Módulo 5 — Configuración

### Qué hace

Expone los parámetros del sistema que se pueden ajustar desde la interfaz. Hoy hay **un único parámetro editable**: el *tiempo de inactividad* tras el cual se cierra la sesión de un usuario.

### Para qué sirve

Adaptar la política de cierre por inactividad al entorno (un mostrador expuesto al público puede querer 5 minutos; una trastienda, 60).

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Ver y editar la configuración (`/admin/configuracion`) | `config.editar` | **Solo Administrador** |

### Información que maneja

- **Ajuste `session.idleTimeoutMinutes`** en la tabla `AppSetting` (valor JSON). Si no existe o no es un número mayor que 0, el sistema usa **15** minutos.
- La tabla `AppSetting` es un almacén genérico clave→valor; este módulo solo escribe esa clave.

### Acciones que permite

| Acción | Efecto |
|---|---|
| **Guardar minutos de inactividad** | Actualiza (o crea) el ajuste dentro de una transacción que incluye su registro de auditoría. El nuevo valor se aplica a partir de la siguiente petición de cada usuario. |

### Qué valida

- Número **entero**, mínimo **1**, máximo **240** (“Mínimo 1 minuto” / “Máximo 240 minutos”). El campo del formulario impone además `required` y el mismo rango.

### Efectos en otros módulos

- **Autenticación / Sesiones**: el valor gobierna tanto el cierre por inactividad que aplica el servidor (`proxy`, validación de sesión, latido) como la cuenta atrás que muestra el vigilante del cliente. Se lee en cada petición.

### Casos especiales

- **Es el único ajuste configurable por interfaz.** Otros parámetros con aspecto de “configuración” **no** se editan aquí: son constantes de código (vigencia de sesión de 8 h, umbral y bloqueo del limitador de intentos, política de contraseñas) o datos de la semilla de la base (tasas de impuesto, cliente “Público en General”).
- El vigilante de inactividad del cliente impone un **suelo efectivo de 120 segundos** aunque se configure 1 minuto, y muestra el aviso al menos 30 segundos antes del cierre.

### Qué se audita

| Evento | Cuándo | Datos registrados |
|---|---|---|
| `config.editar` | Cambio del tiempo de inactividad | Autor, IP, `metadata.clave`, `metadata.antes`, `metadata.despues`. |

---

## Módulo 6 — Categorías

### Qué hace

Organiza el catálogo en una jerarquía de **exactamente dos niveles**: *categoría raíz* y *subcategoría*. Presenta el árbol con el número de productos de cada categoría y permite crear, renombrar, mover (raíz ↔ subcategoría), archivar y restaurar categorías, además de reasignar los productos que quedan bajo una categoría archivada.

### Para qué sirve

Agrupar productos para su búsqueda, filtrado y análisis en reportes.

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Ver el árbol y gestionar categorías (`/admin`… `/categorias`) | `categorias.gestionar` | Administrador, Gerente |
| Pantalla “productos sin categoría activa” | `categorias.gestionar` | Administrador, Gerente |
| Reasignar la categoría de un producto (desde esa pantalla) | `productos.editar` | Administrador, Gerente |

No hay un modo de solo lectura: toda la pantalla de categorías exige `categorias.gestionar`.

### Información que maneja

- **Tabla `Category`**: nombre, `parentId` (nulo en las raíces), `archivada`.
- **Restricción de unicidad `(parentId, nombre)`**: no puede haber dos categorías con el mismo nombre bajo el mismo padre, ni dos raíces con el mismo nombre.
- **Datos derivados**: número de productos **no archivados** por categoría, árbol de hijos por padre.

### Acciones que permite

| Acción | Efecto |
|---|---|
| **Crear categoría raíz** | Alta con `parentId` nulo. |
| **Crear subcategoría** | Alta bajo una categoría raíz **activa**. |
| **Editar categoría** | Renombrar y/o cambiar de padre (convertir una raíz en subcategoría o viceversa). |
| **Archivar categoría** | Marca la categoría como archivada. **Si es una raíz, archiva también en cascada todas sus subcategorías.** Nunca modifica ningún producto: solo los cuenta. Operación idempotente (si ya estaba archivada, devuelve los conteos sin escribir ni auditar). |
| **Restaurar categoría** | Restaura **solo esa categoría** (no restaura sus subcategorías). |
| **Reasignar producto** | Desde `/categorias/sin-categoria-activa`, mueve un producto a una categoría activa. |

### Qué valida

- **Nombre**: mínimo 2 caracteres.
- **Profundidad máxima 2 niveles**: el padre indicado debe ser una categoría **raíz** (“La categoría padre no existe o no es una categoría raíz.”). No se pueden crear terceros niveles.
- **Una categoría con subcategorías no puede convertirse en subcategoría** (“Una categoría con subcategorías no puede convertirse en subcategoría.”).
- Una categoría **no puede ser su propio padre**.
- **No se puede crear una subcategoría bajo una categoría archivada.**
- **Restaurar una subcategoría con el padre archivado** se rechaza (“Restaura primero la categoría padre.”).
- **Nombre duplicado en el mismo nivel** → “Ya existe una categoría con ese nombre en ese nivel.”

### Efectos en otros módulos

- **Productos**: cada producto referencia **opcionalmente** una categoría. Archivar la categoría **no** archiva ni cambia el producto: el producto sigue apuntando a la categoría archivada y aparece listado en `/categorias/sin-categoria-activa`, con un aviso en la pantalla de categorías. El árbol de categorías **activas** alimenta los desplegables de categoría en Productos e Inventario, mostrando las subcategorías como “Raíz › Subcategoría”.
- **Inventario y listados de productos**: el filtro por categoría es por coincidencia directa; **no** se expande automáticamente a las subcategorías.

### Casos especiales

- **Modelo estricto de dos niveles** (raíz + subcategoría).
- **Cascada solo hacia abajo**: archivar una raíz archiva sus subcategorías; restaurar nunca actúa en cascada — hay que restaurar cada subcategoría una a una.
- **El conteo de productos** por categoría solo considera productos no archivados.
- **No existe borrado de categorías**: únicamente archivar/restaurar.
- El archivado de una **categoría raíz** se confirma con un diálogo explícito (por su efecto en cascada); el alta y la edición se hacen en diálogos‑formulario propios de la pantalla.

### Qué se audita

| Evento | Cuándo | Datos registrados |
|---|---|---|
| `categorias.crear` | Alta de categoría | Autor, IP, nombre, `parentId`. |
| `categorias.editar` | Renombrar o mover | Autor, IP, `antes` y `despues` de nombre y `parentId`. |
| `categorias.archivar` | Archivado (primera vez) | Autor, IP, `categoryId`, `subcategoriasArchivadas`, `productosAfectados`. |
| `categorias.restaurar` | Restauración | Autor, IP, `categoryId`. |
| `productos.editar` | Reasignar la categoría de un producto | (Generado por el flujo de edición de producto — véase *Productos y Variantes*.) |

---

## Módulo 7 — Productos y Variantes

### Qué hace

Mantiene el catálogo de lo que se vende. Un **producto** agrupa una o varias **variantes**; el precio, el SKU, el código de barras, el stock y la disponibilidad viven **en la variante**, no en el producto. Hay dos tipos de producto:

- **SIMPLE**: exactamente **una** variante, sin nombre de variante (marcada como predeterminada).
- **CON_VARIANTES**: **dos o más** variantes, cada una con un nombre único (p. ej. tallas o colores).

Incluye el listado con búsqueda (nombre, SKU o código de barras), filtros por categoría, estado y “solo stock bajo”, y la ficha de detalle con el editor de variantes.

### Para qué sirve

Definir qué artículos existen, a qué precio se venden, con qué impuesto y con qué control de inventario y disponibilidad.

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Ver catálogo y ficha (`/productos`) | `productos.ver` | Administrador, Gerente, Cajero, Empleado |
| Crear producto | `productos.crear` | Administrador, Gerente |
| Editar producto y variantes; disponibilidad; añadir variante; convertir a “con variantes” | `productos.editar` | Administrador, Gerente |
| Archivar / restaurar producto y variantes | `productos.archivar` | Administrador, Gerente |

Cajero y Empleado solo consultan. Cada acción del servidor vuelve a comprobar su permiso.

### Información que maneja

- **`Product`**: nombre, descripción, categoría (opcional), **tasa de impuesto (obligatoria)**, tipo (`SIMPLE` / `CON_VARIANTES`), `imagenUrl`, `archivado`, quién lo creó, fechas.
- **`ProductVariant`**: nombre (nulo en SIMPLE), indicador de predeterminada, **SKU** (opcional, **único a nivel global**), **código de barras** (opcional, **único a nivel global**), `precioVenta` y `precioCompra` (importes con 2 decimales), `stock` (entero), `stockMinimo` (entero), `disponible`, `archivada`.
- **`TaxRate`** (datos de la semilla): “IVA 16 %” (tasa 0,16, marcada como predeterminada) y “Exento” (tasa 0). El precio con impuesto se calcula como `precioVenta × (1 + tasa)` redondeado a 2 decimales.

### Acciones que permite

| Acción | Efecto |
|---|---|
| **Crear producto** | Crea el producto y sus variantes con `stock = 0`. Si una variante indica “stock inicial” > 0, se registra un **movimiento de inventario `ENTRADA`** con motivo “Alta de producto” (y se fija `precioCompra` si se indicó costo). Redirige a la ficha del producto. |
| **Editar producto** | Cambia nombre, descripción, categoría, tasa de impuesto e `imagenUrl`. No toca variantes ni stock. |
| **Editar variante** | Cambia nombre, SKU, código de barras, `precioVenta`, `precioCompra`, `stockMinimo` y `disponible`. **Nunca escribe `stock`** (eso es exclusivo de un movimiento de tipo AJUSTE). El formulario es autoritativo: un campo vacío **borra** el valor, no lo conserva. |
| **Añadir variante** | Agrega una variante a un producto que ya es `CON_VARIANTES`. |
| **Convertir SIMPLE → CON_VARIANTES** | La variante predeterminada deja de serlo y recibe nombre; se añaden una o más variantes nuevas. **No hay conversión inversa.** |
| **Disponibilidad** | A nivel producto (afecta a todas sus variantes) o a nivel variante. No cambia el stock; controla si la variante puede venderse. |
| **Archivar producto** | Marca el producto y **todas sus variantes** como archivados. **Restaurar** hace lo inverso. |
| **Archivar variante** | Archiva una variante concreta. **No se puede archivar la última variante activa** de un producto (“archiva el producto entero”). |

### Qué valida

- Nombre de producto mínimo 2 caracteres; descripción máximo 500; **tasa de impuesto obligatoria**.
- **SIMPLE**: exactamente 1 variante y sin nombre de variante. **CON_VARIANTES**: al menos 2 variantes, todas con nombre y con nombres únicos.
- Precios ≥ 0; `stockMinimo` y `stockInicial` enteros ≥ 0.
- **SKU y código de barras únicos entre todos los productos**; una colisión devuelve “Ya está en uso.” en el campo correspondiente.
- Añadir variante: nombre obligatorio y no repetido (sin distinguir mayúsculas) entre las variantes activas; el producto debe ser `CON_VARIANTES`.
- Convertir: nombre base obligatorio, al menos una variante nueva, todos los nombres (base + nuevas) no vacíos y únicos; el producto debe ser `SIMPLE`.
- Archivar variante: falla si es la única activa del producto.

### Efectos en otros módulos

- **Inventario**: el `stock` de una variante **solo** cambia a través de un movimiento de inventario. El alta de producto/variante con stock inicial genera un movimiento `ENTRADA`. Archivar el producto o la variante **bloquea** cualquier movimiento posterior sobre esa variante.
- **Ventas / Punto de venta**: la búsqueda para vender usa estas mismas variantes; solo se ofrecen variantes no archivadas (y, según el flujo, disponibles). El precio con impuesto sale de `precioVenta` + `TaxRate`.
- **Categorías**: la categoría del producto es opcional; véase el módulo *Categorías* para el efecto del archivado.
- **Reportes**: los reportes de inventario y de utilidad/margen leen `precioCompra`, `precioVenta` y `stock` de las variantes.
- **Alertas de stock bajo**: el indicador del menú lateral y la tarjeta de inventario cuentan variantes con `stockMinimo > 0` y `stock ≤ stockMinimo` (con una caché de 30 s que se invalida al registrar cualquier movimiento).

### Casos especiales

- **Estado calculado** del producto en el listado, por prioridad: `archivado` → `agotado` (stock total ≤ 0) → `no disponible` (todas sus variantes no disponibles) → `activo`.
- El `precioCompra` de una variante se **actualiza automáticamente** cuando una `ENTRADA` trae costo unitario.
- **No hay borrado** de productos ni de variantes: solo archivar/restaurar.
- **No hay carga de imágenes**: el campo `imagenUrl` existe en el modelo, pero la interfaz solo muestra “Sin imagen”; no ofrece subir un archivo.
- Al editar una variante, si **solo** cambia el precio se audita `productos.precio_cambiado`; si además cambian otros campos, se audita **también** `productos.editar` (dos registros).
- La ficha de detalle muestra los **últimos 10 movimientos** de inventario de cada variante.
- La búsqueda del catálogo empareja por nombre (contiene), prefijo de SKU o código de barras exacto; lee hasta 200 coincidencias.
- El archivado de un producto y el de una variante se confirman con un diálogo explícito.

### Qué se audita

| Evento | Cuándo | Datos registrados |
|---|---|---|
| `productos.crear` | Alta de producto | Autor, IP, nombre, tipo, `categoryId`, nº de variantes. |
| `productos.editar` | Edición de producto o de variante; conversión a “con variantes” | Autor, IP, `antes`/`despues` de los campos cambiados; en la conversión, `conversion = "SIMPLE_A_CON_VARIANTES"`. |
| `productos.precio_cambiado` | Cambio de `precioVenta` y/o `precioCompra` de una variante | Autor, IP, `antes` y `despues` de ambos precios. |
| `productos.disponibilidad` | Cambio de disponibilidad de producto o variante | Autor, IP, `productId`/`variantId`, `disponible`. |
| `productos.archivar` / `productos.restaurar` | Archivado / restauración de producto | Autor, IP, `productId`. |
| `productos.variante_agregada` | Alta de variante | Autor, IP, `productId`, `variantId`, nombre. |
| `productos.variante_archivada` | Archivado de variante | Autor, IP, `variantId`. |
| `inventario.movimiento` | Stock inicial de una variante nueva | Véase *Inventario y Movimientos*. |

---

## Módulo 8 — Inventario y Movimientos

### Qué hace

Refleja y controla las existencias de cada variante. **El stock nunca se edita a mano**: cambia únicamente al registrar un *movimiento* (entrada, salida o ajuste). Ofrece tres pantallas:

- **Inventario** — stock actual por variante, con tarjetas de resumen (variantes activas, agotadas, en stock bajo) y filtros (texto, categoría, “solo agotados”, “solo stock bajo”).
- **Movimientos** — historial de entradas, salidas y ajustes, con filtros (tipo, fechas, ID de producto, ID de usuario) y exportación a CSV.
- **Stock bajo** — variantes por debajo de su mínimo, ordenadas por déficit, con acceso directo a registrar un movimiento.

### Para qué sirve

Saber qué hay disponible, detectar necesidades de reposición y mantener una traza auditada de cada cambio de existencias con su motivo y su responsable.

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Ver inventario, movimientos y stock bajo; exportar CSV | `inventario.ver` | Administrador, Gerente, Cajero, Empleado |
| Registrar **ENTRADA** | `inventario.entrada` | Administrador, Gerente |
| Registrar **SALIDA** | `inventario.salida` | Administrador, Gerente |
| Registrar **AJUSTE** (fijar el stock a un valor) | `inventario.ajustar` | Administrador, Gerente |

La pantalla “Registrar movimiento” muestra **solo** los tipos para los que el usuario tiene permiso (se calcula sin generar registros `auth.forbidden`); si no tiene ninguno de los tres, ve la pantalla de acceso denegado.

### Información que maneja

- **`InventoryMovement`**: variante, **tipo** (`ENTRADA`, `SALIDA`, `AJUSTE`, `VENTA`, `DEVOLUCION`), `cantidad` (delta **con signo**: positivo si suma, negativo si resta), `stockPrevio`, `stockNuevo`, `costoUnitario` (solo en `ENTRADA`), **`motivo` (obligatorio)**, `referenciaTipo` / `referenciaId` (para movimientos originados por una venta o devolución), autor, fecha.
- El stock vigente vive en `ProductVariant.stock` (entero, nunca negativo).

### Acciones que permite

| Acción | Efecto |
|---|---|
| **ENTRADA** | Suma la cantidad al stock. Si se indica costo unitario, además **actualiza `precioCompra`** de la variante. |
| **SALIDA** | Resta la cantidad del stock (merma, robo, consumo interno, etc.). |
| **AJUSTE** | Fija el stock **al valor absoluto** indicado (el delta registrado es *objetivo − actual*). |
| **VENTA / DEVOLUCION** | **No** se registran desde este módulo: los generan Ventas y Devoluciones, con referencia a la venta correspondiente. |
| **Exportar CSV** | Hasta 5.000 filas con los filtros aplicados. Columnas: Fecha, Producto, Variante, Tipo, Cantidad, Stock previo, Stock nuevo, Motivo, Usuario, Costo unitario. BOM UTF‑8; archivo `movimientos-AAAA-MM-DD.csv`. |

### Qué valida

Todas las comprobaciones ocurren en `recordMovement`, que es **el único punto del sistema que escribe stock**:

- **Motivo obligatorio.**
- `ENTRADA` / `SALIDA` / `VENTA` / `DEVOLUCION`: cantidad **entera y mayor que 0**. `AJUSTE`: valor **entero y ≥ 0**.
- La variante debe existir y **no estar archivada** (ni su producto) — “La variante o su producto están archivados.”.
- El stock resultante **no puede ser negativo** — “Stock insuficiente: disponible N.”.
- El **costo unitario solo se admite en `ENTRADA`** (el formulario lo rechaza en los demás tipos).
- **Bloqueo de fila** (`SELECT … FOR UPDATE`) sobre la variante: serializa los movimientos concurrentes sobre la misma variante para que dos operaciones simultáneas no se pisen el stock.

### Efectos en otros módulos

- **Productos**: el `precioCompra` se actualiza con el costo de una `ENTRADA`; el estado “agotado / stock bajo” del producto se deriva del stock resultante.
- **Alertas de stock bajo**: cada movimiento invalida la caché del contador que alimenta el indicador del menú lateral.
- **Ventas**: al registrar una venta se descuenta stock mediante movimientos `VENTA`; al registrar una devolución se reingresa mediante `DEVOLUCION` — por la misma ruta con bloqueo de fila.
- **Auditoría**: cada movimiento (de cualquier origen) emite `inventario.movimiento`.

### Casos especiales

- **No existe editar ni borrar un movimiento**: el historial es inmutable. Un error se corrige registrando otro movimiento (habitualmente un `AJUSTE`).
- Un `AJUSTE` a un valor menor que el stock actual produce un delta negativo; a un valor mayor, positivo.
- Algunos filtros de las pantallas de listado se resuelven **en memoria** (p. ej. `stock ≤ stockMinimo`); en esos casos el “total” mostrado es el tamaño del conjunto ya filtrado, no un conteo directo de base de datos.
- La pantalla de movimientos permite filtrar por **ID de producto** y por **ID de usuario** (campos de texto), además de por tipo y rango de fechas.
- El motivo “Alta de producto” lo asigna el sistema automáticamente al stock inicial de una variante nueva.
- El modelo de movimiento contempla los tipos `VENTA` y `DEVOLUCION`, que solo se crean desde los módulos de Ventas y Devoluciones.

### Qué se audita

| Evento | Cuándo | Datos registrados |
|---|---|---|
| `inventario.movimiento` | Cualquier movimiento de stock (entrada, salida, ajuste, venta, devolución) | Autor (o *Sistema*), IP, `metadata`: `tipo`, `delta`, `stockPrevio`, `stockNuevo`, `motivo`, `costoUnitario`. |

---

## Módulo 9 — Clientes

### Qué hace

Mantiene el directorio de clientes con sus **datos de contacto** y su **bloque de datos fiscales** (RFC, razón social, régimen fiscal, uso de CFDI y código postal, para facturación conforme a los catálogos del SAT). Incluye listado con búsqueda (nombre, teléfono, correo, prefijo de RFC), filtros por estado y “solo facturables”, ficha editable, archivado/restauración y exportación a CSV.

### Para qué sirve

Asociar cada venta a un cliente, poder emitir comprobantes fiscales con datos correctos, y conservar la información de contacto.

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Ver listado y ficha (`/clientes`); exportar CSV | `clientes.ver` | Administrador, Gerente, Cajero, Empleado |
| Crear cliente (incluida el alta rápida desde el punto de venta) | `clientes.crear` | Administrador, Gerente, **Cajero** |
| Editar datos de contacto y de facturación | `clientes.editar` | Administrador, Gerente |
| Archivar / restaurar | `clientes.archivar` | Administrador, Gerente |

### Información que maneja

- **`Customer`** — contacto: nombre, teléfono (**único**), correo (**único**), dirección, notas. Bloque fiscal: RFC (**único**), razón social, código de régimen fiscal, código de uso de CFDI, código postal fiscal, correo de facturación. Además: `esGenerico`, `archivado`, quién lo creó, fechas.
- **“Facturable”**: se cumple cuando los **cinco campos núcleo** del bloque fiscal (RFC, razón social, régimen, uso de CFDI, CP) tienen valor. El correo de facturación es opcional y no cuenta para esta condición.
- **Catálogos del SAT** (en código): regímenes fiscales y usos de CFDI, con sus códigos y etiquetas y la compatibilidad de cada régimen con RFC de persona física o moral.
- **Cliente “Público en General”** (dato de la semilla): `esGenerico = true`, RFC `XAXX010101000`.

### Acciones que permite

| Acción | Efecto |
|---|---|
| **Crear cliente** | Alta con contacto (nombre obligatorio) y, opcionalmente, el bloque fiscal completo. Si se completa el bloque fiscal, se audita además un evento de datos fiscales. |
| **Alta rápida desde el punto de venta** | Crea el cliente **sin salir de la pantalla de cobro** y lo deja seleccionado en el carrito. |
| **Editar cliente** | Cambia contacto y/o datos fiscales. Puede generar hasta dos registros de auditoría: uno de contacto (solo los campos que cambiaron) y otro de datos fiscales (si cambió cualquier campo del bloque, incluido dejar de ser facturable). |
| **Archivar / restaurar** | Baja/alta lógica. Idempotente. **El cliente “Público en General” no se puede archivar.** |
| **Exportar CSV** | Hasta 5.000 filas con los filtros aplicados. Columnas: Nombre, Teléfono, Correo, RFC, Razón social, Régimen, Uso CFDI, CP fiscal, Facturable, Estado. **En este export el RFC va completo, sin enmascarar** (export administrativo, protegido por permiso). |

### Qué valida

- Nombre mínimo 2 caracteres; teléfono máximo 30; correo con formato válido si se indica; dirección y notas máximo 500.
- **Teléfono, correo y RFC únicos** entre todos los clientes — colisión: “Ya está en uso.”.
- **Bloque fiscal “todo o nada”**: o los cinco campos núcleo vacíos, o los cinco completos (“Completa todos los datos de facturación o déjalos vacíos.”).
- Si el bloque fiscal se completa:
  - RFC con formato válido (12 caracteres para persona moral, 13 para persona física);
  - **RFC genérico prohibido** (`XAXX010101000` / `XEXX010101000`): “RFC reservado; usa el cliente Público en General.”;
  - el **régimen fiscal** debe existir en el catálogo del SAT y ser **compatible con el tipo de RFC** (física / moral);
  - el **uso de CFDI** debe existir en el catálogo del SAT;
  - el **código postal** debe tener 5 dígitos.
- **Cliente genérico**: solo se le pueden cambiar los campos de contacto y las notas; cualquier intento de cambiar su nombre o de darle/alterar datos fiscales se rechaza.

### Efectos en otros módulos

- **Ventas**: toda venta se asocia a un cliente; si el cajero no elige ninguno, se usa “Público en General”. Si la venta **requiere factura**, el cliente debe ser **no genérico** y **facturable**, y sus datos fiscales se **congelan** (instantánea) dentro de la venta.
- **Reportes de clientes**: se calculan con estos datos; el cliente genérico se reporta por separado.
- **Auditoría / privacidad**: el RFC se **enmascara** en los metadatos de auditoría y en la ficha de la venta; solo aparece completo en el CSV administrativo de clientes.

### Casos especiales

- **“Público en General”** no se puede archivar, renombrar ni dotar de datos fiscales; sirve para las ventas sin identificar.
- **No hay borrado** de clientes: solo archivar/restaurar.
- La ficha de cliente **no muestra el historial de compras**: hay un texto que dice que “estará disponible cuando se active el módulo de Ventas” — es un marcador que quedó sin actualizar; el historial por cliente sí puede consultarse desde el módulo de Ventas filtrando por cliente, y en el reporte de Clientes.
- La búsqueda por RFC normaliza el término (mayúsculas, sin espacios ni guiones) y empareja por prefijo.
- El archivado del cliente se confirma con un diálogo explícito.

### Qué se audita

| Evento | Cuándo | Datos registrados |
|---|---|---|
| `clientes.crear` | Alta de cliente | Autor, IP, nombre, `facturable`. |
| `clientes.editar` | Cambio de datos de contacto | Autor, IP, `antes` y `despues` de los campos de contacto cambiados. |
| `clientes.datos_fiscales` | Alta o cambio del bloque fiscal | Autor, IP, `antes` y `despues` del bloque fiscal — **RFC enmascarado en ambos lados**. |
| `clientes.archivar` / `clientes.restaurar` | Archivado / restauración | Autor, IP, `customerId`. |

---

## Módulo 10 — Ventas / Punto de venta

### Qué hace

Es la caja registradora del sistema. En la pantalla de cajero (`/ventas`) se arma un carrito (buscando por texto o código de barras, o navegando por categorías), se elige el cliente, se aplican descuentos, se registran los pagos y se cobra. Al confirmar se genera una **venta** con folio `V-NNNNNN`, sus líneas y sus pagos; se **descuenta el stock** y se calcula el cambio. Complementan el módulo el **historial de ventas** (con filtros y CSV) y la **ficha de venta** (con impresión de ticket y cancelación).

### Para qué sirve

Registrar las ventas del negocio con cálculo exacto de descuentos e IVA, dejando actualizado el inventario y cuadrada la caja.

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Usar el punto de venta y registrar ventas (`/ventas`) | `ventas.crear` | Administrador, Gerente, Cajero |
| Aplicar descuentos (de línea y de ticket) | `ventas.descuento` | Administrador, Gerente (**Cajero no**) |
| Ver historial y ficha de ventas y devoluciones; exportar CSV | `ventas.ver` | Administrador, Gerente, Cajero |
| Cancelar una venta | `ventas.cancelar` | Administrador, Gerente (**Cajero no**) |
| Alta rápida de cliente desde el punto de venta | `clientes.crear` | Administrador, Gerente, Cajero |
| Imprimir el ticket (`/ventas-ticket/[id]`, vista fuera del panel) | `ventas.ver` | Administrador, Gerente, Cajero |

### Información que maneja

- **`Sale`**: folio único, estado (`COMPLETADA` / `CANCELADA`), cliente, cajero, **sesión de caja**, importes (`subtotal` = base neta, `descuentoLineas`, `descuentoTicket`, `impuestos`, `total`, `pagado`, `cambio`), `requiereFactura`, `datosFiscales` (instantánea JSON), y datos de cancelación (fecha, autor, motivo).
- **`SaleLine`**: nombre de producto y de variante y SKU **congelados** en el momento de la venta, cantidad, precio unitario, tasa de impuesto, descuento de línea, descuento de ticket prorrateado, base neta, IVA y total de la línea.
- **`Payment`**: método (`EFECTIVO`, `TARJETA`, `TRANSFERENCIA`) y monto. Una venta puede tener varios pagos.
- **`FolioCounter`** serie `V`: contador atómico que numera sin huecos (si la transacción se revierte, el número también).

### Cálculo de la venta

`computeSale` trabaja en **centavos enteros** para evitar deriva de coma flotante:

1. **Base bruta de línea** = precio unitario × cantidad.
2. **Descuento de línea** (monto fijo o porcentaje), acotado a `[0, base bruta]`.
3. **Descuento de ticket**: se calcula sobre la suma de las bases de línea ya descontadas y se **prorratea** entre las líneas en proporción a esa base; el residuo de redondeo se reparte de a 1 centavo empezando por las líneas de mayor base (orden estable).
4. **Base neta de línea** = base tras descuento de línea − prorrateo del descuento de ticket.
5. **IVA de línea** = base neta × tasa de impuesto.
6. **Total de línea** = base neta + IVA.

`subtotal` = Σ base neta; `impuestos` = Σ IVA; `total` = subtotal + impuestos. **El total debe ser mayor que 0.**

### Acciones que permite

| Acción | Efecto |
|---|---|
| **Registrar venta** | Exige **caja abierta**. Revalida la disponibilidad de cada variante en ese instante, calcula, comprueba que el pago cubre el total, y si hay cambio exige que exista un pago **en efectivo ≥ el cambio** (“El cambio solo se entrega en efectivo.”). Si la venta “requiere factura”, exige cliente no genérico y facturable y **congela** sus datos fiscales. Genera el folio, crea la venta con sus líneas y pagos, registra un **movimiento de inventario `VENTA`** por línea y redirige a la ficha. |
| **Cotización en vivo** (`POST /ventas/quote`) | Recalcula los totales **sin** guardar nada, para mostrar el total mientras se arma el carrito. |
| **Cancelar venta** | Solo si está `COMPLETADA`, **su sesión de caja sigue ABIERTA** y **no tiene devoluciones**. Reingresa el stock (movimiento `DEVOLUCION` por línea, motivo “Cancelación V‑…”) y marca la venta `CANCELADA` con fecha, autor y **motivo obligatorio**. |
| **Imprimir ticket** | Vista imprimible del comprobante en `/ventas-ticket/[id]`. |
| **Historial y CSV** | Filtros por texto (folio o cliente), estado, cajero y rango de fechas. CSV de hasta 5.000 filas: Folio, Fecha, Cliente, Cajero, Nº líneas, Subtotal, Descuentos, IVA, Total, Estado, Métodos de pago. |

### Qué valida

- Al menos una línea y al menos un pago; cantidades enteras > 0; montos de pago > 0.
- Descuentos: valor > 0; porcentaje ≤ 100 %. **Si el pedido trae cualquier descuento y el usuario no tiene `ventas.descuento`, se rechaza** (“No tienes permiso para aplicar descuentos.”).
- Cada variante debe existir, no estar archivada, su producto no estar archivado y estar `disponible` — si no: “El producto ya no está disponible.”.
- El pago debe cubrir el total; el cambio solo se admite si hay respaldo en efectivo suficiente.
- Factura: cliente **no genérico** con bloque fiscal **completo**.
- `computeSale` **no** comprueba que haya stock suficiente, pero el movimiento `VENTA` que se registra a continuación **sí** falla si el stock quedaría negativo, y en ese caso **toda la venta se revierte**.

### Efectos en otros módulos

- **Inventario**: descuenta stock por cada línea (movimiento `VENTA`, por la ruta con bloqueo de fila) e invalida la caché de alertas de stock bajo.
- **Caja**: la venta queda atada a la **sesión de caja abierta**; sus pagos e importes alimentan el arqueo al cerrar (efectivo esperado, totales por método, número de ventas).
- **Clientes**: si la venta requiere factura, congela una instantánea de los datos fiscales del cliente.
- **Reportes**: ventas, IVA, ticket promedio, cobros por método y ventas por cajero salen de aquí.
- **Folios**: consume la serie `V` del contador atómico.
- **Auditoría**: `ventas.crear` y `ventas.cancelar` (además del `inventario.movimiento` de cada línea).

### Casos especiales

- **Sin una caja abierta no se puede vender** (ni devolver): la pantalla muestra un aviso con enlace a “Abrir caja”.
- El **cliente por defecto** es “Público en General” si no se elige otro.
- Los nombres de producto y variante y el SKU quedan **congelados** en la línea: renombrar o archivar el producto después no cambia las ventas ya registradas.
- Un **Cajero no puede aplicar descuentos**: el control no se le muestra y el servidor rechaza el pedido si llegara con descuentos.
- **Cancelar vs. devolver**: se puede *cancelar* solo mientras la caja de esa venta siga abierta y no tenga devoluciones; una vez cerrada la caja, la única vía es la *devolución*. Existe en el código una utilidad de “mismo día natural en horario de México”, pero **no** se usa para decidir esto: la regla vigente es el estado de la sesión de caja.
- El **“Subtotal” que muestra la ficha de la venta es la base bruta** (antes de descuentos), para que “Subtotal − Descuentos + IVA = Total” cuadre a la vista; el campo `subtotal` almacenado es la base **neta**.
- Cancelar una venta **no** genera un asiento de caja separado: la venta cancelada simplemente deja de contar en el arqueo de su sesión (que aún debe estar abierta).

### Qué se audita

| Evento | Cuándo | Datos registrados |
|---|---|---|
| `ventas.crear` | Registro de una venta | Autor, IP, folio, total, nº de líneas, `customerId`, métodos de pago usados. |
| `ventas.cancelar` | Cancelación de una venta | Autor, IP, folio, total, motivo. |
| `inventario.movimiento` | Descuento de stock por cada línea (y reingreso al cancelar) | Véase *Inventario y Movimientos*. |

---

## Módulo 11 — Devoluciones

### Qué hace

Registra la devolución —total o parcial— de líneas de una venta **completada**, reintegrando el stock y calculando el importe a reembolsar. Genera un documento con folio `D-NNNNNN` ligado a la venta de origen. Incluye el listado de devoluciones y la ficha de detalle.

### Para qué sirve

Gestionar devoluciones de mercancía con su reembolso y su ajuste de inventario, dejando traza del motivo y del responsable.

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Registrar devolución (`/ventas/[id]/devolucion`) | `ventas.devolver` | Administrador, Gerente, **Cajero** |
| Ver listado y ficha de devoluciones | `ventas.ver` | Administrador, Gerente, Cajero |

### Información que maneja

- **`Return`**: folio único, venta de origen, cajero, **sesión de caja**, subtotal, impuestos, total, `metodoReembolso` (`EFECTIVO` / `TARJETA` / `TRANSFERENCIA`), motivo, fecha.
- **`ReturnLine`**: línea de venta de origen, variante, cantidad devuelta, y base neta / IVA / total **prorrateados** desde la línea original.
- **`FolioCounter`** serie `D`.

### Acciones que permite

| Acción | Efecto |
|---|---|
| **Registrar devolución** | Se eligen líneas y cantidades a devolver, el método de reembolso y el motivo. Exige **caja abierta**. Calcula los importes prorrateando desde la línea de venta original; **la devolución que agota una línea absorbe el residuo de redondeo**, de modo que la suma de lo devuelto coincide al centavo con lo vendido. Crea el documento y sus líneas, registra un **movimiento de inventario `DEVOLUCION`** por línea (reingresa stock) y redirige a la ficha. |

### Qué valida

- Al menos una línea; cantidades enteras > 0; **motivo entre 3 y 300 caracteres**; método de reembolso válido.
- La venta debe existir y estar **`COMPLETADA`**; una venta `CANCELADA` no admite devoluciones.
- Cada línea debe pertenecer a la venta; la cantidad no puede superar lo **aún devolvible** = cantidad vendida − ya devuelto en devoluciones previas − lo consumido por otras líneas de la misma solicitud.
- **Caja abierta obligatoria** (“No hay una caja abierta. Abre la caja para registrar devoluciones.”).

### Efectos en otros módulos

- **Inventario**: reingresa stock (movimiento `DEVOLUCION`, ruta con bloqueo de fila) e invalida la caché de alertas.
- **Caja**: la devolución queda atada a la sesión de caja abierta; los reembolsos **en efectivo** restan del efectivo esperado en el arqueo.
- **Ventas**: la ficha de la venta de origen lista sus devoluciones y recalcula lo “devuelto” por línea; **una venta con devoluciones ya no se puede cancelar**.
- **Reportes**: las devoluciones se descuentan de los ingresos netos y del cálculo de utilidad/margen; algunos indicadores (ticket promedio, cobros por método, por cajero) se mantienen en bruto.
- **Folios**: consume la serie `D`.
- **Auditoría**: `ventas.devolver` (más el `inventario.movimiento` de cada reingreso).

### Casos especiales

- **Sin caja abierta no se puede devolver.**
- No se puede devolver más de lo comprado, ni devolver sobre una venta cancelada.
- En **devoluciones parciales sucesivas**, cada parcial puede desviarse ±1 centavo por redondeo; la devolución que agota la línea ajusta al residuo exacto para que todo cuadre.
- El **reembolso puede hacerse por un método distinto** al pago original: el sistema no obliga a devolver por la misma vía.
- **No existe “anular una devolución”**: es un documento definitivo (una corrección se haría con otra operación).

### Qué se audita

| Evento | Cuándo | Datos registrados |
|---|---|---|
| `ventas.devolver` | Registro de una devolución | Autor, IP, folio D, folio de la venta, total, método de reembolso, nº de líneas. |
| `inventario.movimiento` | Reingreso de stock por cada línea devuelta | Véase *Inventario y Movimientos*. |

---

## Módulo 12 — Caja: sesiones y arqueo

### Qué hace

Gestiona la **sesión de caja** (el turno) del negocio: apertura con un fondo inicial, movimientos de efectivo (retiros e ingresos ajenos a ventas) y cierre con **arqueo a ciegas**. Al cerrar produce el **corte de caja** imprimible. Incluye el historial de sesiones.

### Para qué sirve

Controlar el efectivo del turno, cuadrar la caja al cierre y detectar faltantes o sobrantes. Además, tener una caja abierta es el **requisito que habilita registrar ventas y devoluciones**.

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Abrir/cerrar caja, registrar movimientos, ver sesiones, ver e imprimir cortes, exportar CSV | `caja.gestionar` | Administrador, Gerente, Cajero |

Es el **único permiso** del módulo: todas sus pantallas y acciones lo exigen.

### Información que maneja

- **Modelo**: **una sola sesión de caja abierta a la vez en todo el sistema** (no por usuario ni por terminal). La apertura toma un bloqueo sobre el contador de folios de caja antes de comprobar que no exista otra abierta, de modo que dos aperturas simultáneas no pueden crear dos sesiones.
- **`CashSession`**: folio `C-NNNNNN`, estado (`ABIERTA` / `CERRADA`), fondo de apertura, quién y cuándo abrió, quién y cuándo cerró y —**solo tras el cierre**— efectivo contado, efectivo esperado, diferencia, y los totales congelados del turno: efectivo de ventas (neto de cambio), tarjeta, transferencia, reembolsos en efectivo, retiros, ingresos, número de ventas, y la nota de cierre.
- **`CashMovement`**: tipo (`RETIRO` / `INGRESO`), monto, motivo, autor, fecha; ligado a la sesión.
- **Serie de folio `C`** del contador atómico.

### Acciones que permite

| Acción | Efecto |
|---|---|
| **Abrir caja** | Registra el fondo de apertura y crea la sesión. Falla si ya hay una caja abierta o si el fondo es negativo. |
| **Registrar retiro / ingreso de efectivo** | Requiere caja abierta, monto > 0 y motivo. Un **retiro** es dinero que sale de la caja (depósito, gasto); un **ingreso**, dinero que entra fuera de una venta. |
| **Cerrar caja (arqueo)** | El usuario introduce **solo el efectivo contado** (y una nota opcional). El sistema calcula el efectivo esperado y la diferencia, **congela** todos los totales del turno en la sesión y la marca `CERRADA`. Redirige al detalle del corte. |
| **Imprimir corte** | Vista de tira (~80 mm) en `/caja-corte/[id]`, solo para sesiones cerradas. |
| **Historial** | Filtros por estado y rango de fechas; exportación CSV. |

### Cálculo del arqueo

`computeExpectedCash` se ejecuta **dentro de la transacción de cierre**:

- **Efectivo de ventas** = Σ pagos en efectivo de las ventas **completadas** de la sesión − Σ cambio entregado en esas ventas que tuvieron algún pago en efectivo.
- **Reembolsos en efectivo** = Σ total de las devoluciones de la sesión cuyo método de reembolso fue efectivo.
- **Retiros / ingresos** = Σ de los movimientos de caja de cada tipo.
- **Efectivo esperado** = fondo de apertura + efectivo de ventas − reembolsos en efectivo − retiros + ingresos.
- **Diferencia** = efectivo contado − efectivo esperado → positiva = **sobrante**, negativa = **faltante**, cero = **cuadra**.
- Tarjeta y transferencia se totalizan para el corte pero **no** intervienen en el efectivo esperado.
- Las ventas **canceladas** no cuentan; solo las `COMPLETADA`.

### Arqueo a ciegas (invariante)

Mientras la caja está **abierta**, el sistema **nunca muestra el efectivo esperado ni la diferencia**. El cálculo solo corre dentro de la transacción de cierre; el formulario de cierre y el resumen de sesión abierta muestran únicamente el folio, el fondo y la lista de movimientos. Así el cajero cuenta el efectivo sin poder ajustar el conteo a una cifra esperada.

### Qué valida

- Fondo de apertura: ≥ 0, máximo 1 000 000.
- Movimiento de caja: tipo `RETIRO` / `INGRESO`; monto > 0, máximo 1 000 000; motivo de 3 a 300 caracteres.
- Cierre: efectivo contado ≥ 0, máximo 1 000 000; nota máximo 500 caracteres.
- Abrir exige que **no** haya otra caja abierta; registrar movimiento y cerrar exigen que **sí** la haya.

### Efectos en otros módulos

- **Ventas y Devoluciones**: sin caja abierta no se pueden registrar; ambas quedan atadas a la sesión abierta y alimentan su arqueo.
- **Cancelación de ventas**: solo es posible mientras la sesión de caja de esa venta siga abierta.
- **Dashboard**: muestra si hay caja abierta, quién la abrió y cuándo.
- **Auditoría**: `caja.abrir`, `caja.movimiento`, `caja.cerrar`.

### Casos especiales

- **El cierre es irreversible**: no hay reapertura de una caja cerrada ni edición del arqueo; una corrección se refleja en la siguiente sesión (o con un movimiento de caja en ella).
- El corte lleva la leyenda **“Documento interno — no fiscal”**.
- La **nota de cierre** sirve para dejar constancia de la causa de un descuadre.
- El detalle de una sesión **todavía abierta** muestra el resumen sin arqueo (“Caja abierta; el arqueo se verá al cerrar.”).
- El nombre del negocio que encabeza el corte proviene del ajuste `negocio.nombre` (por defecto “Punto de venta”), que **no** es editable desde la pantalla de Configuración.

### Qué se audita

| Evento | Cuándo | Datos registrados |
|---|---|---|
| `caja.abrir` | Apertura de caja | Autor, IP, folio, fondo de apertura. |
| `caja.movimiento` | Retiro o ingreso de efectivo | Autor, IP, folio de la sesión, tipo, monto, motivo. |
| `caja.cerrar` | Cierre y arqueo | Autor, IP, folio, efectivo esperado, efectivo contado, diferencia. |

---

## Módulo 13 — Reportes

### Qué hace

Cuatro reportes de gestión de **solo lectura**, cada uno con selector de período, indicadores (KPI), gráficas y tabla de detalle, más exportación a CSV: **Ventas**, **Inventario**, **Clientes** y **Utilidad / Margen**.

### Para qué sirve

Analizar el desempeño del negocio sin alterar ningún dato operativo.

### Usuarios y permisos

| Reporte | Permiso | Roles de sistema con acceso |
|---|---|---|
| Ventas, Inventario, Clientes (y sus CSV); índice `/reportes` | `reportes.ver` | Administrador, Gerente, Cajero |
| Utilidad / Margen (y su CSV) | `reportes.margen` | Administrador, Gerente (**Cajero no**) |

El índice de reportes solo muestra la tarjeta de *Utilidad / Margen* a quien tiene `reportes.margen`.

### Información que maneja

- **Período** (`resolvePeriod`): anclado a la **hora de Ciudad de México** (sin horario de verano). Prioridad: rango personalizado `desde`/`hasta` (inclusivo hasta el final del día) → atajo (`hoy`, `semana` desde el lunes, `mes` desde el día 1, `30dias`) → por defecto **`mes`**. Una fecha inválida se ignora.
- Todos los reportes leen de las tablas operativas (ventas, líneas, pagos, devoluciones, movimientos de inventario, variantes, clientes) y **agregan en el momento**; no hay tablas de reporte ni instantáneas.

### Los cuatro reportes

| Reporte | KPIs | Contenido |
|---|---|---|
| **Ventas** | Ventas completadas, canceladas, ingreso neto, ticket promedio, IVA, descuentos | Tendencia diaria de ingreso neto; cobros por método de pago; top 20 productos (netos de devolución cuando la venta original cae en el período); ventas por cajero (**en bruto**). Ingreso neto = ingreso bruto (con IVA) − devoluciones del período. |
| **Inventario** | Valor del stock a costo y a precio de venta (stock **actual**), nº de variantes en stock bajo/agotado, nº de movimientos del período | Movimientos por tipo; top 10 rotación (unidades vendidas = movimientos `VENTA` del período); detalle de movimientos del período. |
| **Clientes** | Clientes activos (con compras en el período), clientes nuevos del período, ticket promedio | Resumen aparte del cliente **“Público en General”**; top 10 y detalle por cliente (compras, monto neto de devoluciones, ticket promedio en bruto, última compra). El cliente genérico se excluye de los rankings. |
| **Utilidad / Margen** | Utilidad total, margen promedio %, producto más rentable | Top 10 por utilidad; detalle por producto (unidades netas, ingreso, costo, utilidad, % margen). El **ingreso es la base neta SIN IVA**; el **costo** usa el `precioCompra` **actual** de la variante. |

### Qué valida

- Fechas inválidas en la URL se descartan y se usa el período por defecto.

### Efectos en otros módulos

- **Ninguno.** Son de solo lectura: no escriben datos y **no generan auditoría** — consultar o exportar un reporte no deja registro.

### Casos especiales

- **`reportes.margen` es el único punto en el que un Cajero queda fuera de Reportes**, porque el margen revela los costos de compra.
- Las ventas **canceladas** solo cuentan como número (KPI “canceladas”); no suman a los ingresos.
- Diferencia deliberada de criterio: *Ventas* y *Clientes* usan importes **con IVA** (`total`); *Margen* usa importes **sin IVA** (`baseNeta`). Mezclarlos inflaría la utilidad por el IVA cobrado.
- Netos frente a brutos: el ingreso neto de *Ventas* y todo el cálculo de *Margen* descuentan devoluciones; en cambio el ticket promedio, los cobros por método, el desglose por cajero y el ticket por cliente se mantienen **brutos** a propósito (quien procesa un reembolso puede no ser quien hizo la venta).
- El reporte de *Margen* advierte que, si el costo de un producto cambió después de una venta, el margen histórico es una aproximación (usa el costo actual, no el del momento de la venta).
- Las gráficas son SVG dibujadas por la propia aplicación, sin librerías externas.
- La **valorización del stock** en *Inventario* es del stock **actual**, no del que había al final del período.

### Qué se audita

Nada. El módulo de Reportes no produce eventos de auditoría.

---

## Módulo 14 — Dashboard (Inicio)

### Qué hace

Es la pantalla de inicio (`/dashboard`, “Inicio” en el menú). Muestra un saludo y hasta cuatro tarjetas‑indicador planteadas como preguntas del día; cada una enlaza a la pantalla correspondiente.

### Para qué sirve

Dar, de un vistazo al entrar, el estado del día.

### Usuarios y permisos

- **Solo requiere sesión**: cualquier usuario entra al dashboard.
- Cada tarjeta aparece **según los permisos** del usuario:

| Tarjeta | Muestra | Permiso |
|---|---|---|
| “¿Cuánto vendí hoy?” | Ingreso **neto de devoluciones** de hoy | `reportes.ver` |
| “¿Cuántas ventas hice hoy?” | Nº de ventas de hoy y ticket promedio | `reportes.ver` |
| “¿Hay productos con poco stock?” | Nº de variantes en stock bajo/agotado (en ámbar si > 0) | `inventario.ver` |
| “¿Caja abierta?” | Sí/No, folio, quién la abrió y cuándo | `caja.gestionar` |

Un usuario sin ninguno de esos tres permisos (por ejemplo el rol **Empleado**) ve el mensaje “No hay información para mostrar con tu rol.”

### Información que maneja

Reutiliza el **reporte de Ventas** con el atajo “hoy”, el **contador de alertas de stock bajo** y la **sesión de caja abierta**. No consulta nada propio ni persiste nada.

### Acciones que permite

Ninguna: es solo lectura y navegación hacia las pantallas enlazadas.

### Qué valida

No aplica (no recibe entradas).

### Efectos en otros módulos

Ninguno. No genera auditoría.

### Casos especiales

- Las cifras de “hoy” usan el día natural en **hora de Ciudad de México**.
- El rol Empleado ve el dashboard vacío, pero conserva el acceso por menú a lo que su rol permita (catálogo, inventario y clientes en modo consulta).

### Qué se audita

Nada.

---

## Módulo 15 — Asistencia

### Qué hace

Registro de entrada y salida de empleados, con foto opcional de comprobante capturada por cámara; cálculo automático de horas trabajadas; dashboard con llegadas por hora, horas por empleado y galería de fotos del día; corrección/cierre manual de turnos abandonados por un Administrador.

### Para qué sirve

Llevar control del horario real trabajado por cada empleado sin depender de un reloj checador físico, y dar a la gerencia visibilidad diaria de llegadas y horas.

### Usuarios y permisos

| Acción | Permiso | Roles de sistema con acceso |
|---|---|---|
| Registrar la propia entrada/salida (`/asistencia/registrar`) | `asistencia.registrar` | Administrador, Gerente, Cajero, Empleado (todos) |
| Ver el dashboard de asistencia (`/asistencia`) | `asistencia.ver` | Administrador, Gerente |
| Cerrar/corregir manualmente un turno | `asistencia.corregir` | Administrador |

### Información que maneja

- **`AttendanceRecord`**: un registro por empleado por **día natural en America/Mexico_City** (`userId` + `fecha` es único), con hora de entrada, hora de salida (nula mientras el turno sigue abierto), minutos trabajados (calculados al hacer checkout o al corregir) y quién corrigió el registro, si aplica.
- **Fotos**: se guardan como archivos en disco bajo `ATTENDANCE_PHOTOS_DIR` (`<fecha>/<userId>-<tipo>-<timestamp>.jpg`); solo la **ruta relativa** se guarda en `AttendanceRecord`, nunca el binario en la base de datos.

### Acciones que permite

- Marcar entrada y marcar salida desde `/asistencia/registrar`, con o sin foto.
- Ver el dashboard en `/asistencia`: gráfica de llegadas por hora, tabla de horas por empleado, galería de fotos de los registros de hoy y lista de turnos abiertos, todo filtrable por período, empleado y rol.
- Cerrar manualmente un turno abandonado desde la sección “Turnos abiertos en el período” — funciona para cualquier día dentro del período visible, no solo hoy.

### Qué valida

- Un solo par entrada/salida por empleado por día natural (restricción única a nivel de base de datos).
- No se puede marcar salida sin una entrada previa del mismo día.
- Al corregir un turno, la nueva hora de salida debe ser **posterior** a la hora de entrada (una salida anterior o igual se rechaza).
- Una foto ausente, inválida o que exceda el tamaño máximo (5MB) **nunca bloquea** el registro de entrada/salida — el sistema continúa sin foto.

### Efectos en otros módulos

- **Ninguno.** Solo lee `User` y `Role` ya existentes (a través de una relación nueva); no modifica la lógica de Ventas, Caja, Inventario ni Catálogo.

### Casos especiales

- Si no hay cámara disponible (permiso denegado, sin hardware, o contexto inseguro) el registro se completa sin foto.
- Un turno que **cruza la medianoche** (entrada antes de las 00:00, salida después) no puede cerrarlo el propio empleado al día siguiente, porque el checkout solo actúa sobre el registro del día natural en curso — debe cerrarlo un Administrador desde “Turnos abiertos”.
- Las fotos se sirven únicamente mediante un endpoint autenticado (`/api/asistencia/foto/...`) que verifica sesión y permiso antes de leer el archivo; nunca se exponen desde una carpeta pública, y la respuesta se envía con `cache-control: no-store` por tratarse de un dispositivo potencialmente compartido.

### Qué se audita

Nada por ahora: este módulo no llama a `logActivity` (véase “Límites y ausencias conocidas”).

---

## Cierre de la FASE 7

Este manual cubre los **quince módulos** funcionales del sistema (Bloques 1–7), verificados uno a uno contra el código:

1. Autenticación y Sesiones · 2. Usuarios · 3. Roles y Permisos · 4. Auditoría · 5. Configuración · 6. Categorías · 7. Productos y Variantes · 8. Inventario y Movimientos · 9. Clientes · 10. Ventas / Punto de venta · 11. Devoluciones · 12. Caja: sesiones y arqueo · 13. Reportes · 14. Dashboard · 15. Asistencia.

### Límites y ausencias conocidas (documentadas, no defectos)

- **No hay emisión de factura/CFDI ni timbrado**: el sistema captura y valida los datos fiscales del cliente y guarda una instantánea en la venta marcada como “requiere factura”, pero no genera ni envía comprobantes fiscales.
- **No hay carga de imágenes de producto**: el campo existe en el modelo, la interfaz no permite subirlas.
- **Configuración editable por interfaz = un solo parámetro** (tiempo de inactividad). El resto son constantes de código o datos de la semilla (`negocio.nombre` incluido).
- **La ficha de cliente no muestra su historial de compras** (texto marcador sin actualizar); ese historial sí se consulta desde Ventas y desde el reporte de Clientes.
- **Sin borrado físico** en ningún módulo de catálogo o personas: usuarios, roles con uso, categorías, productos, variantes y clientes se **archivan/desactivan**, nunca se eliminan, para preservar la trazabilidad. Sí se pueden borrar roles sin usuarios.
- **Operaciones irreversibles**: cierre de caja, cancelación de venta, devolución. No tienen “deshacer”.
- El limitador de intentos de inicio de sesión vive **en memoria del proceso** (no persiste entre reinicios).
- Un turno de asistencia que cruza la medianoche no puede cerrarlo el propio empleado al día siguiente (ver Módulo 15) — requiere corrección manual de un Administrador.
- Las fotos de asistencia no tienen política de retención/limpieza automática — crecen indefinidamente en `ATTENDANCE_PHOTOS_DIR`; en un despliegue containerizado sin volumen persistente, se pierden en cada redeploy aunque la base de datos siga apuntando a ellas.
- Tras desplegar este bloque en una instalación existente, es necesario volver a correr `npm run db:seed` para que los permisos `asistencia.*` lleguen a los roles — esto reescribe los permisos de los roles de sistema y descarta cualquier personalización manual hecha desde la pantalla de Roles.

Estas ausencias se listan como parte del alcance real del sistema; no implican trabajo pendiente dentro de FASE 7.

<!-- FIN DE LA FASE 7 — el Manual de Usuario (no técnico) es la FASE 8, documento aparte -->
