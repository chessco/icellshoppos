# Apple / Expo Preflight Report — iReader iPad POS (Phase 3.1)

**Date:** September 2026  
**Document Context:** Execution environment analysis for Phase 3 Mobile Baseline (`apps/mobile`)  
**Target Platform:** iPadOS / iPad (iPad-first architecture, future iPhone compatible)  

---

## 1. Entorno de Ejecución Detectado (Current Host Environment)

| Componente | Versión / Estado Detectado | Notas / Evidencia |
| :--- | :--- | :--- |
| **Operating System** | `Windows 10 / 11 (win32 x64)` | Entorno de desarrollo local actual |
| **Node.js Runtime** | `v24.14.0` | Compatible con Expo CLI y herramientas de empaquetado |
| **npm** | `11.9.0` | Gestor de paquetes nativo |
| **Git** | `2.53.0.windows.1` | Control de versiones operativo |
| **EAS CLI** | `Not installed / Not recognized` | Se usará compilación local / Expo CLI estándar |
| **Expo CLI** | `Available via npx expo` (Latest npm: `57.0.22`) | Expo SDK 52 / 53 compatible |
| **macOS Host** | `NOT AVAILABLE IN CURRENT HOST` | Entorno de compilación cruzada Windows |
| **Xcode / iOS SDK** | `NOT ACCESSIBLE DIRECTLY` | Requiere macOS para compilación nativa directa |
| **CocoaPods** | `N/A on Windows` | No aplica en runtime local Windows |
| **Physical iPad** | `NOT CONNECTED TO HOST` | Validación en hardware requerirá entorno iOS/macOS |

---

## 2. Decisiones de Versiones y Compatibilidad

### A. Versión de Expo & React Native Seleccionada
- **Expo SDK:** `52.x` (React Native `0.76.x` con New Architecture habilitada).
- **TypeScript:** `^5.3.0` (alineado con el monorepo y shared packages).
- **Estrategia de Desarrollo:** **Expo Development Builds (`expo-dev-client`)**
  - **REGLA CUMPLIDA:** Cero dependencia en Expo Go para capacidades nativas futuras.
  - La arquitectura se diseña y estructura lista para `npx expo prebuild` e inyección de CocoaPods en macOS.

### B. Dependencias Nativas Críticas Evaluadas
1. **Almacenamiento Seguro (`ISecureStorage`):**
   - Abstracción de puerto `ISecureStorage` (`getItem`, `setItem`, `removeItem`).
   - Implementación Apple: `expo-secure-store` (respaldado por **Apple Keychain** con `WHEN_UNLOCKED_THIS_DEVICE_ONLY`).
   - Implementación Windows: `WindowsSafeStorageAdapter` (respaldado por **DPAPI**).
   - Implementación Mock/Memory: Para pruebas unitarias y entornos sin hardware.
2. **Cámara / Scanner:**
   - Abstracción `IScannerService` (`BarcodeScannerService`).
   - Compatible con `expo-camera` o capacidades de escaneo estándar sin APIs privadas.
3. **Impresión:**
   - Abstracción `IPrinterService`.
   - Soporte futuro de AirPrint sin librerías invasivas.

---

## 3. Matriz de Validación: Verified vs Requires Mac/Xcode

| Aspecto Arquitectónico | Estado de Verificación | Método de Validación en Entorno Actual |
| :--- | :--- | :--- |
| **Contratos Compartidos (`@ireader/contracts`)** | **VERIFIED ON CURRENT ENVIRONMENT** | Typecheck estricto TypeScript en Windows & CI |
| **Cliente API (`@ireader/api-client`)** | **VERIFIED ON CURRENT ENVIRONMENT** | Pruebas unitarias HTTP/Mock y consumo real |
| **Application Services (`@ireader/application`)** | **VERIFIED ON CURRENT ENVIRONMENT** | Pruebas unitarias de orquestación de negocio |
| **Código TypeScript de `apps/mobile`** | **VERIFIED ON CURRENT ENVIRONMENT** | `npx tsc --noEmit` exitoso sin errores |
| **Expo Project Configuration & Bundling** | **VERIFIED ON CURRENT ENVIRONMENT** | `npx expo export` / Metro bundle compilation |
| **Regresión Windows (`desktop`)** | **VERIFIED ON CURRENT ENVIRONMENT** | `npm run build` & `npm run pack:win-unpacked` (Exit Code 0) |
| **iOS Simulator (iPad Air / Pro)** | **REQUIRES MAC/XCODE VERIFICATION** | Requiere host macOS con Xcode instalado |
| **iPad Físico (TestFlight / Ad-hoc)** | **REQUIRES PHYSICAL IPAD / APPLE DEV ACC** | Requiere provisioning profile y firma Apple |
| **Apple Keychain Native Binary** | **REQUIRES MAC/XCODE BUILD** | Ejecutado en runtime nativo iOS/iPadOS |

---

## 4. Bloqueos y Decisiones Arquitectónicas

1. **Ausencia de host macOS en la máquina de desarrollo:**
   - **Decisión:** El código de `apps/mobile` se desarrolla y valida al 100% en TypeScript estricto, configuración de Expo SDK, contratos compartidos y suites de pruebas unitarias.
   - Todo módulo nativo (`expo-secure-store`, escáner, etc.) se envuelve detrás de contratos de interfaz (`ISecureStorage`, `IScannerCapability`), permitiendo testeo inmediato sin dependencias nativas bloqueantes.
2. **Cero APIs Privadas de Apple (Directiva 17):**
   - **Decisión:** Queda expresamente prohibido incorporar `libimobiledevice`, `usbmuxd` o protocolos Lockdown en la app iPad. La inspección física profunda permanece en Windows/Mac Bridge.
