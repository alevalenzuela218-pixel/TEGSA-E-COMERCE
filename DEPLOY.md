# Cómo publicar cambios (a prueba de errores)

El problema que más te trabó no fue el código: fue subir cambios **incompletos**.
Arrastrar archivos sueltos a GitHub actualiza solo los que arrastrás, y tu web
queda mezclada (mitad nueva, mitad vieja). Esta guía lo elimina.

## Método recomendado: GitHub Desktop (subís TODO, siempre)

1. Instalá **GitHub Desktop** (https://desktop.github.com) e iniciá sesión.
2. *File → Clone repository* → elegí `TEGSA-ILUMINACI-N`. Se descarga a una
   carpeta local.
3. Cuando te pase una versión nueva: **descomprimí el ZIP y copiá TODO su
   contenido dentro de esa carpeta local, reemplazando** los archivos.
4. En GitHub Desktop vas a ver, a la izquierda, la lista de **todos** los
   archivos que cambiaron. Escribí un mensaje abajo (ej. "actualización") y
   apretá **Commit to main**.
5. Arriba, **Push origin**. Listo: subió todo junto, sin olvidos.

> Con esto no volvés a tener versiones mezcladas: GitHub Desktop detecta y sube
> todos los cambios de una, incluidos los archivos dentro de `public/`, `src/`
> y `db/`.

## En Render (una sola vez)

- Tu web service → **Settings → Build & Deploy** → **Auto-Deploy = Yes**.
- Rama: **main**.
- Con eso, cada *Push* dispara el deploy solo.

## Verificar que la versión NUEVA quedó publicada (el sello)

Esto es lo que te da certeza, sin adivinar:

1. Esperá en Render a que el deploy diga **"Deploy live"** (verde).
2. Abrí en tu navegador: **`tu-web.onrender.com/api/version`**
   - Tiene que mostrar la versión que te dije (ej. `{"version":"1.1.0", ...}`).
   - Si muestra una versión más vieja → el deploy no entró (revisá Auto-Deploy o
     que el Push haya subido).
3. También aparece abajo de todo en el **footer** de la web: `v1.1.0 (fecha)`.
4. Siempre, al abrir la web: **Ctrl + Shift + R** (refresco forzado) para que el
   navegador no te muestre la versión cacheada.

## Regla de oro

> Si el `/api/version` de tu web no coincide con la versión que te pasé, **no
> estás viendo el código nuevo** — no es un problema de programación, es de
> publicación. Repetí el Commit + Push completo.
