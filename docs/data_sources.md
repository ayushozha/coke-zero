# coke-zero Data Sources

coke-zero separates public source caches from demo-only overlays. Public orbital
catalog inputs come from CelesTrak and are cached so demos and tests can run
without a network dependency.

## CelesTrak Orbital Catalogs

The orbital cache worker is:

```bash
python3 scripts/fetch_orbital_cache.py
```

Known datasets:

| Dataset | Explicit URL | Cache file |
| --- | --- | --- |
| `geo` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=GEO&FORMAT=JSON` | `data/orbital/cache/geo.json` |
| `gps-ops` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=GPS-OPS&FORMAT=JSON` | `data/orbital/cache/gps-ops.json` |
| `starlink` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=STARLINK&FORMAT=JSON` | `data/orbital/cache/starlink.json` |
| `planet` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=PLANET&FORMAT=JSON` | `data/orbital/cache/planet.json` |
| `gpz-plus` | `https://celestrak.org/NORAD/elements/gp.php?SPECIAL=GPZ-PLUS&FORMAT=JSON` | `data/orbital/cache/gpz-plus.json` |

## Offline Fixtures

Tests and deterministic local workflows should use:

```bash
python3 scripts/fetch_orbital_cache.py --mode offline
```

Offline mode reads `data/orbital/curated/fixtures/<dataset>.json` instead of
calling CelesTrak. The fixture files are intentionally small CelesTrak-style
JSON arrays and exist to validate parser and cache behavior, not to represent a
complete operational catalog.

Use this command for no-write validation:

```bash
python3 scripts/fetch_orbital_cache.py --mode offline --dry-run
```

## Live Refresh Policy

Live refreshes are manual and opt-in:

```bash
python3 scripts/fetch_orbital_cache.py --mode live
```

Do not refresh CelesTrak more often than every 2 hours. A live run writes each
dataset JSON array into `data/orbital/cache/` and rewrites
`data/orbital/cache/manifest.json` with checksums and counts.

## Manifest Update Format

Every cache update writes a manifest with:

| Field | Meaning |
| --- | --- |
| `cache_version` | Stable cache contract, currently `coke-zero-orbital-cache-v1` |
| `updated_at` | UTC timestamp for this cache run |
| `mode` | `offline_fixture` or `celestrak_live` |
| `refresh_policy` | Human-readable refresh rule |
| `datasets[]` | Per-source URL, cache path, count, checksum, source mode, and timestamps |
| `synthetic_overlays[]` | Demo-only placeholders that remain separate from public CelesTrak records |

Each `datasets[]` entry includes `id`, `url`, `cache_path`, `realism`,
`source_mode`, `fetched_at`, `cached_at`, `sha256`, `object_count`, and `notes`.
Offline entries use `realism: "offline_fixture"` and `fetched_at: null`; live
entries use `realism: "real_source"` and set `fetched_at`.

## Curated RPO Placeholders

`data/orbital/curated/rpo_placeholders.json` holds fictional objects such as
`SATCOM-3` and `coke-zero-RPO-1`. They are labeled
`synthetic_orbital_overlay`, support RPO close-approach demo flows, and should
not be cited as CelesTrak data.
