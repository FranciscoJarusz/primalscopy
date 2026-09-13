# Panel de administración de traits

CRUD de traits (subir, renombrar, borrar) sin tocar el repo ni redeployar.

- **API**: `backend/` → `/api/admin/*`
- **Panel**: `wallet-web3/` → `/admin`

---

## 1. Crear el volumen en Railway

El filesystem de un contenedor de Railway es efímero: todo lo que se sube se
pierde en el siguiente deploy. Sin volumen, el panel funciona pero los traits
nuevos duran hasta el próximo push.

En el dashboard de Railway, sobre el servicio del backend:

1. **New** → **Volume**
2. **Mount path**: `/data/traits`
3. Guardar y esperar el redeploy

## 2. Variables de entorno del backend

| Variable | Valor | Para qué |
|---|---|---|
| `TRAITS_PATH` | `/data/traits` | Dónde viven los traits. Tiene que coincidir con el mount path del volumen. |
| `ADMIN_TOKEN` | un secreto largo | Contraseña del panel. Sin esto, la API de admin devuelve 503 y el panel no funciona. |

Para generar un token:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Qué pasa en el primer arranque

Si `TRAITS_PATH` apunta a un directorio vacío, el server copia ahí los 469
traits versionados de `backend/assets/traits/` y lo informa en los logs:

```
[traits] Volumen vacio. Sembrando desde .../backend/assets/traits...
[traits] Semilla copiada. El volumen es ahora la unica fuente de verdad.
```

De ahí en adelante el volumen manda. Los archivos del repo quedan solo como
semilla y backup: editarlos ya no cambia nada en producción.

## 3. Variables del frontend (wallet-web3)

Las mismas que ya usa el customizer, no hay que agregar ninguna:

| Variable | Ejemplo |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `https://tu-backend.up.railway.app/api` |
| `NEXT_PUBLIC_BACKEND_BASE_URL` | `https://tu-backend.up.railway.app` |

---

## Traits globales: la carpeta `_GLOBAL`

Los traits se guardan en `TRAITS_PATH/CATEGORIA/CARPETA/archivo.gif`, donde
`CARPETA` es el valor del trait en la metadata del NFT. Un NFT con `Hat = BOHO`
solo ve los archivos de `HAT/BOHO/`.

Por eso, antes, para ofrecer un sombrero a toda la colección había que copiarlo
a mano en las 21 carpetas de `HAT` (así se agregó `NAKED-ARMY-SWORD`).

Ahora cada categoría tiene una carpeta especial **`_GLOBAL`**: lo que esté ahí
se le ofrece a **todos** los NFTs, sin importar su trait. Un archivo, no 21.

En el panel aparece primero, marcada con 🌐.

> Si un trait de `_GLOBAL` tiene el mismo nombre que uno de la carpeta propia
> del NFT, gana el de la carpeta propia y el global no se duplica.

### Limpiar las copias viejas

Para los traits que ya se duplicaron a mano, el panel tiene **"Borrar en todas"**:
elimina ese archivo de todas las carpetas de la categoría de una sola vez.
Después se sube una única copia a `_GLOBAL`.

---

## API

Todos los endpoints piden `Authorization: Bearer <ADMIN_TOKEN>`.

| Método | Ruta | Cuerpo | Qué hace |
|---|---|---|---|
| `GET` | `/api/admin/session` | — | Valida el token. |
| `GET` | `/api/admin/traits` | — | Árbol completo de categorías, carpetas y traits. |
| `POST` | `/api/admin/traits` | multipart: `file`, `category`, `directory`, `name?`, `overwrite?` | Sube un trait. Crea la carpeta si no existe. |
| `PATCH` | `/api/admin/traits` | `{ category, directory, file, newName }` | Renombra. |
| `DELETE` | `/api/admin/traits` | `{ category, directory, file, scope? }` | Borra. Con `scope: "all"`, de todas las carpetas de la categoría. |

Restricciones: `.png`, `.gif`, `.bmp`, `.webp`, hasta 25 MB, un archivo por
request. Las categorías válidas son las de `CATEGORY_CONFIG` en
`controllers/nftController.js`.

### Ejemplo

```bash
curl -X POST https://tu-backend.up.railway.app/api/admin/traits \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "category=HAT" \
  -F "directory=_GLOBAL" \
  -F "name=NUEVO-SOMBRERO" \
  -F "file=@./nuevo-sombrero.gif"
```

---

## Desarrollo local

```bash
cd backend
TRAITS_PATH=./.local-traits ADMIN_TOKEN=dev-token npm run dev
```

Se siembra `./.local-traits` con una copia de los assets y se puede romper todo
sin tocar el repo. El panel queda en `http://localhost:3000/admin`.

---

## Seguridad

- El token es **compartido** y va en `sessionStorage`: se borra al cerrar la
  pestaña. No hay usuarios ni roles, es un panel para el equipo.
- Sin `ADMIN_TOKEN` definido, la API entera responde 503. Es deliberado:
  preferible que no funcione a que quede abierta.
- Los nombres de categoría, carpeta y archivo se validan contra una lista blanca
  y un regex, y toda ruta se resuelve y se verifica que caiga dentro de
  `TRAITS_PATH` antes de escribir.
