# Cómo arrancar el proyecto en modo nativo (iOS)

El proyecto usa módulos de audio nativos que **no funcionan con Expo Go**.
Hay que lanzarlo siempre desde Xcode, pero **Metro debe estar corriendo antes**.

---

## Cada vez que quieras desarrollar

### 1. Arranca Metro (una sola terminal)

```bash
cd /Users/pedrojuradopueyo/develop/react/matebil-tuner
npx expo start --dev-client
```

Espera hasta ver `Metro waiting on exp://...` o `Metro bundler ready`.

### 2. Abre Xcode y lanza la app

Abre el workspace (no el `.xcodeproj`):

```
ios/GuitarTunerIntonation.xcworkspace
```

Luego pulsa **▶ Run** (`Cmd+R`) con tu iPhone conectado o por WiFi.

---

## Si el puerto 8081 está ocupado

```bash
lsof -ti :8081 | xargs kill -9
```

## Si ves "No script URL provided"

Significa que Metro no estaba corriendo cuando arrancaste la app.  
→ Arranca Metro (paso 1) y pulsa **Reload JS** en la app, o vuelve a hacer Run desde Xcode.

## Si ves "PlatformConstants not found"

El binario nativo está desincronizado.  
→ En Xcode: **Cmd+Shift+K** (Clean) y luego **Cmd+R** (Run).

---

## Primera vez / después de limpiar DerivedData

```bash
# 1. Instalar pods
cd ios && pod install && cd ..

# 2. Arrancar Metro
npx expo start --dev-client

# 3. En Xcode: Cmd+Shift+K → Cmd+R
```

---

## Flujo normal del día a día

| Paso | Comando / Acción |
|------|-----------------|
| 1 | `npx expo start --dev-client` |
| 2 | Xcode → `Cmd+R` |
| 3 | Cambios en JS → se reflejan automáticamente (Fast Refresh) |
| 4 | Cambios nativos → repetir paso 2 |
