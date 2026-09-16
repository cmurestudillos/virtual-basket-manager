# Distribución — instalador, firma y actualizaciones

Cómo sale el juego del repositorio y cómo llega actualizado a quien lo tiene
instalado. Nada de esto se ejecuta solo: construir no publica, y publicar es un
paso aparte y deliberado.

## Construir

| Script             | Qué hace                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| `pnpm build:win`   | Instalador NSIS en `release/`. Firma si hay certificado; si no, sin firmar |
| `pnpm release:win` | Lo mismo, pero **exige** firma: sin certificado falla en vez de seguir     |

Los dos llevan `--publish never`: generan el instalador y su `latest.yml`, pero
no suben nada a ninguna parte.

`release:win` existe para que una versión que se va a distribuir no pueda salir
sin firmar por olvido. `build:win` es para probar el instalador en local.

## Firma de código

Windows avisa con SmartScreen de todo instalador sin firmar, y el aviso sólo
desaparece con un certificado de firma de código emitido por una autoridad
reconocida. **No está en el repositorio ni debe estarlo.**

electron-builder lo lee de dos variables de entorno:

```powershell
$env:CSC_LINK = "C:\ruta\al\certificado.pfx"   # o el .pfx en base64
$env:CSC_KEY_PASSWORD = "..."                   # la contraseña, nunca en un fichero
pnpm release:win
```

La configuración de `electron-builder.yml` ya firma con SHA-256 y sello de
tiempo (`timestamp.digicert.com`): el sello hace que la firma siga siendo válida
cuando caduque el certificado.

Al tener certificado, hay que poner **`win.signtoolOptions.publisherName`** con
el nombre común (CN) exacto del certificado. Con él puesto, la aplicación
instalada rechaza cualquier actualización que no venga firmada por ese mismo
nombre, que es lo que impide que alguien cuele un instalador ajeno. Se deja sin
poner hasta tener el certificado porque un nombre inventado haría rechazar
todas las actualizaciones, también las buenas.

## Actualizaciones

La aplicación instalada busca versiones nuevas en las **releases de GitHub** de
`cmurestudillos/virtual-basket-manager` (`publish` en `electron-builder.yml`):

- Comprueba una vez al arrancar, cinco segundos después de abrir la ventana, y
  cuando se pulsa «Buscar actualizaciones» en Ajustes.
- Si hay versión nueva la **descarga sola** en segundo plano y la verifica contra
  el hash SHA-512 del `latest.yml`.
- **No la instala sola.** Avisa en Ajustes y en el menú principal, y se instala
  al pulsar «Reiniciar e instalar» o al cerrar la aplicación. Reiniciar sin
  avisar le haría perder a alguien el partido que estuviera jugando.
- En desarrollo no hace nada: no hay instalación que sustituir.

Para que las releases sirvan de fuente, **el repositorio tiene que ser público**:
la aplicación instalada no lleva credenciales, así que no puede leer las
releases de un repositorio privado.

### Publicar una versión

1. Subir `version` en `package.json`. La aplicación compara con ella: una release
   con la misma versión que la instalada no se ofrece.
2. Construir firmado: `pnpm release:win`.
3. Crear en GitHub una release con la etiqueta `v<versión>` y adjuntar, de
   `release/`, **los tres ficheros**: `Triple-Manager-Setup-<versión>.exe`, su
   `.blockmap` y `latest.yml`. Sin `latest.yml` la aplicación no ve la versión, y
   el instalador tiene que conservar su nombre: `latest.yml` lo busca por él.

También puede publicar electron-builder directamente, con un token de GitHub con
permiso sobre el repositorio:

```powershell
$env:GH_TOKEN = "..."
pnpm exec electron-builder --win --publish always
```

### Probarlo en local sin publicar nada

La variable `VBM_UPDATE_FEED` hace que la aplicación en desarrollo busque
actualizaciones en una carpeta servida por HTTP en lugar de en GitHub:

```powershell
pnpm build
pnpm exec electron-builder --win --publish never -c.extraMetadata.version=9.9.9 -c.directories.output=release-prueba
python -m http.server 8765 --directory release-prueba
$env:VBM_UPDATE_FEED = "http://127.0.0.1:8765/"; pnpm dev
```

En Ajustes, «Buscar actualizaciones» tiene que encontrar la 9.9.9, descargarla y
dejarla lista para instalar. Es como se verificó el flujo al montarlo.

Con `VBM_UPDATE_FEED` la instalación al cerrar está **desactivada**, a propósito:
la primera verificación la tenía activa y, al cerrar la ventana de pruebas,
ejecutó en silencio el instalador descargado y dejó la versión de prueba
instalada en la máquina. **No pulses «Reiniciar e instalar» en una prueba
local**: eso sí instala.
