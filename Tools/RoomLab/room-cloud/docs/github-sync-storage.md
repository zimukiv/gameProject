# Optional GitHub storage

`lib/github-storage.mjs` is an opt-in storage adapter for one explicitly
configured RoomLab workspace. It replaces D1 reads/writes for saved revisions,
branch heads, graph metadata, chunk presence and chunk bytes. Every other
workspace key continues to use the existing D1/R2 path, including its manifest,
path and size checks.

No deployment, remote write, data migration or branch creation is performed by
this repository change. The adapter reads the existing `roomlab-saves` branch and
uses `base_tree` on every commit, so `roomlab-41-rooms.zip` and any other existing
branch content remain untouched.

## Runtime configuration

All values are server-side Cloudflare/Next `env` bindings. Never return them to a
browser and never put them into a connection key.

| Binding | Required | Default |
| --- | --- | --- |
| `ROOMLAB_GITHUB_TOKEN` | yes | — |
| `ROOMLAB_GITHUB_WORKSPACE_SHA256` | yes | — |
| `ROOMLAB_GITHUB_REPOSITORY` | no | `zimukiv/gameProject` |
| `ROOMLAB_GITHUB_BRANCH` | no | `roomlab-saves` |
| `ROOMLAB_GITHUB_STATE_PATH` | no | `roomlab-saves/state.json` |
| `ROOMLAB_GITHUB_ZIP_PATH` | no | `roomlab-41-rooms.zip` |

The token should be scoped to repository contents write access for the configured
repository. The workspace hash is the lowercase SHA-256 of the 43-character
workspace key; the key itself and the token are never written to Git.

A store is created only after `SHA-256(X-Room-Workspace-Key)` matches
`ROOMLAB_GITHUB_WORKSPACE_SHA256` in constant time. Without an exact match the
GitHub client is not constructed and its credential is never attached to a
request. Invalid repo, branch, path or workspace-hash configuration disables
GitHub mode and falls back to legacy storage.

## Write and concurrency model

State is a single JSON blob under `ROOMLAB_GITHUB_STATE_PATH`:

```json
{
  "schema": 1,
  "workspace": "<configured sha256>",
  "branches": [{"name": "main", "head": "<revision id>", "updatedAt": 0}],
  "revisions": [{"id": "<sha256>", "files": [], "fingerprint": "<sha256>"}],
  "revisionTimes": {"<revision id>": 0},
  "graph": {"generation": 0, "metadata": []}
}
```

A write:

1. Reads the branch ref, commit/tree and current state.
2. Applies the same branch/base, graph-generation and manifest rules as D1.
3. Creates a blob and a tree with `base_tree` (existing files preserved).
4. Creates a commit whose parent is the HEAD observed in step 1.
5. Updates the ref with `force: false`.

If another writer moved the branch between steps 1 and 5, GitHub rejects the
non-fast-forward update and the route reports a 409 conflict. A forced update is
never attempted. GitHub HTTP bodies and credentials are mapped to fixed,
non-secret error messages.

### Immutable chunks

Chunk bytes are immutable blobs in a sibling directory of the state file. With
the default configuration the path is:

```text
roomlab-saves/chunks/<lowercase sha256>
```

`missing` reads the current tree, `GET chunks/<hash>` reads the blob and recomputes
its SHA-256 before returning bytes, and `PUT chunks/<hash>` recomputes the digest
before writing. A branch blob whose bytes do not match its path hash fails closed
instead of being served.

Chunk uploads use the same HEAD CAS as metadata:

1. Read the branch HEAD, commit and tree.
2. If the content-addressed blob already exists with matching SHA-256, return
   success without creating a commit (idempotent write).
3. Otherwise create the blob, a `base_tree` tree and a commit parented on the
   observed HEAD.
4. Update the ref with `force: false`. If another writer moved HEAD, reload and
   retry against the new HEAD; a repeated loss returns a 409 conflict.

Commit validation reads each referenced chunk blob from GitHub, verifies its
SHA-256 and checks its size. A configured workspace therefore never consults D1
or R2 for `missing`, `chunks/<hash>` GET/PUT, or commit chunk checks.

## Current limitations

- Commit validation reads every referenced chunk to verify digest and size. Large
  projects make that validation proportional to the total chunk bytes.
- The state is one JSON document. It is rejected above 8 MiB, so a very large
  revision history needs a future split into per-revision blobs.
- The adapter expects the configured branch to already exist; it never creates or
  deletes branches.
- Reads are uncached; every request performs Git Data API calls.
- A tree response truncated by GitHub fails closed. A project with enough chunks
  to truncate the recursive tree requires a future per-directory lookup.
- Existing D1 revisions/branches/graph/chunks are not migrated or mirrored. Only
  the configured workspace opts in, and only when all configuration is valid.
- Branch protection rules that forbid direct ref updates will make writes return
  a conflict/unavailable response by design.
