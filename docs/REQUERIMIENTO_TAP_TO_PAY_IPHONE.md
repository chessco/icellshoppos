# Requerimiento: Pagos Stripe en POS y Tap to Pay en iPhone

**Producto:** iReader POS / Pro Buyer  
**Plataforma:** Expo React Native, iOS  
**Prioridad:** Alta  
**Estado:** Requerimiento listo para iniciar implementación  
**Referencia técnica actual:** `apps/mobile/src/services/TapToPayIPhoneAdapter.ts`

## 1. Objetivo

La prioridad inmediata es habilitar dos modalidades de cobro con Stripe desde el POS:

1. Tarjeta presencial mediante un lector físico Stripe.
2. Tarjeta capturada directamente en el POS, sin lector físico, mediante Stripe PaymentSheet.

Tap to Pay on iPhone queda como una tercera modalidad posterior, para implementarse y probarse desde Mac.

Permitir que un iPhone compatible funcione como terminal de cobro sin contacto usando Stripe Terminal Tap to Pay on iPhone, sin lector físico adicional.

El cliente deberá poder acercar una tarjeta contactless o una cartera digital al iPhone. La venta solo se marcará como pagada después de que Stripe y el backend confirmen el resultado.

## 2. Alcance

Incluye:

- Elegibilidad del dispositivo iPhone y versión de iOS.
- Inicialización real de Stripe Terminal Tap to Pay.
- Solicitud segura de Connection Tokens desde el backend.
- Creación y confirmación de PaymentIntent.
- Lectura contactless mediante el SDK nativo.
- Estados visibles de preparación, espera, procesamiento, éxito, rechazo y estado ambiguo.
- Verificación server-side antes de finalizar la venta.
- Cancelación segura y prevención de doble cobro.
- Registro del iPhone como dispositivo POS.
- Pruebas unitarias, integración, sandbox y prueba física con tarjeta.

No incluye en esta fase:

- Pagos con tarjeta insertada o banda magnética.
- Split payments.
- Reembolsos desde el flujo móvil.
- Soporte de Tap to Pay en iPad o Android.

## 3. Situación actual

La aplicación ya contiene:

- `TerminalContext` para exponer capacidades y estados.
- `TapToPayIPhoneAdapter` con el contrato de estados esperado.
- Endpoint cliente para solicitar Connection Tokens.
- Creación de PaymentIntent y registro `PosPayment`.
- Verificación server-side del estado de Stripe.
- Manejo de estado `UNKNOWN` para evitar reintentos peligrosos.
- Finalización de la venta después del pago.
- Configuración inicial de Proximity Reader en `apps/mobile/app.json`.

Pendientes críticos:

- Sustituir las esperas simuladas del adaptador por el SDK real de Stripe Terminal.
- Crear o integrar un módulo nativo compatible con Expo Development Build.
- Inicializar Tap to Pay antes del checkout.
- Conectar el callback real de lectura y procesamiento al PaymentIntent.
- Validar permisos, entitlement, cuenta Stripe y ubicación.
- Probar en dispositivo físico; Expo Go no es suficiente para validar esta función nativa.

## 4. Requisitos funcionales

### RF-01. Validación del dispositivo

El sistema debe permitir Tap to Pay únicamente cuando:

- El sistema sea iOS.
- El dispositivo sea iPhone, no iPad.
- El iPhone sea compatible con Tap to Pay.
- La versión de iOS cumpla el mínimo requerido por la versión aprobada del SDK.
- La capacidad `stripeTapToPayEnabled` esté habilitada para la organización.

Si no cumple, el checkout debe ocultar o deshabilitar Tap to Pay y mostrar una explicación accionable.

### RF-02. Inicialización

Al iniciar sesión o al entrar al checkout, la aplicación debe:

1. Solicitar un Connection Token temporal al backend.
2. Inicializar Stripe Terminal con un proveedor de tokens.
3. Inicializar el lector local de Tap to Pay.
4. Registrar el dispositivo POS con tipo `IPHONE_TAP_TO_PAY`.
5. Mostrar estado `READY` solo cuando el SDK confirme que está listo.

Nunca se debe guardar una clave secreta de Stripe en el iPhone.

### RF-03. Cobro

Al confirmar una venta con tarjeta en iPhone:

1. Validar cliente, monto, moneda y contenido de la venta.
2. Crear PaymentIntent en backend con canal Tap to Pay.
3. Iniciar `collectPaymentMethod` del SDK.
4. Mostrar instrucciones para acercar tarjeta o cartera digital a la parte superior del iPhone.
5. Ejecutar `processPayment`.
6. Verificar el PaymentIntent y `PosPayment` en el backend.
7. Finalizar la venta únicamente si el resultado es confirmado como pagado.

### RF-04. Estados ambiguos

Si se pierde red, se cierra la app o el SDK no confirma el resultado:

- El pago debe pasar a `PAYMENT_UNKNOWN`.
- La venta no debe finalizarse automáticamente.
- La interfaz debe indicar que no se debe volver a cobrar.
- Debe existir una acción de re-verificación por `paymentIntentId` y `paymentAttemptId`.
- El sistema debe impedir un segundo intento mientras el primer intento siga ambiguo.

### RF-05. Cancelación

El usuario podrá cancelar antes de que el pago sea confirmado. La cancelación deberá invocar el SDK y posteriormente el backend, dejando el intento en un estado consistente.

## 5. Requisitos no funcionales

- No exponer claves secretas ni datos completos de tarjeta en la aplicación.
- Usar idempotencia para creación y finalización de pagos.
- No registrar PAN, CVC, track data ni datos sensibles en logs.
- Mostrar importes en MXN con el mismo monto enviado al backend.
- Deshabilitar el botón de cobro mientras exista una operación activa.
- Responder correctamente a background/foreground y pérdida de conectividad.
- Mantener el flujo de lector físico para iPad sin regresiones.
- La compilación de producción debe utilizar un Development Build/EAS Build con el módulo nativo incluido.

## 6. Diseño técnico propuesto

### Aplicación móvil

Modificar:

- `apps/mobile/src/services/TapToPayIPhoneAdapter.ts`
- `apps/mobile/src/contexts/TerminalContext.tsx`
- `apps/mobile/src/components/checkout/CheckoutSheet.tsx`
- `apps/mobile/app.json` y configuración EAS

Agregar una capa nativa o dependencia oficial de Stripe Terminal compatible con React Native/Expo. El adaptador actual debe conservar la interfaz pública y cambiar únicamente la implementación simulada por llamadas reales al SDK.

### Backend

Revisar y validar:

- Endpoint de Connection Token.
- Creación de PaymentIntent.
- Creación de `PosPayment` con canal Tap to Pay.
- Verificación de estado.
- Webhooks de Stripe.
- Idempotency keys.
- Autorización por organización, sitio y dispositivo POS.

El backend será la autoridad final del estado del pago y de la finalización de la venta.

## 7. Configuración externa necesaria

Antes de la prueba real se requiere:

- Cuenta Stripe activa y habilitada para Terminal/Tap to Pay on iPhone.
- Cuenta Apple Developer del equipo propietario de la aplicación.
- Bundle identifier correcto: `com.icellshop.ireaderpos`.
- Entitlement de Proximity Reader aprobado y firmado.
- Merchant/location configurado en Stripe.
- Connection Token endpoint funcionando en el ambiente de pruebas.
- iPhone físico compatible.
- Tarjeta de prueba contactless y posteriormente tarjeta real de bajo monto.
- Development Build o distribución TestFlight; Expo Go no debe usarse para la validación final.

## 8. Plan de implementación

### Fase 1: contrato y configuración

- Confirmar versión de Expo, React Native y SDK Stripe compatible.
- Confirmar disponibilidad de Tap to Pay en la cuenta Stripe y país de operación.
- Validar entitlement y configuración EAS.
- Revisar contratos de PaymentIntent, `PosPayment` y verificación.

### Fase 2: integración nativa

- Instalar/configurar SDK Stripe Terminal.
- Implementar proveedor de Connection Tokens.
- Inicializar lector local.
- Mapear eventos nativos a `TapToPayOperationalState`.
- Implementar cancelación y limpieza del lector.

### Fase 3: checkout

- Inicializar Tap to Pay al entrar al checkout o antes del primer cobro.
- Reemplazar simulación por `collectPaymentMethod` y `processPayment`.
- Mantener verificación server-side e idempotencia.
- Agregar re-verificación para estados ambiguos.

### Fase 4: pruebas y liberación

- Ejecutar typecheck y pruebas unitarias.
- Probar Development Build en iPhone físico.
- Probar éxito, rechazo, cancelación, timeout y pérdida de red.
- Probar que el iPad continúe usando lector físico.
- Ejecutar cobro real controlado de bajo monto.
- Liberar mediante TestFlight antes de producción.

## 9. Criterios de aceptación

- Un iPhone elegible muestra Tap to Pay como método disponible.
- Un iPhone no elegible no puede iniciar el cobro.
- Al tocar “Cobrar”, aparece el flujo nativo real de Stripe.
- Una tarjeta contactless aprobada finaliza la venta una sola vez.
- Un pago rechazado no descuenta inventario ni finaliza la venta.
- Una cancelación devuelve el checkout a un estado seguro.
- Una interrupción de red marca el intento como ambiguo y permite re-verificar.
- No existen claves secretas ni datos de tarjeta en logs o almacenamiento móvil.
- El monto del PaymentIntent coincide con el total de la venta.
- El webhook/backend puede confirmar el resultado aunque la app se cierre.
- El lector físico de iPad sigue funcionando.
- Las pruebas pasan en CI y la validación física se documenta con evidencia.

## 10. Bloqueadores para iniciar cobros reales

El desarrollo puede comenzar con el código actual, pero no se debe anunciar Tap to Pay como funcionalidad productiva hasta confirmar:

1. SDK nativo real integrado.
2. Entitlement Apple aprobado.
3. Cuenta Stripe habilitada.
4. Backend con tokens, idempotencia y webhooks verificados.
5. Prueba física exitosa en un iPhone compatible.
