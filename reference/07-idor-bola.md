# 07 — IDOR / BOLA: qué se necesita y cómo se prueba

## 1. Qué son

| Sigla | Nombre | Qué rompe |
|---|---|---|
| **IDOR** | Insecure Direct Object Reference | Acceso a un objeto por su identificador sin verificar propiedad |
| **BOLA** | Broken Object Level Authorization | La API no valida que el objeto pertenezca al usuario autenticado |
| **BOPLA** | Broken Object Property Level Authorization | Se pueden leer o escribir campos que no corresponden (mass assignment, serialización de más) |
| **Escalada horizontal** | — | Usuario A accede a datos de usuario B del mismo rol |
| **Escalada vertical** | — | Usuario normal accede a funciones de administrador |

IDOR es el caso particular web; BOLA es el nombre en OWASP API Top 10 (API1:2023). En el plan del motor
ambos se cubren con `crossAccess`.

## 2. Requisitos previos

| Requisito | Detalle |
|---|---|
| Dos usuarios normales distintos | **A** y **B**, mismo rol, cada uno dueño de al menos un recurso |
| Un administrador | Para distinguir “no autorizado” de “no existe” |
| Recursos con ID | Facturas, pedidos, tickets, mensajes, archivos: al menos uno de A y uno de B |
| Staging autorizado | Nunca producción |
| Ventana vigente | La del `sectest/scope/authorization.md` |

Sin **B** no hay IDOR horizontal. Con un solo usuario solo se puede probar escalada vertical, y esa se
prueba con `adminEndpoints`.

## 3. Datos mínimos que hay que preparar

```text
Usuario A:  id=101  → factura 5001, pedido 7001
Usuario B:  id=102  → factura 5002, pedido 7002
Admin:      id=1    → acceso legítimo a todo
```

Lo importante no es el número: es que **A y B tengan recursos distintos y reales**. Los IDs se anotan en
el plan; el motor no los adivina ni itera.

## 4. Cómo obtener los IDs sin adivinar

1. Inicia sesión como B y abre “mis facturas”. Copia el ID de una factura de B.
2. Inicia sesión como A y confirma que **no** ve esa factura.
3. Ese ID es el que va en `crossAccess.url`.
4. Repite con el recurso de A para el control inverso.

Nunca uses IDs secuenciales a ciegas: puedes tocar datos de terceros y el hallazgo deja de ser
reproducible.

## 5. Plan en `sectest/scope/dynamic-plan.json`

```json
{
  "version": 1,
  "login": {
    "url": "/login",
    "contentType": "form",
    "fields": { "email": "{{username}}", "password": "{{password}}" },
    "csrf": { "url": "/login", "field": "_token", "pattern": "name=\"_token\" value=\"([^\"]+)\"" },
    "successStatus": [302]
  },
  "crossAccess": [
    {
      "name": "factura de B",
      "url": "/api/invoices/5002",
      "as": "user",
      "owner": "userB",
      "expect": [403, 404]
    }
  ],
  "adminEndpoints": [
    { "name": "panel de usuarios", "url": "/admin/users", "expect": [403] }
  ]
}
```

| Campo | Significado |
|---|---|
| `url` | URL concreta del recurso de **B**, no una plantilla |
| `as` | Rol que ataca: `user` (A), `userB` (B), `admin` |
| `owner` | Rol dueño legítimo del recurso |
| `expect` | Códigos que indican “bien protegido”. Default `[403, 404]` |

Credenciales necesarias en `sectest/scope/credentials.conf`:

```text
SECTEST_USER_USERNAME=...       # A
SECTEST_USER_PASSWORD=...
SECTEST_USER_B_USERNAME=...     # B
SECTEST_USER_B_PASSWORD=...
SECTEST_ADMIN_USERNAME=...
SECTEST_ADMIN_PASSWORD=...
```

## 6. Procedimiento que ejecuta el motor

1. **Login** de A, B y admin (si tienen credenciales).
2. **Ataque**: A pide `url`. Si responde 2xx, hay sospecha.
3. **Control positivo**: B pide la misma `url`.
   - B recibe 2xx → el recurso existe y es de B → **IDOR confirmado** (alto).
   - B recibe 403/404 → el ID o la URL está mal → **probable** (medio), no se reporta como confirmado.
4. **Evidencia**: método, URL, estado como A, estado como B, rol, fecha. Sin cuerpos completos.
5. **Sin iteración**: solo las URLs declaradas. Nada de recorrer `1..1000`.

## 7. Reglas de severidad

| Resultado | Severidad | Estado |
|---|---|---|
| A accede (2xx) y B accede (2xx) | alta | confirmado |
| A accede (2xx) y B no accede (403/404) | media | probable |
| A recibe 403/404 | — | control superado, sin hallazgo |
| No hay sesión de A o B | — | `bloqueada`, con el motivo |

## 8. Evidencia mínima

```text
GET /api/invoices/5002
  como user (A):  200  {"id":5002,"total":...}   (primeras líneas, PII enmascarada)
  como userB (B): 200  {"id":5002,...}
  conclusión: BOLA confirmado
```

No guardes el cuerpo completo ni datos personales. Basta el código y una muestra enmascarada.

### Enumeración: cuándo sí y cuándo no

El dueño del sistema puede autorizar enumeración. No es una prohibición absoluta: es una prueba de
**alto impacto** que exige control explícito.

**Permitida** cuando se cumplen las cinco condiciones:

1. Casilla `Enumeración controlada de IDs` marcada en la sección 6.
2. Entorno de staging autorizado, nunca producción.
3. Rango acotado: **máximo 100 IDs** por recurso.
4. Sin extracción: solo código de estado y, como mucho, el ID. Nada de cuerpos con datos.
5. Se detiene al primer `200` confirmado (o a los 5 hallazgos) y se documenta el resto como no probado.

**Prohibida** cuando:

- No hay casilla, o el entorno es producción.
- El rango es abierto (`1..∞`) o supera 100.
- Se descargan cuerpos, se guardan registros o se modifican datos.
- Se usa para “demostrar volumen” después de que ya hay un hallazgo confirmado.

**Por qué el tope.** El valor marginal de enumerar cae a cero tras el primer acceso confirmado. A partir
de ahí solo crece la exposición: cada `200` es un registro real leído, y el informe pasa de “encontré la
falla” a “leí datos de clientes”.

**Cómo se registra.** `enumerate` en el plan, no `crossAccess`:

```json
"enumerate": [
  {
    "name": "facturas secuenciales",
    "urlTemplate": "/api/invoices/{id}",
    "from": 5000,
    "to": 5030,
    "as": "user",
    "expect": [403, 404]
  }
]
```

El motor reporta cada `200` como `probable` (no hay control positivo del dueño) y guarda solo
`ID + estado`. Si el dueño del sistema aporta el recurso real, se prefiere `crossAccess` con `owner`,
que da evidencia `confirmada`.

**Contexto legal.** Con autorización escrita del responsable y datos de prueba, la enumeración es una
prueba contractual. Sigue aplicando minimización: si el endpoint es vulnerable, cada respuesta es un
registro de una persona real. La autorización habilita la prueba, no la extracción.

## 9. Qué NO hacer

- Enumerar IDs o usar fuerza bruta.
- Modificar o borrar el recurso ajeno.
- Extraer datos completos.
- Probar con el usuario administrador como atacante: el admin puede tener acceso legítimo.
- Declarar IDOR con un solo usuario.

## 10. Casos especiales

| Caso | Qué cambia |
|---|---|
| IDs UUID | Igual: se usa el UUID real de B, no se genera |
| Multi-tenant | Añade `tenant` en la URL o cabecera; el control debe cruzar tenant |
| GraphQL | El “ID” es el `node(id:)`; el plan apunta al endpoint y al body, que hoy no soporta POST arbitrario |
| URLs firmadas | Si A puede reutilizar la firma de B, es BOLA sobre el token, no sobre el ID |
| BOPLA | Revisa campos de respuesta (`password`, `remember_token`, `role`) y mass assignment |

## 11. Ejemplo de defensa en Laravel

```php
// app/Policies/InvoicePolicy.php
public function view(User $user, Invoice $invoice): bool
{
    return $invoice->user_id === $user->id;
}
```

```php
// app/Http/Controllers/InvoiceController.php
public function show(Invoice $invoice)
{
    $this->authorize('view', $invoice);
    return new InvoiceResource($invoice);
}
```

La prueba de regresión vive en `sectest/tests/Feature/` y usa `actingAs` con dos usuarios distintos.

## 12. Límites del motor

- No descubre recursos: los declara el humano en el plan.
- No soporta POST/PUT/DELETE arbitrarios; solo login y logout.
- No prueba BOPLA de escritura (mass assignment) sin un plan de escritura explícito.
- Un 2xx de A con control fallido de B queda como `probable`: revisar a mano antes de reportar.
