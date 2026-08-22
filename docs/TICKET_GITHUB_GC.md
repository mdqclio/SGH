# Ticket a GitHub Support — GC de commits huérfanos

> **Versión para revisión.** Los 47 SHA están reemplazados por placeholders a propósito:
> publicarlos en este repo, que es público, daría 47 enlaces directos a los datos
> personales que el ticket pide purgar. Un SHA solo alcanza — `/commit/<sha>.patch` y
> `/tree/<sha>/` los sirven sin necesidad de conocer ninguna ruta.
>
> El texto íntegro, con los SHA, está fuera del repo. Se completan al enviar.

```
Hello,

I am the owner of the repository mdqclio/SGH (public).

The repository contained files with personal data of private individuals: national
identity numbers (DNI) alongside full names, and in some files phone numbers and dates of
birth. The subjects are third parties — racing professionals and stable owners who work
with our client racetrack. They did not consent to publication.

I have already remediated everything under my own control:

1. The current tree of the default branch (main) has been scrubbed. The values are
   redacted and the branch is verified clean.
2. The six branches that carried the data have been deleted from the remote.

What remains outside my control: the commits from those deleted branches are no longer
reachable from any ref, but your infrastructure still serves them when addressed by SHA.
I verified this after deletion — they return HTTP 200 both from the commit view on
github.com and from raw.githubusercontent.com, and the files still contain the personal
data in full.

Please note the scope carefully. This is not a request about six commits. Deleting the six
branches orphaned their entire history: 41 distinct commits in total. I tested every one of
them individually after the deletion, and all 41 return HTTP 200 for both the commit view
and raw file content. Purging only the six branch tips would leave 35 commits still
serving the data.

The scope matters for a second reason. Some intermediate commits expose MORE data than the
branch tips do, because later commits in those branches narrowed the dataset. For example,
one non-tip commit serves 53 distinct identity numbers, while the tip of the same branch
serves 51 — a later commit had discarded incorrect matches. Purging only the tips would
leave the worst version of the data behind.

So my request is: please purge all objects that became unreachable when these six branches
were deleted. The six branch tips are:

  <SHA>   was fix/dni-cuidadores                  2026-08-12
  <SHA>   was fix/dni-jockeys                     2026-08-12
  <SHA>   was chore/reunion-prueba-9998           2026-08-14
  <SHA>   was diag/cotejo-resultados-r6           2026-08-14
  <SHA>   was chore/propietarios-provisorios-r8   2026-08-18
  <SHA>   was diag/pii-audit                      2026-08-20

The complete list of all 41 affected commits is at the end of this message, in case it is
useful for verification.

I can confirm that none of the 41 is reachable from any branch, tag, or pull request in the
repository. There are no open or closed pull requests referencing them. I hold verified
local backups, so I do not need any of these objects preserved — please purge them.

If it helps you scope the work: the affected files are SQL migration scripts and Markdown
documents under migrations/ and docs/. I have deliberately not pasted file paths or values
into this ticket. I will provide them through whatever channel you prefer if you need them.

Two related notes, so you have the full picture:

- Some commits still reachable from main also contain a subset of these values. Removing
  those requires rewriting history on my side, which I am planning separately with
  git filter-repo. This request covers only the unreachable objects, which I have no way
  to reach at all.
- Please confirm once the purge has run, so I can re-verify that the SHAs no longer
  resolve.

Thank you.

--- Appendix: all 41 unreachable commits ---

  [41 SHA — se pegan al enviar, no se publican acá]
```

## Al enviar

1. Reemplazar los 6 `<SHA>` del cuerpo por los tips reales.
2. Pegar los 41 del apéndice.
3. Borrar este archivo y esta rama.
