# coke-zero Orbital Cache

This directory holds cached public orbital catalog snapshots and curated demo-only
objects for coke-zero. The cache worker is `scripts/fetch_orbital_cache.py`.

## Sources

The worker knows these CelesTrak JSON endpoints:

| Dataset | URL | Use |
| --- | --- | --- |
| `geo` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=GEO&FORMAT=JSON` | GEO/SATCOM public catalog context |
| `gps-ops` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=GPS-OPS&FORMAT=JSON` | PNT constellation context |
| `starlink` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=STARLINK&FORMAT=JSON` | Commercial SATCOM context |
| `planet` | `https://celestrak.org/NORAD/elements/gp.php?GROUP=PLANET&FORMAT=JSON` | Commercial EO context |
| `gpz-plus` | `https://celestrak.org/NORAD/elements/gp.php?SPECIAL=GPZ-PLUS&FORMAT=JSON` | GEO protected-zone and RPO-adjacent context |

## Offline Fixture Behavior

Offline mode is the default:

```bash
python3 scripts/fetch_orbital_cache.py --mode offline
```

It reads deterministic fixtures from `data/orbital/curated/fixtures/*.json`,
validates that each file is a non-empty CelesTrak-style JSON array, writes
`data/orbital/cache/<dataset>.json`, and updates
`data/orbital/cache/manifest.json`. Tests should use this mode so they do not
require network access or depend on live catalog churn.

Use `--dry-run` when validating fixtures without writing cache files:

```bash
python3 scripts/fetch_orbital_cache.py --mode offline --dry-run
```

## Live Refresh

Live mode is explicit:

```bash
python3 scripts/fetch_orbital_cache.py --mode live
```

Only run live refreshes manually, and do not refresh CelesTrak more often than
every 2 hours. The script records `sha256`, `object_count`, `cached_at`,
`fetched_at`, `source_mode`, `url`, and `cache_path` for each dataset.

## Manifest Update Format

The manifest is JSON with this top-level shape:

```json
{
  "cache_version": "coke-zero-orbital-cache-v1",
  "updated_at": "2026-05-02T00:00:00Z",
  "mode": "offline_fixture",
  "refresh_policy": "Manual refresh only; do not refresh CelesTrak data more often than every 2 hours.",
  "datasets": [
    {
      "id": "geo",
      "url": "https://celestrak.org/NORAD/elements/gp.php?GROUP=GEO&FORMAT=JSON",
      "cache_path": "data/orbital/cache/geo.json",
      "realism": "offline_fixture",
      "source_mode": "offline_fixture",
      "fetched_at": null,
      "cached_at": "2026-05-02T00:00:00Z",
      "sha256": "hex encoded sha256 of cache file bytes",
      "object_count": 1,
      "notes": "GEO/SATCOM environment for public catalog context."
    }
  ],
  "synthetic_overlays": [
    {
      "id": "coke-zero-RPO-1",
      "realism": "synthetic_orbital_overlay",
      "cache_path": "data/orbital/curated/rpo_placeholders.json",
      "notes": "Fictional inspector object used to demonstrate close-approach detection."
    }
  ]
}
```

For live refreshes, `mode` is `celestrak_live`, each dataset `realism` is
`real_source`, and `fetched_at` matches the run timestamp. For offline fixture
runs, `mode` is `offline_fixture`, each dataset `realism` is `offline_fixture`,
and `fetched_at` is `null`.

## Curated RPO Placeholders

`data/orbital/curated/rpo_placeholders.json` contains fictional
`synthetic_orbital_overlay` objects used by demo RPO and SATCOM-degradation
flows. These are not public catalog records and should not be mixed into
`real_source` CelesTrak cache files.
