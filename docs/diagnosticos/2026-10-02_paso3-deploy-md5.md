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
