# Manual de Usuario — Sistema de Punto de Venta

> **Para quién es este manual.** Para las personas que usan el sistema todos los días: cajeros, encargados, gerentes y administradores. Explica **paso a paso** cómo hacer cada tarea. No hace falta ningún conocimiento técnico.
>
> **Qué NO encontrarás aquí.** Detalles internos, base de datos ni configuración de servidores. Para eso está el *Manual Operativo / Técnico‑Funcional* (documento aparte).

---

## Cómo usar este manual

- Está organizado por **tareas** (“cómo hacer una venta”, “cómo cerrar la caja”, etc.), no por pantallas.
- Cada tarea indica **quién puede hacerla**. Si tu usuario no tiene permiso, no verás el botón correspondiente.
- Los pasos van numerados. Si un paso tiene condiciones o avisos, aparecen justo debajo.
- Cuando el texto dice *“pulsa **Guardar**”*, se refiere al botón con ese nombre en la pantalla.

### Cómo se ve el sistema

- A la izquierda hay un **menú** con las secciones a las que tienes acceso (Inicio, Usuarios, Productos, Inventario, Clientes, Punto de venta, Ventas, Caja, Reportes, Mi perfil…). Cada quien ve solo lo que su rol permite.
- Arriba a la derecha está tu nombre y la opción de **cerrar sesión**.
- La pantalla **Inicio** resume el día (cuánto se vendió, si hay poco stock, si la caja está abierta).

---

## Los roles: qué puede hacer cada quién

El sistema tiene cuatro tipos de usuario de fábrica. Un administrador puede además crear roles a la medida.

| Rol | Para qué sirve | Puede hacer | No puede hacer |
|---|---|---|---|
| **Administrador** | Responsable total del sistema | **Todo**: vender, caja, catálogo, inventario, clientes, reportes (incluidos costos), y además crear usuarios y roles, desactivar usuarios, ver la auditoría, cambiar la configuración, ver el panel de asistencia y cerrar turnos abandonados | — |
| **Gerente** | Encargado de la operación | Vender, aplicar descuentos, cancelar ventas, caja, todo el catálogo e inventario, clientes, todos los reportes (incluidos costos), crear y editar usuarios, restablecer contraseñas, consultar la auditoría, ver el panel de asistencia | Desactivar usuarios · gestionar roles · cambiar la configuración del sistema · cerrar turnos abandonados |
| **Cajero** | Atiende el punto de venta | Abrir y cerrar caja, registrar ventas, cobrar, registrar devoluciones, dar de alta clientes, consultar productos, inventario y los reportes de ventas/inventario/clientes | Aplicar descuentos · cancelar ventas · editar productos, precios o inventario · ver el reporte de utilidad/margen · ver el panel de asistencia · nada de administración |
| **Empleado** | Consulta de apoyo | Ver el catálogo de productos, el inventario y la lista de clientes | Vender, tocar caja, editar cualquier cosa, ver reportes, ver el panel de asistencia |

Cualquier usuario, sea cual sea su rol, puede **editar sus propios datos de contacto**, **cambiar su contraseña**, **ver su propia actividad** y **registrar su propia entrada y salida de asistencia**.

---

## 1. Primer arranque: crear el primer administrador

Esto se hace **una sola vez**, cuando el sistema está recién instalado y todavía no existe ningún usuario.

1. Abre la dirección del sistema en el navegador. Como no hay usuarios, te llevará automáticamente a la pantalla de **configuración inicial**.
2. Escribe tu **nombre**, tu **correo** y una **contraseña** (mínimo 10 caracteres; no puede ser igual a tu correo ni una contraseña demasiado común). Repite la contraseña en el campo de confirmación.
3. Pulsa **Crear administrador**.
4. El sistema te deja dentro, ya con la sesión iniciada, en la pantalla de Inicio.

> A partir de aquí, la pantalla de configuración inicial deja de estar disponible: los demás usuarios se crean desde **Usuarios** (ver el Bloque 4).

---

## 2. Iniciar sesión

1. Abre la dirección del sistema. Verás la pantalla de **inicio de sesión**.
2. Escribe tu **correo** y tu **contraseña**.
3. Pulsa **Entrar**.
4. Si los datos son correctos, entras a la pantalla de **Inicio**.

**Si ves “Credenciales inválidas”:** el correo o la contraseña no coinciden, **o** tu cuenta está desactivada. Revisa lo que escribiste; si estás seguro de que son correctos, contacta a un administrador para que verifique tu cuenta.

**Si ves “Demasiados intentos. Inténtalo de nuevo en N minutos”:** por seguridad, tras **5 intentos fallidos seguidos** el acceso se bloquea **15 minutos** para esa combinación de correo. Espera ese tiempo y vuelve a intentar; un inicio de sesión correcto reinicia el contador.

---

## 3. La primera vez que entras: cambiar la contraseña temporal

Cuando un administrador o gerente crea tu cuenta, te entrega una **contraseña temporal**. La primera vez que entres, el sistema te obliga a cambiarla.

1. Inicia sesión con tu correo y la contraseña temporal.
2. El sistema te lleva directo a la pantalla **Cambiar contraseña**.
3. Escribe tu **nueva contraseña** (mínimo 10 caracteres, distinta de tu correo, que no sea una contraseña común) y repítela en la confirmación.
   - En este caso **no** se te pide la contraseña anterior.
4. Pulsa **Cambiar contraseña**.
5. Listo: ya puedes usar el sistema con normalidad.

> Al cambiar la contraseña, **se cierran todas tus demás sesiones** (por ejemplo, si habías entrado desde otro equipo). Tendrás que volver a iniciar sesión en ellas con la contraseña nueva.

---

## 4. Cambiar tu contraseña cuando quieras

1. En el menú, entra a **Mi perfil**.
2. Pulsa **Cambiar contraseña**.
3. Escribe tu **contraseña actual**.
4. Escribe la **nueva contraseña** (mismas reglas: mínimo 10 caracteres, distinta del correo, que no sea común) y repítela.
5. Pulsa **Cambiar contraseña**.

> Igual que antes: al cambiarla se cierran tus otras sesiones abiertas.

**Si olvidaste tu contraseña:** el sistema no tiene recuperación por correo. Pide a un administrador o gerente que te haga un **restablecimiento de contraseña**; te dará una nueva contraseña temporal y volverás al paso 3 de este manual.

---

## 5. Cerrar sesión

1. Arriba a la derecha, pulsa tu nombre y elige **Cerrar sesión**.
2. Vuelves a la pantalla de inicio de sesión.

Cierra sesión siempre que dejes el equipo desatendido, sobre todo en un mostrador.

---

## 6. La sesión se cierra sola (por inactividad y por tiempo)

- **Por inactividad:** si pasas un rato sin usar el sistema, se cierra tu sesión por seguridad. El tiempo lo fija un administrador (de fábrica, **15 minutos**).
  - **Un minuto antes** aparece un aviso con una cuenta atrás y un botón **Seguir conectado**. Púlsalo para seguir trabajando sin volver a iniciar sesión.
  - Si no reaccionas, el sistema te lleva a la pantalla de inicio de sesión con el mensaje de que se cerró por inactividad.
- **Por tiempo máximo:** aunque estés activo, cada sesión dura como máximo **8 horas** desde la última vez que se renovó. Al llegar a ese límite tendrás que volver a iniciar sesión.

---

## 7. Tu perfil: editar tus datos

1. En el menú, entra a **Mi perfil**.
2. En **Información personal** puedes cambiar tu **nombre** y tu **teléfono**.
   - El **correo** y el **rol** no se editan aquí; eso lo hace un administrador o gerente.
3. Pulsa **Guardar**.

---

## 8. Tu perfil: ver y cerrar tus sesiones activas

En **Mi perfil**, la sección **Sesiones activas** muestra dónde tienes la sesión abierta (equipo/navegador, dirección de red y última actividad). La sesión que estás usando ahora aparece marcada como **la actual**.

- **Cerrar una sesión concreta:** pulsa **Cerrar** en la fila correspondiente. Útil si dejaste la sesión abierta en otro equipo.
- **Cerrar todas menos esta:** pulsa **Cerrar las demás sesiones**. Tu sesión actual sigue abierta; todas las otras se cierran.

---

## 9. Tu perfil: ver tu historial de actividad

1. En **Mi perfil**, pulsa **Ver historial de actividad**.
2. Verás la lista de acciones que **tú** has realizado en el sistema, con la fecha, la hora y la dirección de red desde la que se hicieron.
3. Puedes acotar por rango de fechas y avanzar de página.

> Este historial es solo tuyo. La auditoría completa del sistema (todas las personas) la consultan los administradores y gerentes desde **Auditoría** (ver el Bloque 4).

---

# Bloque 2 — Operación diaria del punto de venta

Este bloque cubre el día a día de quien atiende: abrir la caja, vender, cobrar, hacer devoluciones y cerrar la caja al final del turno.

> **Regla de oro:** para **vender** o **hacer una devolución** tiene que haber una **caja abierta**. Si no la hay, el sistema te lo avisa y te ofrece el enlace para abrirla.
>
> Solo puede haber **una caja abierta a la vez en todo el negocio** (no una por persona ni una por equipo).

---

## 10. Abrir la caja

**Quién puede:** Administrador, Gerente, Cajero.

1. En el menú, entra a **Caja**.
2. Si no hay ninguna caja abierta, verás el formulario **Abrir caja**.
3. Escribe el **fondo de apertura**: el efectivo con el que arranca el turno (puede ser 0). No puede ser un número negativo.
4. Pulsa **Abrir caja**.
5. La pantalla cambia y muestra la caja abierta, con su folio (por ejemplo `C-000012`), el fondo y la lista de movimientos (de momento vacía).

> Si ya hay una caja abierta, no verás este formulario, sino el panel de la caja en curso.

---

## 11. Registrar una venta

**Quién puede:** Administrador, Gerente, Cajero.

1. En el menú, entra a **Punto de venta**.
   - Si no hay caja abierta, verás un aviso con el enlace **Abrir caja**. Ábrela primero (paso 10).
2. **Agrega productos al carrito.** Tienes dos formas:
   - **Buscar:** escribe en el buscador el **nombre del producto, su SKU o su código de barras**. Aparece una lista; pulsa el producto que quieras. Con un lector de códigos de barras, el producto exacto se reconoce solo.
   - **Por categorías:** navega por las categorías y elige el producto de la cuadrícula.
3. Si el producto tiene **variantes** (tallas, colores, presentaciones…), elige la variante concreta.
4. Ajusta la **cantidad** de cada línea en el carrito. Para quitar una línea, ponla en 0 o usa el botón de eliminar.
5. El **total** se actualiza solo cada vez que cambias el carrito.

> Solo aparecen productos **disponibles y no archivados**. Si un producto se quedó sin stock o se marcó como no disponible justo antes de cobrar, al confirmar el sistema avisará “El producto ya no está disponible” y no registrará la venta hasta que quites esa línea.

---

## 12. Elegir el cliente

1. En la pantalla de venta, en la zona de **cliente**, pulsa para buscar.
2. Escribe **nombre, teléfono, correo o RFC** y elige el cliente de la lista.
3. Si no eliges a nadie, la venta se registra a nombre de **“Público en General”**.

### Dar de alta un cliente sin salir de la venta

**Quién puede:** Administrador, Gerente, Cajero.

1. En el buscador de cliente, pulsa **Nuevo cliente**.
2. Rellena al menos el **nombre**. El teléfono, el correo y los datos de facturación son opcionales (si pones datos de facturación, tienen que ir **todos** los obligatorios; ver el Bloque 4).
3. Pulsa **Guardar**. El cliente queda creado y **seleccionado en la venta**; no pierdes el carrito.

---

## 13. Aplicar descuentos

**Quién puede:** Administrador, Gerente. **El Cajero no ve esta opción** y no puede aplicar descuentos.

1. **Descuento en una línea:** pulsa el descuento en la línea del carrito, elige **importe fijo** o **porcentaje** e indica el valor. El porcentaje no puede pasar de 100 %.
2. **Descuento a toda la venta (ticket):** usa el campo de descuento del total, igual, por importe o por porcentaje (máximo 100 %).
3. El total se recalcula. El descuento del ticket se reparte de forma proporcional entre las líneas.

---

## 14. Marcar “Requiere factura”

1. Si el cliente va a pedir factura, activa la casilla **Requiere factura** en la venta.
2. Para poder marcarla, el cliente **no** puede ser “Público en General” y **debe tener sus datos de facturación completos** (RFC, razón social, régimen fiscal, uso de CFDI y código postal). Si le faltan datos, complétalos primero en su ficha (Bloque 4) o elige otro cliente.
3. Al registrar la venta, el sistema guarda una **copia de los datos de facturación** tal como estaban en ese momento.

> El sistema **no emite la factura ni la timbra**: solo deja registrado que la venta requiere factura y con qué datos. La emisión del comprobante se hace por fuera.

---

## 15. Cobrar

1. En la zona de **pago**, elige el **método**: **Efectivo**, **Tarjeta** o **Transferencia**.
2. Indica el **monto** recibido con ese método.
3. Puedes registrar **varios pagos** (por ejemplo, una parte en tarjeta y otra en efectivo). Añade tantas líneas de pago como necesites.
4. El total de los pagos **debe cubrir el total de la venta**. Si falta, el sistema no deja cobrar (“El pago no cubre el total.”).
5. Si el cliente paga de más, el sistema calcula el **cambio**. El cambio **solo se entrega en efectivo**: tiene que haber un pago en efectivo por un monto igual o mayor al cambio; si no, el sistema lo impide (“El cambio solo se entrega en efectivo.”).
6. Pulsa **Cobrar** (o **Registrar venta**).
7. El sistema:
   - descuenta del inventario las cantidades vendidas,
   - crea la venta con su folio (`V-000123`),
   - te lleva a la **ficha de la venta**, donde ves el detalle, los pagos y el cambio.

---

## 16. Imprimir el ticket

1. En la **ficha de la venta**, pulsa **Imprimir ticket**.
2. Se abre una vista lista para imprimir. Usa la impresión del navegador o de la impresora de tickets.

Puedes volver a imprimir el ticket de cualquier venta pasada entrando a **Ventas**, abriendo la venta y pulsando **Imprimir ticket**.

---

## 17. Registrar un retiro o un ingreso de efectivo

Sirve para el dinero que entra o sale de la caja **sin ser una venta** (un depósito al banco, pagar un gasto menor, meter cambio…).

**Quién puede:** Administrador, Gerente, Cajero. Requiere caja abierta.

1. En el menú, entra a **Caja** (con la caja abierta).
2. Elige **Retiro** (sale dinero de la caja) o **Ingreso** (entra dinero a la caja).
3. Escribe el **monto** (mayor que 0) y el **motivo** (obligatorio, entre 3 y 300 caracteres).
4. Pulsa **Registrar**.
5. El movimiento aparece en la lista de la caja y se tendrá en cuenta en el arqueo de cierre.

---

## 18. Cancelar una venta

**Quién puede:** Administrador, Gerente. **El Cajero no puede cancelar ventas.**

Solo se puede cancelar una venta si:

- está **completada** (no cancelada ya),
- **la caja en la que se hizo sigue abierta**, y
- **no tiene devoluciones** registradas.

1. Entra a **Ventas** y abre la venta que quieres cancelar.
2. Si se cumplen las condiciones, verás la opción **Cancelar venta**.
3. Escribe el **motivo** de la cancelación (obligatorio).
4. Confirma en el aviso que aparece.
5. El sistema **reingresa al inventario** las cantidades de esa venta y la deja marcada como **cancelada**, con la fecha, tu nombre y el motivo.

> Si la caja de esa venta **ya se cerró**, la cancelación no está disponible: en ese caso haz una **devolución** (paso 19).

---

## 19. Registrar una devolución

**Quién puede:** Administrador, Gerente, Cajero. Requiere **caja abierta**.

1. Entra a **Ventas** y abre la venta de la que se devuelve mercancía. Debe estar **completada** (de una venta cancelada no se puede devolver).
2. Pulsa **Registrar devolución**.
3. Marca las **líneas** que se devuelven y la **cantidad** de cada una.
   - No puedes devolver más de lo que se compró, ni más de lo que ya quede pendiente si hubo devoluciones anteriores. El sistema te indica el **máximo devolvible** de cada línea.
4. Elige el **método de reembolso**: Efectivo, Tarjeta o Transferencia. Puede ser distinto al método con el que se pagó la venta.
5. Escribe el **motivo** (entre 3 y 300 caracteres).
6. Pulsa **Registrar devolución**.
7. El sistema:
   - **reingresa al inventario** las cantidades devueltas,
   - calcula el **importe a reembolsar** (proporcional a lo devuelto, IVA incluido),
   - crea la devolución con su folio (`D-000045`) y te lleva a su ficha.

> Los reembolsos **en efectivo** se descuentan del efectivo esperado en el arqueo de la caja.
>
> Una devolución es un documento **definitivo**: no se anula. Una corrección se hace con otra operación.

---

## 20. Cerrar la caja (arqueo)

**Quién puede:** Administrador, Gerente, Cajero.

Al final del turno se cuenta el efectivo y se cierra la caja.

1. **Cuenta físicamente** todo el efectivo que hay en la caja.
2. En el menú, entra a **Caja** y pulsa **Cerrar caja (arqueo)**.
3. En **Efectivo contado**, escribe **únicamente la cifra que contaste**.
   - Importante: en esta pantalla **no** verás cuánto “debería” haber. El conteo se hace **a ciegas**, a propósito, para que sea una verificación real.
4. Si quieres, escribe una **nota de cierre** (por ejemplo, para explicar un descuadre).
5. Pulsa **Cerrar caja** y confirma en el aviso.
6. El sistema calcula el **efectivo esperado** y la **diferencia**, y te muestra el **corte**:
   - **Cuadra** si el contado coincide con el esperado,
   - **Sobrante** si contaste de más,
   - **Faltante** si contaste de menos.

**Cómo se calcula el efectivo esperado:** fondo de apertura + efectivo cobrado en ventas − reembolsos hechos en efectivo − retiros + ingresos. Los pagos con **tarjeta** y **transferencia** aparecen en el corte pero **no** cuentan para el efectivo esperado.

> El cierre es **definitivo**: una caja cerrada **no se reabre** ni se edita. Si detectas un error después, se corrige en la siguiente sesión de caja.

---

## 21. Imprimir el corte de caja

1. Tras cerrar la caja (o entrando después a **Caja → Ver historial de cortes** y abriendo la sesión), pulsa **Imprimir corte**.
2. Se abre la vista imprimible del corte, con el desglose de ventas por método, retiros, ingresos, esperado, contado y diferencia.

El corte lleva la leyenda **“Documento interno — no fiscal”**.

---

## 22. Consultar el historial

- **Ventas:** menú **Ventas**. Puedes filtrar por **folio o cliente**, **estado** (completadas / canceladas), **cajero** y **rango de fechas**, y **exportar a CSV** el resultado.
- **Devoluciones:** menú **Ventas → Devoluciones** (o desde la ficha de una venta con devoluciones). Filtro por fechas.
- **Cortes de caja:** menú **Caja → Ver historial de cortes**. Filtro por estado y fechas, y **exportar a CSV**. Desde el panel de la caja abierta, **Ver ventas de esta caja** te lleva a las ventas del turno en curso.

---

# Bloque 3 — Catálogo e inventario

Aquí se gestiona **qué se vende** (categorías, productos y variantes, precios) y **cuántas existencias hay** (movimientos de stock).

> **Quién puede modificar el catálogo y el inventario:** Administrador y Gerente. El **Cajero** y el **Empleado** solo pueden **consultar** productos, stock y alertas.

---

## 23. Crear una categoría raíz

**Quién puede:** Administrador, Gerente.

Las categorías tienen **dos niveles**: la **categoría raíz** (la principal) y la **subcategoría** (dentro de una raíz). No hay un tercer nivel.

1. En el menú, entra a **Categorías**.
2. Pulsa **Nueva categoría raíz**.
3. Escribe el **nombre** (mínimo 2 caracteres).
4. Pulsa **Guardar**.

> No puede haber dos categorías raíz con el mismo nombre.

---

## 24. Crear una subcategoría

**Quién puede:** Administrador, Gerente.

1. En **Categorías**, localiza la categoría raíz donde quieres crear la subcategoría.
2. Pulsa la opción para **añadir una subcategoría** dentro de esa raíz.
3. Escribe el **nombre** y pulsa **Guardar**.

> La categoría raíz debe estar **activa** (no archivada). No puede haber dos subcategorías con el mismo nombre dentro de la misma raíz.

---

## 25. Renombrar o mover una categoría

**Quién puede:** Administrador, Gerente.

1. En **Categorías**, abre la categoría que quieres cambiar.
2. Cambia el **nombre**, o cambia su **categoría padre** para convertir una raíz en subcategoría (o dejar el padre vacío para convertir una subcategoría en raíz).
3. Pulsa **Guardar**.

**Límites:**

- Una categoría que **tiene subcategorías** no se puede convertir en subcategoría.
- Una categoría no puede ser su propia categoría padre.
- El nuevo padre debe ser una categoría **raíz** (no se pueden encadenar tres niveles).

---

## 26. Archivar y restaurar categorías

**Quién puede:** Administrador, Gerente.

**Archivar** oculta la categoría de las listas de selección, pero **no borra nada ni cambia los productos**.

1. En **Categorías**, elige la categoría y pulsa **Archivar**.
2. Si es una **categoría raíz**, el sistema te pide **confirmación**, porque al archivarla se archivan también **todas sus subcategorías**.

**Restaurar:**

1. En **Categorías**, activa **Mostrar categorías archivadas**.
2. Elige la categoría archivada y pulsa **Restaurar**.
3. Al restaurar una **raíz**, sus subcategorías **siguen archivadas**: restáuralas una por una.
4. No se puede restaurar una subcategoría si su categoría padre sigue archivada; restaura primero el padre.

> No existe “eliminar” una categoría: solo archivar y restaurar.

---

## 27. Productos que quedaron bajo una categoría archivada

Si archivas una categoría, los productos que la tenían **siguen apuntando a ella** (no se archivan). El sistema te lo avisa con un mensaje en la pantalla **Categorías**.

1. Pulsa **Recategorizar** en ese aviso (o entra a **Categorías → Productos sin categoría activa**).
2. Para cada producto de la lista, elige una **categoría activa** y guarda.

---

## 28. Crear un producto sencillo (sin variantes)

**Quién puede:** Administrador, Gerente.

Un producto **sencillo** tiene una sola presentación (una sola variante interna, sin nombre).

1. En el menú, entra a **Productos** y pulsa **Nuevo producto**.
2. Escribe el **nombre** (mínimo 2 caracteres) y, si quieres, una **descripción** (máximo 500 caracteres).
3. Elige la **categoría** (opcional) y la **tasa de impuesto** (obligatoria; por ejemplo “IVA 16 %” o “Exento”).
4. Deja el tipo en **Sencillo**.
5. Indica el **precio de venta** (sin impuesto; el precio con impuesto se calcula solo). Opcionalmente, el **precio de compra**, el **SKU**, el **código de barras** y el **stock mínimo**.
6. Si ya tienes existencias, escribe el **stock inicial**. El sistema lo registrará como una **entrada de inventario**.
7. Pulsa **Guardar**. Te lleva a la ficha del producto.

> El **SKU** y el **código de barras** no se pueden repetir en **ningún** otro producto del catálogo.

---

## 29. Crear un producto con variantes

**Quién puede:** Administrador, Gerente.

Un producto **con variantes** tiene dos o más presentaciones (tallas, colores, sabores…), cada una con su propio precio, SKU, código de barras y stock.

1. En **Productos → Nuevo producto**, rellena nombre, descripción, categoría y tasa de impuesto igual que antes.
2. Cambia el tipo a **Con variantes**.
3. Añade **al menos dos variantes**. Cada una necesita un **nombre** (distinto de las demás) y su **precio de venta**; opcionalmente precio de compra, SKU, código de barras, stock mínimo y stock inicial.
4. Pulsa **Guardar**.

---

## 30. Editar los datos de un producto

**Quién puede:** Administrador, Gerente.

1. En **Productos**, abre el producto.
2. En **Datos del producto** puedes cambiar el nombre, la descripción, la categoría y la tasa de impuesto.
3. Pulsa **Guardar**.

> Editar el producto **no** cambia sus variantes ni su stock.

---

## 31. Editar una variante (precio, SKU, código de barras, stock mínimo, disponibilidad)

**Quién puede:** Administrador, Gerente.

1. En la ficha del producto, ve a **Variantes e inventario** y abre la variante.
2. Cambia lo que necesites: nombre, SKU, código de barras, **precio de venta**, **precio de compra**, **stock mínimo**, y si está **disponible**.
3. Pulsa **Guardar**.

**Importante:**

- Aquí **no se cambia la cantidad de stock**. El stock solo se modifica registrando un movimiento de inventario (pasos 37–39).
- Si dejas un campo **vacío** (SKU, código de barras, nombre de variante), ese dato se **borra**.
- El SKU y el código de barras siguen sin poder repetirse en el catálogo.

---

## 32. Añadir una variante a un producto

**Quién puede:** Administrador, Gerente.

1. En la ficha de un producto **con variantes**, pulsa **Añadir variante**.
2. Escribe el **nombre** (distinto de las variantes activas) y el **precio de venta**; el resto de datos son opcionales.
3. Pulsa **Guardar**.

> Si el producto es **sencillo**, primero conviértelo en “con variantes” (paso 33).

---

## 33. Convertir un producto sencillo en producto con variantes

**Quién puede:** Administrador, Gerente.

1. En la ficha del producto sencillo, elige la opción para **convertir a “con variantes”**.
2. Ponle un **nombre** a la variante que ya existía.
3. Añade **una o más variantes nuevas**, cada una con su nombre y precio.
4. Guarda.

> No se puede volver atrás: una vez que un producto tiene variantes, no se convierte de nuevo en sencillo.

---

## 34. Marcar un producto o una variante como “no disponible”

**Quién puede:** Administrador, Gerente.

“No disponible” significa que **no se puede vender**, aunque haya stock. No cambia las existencias.

- **Todo el producto:** en la ficha, sección **Disponibilidad del producto**, cambia el estado. Afecta a todas sus variantes.
- **Una variante concreta:** en la edición de esa variante, desmarca **Disponible**.

Para volver a venderlo, marca de nuevo la disponibilidad.

---

## 35. Archivar y restaurar productos y variantes

**Quién puede:** Administrador, Gerente.

**Archivar un producto:**

1. En la ficha del producto, sección **Archivar producto**, pulsa **Archivar** y confirma.
2. El producto y **todas sus variantes** quedan archivados: dejan de aparecer para vender y en las listas normales.

**Restaurar un producto:** en **Productos**, filtra por estado **Archivados**, abre el producto y pulsa **Restaurar**.

**Archivar una variante:** en la ficha del producto, en la variante, pulsa **Archivar** y confirma.

- No se puede archivar la **última variante activa** de un producto. Si quieres quitar todo el producto, archiva el producto entero.

> No existe “eliminar” productos ni variantes: solo archivar y restaurar. Tampoco hay carga de imágenes de producto.

---

## 36. Entender los estados de un producto

En la lista de **Productos**, la columna **Estado** puede mostrar:

| Estado | Qué significa |
|---|---|
| **Activo** | Se puede vender con normalidad. |
| **No disponible** | Todas sus variantes están marcadas como no disponibles. |
| **Agotado** | La suma del stock de sus variantes es 0 o menos. |
| **Archivado** | Está archivado; no se vende ni aparece en las listas normales. |

---

## 37. Registrar una entrada de stock

**Quién puede:** Administrador, Gerente (permiso de *entradas*).

Una **entrada** suma existencias (una compra a proveedor, una reposición…).

1. En el menú, entra a **Inventario → Movimientos → Registrar movimiento**.
2. Elige la **variante** (búscala por nombre, SKU o código de barras).
3. Elige el tipo **Entrada**.
4. Escribe la **cantidad** (número entero mayor que 0).
5. Escribe el **motivo** (obligatorio).
6. Opcionalmente, el **costo unitario**: si lo indicas, además se actualiza el **precio de compra** de esa variante.
7. Pulsa **Registrar**.

> Solo verás los tipos de movimiento para los que tengas permiso. Si no tienes ninguno, no podrás abrir esta pantalla.

---

## 38. Registrar una salida de stock

**Quién puede:** Administrador, Gerente (permiso de *salidas*).

Una **salida** resta existencias por un motivo que **no es una venta** (merma, rotura, consumo interno, robo…).

1. En **Registrar movimiento**, elige la **variante**.
2. Tipo **Salida**.
3. **Cantidad** (entero mayor que 0) y **motivo** (obligatorio).
4. Pulsa **Registrar**.

> No se puede dejar el stock en negativo: si la cantidad supera lo disponible, el sistema lo rechaza (“Stock insuficiente”).

---

## 39. Ajustar el stock a una cantidad concreta

**Quién puede:** Administrador, Gerente (permiso de *ajustes*).

Un **ajuste** fija el stock **al número que indiques** (por ejemplo, tras un conteo físico).

1. En **Registrar movimiento**, elige la **variante**.
2. Tipo **Ajuste**.
3. En **cantidad**, escribe el **stock final que debe quedar** (un entero, puede ser 0).
4. Escribe el **motivo** (obligatorio).
5. Pulsa **Registrar**. El sistema calcula solo la diferencia.

---

## 40. Ver el stock y buscar

**Quién puede:** todos los roles.

1. En el menú, entra a **Inventario**.
2. Arriba ves tres cifras: **variantes activas**, **agotadas** y **en stock bajo**.
3. Usa el buscador (nombre o SKU) y los filtros de **categoría**, **solo agotados** y **solo stock bajo**.
4. La columna **Estado** muestra **OK**, **Stock bajo** o **Agotado** para cada variante.

---

## 41. Alertas de stock bajo

Una variante está en **stock bajo** cuando tiene un **stock mínimo mayor que 0** y su stock actual es **igual o menor** que ese mínimo.

- En el menú, junto a **Inventario**, aparece un **contador** con el número de variantes en stock bajo o agotadas.
- En **Inventario → Stock bajo** tienes la lista completa, ordenada por **déficit** (las más críticas primero), con un enlace directo para **registrar un movimiento** de cada una.

---

## 42. Historial de movimientos de inventario

**Quién puede:** todos los roles.

1. En el menú, entra a **Inventario → Movimientos**.
2. Verás todas las entradas, salidas y ajustes, y también los movimientos automáticos de **venta** y **devolución**.
3. Filtra por **tipo**, **rango de fechas**, **producto** o **usuario**.
4. Pulsa **Exportar CSV** para descargar el resultado.

> Los movimientos **no se editan ni se borran**. Si te equivocaste, corrige registrando **otro** movimiento (normalmente un ajuste).

---

# Bloque 4 — Clientes, reportes y administración

---

## Clientes

> **Ver** la lista de clientes: todos los roles. **Dar de alta**: Administrador, Gerente y Cajero. **Editar, archivar y restaurar**: Administrador y Gerente.

### 43. Ver y buscar clientes

1. En el menú, entra a **Clientes**.
2. Usa el buscador (**nombre, teléfono, correo o RFC**) y los filtros de **estado** (activos / archivados / todos) y **solo facturables**.
3. La columna **Facturable** indica si el cliente tiene sus datos de facturación completos.
4. Pulsa una fila para abrir la **ficha** del cliente.

### 44. Dar de alta un cliente

**Quién puede:** Administrador, Gerente, Cajero.

1. En **Clientes**, pulsa **Nuevo cliente** (o usa la alta rápida desde el punto de venta, paso 12).
2. Rellena el **nombre** (obligatorio, mínimo 2 caracteres).
3. Opcionalmente: teléfono (máximo 30), correo, dirección y notas (máximo 500).
   - El teléfono, el correo y el RFC **no se pueden repetir** en otro cliente.
4. Los **datos de facturación** son opcionales (ver el paso 45).
5. Pulsa **Guardar**.

### 45. Añadir o cambiar los datos de facturación de un cliente

**Quién puede:** Administrador, Gerente.

Los datos de facturación funcionan **“todo o nada”**: o los dejas **todos vacíos**, o rellenas **todos** los obligatorios.

1. En la ficha del cliente, completa: **RFC**, **razón social**, **régimen fiscal**, **uso de CFDI** y **código postal fiscal**. El **correo de facturación** es opcional.
2. Reglas que valida el sistema:
   - El **RFC** debe tener el formato correcto (12 caracteres para empresa, 13 para persona física).
   - No se admite el **RFC genérico** (`XAXX010101000` / `XEXX010101000`): para ventas sin datos usa el cliente “Público en General”.
   - El **régimen fiscal** debe existir en el catálogo y corresponder al tipo de RFC (persona física o empresa).
   - El **uso de CFDI** debe existir en el catálogo.
   - El **código postal** debe tener 5 dígitos.
3. Pulsa **Guardar**. A partir de ahí el cliente aparece como **Facturable** y se le pueden hacer ventas “con factura”.

> El sistema guarda y valida estos datos, pero **no emite ni timbra la factura**.

### 46. Editar un cliente

**Quién puede:** Administrador, Gerente.

1. En la ficha del cliente, cambia los datos de contacto o de facturación.
2. Pulsa **Guardar**.

**El cliente “Público en General”** es especial: solo se le pueden cambiar los **datos de contacto y las notas**. No se le puede cambiar el nombre, ni darle datos de facturación, ni archivarlo.

### 47. Archivar y restaurar clientes

**Quién puede:** Administrador, Gerente.

1. En la ficha del cliente, sección **Archivar cliente**, pulsa **Archivar** y confirma.
2. Para restaurarlo: en **Clientes**, filtra por estado **Archivados**, abre el cliente y pulsa **Restaurar**.

> No existe “eliminar” clientes: solo archivar y restaurar. El cliente “Público en General” no se puede archivar.

### 48. Exportar la lista de clientes

**Quién puede:** cualquiera que pueda ver clientes.

1. En **Clientes**, ajusta los filtros que quieras aplicar.
2. Pulsa **Exportar CSV**.
3. Se descarga un archivo con nombre, teléfono, correo, RFC, razón social, régimen, uso de CFDI, código postal, si es facturable y su estado.

> En este archivo el **RFC aparece completo**. Trátalo como información sensible.

---

## Reportes

> **Ventas, Inventario y Clientes:** Administrador, Gerente y Cajero. **Utilidad / Margen:** solo Administrador y Gerente (muestra costos).

### 49. Elegir el período de un reporte

Todos los reportes usan un selector de **período**, con la fecha en **horario de Ciudad de México**.

1. Elige un **atajo**: **Hoy**, **Esta semana** (desde el lunes), **Este mes** (desde el día 1) o **Últimos 30 días**.
2. O define un **rango personalizado** con **Desde** y **Hasta** (ambos incluidos).
3. Si no eliges nada, el reporte muestra **este mes**.

### 50. Reporte de Ventas

**Menú:** Reportes → Ventas.

Muestra:

- **Indicadores:** ventas completadas, ventas canceladas, ingreso neto (ventas menos devoluciones, con IVA), ticket promedio, IVA e importe de descuentos.
- **Gráficas:** tendencia diaria del ingreso neto y cobros por método de pago.
- **Tablas:** top productos, ventas por cajero y desglose por día.

### 51. Reporte de Inventario

**Menú:** Reportes → Inventario.

Muestra:

- **Indicadores:** valor del stock actual a **costo** y a **precio de venta**, número de variantes en stock bajo/agotado y número de movimientos del período.
- **Tablas:** movimientos por tipo, productos con más rotación (más unidades vendidas) y detalle de movimientos del período.

### 52. Reporte de Clientes

**Menú:** Reportes → Clientes.

Muestra:

- **Indicadores:** clientes con compras en el período, clientes nuevos y ticket promedio.
- El cliente **“Público en General”** se resume **aparte**, no entra en los rankings.
- **Tablas:** top compradores y detalle por cliente (número de compras, monto, última compra).

### 53. Reporte de Utilidad / Margen

**Menú:** Reportes → Utilidad / margen. **Solo Administrador y Gerente.**

Muestra la ganancia por producto:

- **Indicadores:** utilidad total, margen promedio y producto más rentable.
- **Tabla:** por producto, unidades, ingreso (sin IVA), costo, utilidad y % de margen.

> Este reporte usa el **costo actual** de cada producto (su precio de compra de hoy). Si el costo cambió después de una venta, el margen histórico es una **aproximación**. El aviso aparece también en la propia pantalla.

### 54. Exportar un reporte

1. En cualquier reporte, ajusta el período.
2. Pulsa **Exportar CSV**. El archivo respeta el período seleccionado.

> Consultar o exportar un reporte **no cambia nada** en el sistema y no queda registrado.

---

## Administración

> Esta sección es sobre todo para **Administradores**. El **Gerente** puede crear y editar usuarios, restablecer contraseñas y consultar la auditoría, pero **no** puede desactivar usuarios, gestionar roles ni cambiar la configuración.

### 55. Crear un usuario

**Quién puede:** Administrador, Gerente.

1. En el menú, entra a **Usuarios** y pulsa **Nuevo usuario**.
2. Escribe el **nombre**, el **correo** (no se puede repetir) y, opcionalmente, el **teléfono**.
3. Elige el **rol**.
4. Pulsa **Guardar**.
5. El sistema genera una **contraseña temporal** y la muestra **una sola vez**. **Cópiala y entrégala** a la persona; con ella iniciará sesión y tendrá que cambiarla la primera vez (paso 3 del manual).

### 56. Editar un usuario o cambiar su rol

**Quién puede:** Administrador, Gerente.

1. En **Usuarios**, abre la ficha de la persona.
2. Pulsa **Editar** y cambia el nombre, el correo, el teléfono o el **rol**.
3. Pulsa **Guardar**.

> El sistema no permite un cambio que dejaría al sistema **sin ningún administrador** con permisos para gestionar usuarios y roles.

### 57. Restablecer la contraseña de un usuario

**Quién puede:** Administrador, Gerente.

1. En la ficha del usuario, sección **Restablecer contraseña**.
2. Escribe el **motivo** (obligatorio; queda registrado).
3. Pulsa **Restablecer contraseña**.
4. El sistema genera una **nueva contraseña temporal** (se muestra una vez) y **cierra todas las sesiones** de esa persona. Entrégale la nueva contraseña.

### 58. Desactivar y reactivar un usuario

**Quién puede:** solo **Administrador**.

**Desactivar** (la persona ya no podrá iniciar sesión):

1. En la ficha del usuario, sección **Estado de la cuenta**, pulsa **Desactivar usuario** y confirma.
2. Se cierran de inmediato **todas sus sesiones**.

Límites:

- No puedes **desactivarte a ti mismo**.
- No se puede desactivar al **último administrador** con permisos de gestión.

**Reactivar:** en la misma sección, pulsa **Reactivar usuario**. La persona deberá volver a iniciar sesión.

> No existe “eliminar” usuarios: se desactivan, para conservar el historial de sus operaciones.

### 59. Cerrar todas las sesiones de un usuario

**Quién puede:** Administrador, Gerente.

1. En la ficha del usuario, sección **Sesiones**, pulsa **Cerrar todas las sesiones**.
2. Se cierran todas sus sesiones activas, **sin** cambiar su contraseña ni su estado. Útil si sospechas que dejó la sesión abierta en algún sitio.

### 60. Ver y filtrar los usuarios

En **Usuarios** puedes buscar por **nombre o correo** y filtrar por **rol** y por **estado** (activos / inactivos / todos).

### 61. Ver los roles

**Quién puede:** Administrador, Gerente.

En el menú, **Roles** muestra la lista de roles, su descripción, cuántos usuarios tiene cada uno y si es un **rol de sistema**. Pulsa un rol para ver sus permisos.

### 62. Crear un rol a medida

**Quién puede:** solo **Administrador**.

1. En **Roles**, pulsa **Nuevo rol**.
2. Escribe el **nombre** (mínimo 2 caracteres, no repetido) y una **descripción** opcional (máximo 200 caracteres).
3. Marca los **permisos** que tendrá el rol, de la lista por módulos (usuarios, productos, inventario, ventas, caja, reportes…).
4. Pulsa **Guardar**.

### 63. Editar un rol

**Quién puede:** solo **Administrador**.

1. En **Roles**, abre el rol y cambia su descripción o sus permisos.
2. Pulsa **Guardar**.

Límites:

- Los **roles de sistema** (Administrador, Gerente, Cajero, Empleado) **no se pueden renombrar**, pero sí se les pueden ajustar los permisos y la descripción.
- El rol **Administrador** siempre conserva los permisos clave de gestión de usuarios y roles, aunque los desmarques.
- No se puede guardar un cambio que deje al sistema sin ningún administrador con permisos de gestión.

### 64. Borrar un rol

**Quién puede:** solo **Administrador**.

1. En **Roles**, abre el rol y pulsa **Eliminar rol**; confirma.
2. Solo se puede borrar si **no es un rol de sistema** y **no tiene ningún usuario asignado**. Si tiene usuarios, muévelos antes a otro rol (paso 56).

### 65. Consultar la auditoría

**Quién puede:** Administrador, Gerente.

1. En el menú, entra a **Auditoría**.
2. Verás el registro de actividad del sistema: **quién** hizo **qué**, sobre **qué elemento**, **cuándo** y desde **qué dirección de red**.
3. Filtra por **usuario**, **tipo de acción** y **rango de fechas**.

> El registro de auditoría **no se puede modificar ni borrar**. Es un histórico permanente.

### 66. Exportar la auditoría

1. En **Auditoría**, aplica los filtros que quieras.
2. Pulsa **Exportar CSV** (descarga hasta 5.000 registros; si necesitas más, acota por fechas).

### 67. Cambiar el tiempo de cierre por inactividad

**Quién puede:** solo **Administrador**.

1. En el menú, entra a **Configuración**.
2. En **Timeout de Inactividad**, escribe los **minutos** que puede pasar un usuario sin actividad antes de que se cierre su sesión (entre **1 y 240**; de fábrica, **15**).
3. Pulsa **Guardar**. El cambio se aplica a partir de la siguiente acción de cada usuario.

> Es el **único** parámetro configurable desde esta pantalla.

---

# Bloque 5 — Asistencia

Este bloque cubre el registro de entrada y salida de los empleados, y el panel de asistencia que consultan gerentes y administradores.

---

## 68. Registrar tu entrada y salida

**Quién puede:** Administrador, Gerente, Cajero, Empleado (cualquier persona con sesión).

1. En el menú, entra a **Asistencia** y luego a **Registrar** (o ve directamente a `/asistencia/registrar`).
2. Pulsa **Activar cámara** para tomar una foto de comprobante. Si el navegador te pide permiso, acéptalo.
   - Si no tienes cámara disponible, o prefieres no usarla, ignora este paso: el registro se hace igual, sin foto.
3. Con la cámara activa, pulsa **Capturar foto** para tomar la imagen.
4. Pulsa **Marcar entrada**. Verás el mensaje “Entrada registrada.”.
5. Al terminar tu turno, vuelve a la misma pantalla, repite los pasos 2-3 si quieres foto de salida y pulsa **Marcar salida**. Verás “Salida registrada.”.

> Solo puedes tener **una entrada y una salida por día**. Si ya marcaste ambas hoy, la pantalla te lo indica y no vuelve a mostrar el formulario.

---

## 69. Ver el panel de asistencia (Gerentes y Administradores)

**Quién puede:** Administrador, Gerente.

1. En el menú, entra a **Asistencia**.
2. Usa el **selector de período** y, si quieres, los filtros de **empleado** y **rol** para acotar lo que ves.
3. Revisa la información de arriba hacia abajo:
   - **Turnos abiertos en el período**: empleados que marcaron entrada pero todavía no tienen salida registrada.
   - **Llegadas por hora**: gráfica con cuántas entradas hubo en cada hora del día.
   - **Horas trabajadas por empleado**: tabla con el total de horas de cada quien en el período.
   - **Registros de hoy**: galería con las fotos de entrada y salida del día.

---

## 70. Cerrar un turno que alguien olvidó cerrar (solo Administradores)

**Quién puede:** solo **Administrador**.

1. En **Asistencia**, ubica la sección **Turnos abiertos en el período** (aparece si hay algún turno sin salida registrada, sea de hoy o de un día anterior dentro del período que estás viendo).
2. Junto al turno abierto, escribe la **hora de salida** correcta.
3. Pulsa **Cerrar turno**.
4. El turno pasa a cerrado y sus horas trabajadas se calculan con la hora que escribiste.

> La hora de salida debe ser **posterior** a la hora de entrada; si escribes una igual o anterior, el sistema te lo rechaza.

---

## Resumen rápido: quién hace qué

| Tarea | Administrador | Gerente | Cajero | Empleado |
|---|:---:|:---:|:---:|:---:|
| Vender y cobrar | ✅ | ✅ | ✅ | — |
| Aplicar descuentos | ✅ | ✅ | — | — |
| Cancelar ventas | ✅ | ✅ | — | — |
| Devoluciones | ✅ | ✅ | ✅ | — |
| Abrir / cerrar caja, retiros e ingresos | ✅ | ✅ | ✅ | — |
| Crear / editar productos, precios, inventario | ✅ | ✅ | — | — |
| Consultar productos e inventario | ✅ | ✅ | ✅ | ✅ |
| Crear clientes | ✅ | ✅ | ✅ | — |
| Editar / archivar clientes | ✅ | ✅ | — | — |
| Reportes de ventas / inventario / clientes | ✅ | ✅ | ✅ | — |
| Reporte de utilidad / margen | ✅ | ✅ | — | — |
| Crear / editar usuarios, restablecer contraseñas | ✅ | ✅ | — | — |
| Activar / desactivar usuarios | ✅ | — | — | — |
| Crear / editar / borrar roles | ✅ | — | — | — |
| Consultar la auditoría | ✅ | ✅ | — | — |
| Cambiar la configuración | ✅ | — | — | — |
| Registrar tu propia entrada/salida | ✅ | ✅ | ✅ | ✅ |
| Ver el panel de asistencia | ✅ | ✅ | — | — |
| Cerrar un turno de asistencia abandonado | ✅ | — | — | — |

## Qué NO hace el sistema (para tenerlo claro)

- **No emite ni timbra facturas (CFDI).** Solo guarda y valida los datos de facturación y marca la venta como “requiere factura”.
- **No sube imágenes de producto.**
- **No recupera contraseñas por correo.** Un administrador o gerente hace un restablecimiento.
- **No borra** usuarios, roles con uso, categorías, productos, variantes ni clientes: se **archivan** o **desactivan**.
- **No permite deshacer** un cierre de caja, una cancelación de venta ni una devolución.
- La pantalla de **Configuración** solo tiene un ajuste (el tiempo de inactividad).
- **No cierra solo un turno de asistencia que cruza la medianoche**: un empleado que entró antes de las 00:00 y sale después no puede marcar su propia salida al día siguiente; un Administrador debe cerrarlo a mano.

---

*Fin del Manual de Usuario.*

