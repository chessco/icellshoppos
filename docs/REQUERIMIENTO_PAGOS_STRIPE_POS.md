# Requerimiento: pagos Stripe en el POS

## Objetivo

El POS debe permitir cobrar con Stripe en dos modalidades:

1. Tarjeta presencial mediante un lector físico Stripe.
2. Tarjeta capturada directamente en el POS, sin lector físico, mediante PaymentSheet.

Tap to Pay en iPhone queda diferido para una fase posterior en Mac.

## Modalidad A: lector físico Stripe

- Detectar lectores por Bluetooth o red local.
- Conectar y desconectar el lector.
- Crear PaymentIntent con `payment_method_types: ["card_present"]`.
- Ejecutar `collectPaymentMethod` y `processPaymentIntent` mediante Stripe Terminal.
- Confirmar el pago en el backend antes de finalizar la venta.
- Registrar el canal como `STRIPE_READER`.

## Modalidad B: tarjeta sin lector

- Usar `@stripe/stripe-react-native` con `PaymentSheet`.
- Crear PaymentIntent con `payment_method_types: ["card"]`.
- Entregar al móvil únicamente el `clientSecret`.
- Mostrar formulario seguro de Stripe dentro del POS.
- Soportar autenticación 3DS cuando Stripe la solicite.
- Confirmar el resultado mediante Stripe y el backend.
- Registrar un canal separado: `STRIPE_CARD_ONLINE`.

## Selección del método

- Con lector físico conectado: mostrar cobro presencial.
- Sin lector conectado: permitir tarjeta online.
- Con ambos disponibles: permitir seleccionar explícitamente una modalidad.
- Si una operación queda ambigua, bloquear nuevos cobros hasta re-verificarla.

## Backend requerido

- Agregar `STRIPE_CARD_ONLINE` al enum de canales de pago.
- Mantener `STRIPE_READER` para pagos `card_present`.
- Crear endpoints separados o un parámetro de canal validado para ambos tipos de PaymentIntent.
- Usar idempotency keys independientes por intento.
- Validar monto, moneda, organización, dispositivo y venta.
- Procesar webhooks de éxito, rechazo y cancelación.
- No guardar ni registrar PAN, CVC ni datos completos de tarjeta.

## Aplicación Expo

- Agregar `@stripe/stripe-react-native` para PaymentSheet.
- Mantener `@stripe/stripe-terminal-react-native` para lectores físicos.
- Usar Development Build; Expo Go no incluye estos módulos nativos.
- El desarrollo puede continuar desde Windows y probarse primero en Android.
- La compilación y validación iOS se realizará posteriormente con Mac o EAS.

## Criterios de aceptación

- Se puede cobrar con lector Stripe y la venta se finaliza una sola vez.
- Se puede cobrar con tarjeta sin lector y la venta se finaliza una sola vez.
- Los dos tipos de pago aparecen con estados y errores claros.
- Un rechazo no descuenta inventario ni crea una venta pagada.
- Una interrupción de red no permite duplicar el cargo.
- El backend puede re-verificar cualquier intento ambiguo.
- La clave secreta de Stripe nunca llega al dispositivo.
