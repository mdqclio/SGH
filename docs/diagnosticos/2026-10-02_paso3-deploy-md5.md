# Paso 3 — deploy: md5 servido por sigh.com.ar = `main`

- **Fecha**: 2026-10-02 · **`main`**: `e82a5484898c2868f3fe1b248985f3ba69d07b50` (merge del #38)
- **Guards**: los del paso 1 ✅

**Los tres archivos servidos coinciden con `main`.** Pages publicó en ~80 s desde el merge.

```
$ # loop: curl https://sigh.com.ar/<archivo>?v=$RANDOM | md5sum  vs  git show e82a548…:<archivo> | md5sum, hasta que coincidan los tres
desde 17:29:28 UTC hasta 17:30:46 UTC
liquidaciones-engine.js    main=b025a7838b07488003ac9b7832687c67 servido=b025a7838b07488003ac9b7832687c67
liquidaciones.html         main=d3d58e1f0cb2a4d66f4e75bed148a834 servido=d3d58e1f0cb2a4d66f4e75bed148a834
resultados.html            main=7060a8068f9cc605ed2a41c05e17fc16 servido=7060a8068f9cc605ed2a41c05e17fc16
```

## Verificación de push

Chequeo de datos personales sobre lo agregado (los cinco informes de los pasos 1 a 5): 1 coincidencia en la primera pasada (un rango de
números de línea del paso 5 escrito con guion, reescrito con "a"); segunda pasada **0**. Nombres de personas en lo agregado: **0**. La
contraseña del rol en lo agregado: **0**.

```
$ git push -q origin HEAD:reports && git ls-remote origin reports && git rev-parse HEAD
64b6fee87cdaa025b7b7fe965e75df3b0a20abc4	refs/heads/reports
64b6fee87cdaa025b7b7fe965e75df3b0a20abc4
```

Este anexo va en un commit posterior; su SHA es el tip de `origin/reports`.
