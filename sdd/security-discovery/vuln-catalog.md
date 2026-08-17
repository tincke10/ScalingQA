# Catálogo de clases de vulnerabilidad

Bloque estable, cacheable (entra como contexto de sistema en Capas 1-2). Cada clase describe
qué es, cómo se explota en un flujo web, y la forma del test que la detecta. El generador
combina cada clase con cada workflow del mapa para producir un spec falsable.

> Invariante de toda esta sección: el test generado **afirma que la explotación funciona**.
> Si el test pasa, la vulnerabilidad es real. Si falla, la app se defendió.

---

## IDOR (Insecure Direct Object Reference)

- **Qué es:** un identificador controlado por el usuario (path/query) permite acceder a un
  recurso que no le pertenece.
- **Explotación:** autenticarse como usuario A, pedir un recurso cuyo id pertenece a B.
- **Assert de explotación exitosa:** respuesta 200 con datos de B. (Comportamiento correcto
  sería 403 o 404.)
- **Aplica a:** workflows con `auth_required: true` y un `param` `user_controlled` que
  referencia un recurso.

## Mass assignment

- **Qué es:** el binding de la request acepta campos que no deberían ser seteables por el
  cliente (`role`, `is_admin`, `verified_at`).
- **Explotación:** enviar en el body campos sensibles no listados en el formulario legítimo.
- **Assert de explotación exitosa:** el campo se persistió (leer el recurso después y verlo
  reflejado).
- **Aplica a:** workflows de creación/edición (`POST`/`PUT`/`PATCH`).

## Bypass de autorización

- **Qué es:** un endpoint privilegiado responde sin exigir el rol/permiso correcto.
- **Explotación:** invocar el endpoint autenticado como usuario sin privilegio (o sin auth si
  el workflow lo marca requerido).
- **Assert de explotación exitosa:** respondió con el recurso/acción en vez de 401/403.
- **Aplica a:** workflows con `auth_required: true` o que tocan recursos administrativos.

## Falta de rate limiting

- **Qué es:** endpoints sensibles (login, reset de password) sin límite de intentos.
- **Explotación:** N requests rápidos consecutivos al mismo endpoint.
- **Assert de explotación exitosa:** ninguno devolvió 429 (todos procesados).
- **Aplica a:** workflows de autenticación y de envío de mail (registro, reset).

## Exposición de datos en respuestas

- **Qué es:** la API devuelve campos sensibles que no debería serializar (hash de password,
  tokens, datos de otros usuarios embebidos).
- **Explotación:** inspeccionar el JSON de una respuesta legítima.
- **Assert de explotación exitosa:** el body contiene una clave sensible
  (`password`, `remember_token`, `api_token`, etc.).
- **Aplica a:** todo workflow que devuelva un recurso serializado.

---

## Cómo se amplía

Agregar una clase es agregar una entrada acá con las cuatro partes (qué / explotación /
assert / aplica a). El generador la toma automáticamente en la próxima corrida. No se toca
código para sumar una clase — solo este catálogo.
