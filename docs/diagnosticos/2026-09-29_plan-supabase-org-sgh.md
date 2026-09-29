# Plan de Supabase de la organización de SGH — NO SE PUDO OBTENER

- **Fecha:** 2026-09-29
- **SHA de `main`:** `7e5fc99cacce01790e594dc7e5bc2e93b9cef36a`
- **Solo lectura.** No se escribió nada.

## Respuesta

**No sé el plan, ni si es pago, ni desde cuándo, ni el costo**: ninguna herramienta de esta sesión llega a la organización
dueña del proyecto `unlhcuanfrtpatoipwve`.

## Qué se intentó (salida cruda)

Hay dos MCP de Supabase en la sesión:

1. **Conector de claude.ai** (`mcp__claude_ai_Supabase__*`, el que tiene `get_organization`):

```
get_project {id: "unlhcuanfrtpatoipwve"}
→ {"error":{"name":"ProtocolError","message":"MCP error -32600: You do not have permission to perform this action"}}

list_organizations
→ {"organizations":[{"id":"jhddllccepmbmutczwbg","slug":"jhddllccepmbmutczwbg","name":"<cuenta ajena a SGH>'s Org"}]}

list_projects
→ un solo proyecto: "Cambios" (ref kshoecyroddvhqqrmosm, organization_id jhddllccepmbmutczwbg, us-west-2, ACTIVE_HEALTHY, creado 2026-06-07)
```

   → Esa cuenta **no es miembro** de la organización de SGH. No llamé a `get_organization` sobre `jhddllccepmbmutczwbg`: es la
   organización de Cambios, no la de SGH, y no fue lo pedido.

2. **MCP propio del proyecto** (`mcp__supabase__*`, el que se usa siempre para SGH): está atado al proyecto
   (`get_project_url` → `https://unlhcuanfrtpatoipwve.supabase.co`) y **no tiene** `get_organization`, `list_organizations`
   ni `get_project` (sus herramientas son de base, edge functions, branches, logs y advisors).

## Cómo obtenerlo

- Dashboard: https://supabase.com/dashboard/org/_/billing (entrando con la cuenta dueña de SGH): muestra plan, fecha de
  alta de la suscripción y facturas.
- O conectar el conector de Supabase de claude.ai con esa misma cuenta, y ahí `get_organization` devuelve el plan.
  Aun así, `get_organization` informa el **plan**, no el historial de facturación: el "desde cuándo" y el costo real del mes
  (con uso excedente) están en Billing/Invoices del dashboard.
