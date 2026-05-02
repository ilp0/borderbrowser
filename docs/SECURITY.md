# Security and reproducible builds

This document describes BorderBrowser's threat model, how our builds are made reproducible, and how a user can verify that a published artifact (e.g. the version on the Chrome Web Store) was built from a specific public commit.

It is the long-form companion to vision section 6 ("Privacy & trust"). The short version: our source is on GitHub, our CI publishes builds whose SHA-256 you can compute yourself from the same tag, and anything that touches the network is logged in `audit-log.md`.

## Threat model

We protect against three classes of threat, in priority order.

### 1. Supply-chain compromise of the published extension

Concretely: an attacker publishes a malicious build to the Chrome Web Store under our name, or a maintainer is coerced into doing so.

Mitigations:

- All releases are cut from a tagged commit on `main`. The tag is what CI consumes.
- The release workflow (`.github/workflows/release.yml`) builds the extension and uploads the resulting zip plus its SHA-256 checksum to the GitHub release. The SHA-256 is the verification anchor — you can recompute it locally and compare.
- The store listing description includes the release tag and SHA-256 of the zip the store received. A user who suspects tampering can re-fetch the store package, hash it, and compare.
- We do not ship pre-built artifacts from a maintainer's laptop. Only CI publishes.

### 2. Malicious dependency in the build graph

Concretely: a transitive npm dependency is taken over and ships malware that ends up in our bundle.

Mitigations:

- `package-lock.json` is committed and pinned. CI uses `npm ci`, which fails if the lockfile and `package.json` disagree.
- The Node version is pinned in CI (`actions/setup-node` with an explicit version), so the install graph is deterministic across runners.
- `esbuild` targets a fixed browser version (`chrome120`, `firefox120`) so output bytes do not drift with toolchain updates.
- Any PR that adds or upgrades a dependency that touches network code adds an entry to `audit-log.md`.

### 3. Backend or proxy compromise leaking page content

Out of scope for this document — covered by the worker's own threat model when that package lands. The relevant property here is that the extension's BYOK direct-to-OpenRouter path does not require our backend at all, so a backend compromise cannot retroactively read content from BYOK users.

## Build determinism

Reproducibility means: given the same source commit, two independent builders produce byte-identical output (modulo a small set of documented non-determinism sources).

What we pin:

| Input | How |
|---|---|
| Source | git tag → commit SHA |
| Dependencies | `package-lock.json` (committed); `npm ci` in CI |
| Node version | `.github/workflows/release.yml` `setup-node` `node-version` field |
| Bundler target | `target: ["chrome120", "firefox120"]` in `packages/extension/build.mjs` |
| Bundler version | `esbuild` is pinned by the lockfile |
| Build entry point | `node build.mjs` — no shell wrappers, no env-dependent flags |

Known non-determinism we accept:

- File ordering inside a zip can vary. The release workflow zips `dist/` with sorted entries to mitigate this; if a future change introduces variance, the SHA-256 is still anchored to whatever CI produced for that tag.
- Source maps include absolute paths from the build environment. The Chrome Web Store-uploaded build typically excludes source maps; the GitHub-released zip includes them for debuggability.

## Verifying a release

Given a release tag `v0.1.2`:

```bash
# Fetch the published artifact and its checksum
gh release download v0.1.2 -p 'borderbrowser-extension-*.zip' -p 'SHA256SUMS'

# Recompute and compare
shasum -a 256 -c SHA256SUMS
```

To verify locally that the artifact actually came from the source at that tag:

```bash
git fetch --tags
git checkout v0.1.2
npm ci
npm run -w @borderbrowser/extension build
( cd packages/extension/dist && zip -rX ../local.zip . )
shasum -a 256 packages/extension/local.zip
# Compare against the SHA-256 in the GitHub release.
```

If the hashes match, the published zip was built from exactly the source you just checked out.

## Where signing fits in

Today the release workflow publishes a SHA-256 only; it does not produce a cryptographic signature. The SHA-256 already pins content, but it does not prove who produced it — anyone with write access to the release page can replace both the zip and the checksum.

The path to true signed builds:

1. **GitHub attestations** (`actions/attest-build-provenance`). Cheap to add; binds a provenance statement to the artifact, signed by GitHub's OIDC root via Sigstore. No keys to manage on our side.
2. **`cosign` signing** with the workflow's OIDC identity. Same trust root, more flexibility on where the signature is published.
3. **Chrome Web Store package signing**: the store re-signs uploads with its own key, which is what users' browsers trust. Our SHA-256 anchors the *input* to that re-signing step.

This document will be updated when step 1 lands; the verification recipe above will then include an attestation check.

## Reporting a vulnerability

Email security disclosures to the maintainer listed in the repository's GitHub profile. Please do not file public issues for security bugs. We will acknowledge within 72 hours.
