# WhatsApp para Yesi — 10 entrenadores de R9 sin DNI

**Fecha:** 2026-09-11 (noche) · foto de R9 con **78** inscripciones (query de recién; si sigue cargando, se regenera con la de abajo). Solo lectura.

---

```
Yesi, para el Stud Book necesitamos el DNI de los cuidadores. Estos 10 tienen caballos anotados para el 20/09 y no tienen documento cargado. ¿Me los pasás, o los cargás desde Entrenadores → lápiz → DNI?

1. BLANCO, MARCELO — LOCA DUBAI (T2 y T3), BAHIA ROMANA (T3)
2. BOLONTI, ROBERTO — DEL CAMPEON (T2), DOCTORA MIA (T2)
3. CANTO, HORACIO — AMIGUITO JESUS (T5), KUCCINI (T5), EL MAS SABIO (T6), ESPLENDID CRAF (T9)
4. GONZALEZ, ADRIAN AGUSTIN — TOUCH OF BLUE (T2), ECHO IN THE SKY (T7)
5. MAITIA, MIGUEL A — TORO MAÑERO (T3), COLONIAL JOHAN (T4), TOY BOY (T4), SEMBRADOR CHUCK (T7)
6. PADRON, WALTER — BACON (T4), BUEN MANUEL (T11)
7. PAGANO, JUAN MAURICIO — IDALIA MARO (T6 y T8)
8. PREBE, JOSE — DESTINADO JOHAN (T11)
9. TRUPPA, ROBERTO — ASTUTO NOTES (T2), FALAYS (T6), HEART OF GOLD (T11)
10. VILLANUEVA, SANTINO — TERRIBLE KING (T11)

Tres jockeys también sin DNI: GONZALEZ EDUARDO CECILIO, GONZALEZ LUCAS, HAHN GONZALO.

Y estos 8 caballos están anotados pero todavía sin entrenador cargado: DESERT OF DUBAI (T1), QUE BELLA DOÑA (T1), NIÑO OCEANICO (T4), BIEN COQUETA (T4), EL RISKO (T7), THE BEAST PARTY (T9), INDIANA MARO (T10), GOIADORA (T11).

Gracias!
```

---

Query (para regenerar el lunes si hace falta):

```sql
select p.apellido||', '||coalesce(p.nombre,'') entrenador, x.cab
from (select i.entrenador_id, string_agg(s.nombre||' (T'||ca.numero_turno||')', ', ' order by ca.numero_turno, s.nombre) cab
      from inscripciones i join carreras ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id
      where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.entrenador_id is not null group by 1) x
join profesionales p on p.id=x.entrenador_id
where p.documento_nro is null order by p.apellido;
```
```json
[{"caballos":"LOCA DUBAI (T2), BAHIA ROMANA (T3), LOCA DUBAI (T3)","entrenador":"BLANCO, MARCELO"},{"caballos":"DEL CAMPEON (T2), DOCTORA MIA (T2)","entrenador":"BOLONTI, ROBERTO"},{"caballos":"AMIGUITO JESUS (T5), KUCCINI (T5), EL MAS SABIO (T6), ESPLENDID CRAF (T9)","entrenador":"CANTO, HORACIO"},{"caballos":"TOUCH OF BLUE (T2), ECHO IN THE SKY (T7)","entrenador":"GONZALEZ, ADRIAN AGUSTIN"},{"caballos":"TORO MAÑERO (T3), COLONIAL JOHAN (T4), TOY BOY (T4), SEMBRADOR CHUCK (T7)","entrenador":"MAITIA, MIGUEL A"},{"caballos":"BACON (T4), BUEN MANUEL (T11)","entrenador":"PADRON, WALTER"},{"caballos":"IDALIA MARO (T6), IDALIA MARO (T8)","entrenador":"PAGANO, JUAN MAURICIO"},{"caballos":"DESTINADO JOHAN (T11)","entrenador":"PREBE, JOSE"},{"caballos":"ASTUTO NOTES (T2), FALAYS (T6), HEART OF GOLD (T11)","entrenador":"TRUPPA, ROBERTO"},{"caballos":"TERRIBLE KING (T11)","entrenador":"VILLANUEVA, SANTINO"}]
jockeys sin DNI: ["GONZALEZ EDUARDO CECILIO","GONZALEZ LUCAS","HAHN GONZALO"]
sin entrenador: ["DESERT OF DUBAI (T1)","QUE BELLA DOÑA (T1)","NIÑO OCEANICO (T4)","BIEN COQUETA (T4)","EL RISKO (T7)","THE BEAST PARTY (T9)","INDIANA MARO (T10)","GOIADORA (T11)"]
r9_total: 78
```
