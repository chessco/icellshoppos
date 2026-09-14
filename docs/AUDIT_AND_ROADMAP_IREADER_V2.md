# AUDITORÍA OFICIAL Y PLAN DE IMPLEMENTACIÓN
## iReader Multiplatform Architecture v2.0 (UPDATED Baseline)
**Producto:** iReader by Pro Buyer  
**Ecosistema:** iCellShop POS / Pro Buyer Platform  
**Documento Fuente:** `C:\PitayaCode\icellshoppos\docs\iReader_Multiplatform_Architecture_v2.0.DOCX`  
**Fecha:** Septiembre 2026  
**Auditor:** PitayaCode Architecture & Engineering Core  

---

## 1. Executive Summary & Alineación Estratégica

El documento maestro `iReader_Multiplatform_Architecture_v2.0.DOCX` define formalmente el mandato de ingeniería:

> **"iReader se desarrollará como una única arquitectura de producto con múltiples entornos de ejecución (runtimes). La aplicación Windows Electron existente NO se reemplaza: se preserva como la primera implementación en producción y se refactoriza de manera incremental. La API de Pro Buyer es el backend central y sistema de registro compartido. La prioridad estratégica es: iPad POS primero (React Native + Expo), mientras Windows permanece como la línea base operativa y de hardware."**

### Principio Rector
* **Dirección de Dependencias Obligatoria:**  
  `Presentation` → `Application` → `Domain` → `Ports` → `Infrastructure / Platform`
* **Regla Inviolable:** La lógica de dominio y aplicación compartida no debe depender de Electron, React ni React Native. Las plataformas acceden al hardware mediante **Ports y Adapters**.

---

## 2. Matriz de Auditoría: Repositorio Actual vs. Arquitectura v2.0

Auditando el código real en `desktop/` y `src/` frente a las 34 secciones del documento rector:

| Componente / Sección | Estado en el Repositorio Actual | Requerimiento Arquitectura v2.0 DOCX | Brecha Técnica & Diagnóstico |
| :--- | :--- | :--- | :--- |
| **Backend Boundary (Sección J)** | Los endpoints en `src/app/api` sirven tanto a web como a desktop mediante Route Handlers. | La API de Pro Buyer es la plataforma central compartida (System of Record) con contratos tipados explícitos. | 🟢 **Alineado en concepto, falta formalizar**: Los contratos no están empaquetados en un cliente compartido (`@ireader/api-client`), sino llamadas `fetch` ad-hoc en `desktop/src/main/index.ts`. |
| **Windows Desktop Shell (Sección D, E, Q)** | Electron 31.7.7, Electron-Vite 2.3.0, React 19.2.3, TypeScript, electron-builder (NSIS/ZIP). | Conservar Electron en Windows como baseline de hardware; refactorizar incrementalmente sin reescribir. | 🟢 **Aprobado**: La base tecnológica coincide exactamente con la recomendación oficial. |
| **Seguridad de Almacenamiento (Sección R, ADR-009)** | Sesión guardada en texto plano en `app.getPath("userData")/session.txt`. | **SecureStorage Port**: Uso de DPAPI / Windows Credential Manager en Windows y Keychain en Apple. | 🔴 **Brecha Crítica (P0)**: Exposición de cookie `icellshop_session` en disco sin cifrar. Debe migrarse a `safeStorage`. |
| **Autenticación 2FA (Sección R)** | Formulario desktop solo envía email + password. Si el backend responde 2FA, falla con 401. | Autenticación centralizada Pro Buyer con soporte estricto de códigos temporales de seguridad. | 🔴 **Brecha Crítica (P0)**: Los superadmins quedan bloqueados en Desktop. Debe agregarse el paso de verificación de 6 dígitos. |
| **Arquitectura de Dominio (Sección H, I, W)** | `App.tsx` monolítico (>1,630 líneas) con llamadas directas a IPC y 25+ campos de estado en UI. | Separación estricta: `Presentation → Application → Domain → Ports → Platform`. UI no contiene lógica de negocio. | 🟡 **Brecha Alta (P1)**: Acoplamiento extremo en `App.tsx`. Requiere extracción a Custom Hooks (`useDeviceIntake`) y Contextos. |
| **Apple USB Adapter (Sección K, L, M, Q)** | `AppleUsbAdapter.ts` monolítico (862 líneas) con sondeo cíclico cada 3.5s (`setInterval`). | Adaptador de hardware basado en capacidades (`DeviceDiscovery`, `DeviceIdentity`, `DeviceDiagnostics`). | 🟡 **Brecha Alta (P1)**: El adapter es un activo IP valioso pero debe envolverse detrás de una interfaz `DevicePort` y optimizar el sondeo. |
| **Impresión Térmica (Sección T, ADR-010)** | [LabelEditor.tsx](file:///c:/PitayaCode/icellshoppos/desktop/src/renderer/src/components/LabelEditor.tsx) maneja diseño y renderizado acoplado al canvas web. | Abstracción `PrinterService`: `LabelDocument → LabelJob → PrinterService → Platform Printer Adapter`. | 🟢 **Fase 2**: Funciona actualmente para thermal preview/canvas; requiere formalizar la abstracción de jobs. |
| **Estrategia iPad POS (Sección P, ADR-002, ADR-019)** | No existe en el repositorio (`desktop/` solo tiene Electron para Windows/Mac). | **Prioridad Estratégica #1**: App iPad POS en React Native + Expo Development Builds consumiendo la misma API. | 🔵 **Nueva Fase (Fase 3)**: Crear el paquete mobile en el monorepo. |
| **Monorepo Structure (Sección I, X, ADR-004)** | Todo el escritorio reside en una subcarpeta `/desktop` sin paquetes compartidos. | Monorepo con `packages/contracts`, `packages/api-client`, `packages/domain` compartidos entre desktop y mobile. | 🟡 **Estructural (Fase 1-2)**: Debe prepararse la estructura de paquetes compartidos. |

---

## 3. Hoja de Ruta de Implementación (Basada en los 10 Pasos Oficiales)

Siguiendo estrictamente los **10 pasos de implementación** estipulados en la **Sección AG** del documento rector:

```
[Paso 1-4] Auditoría API & Contratos Tipados (@ireader/contracts & @ireader/api-client)
     │
[Paso 6-7] Blindaje & Ports en Windows (DPAPI SafeStorage + 2FA + DevicePort Wrapper)
     │
[Paso 8-9] Creación de iPad POS Shell (Expo / React Native consumiendo @ireader/api-client)
     │
[Paso 10]  Refactorización Modular de UI Windows sobre Capas de Dominio
```

---

## 4. Plan de Acción Detallado por Fases

### FASE 1: Seguridad Inmediata, 2FA y Contratos de API (P0 - Inmediato)
* **1.1. Seguridad de Sesión (DPAPI):**
  - Implementar `SessionManager.ts` en `desktop/src/main/auth/` utilizando `electron.safeStorage` para cifrar el token de sesión.
  - Migrar y destruir automáticamente el archivo `session.txt` en texto plano.
* **1.2. Soporte Superadmin 2FA en Desktop:**
  - Actualizar `desktop/src/preload/index.ts` y `desktop/src/main/index.ts` para capturar el payload `{ requiresVerification: true }`.
  - Integrar la vista/modal de código de 6 dígitos en la pantalla de login de Desktop para permitir acceso transparente al superadmin (`chesssco@gmail.com`).
* **1.3. Paquete Compartido de Contratos de API:**
  - Extraer y tipar formalmente los contratos de endpoints (`/api/inventory`, `/api/checkout`, `/api/auth`) en una capa compartida (`@ireader/contracts`), eliminando llamadas de strings mágicos.

### FASE 2: Envoltura de Ports de Hardware & Refactorización de Windows (P1)
* **2.1. Device Adapter Port:**
  - Envolver [AppleUsbAdapter.ts](file:///c:/PitayaCode/icellshoppos/desktop/src/main/usb/AppleUsbAdapter.ts) bajo la interfaz oficial `DevicePort` (DeviceDiscovery, DeviceIdentity, BatteryInformation) sin alterar su valiosa lógica interna probada.
  - Implementar detección adaptativa: si no hay dispositivos PnP Apple conectados, pausar llamadas intensivas a PowerShell/WMI para eliminar el consumo innecesario de CPU.
* **2.2. Desacoplamiento de la UI de Windows:**
  - Descomponer el archivo gigante `App.tsx` (1,630 líneas) en:
    - `useDeviceIntake.ts`: Lógica pura de formulario y enriquecimiento USB.
    - `AuthContext.tsx`: Gestión de sesión, cambio de organización y 2FA.
    - `UsbContext.tsx`: Estado reactivo de dispositivos conectados.
    - Componentes de vista atómicos.

### FASE 3: iPad POS Baseline (Prioridad Estratégica Nueva - P1/P2)
* **3.1. Inicialización de iPad POS:**
  - Inicializar `apps/mobile/` utilizando **React Native + Expo SDK 52+** con configuración de Expo Development Builds para iPad.
* **3.2. Conexión al Backend Central:**
  - Consumir la API de Pro Buyer mediante `@ireader/api-client`.
  - Implementar el flujo de ventas prioritario definido en el documento:
    `Login → Inventory → Search/Scan (Cámara/QR) → Product Detail → Cart → Checkout → Recibo`.

### FASE 4: Impresión & Distribución Automática (P2)
* **4.1. Abstracción PrinterService:**
  - Desacoplar la generación del canvas/PDF térmico del transporte a la impresora física.
* **4.2. Auto-Update:**
  - Integrar `electron-updater` en el escritorio Windows para actualización automática desde los artefactos subidos por `publish-s3.mjs`.

---

## 5. Criterios de Validación (Go / No-Go Gates de la Sección AE)

1. **Gate G1/G2 (API & Contratos):** Los contratos tipados compilan y cubren tanto el inventario como el checkout sin duplicar lógica en el backend.
2. **Gate G3 (Windows Parity):** La app de Windows sigue compilando y empaquetando perfectamente (`npm run build` y `pack:win-unpacked`), manteniendo intacta la detección USB de dispositivos físicos.
3. **Gate G7 (Seguridad):** Cero archivos en texto plano para tokens o contraseñas en `userData`; autenticación 2FA operativa en escritorio.
