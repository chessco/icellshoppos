# Plan de Implementación: Auditoría y Evolución iReader Multiplatform Architecture v2.0

Auditoría técnica exhaustiva del repositorio actual (`desktop/`) contra la especificación **iReader Multiplatform Architecture v2.0 UPDATED** y hoja de ruta de implementación.

---

## 1. Resumen Ejecutivo de la Auditoría

La aplicación de escritorio (**iReader by Pro Buyer**) fue concebida inicialmente en Fase 1 como un scaffold de Electron para la lectura de dispositivos Apple mediante USB y puente hacia la API de iCellShop POS / Pro Buyer. Actualmente cuenta con:
- Stack moderno: **Electron 31 + Vite 5 + React 19 + TypeScript**.
- Detección USB híbrida en Windows ([AppleUsbAdapter.ts](file:///c:/PitayaCode/icellshoppos/desktop/src/main/usb/AppleUsbAdapter.ts)) con 3 capas: `libimobiledevice`, `pymobiledevice3` (Python) y fallback WMI/Lockdown de iTunes.
- Módulos de POS incrustados (Inventory, Checkout, Sales History, Credit Ledger, Label Designer, Data Admin, Public Inventory).

Sin embargo, frente a los estándares de **iReader Multiplatform Architecture v2.0 UPDATED (Enterprise Native Grade)**, se identifican brechas críticas de arquitectura, seguridad y rendimiento que deben corregirse:

| Dimensión | Estado Actual | Requerimiento v2.0 | Brecha / Diagnóstico |
| :--- | :--- | :--- | :--- |
| **Seguridad de Sesión** | `session.txt` en texto plano en `app.getPath("userData")` | Cifrado OS seguro (DPAPI en Windows / Keychain en macOS) | 🔴 **Crítico**: Exposición de credenciales/cookies de sesión en disco sin cifrar. |
| **Arquitectura de Código UI** | `App.tsx` monolítico (>1,630 líneas) | Arquitectura modular con Custom Hooks, Contextos y Vistas desacopladas | 🟡 **Alto**: Acoplamiento excesivo, renderizados innecesarios y dificultad de testeo. |
| **Detección USB** | Polling activo cada 3.5 segundos (`setInterval`) | Eventos reactivos USB por hardware (`node-usb` / WMI DeviceChange) | 🟡 **Alto**: Consumo innecesario de CPU y llamadas repetitivas a PowerShell/reg. |
| **Manejo 2FA en Desktop** | Login básico usuario/contraseña | Soporte de Superadmin 2FA (código de 6 dígitos) | 🔴 **Crítico**: Los superadmins quedan bloqueados en el login de Desktop si el backend exige 2FA. |
| **Multiplataforma Mac/Win** | Soporte parcial en Mac (sin stack nativo completo) | Pipeline unificado Mac (`usbmuxd` nativo) + Win (AMDS + libimobiledevice) | 🟢 **Medio**: Bien estructurado pero requiere paridad y validación en macOS. |
| **Actualizaciones Automáticas** | Script manual hacia S3 (`publish-s3.mjs`) | `electron-updater` con canal de distribución continuo y fallback | 🟢 **Medio**: Falta integración del cliente con auto-descarga e instalación. |

---

## 2. User Review Required

> [!IMPORTANT]
> **Migración de Sesiones Existentes a DPAPI / SafeStorage:**
> Al cambiar el almacenamiento de `userData/session.txt` a `electron.safeStorage`, los usuarios locales que ya tenían la sesión recordada deberán iniciar sesión una vez más para cifrar su token de sesión.

> [!WARNING]
> **Flujo 2FA en Desktop:**
> Actualmente el backend de iCellShop exige un código de 6 dígitos para superadmins. El formulario de login en [App.tsx](file:///c:/PitayaCode/icellshoppos/desktop/src/renderer/src/App.tsx) no solicita el código 2FA si `requiresVerification: true`. Es imperativo sincronizar el flujo de login del escritorio con el de la web.

---

## 3. Arquitectura Propuesta v2.0 (Target Architecture)

```
icellshoppos/desktop/
├── src/
│   ├── main/
│   │   ├── auth/
│   │   │   ├── SessionManager.ts       <-- safeStorage / DPAPI nativo
│   │   │   └── ApiClient.ts            <-- Fetch tipado, TLS retry y auto-cookie
│   │   ├── usb/
│   │   │   ├── AppleUsbAdapter.ts      <-- Orquestador v2.0
│   │   │   ├── providers/
│   │   │   │   ├── ToolchainProvider.ts    (libimobiledevice C binaries)
│   │   │   │   ├── PythonProvider.ts       (pymobiledevice3 fallback)
│   │   │   │   └── WindowsPnpProvider.ts   (AMDS + Lockdown mtime + WMI)
│   │   │   └── UsbWatcher.ts           <-- Watcher basado en eventos (sin polling ciego)
│   │   ├── updater/
│   │   │   └── AutoUpdateManager.ts    <-- electron-updater integrado
│   │   └── index.ts                    <-- Main process modular y limpio
│   │
│   ├── preload/
│   │   └── index.ts                    <-- Tipos e interfaces enriquecidas (2FA, USB status)
│   │
│   └── renderer/
│       ├── contexts/
│       │   ├── AuthContext.tsx         <-- Estado de sesión y soporte 2FA
│       │   └── UsbContext.tsx          <-- Estado reactivo de dispositivos conectados
│       ├── hooks/
│       │   └── useDeviceIntake.ts      <-- Lógica desacoplada del formulario Add Device
│       ├── components/                 <-- Vistas aisladas y reutilizables
│       └── App.tsx                     <-- Layout principal simplificado (<250 líneas)
```

---

## 4. Fases de Implementación

### Fase 1: Seguridad & Autenticación 2FA (P0 - Inmediato)
1. **Sustituir `session.txt` por `electron.safeStorage`:**
   - Encriptar el token de sesión usando las credenciales del sistema operativo antes de escribirlo en disco.
2. **Implementar soporte de 2FA en Desktop:**
   - Detectar respuesta `{ requiresVerification: true }` de `/api/auth/login`.
   - Mostrar pantalla/input de verificación de 6 dígitos en el diálogo de login de escritorio.

### Fase 2: Refactorización y Desacoplamiento de la UI (P1)
1. Extraer el formulario de admisión (`IntakeForm`) de `App.tsx` hacia un hook dedicado: `useDeviceIntake.ts`.
2. Crear `AuthContext` y `UsbContext` para evitar pasar props masivos y referencias mutables.
3. Rediseñar el componente `IntakeView` con mejor UX para la indicación visual de campos leídos por USB vs. calculados.

### Fase 3: Optimización del Subsistema USB (P1)
1. Refactorizar [AppleUsbAdapter.ts](file:///c:/PitayaCode/icellshoppos/desktop/src/main/usb/AppleUsbAdapter.ts) dividiendo la lógica en proveedores independientes (`ToolchainProvider`, `PythonProvider`, `LockdownProvider`).
2. Implementar detección reactiva: reducir la frecuencia de polling cuando no hay cambios de hardware detectados en el árbol PnP de Windows.

### Fase 4: Auto-Update y Empaquetado Robusto (P2)
1. Integrar `electron-updater` en el Main process para consultar releases en el bucket S3 o GitHub Releases.
2. Comprobar la presencia de drivers oficiales de Apple (`Apple Mobile Device Service`) en el instalador de NSIS (`installer.nsh`).

---

## 5. Plan de Verificación

### Pruebas Automatizadas y de Compilación
* Compilación completa de Electron con TypeScript:
  ```powershell
  cd desktop ; npm run build
  ```
* Prueba de empaquetado unpacked en Windows:
  ```powershell
  cd desktop ; npx electron-builder --win dir --publish never
  ```

### Pruebas Manuales
1. **Login & 2FA:** Probar inicio de sesión con el superadmin `chesssco@gmail.com` comprobando que solicita el código 2FA e ingresa satisfactoriamente.
2. **Seguridad:** Verificar que en `AppData/Roaming/icellshoppos-desktop/` no exista `session.txt` en texto plano y que se use almacenamiento protegido.
3. **Lectura USB:** Conectar un iPhone con cable USB en Windows y verificar la extracción de IMEI, Batería, Ciclos y Modelo en el formulario "Add Device".
