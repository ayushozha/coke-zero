from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import shlex
import shutil
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from coke_zero.services.kb.models import KBEntry, SourceRef

__all__ = [
    "NiaCliContextProvider",
    "NiaContextHit",
    "NiaContextProvider",
    "NiaContextResult",
]

_FALSE_VALUES = {"0", "false", "no", "off"}
_DEFAULT_COMMAND = "npx -y @nozomioai/nia"
_DEFAULT_TIMEOUT_S = 12.0
_LOCAL_MODE = "nia.json.local"
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
_SOURCE_LABEL_RE = re.compile(
    r"(README\.md|CODEX_TASKS\.md|docs/[^\s:)]+|kb/[^\s:)]+|"
    r"data/(?:kb_seed_entries|source_registry)\.json|data/orbital/[^\s:)]+|"
    r"scenarios/[^\s:)]+|bench/scenarios/[^\s:)]+|coke_zero/[^\s:)]+|"
    r"services/[^\s:)]+|src/[^\s:)]+|scripts/[^\s:)]+)"
)


@dataclass(frozen=True)
class NiaContextHit:
    label: str
    citation: str
    snippet: str


@dataclass(frozen=True)
class NiaContextResult:
    query: str
    available: bool
    hits: tuple[NiaContextHit, ...] = ()
    source_labels: tuple[str, ...] = ()
    raw_preview: str = ""
    stderr_preview: str = ""
    error: str | None = None
    mode: str = "nia.search.query"

    @property
    def count(self) -> int:
        return len(self.hits)

    def as_payload(self) -> dict[str, object]:
        return {
            "provider": "nia",
            "mode": self.mode,
            "available": self.available,
            "query": self.query,
            "count": self.count,
            "source_labels": list(self.source_labels),
            "citations": [hit.citation for hit in self.hits],
            "preview": self.raw_preview,
            "stderr_preview": self.stderr_preview,
            "error": self.error,
        }

    def to_kb_entries(self, *, limit: int = 3) -> list[KBEntry]:
        entries: list[KBEntry] = []
        for hit in self.hits[:limit]:
            digest = hashlib.sha1(
                f"{hit.citation}\n{hit.snippet}".encode("utf-8")
            ).hexdigest()[:12]
            entries.append(
                KBEntry(
                    id=f"nia-{digest}",
                    title=f"Nia context: {hit.label}"[:120],
                    actor="Unknown",
                    domain=["osint"],
                    capability_type="nia_context",
                    summary=hit.snippet or hit.label,
                    source_refs=[
                        SourceRef(
                            source_id="nia",
                            locator=hit.citation,
                            claim_supported=hit.label,
                        )
                    ],
                    claim_type="open_report",
                    confidence="medium",
                    sensitivity="public",
                    notes=(
                        "Retrieved from project-scoped Nia search."
                        if self.mode != _LOCAL_MODE
                        else "Retrieved from nia.json-bound local source fallback."
                    ),
                )
            )
        return entries


class NiaContextProvider(Protocol):
    async def retrieve(self, query: str, *, limit: int = 3) -> NiaContextResult: ...


class NiaCliContextProvider:
    """Small async adapter around project-scoped `nia search query`.

    The provider is intentionally soft-fail. Missing CLI, missing nia.json,
    auth failures, or timeouts return an unavailable result so the engine can
    keep using the in-process KB without breaking the demo.
    """

    def __init__(
        self,
        *,
        project_root: str | Path | None = None,
        command: str | Sequence[str] | None = None,
        timeout_s: float | None = None,
        enabled: bool | None = None,
    ) -> None:
        self._project_root = Path(project_root or os.getcwd()).resolve()
        self._command = command or os.environ.get("NIA_CLI", _DEFAULT_COMMAND)
        self._timeout_s = timeout_s or float(
            os.environ.get("COKE_ZERO_NIA_TIMEOUT_S", _DEFAULT_TIMEOUT_S)
        )
        if enabled is None:
            enabled = os.environ.get("COKE_ZERO_NIA_ENABLED", "1").lower() not in (
                _FALSE_VALUES
            )
        self._enabled = enabled

    async def retrieve(self, query: str, *, limit: int = 3) -> NiaContextResult:
        if not self._enabled:
            return NiaContextResult(
                query=query,
                available=False,
                error="Nia context disabled by COKE_ZERO_NIA_ENABLED",
            )

        manifest_dir = _find_manifest_dir(self._project_root)
        if manifest_dir is None:
            return NiaContextResult(
                query=query,
                available=False,
                error="nia.json not found; run nia project init and bind coke-zero sources",
            )

        command = self._resolve_command()
        if command is None:
            return NiaContextResult(
                query=query,
                available=False,
                error="Nia CLI not found on PATH; set NIA_CLI to the executable",
            )

        args = [
            *command,
            "search",
            "query",
            query,
            "--skip-llm",
            "--strategy",
            "hybrid",
        ]
        proc: asyncio.subprocess.Process | None = None
        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                cwd=str(manifest_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(), timeout=self._timeout_s
            )
        except TimeoutError:
            if proc is not None:
                proc.kill()
                await proc.wait()
            return NiaContextResult(
                query=query,
                available=False,
                error=f"Nia search timed out after {self._timeout_s:.1f}s",
            )
        except OSError as exc:
            return NiaContextResult(query=query, available=False, error=str(exc))

        stdout = stdout_b.decode("utf-8", errors="replace")
        stderr = stderr_b.decode("utf-8", errors="replace")
        if proc.returncode != 0:
            detail = _preview(stderr or stdout, max_chars=240)
            error = f"Nia search failed with exit {proc.returncode}: {detail}"
            fallback = _retrieve_local_manifest_context(
                query,
                manifest_dir=manifest_dir,
                limit=limit,
                cli_error=error,
                stdout=stdout,
                stderr=stderr,
            )
            if fallback is not None:
                return fallback
            return NiaContextResult(
                query=query,
                available=False,
                raw_preview=_preview(stdout),
                stderr_preview=_preview(stderr),
                error=error,
            )

        combined = "\n".join(part for part in (stderr, stdout) if part.strip())
        clean = _clean(combined)
        clean_stdout = _clean(stdout)
        labels = _source_labels(clean)
        hits = _extract_hits(clean_stdout or clean, limit=limit)
        if not hits:
            fallback = _retrieve_local_manifest_context(
                query,
                manifest_dir=manifest_dir,
                limit=limit,
                stdout=stdout,
                stderr=stderr,
            )
            if fallback is not None:
                return fallback
        return NiaContextResult(
            query=query,
            available=True,
            hits=tuple(hits),
            source_labels=tuple(labels),
            raw_preview=_preview(clean),
            stderr_preview=_preview(stderr),
        )

    def _resolve_command(self) -> list[str] | None:
        if isinstance(self._command, str):
            raw = self._command.strip()
            if not raw:
                return None
            parts = shlex.split(raw, posix=os.name != "nt")
        else:
            parts = [str(part) for part in self._command]
        if not parts:
            return None
        executable = parts[0]
        if Path(executable).exists():
            return parts
        resolved = shutil.which(executable)
        if resolved:
            return [resolved, *parts[1:]]
        return None


def _find_manifest_dir(start: Path) -> Path | None:
    current = start.resolve()
    if current.is_file():
        current = current.parent
    while True:
        if (current / "nia.json").exists():
            return current
        if current.parent == current:
            return None
        current = current.parent


def _clean(text: str) -> str:
    return _ANSI_RE.sub("", text).replace("\r\n", "\n").strip()


def _preview(text: str, *, max_chars: int = 1200) -> str:
    clean = _clean(text)
    if len(clean) <= max_chars:
        return clean
    return f"{clean[:max_chars].rstrip()}..."


def _source_labels(text: str) -> list[str]:
    labels: list[str] = []
    seen: set[str] = set()
    for match in _SOURCE_LABEL_RE.finditer(text.replace("\\", "/")):
        label = match.group(1)
        if label not in seen:
            labels.append(label)
            seen.add(label)
    return labels


def _extract_hits(text: str, *, limit: int) -> list[NiaContextHit]:
    hits: list[NiaContextHit] = []
    lines = [line.strip(" -*\t") for line in text.splitlines() if line.strip()]
    for line in lines:
        labels = _source_labels(line)
        if not labels:
            continue
        label = labels[0]
        hits.append(
            NiaContextHit(
                label=label,
                citation=_citation_for(label, line),
                snippet=line[:500],
            )
        )
        if len(hits) >= limit:
            return hits
    if not hits and text.strip():
        snippet = _preview(text, max_chars=500)
        hits.append(
            NiaContextHit(
                label="nia.search.query",
                citation="nia.search.query",
                snippet=snippet,
            )
        )
    return hits[:limit]


def _citation_for(label: str, line: str) -> str:
    normalized = line.replace("\\", "/")
    idx = normalized.find(label)
    if idx < 0:
        return label
    tail = normalized[idx + len(label) :]
    line_no = re.search(r"[:#L](\d+)", tail)
    if line_no:
        return f"{label}:{line_no.group(1)}"
    return label


def _retrieve_local_manifest_context(
    query: str,
    *,
    manifest_dir: Path,
    limit: int,
    cli_error: str | None = None,
    stdout: str = "",
    stderr: str = "",
) -> NiaContextResult | None:
    roots = _manifest_local_roots(manifest_dir)
    if not roots:
        return None
    hits = _local_source_hits(query, roots=roots, limit=limit)
    if not hits:
        return None
    source_labels = []
    seen: set[str] = set()
    for hit in hits:
        if hit.label not in seen:
            source_labels.append(hit.label)
            seen.add(hit.label)
    status = (
        "Nia CLI search unavailable; using nia.json local source fallback."
        if cli_error
        else "Nia CLI returned no hits; using nia.json local source fallback."
    )
    preview = "\n".join([status, *(hit.snippet for hit in hits)])
    if stdout.strip():
        preview = f"{preview}\n\nNia stdout:\n{_preview(stdout, max_chars=360)}"
    return NiaContextResult(
        query=query,
        available=True,
        hits=tuple(hits),
        source_labels=tuple(source_labels),
        raw_preview=_preview(preview),
        stderr_preview=_preview(stderr),
        error=cli_error,
        mode=_LOCAL_MODE,
    )


def _manifest_local_roots(manifest_dir: Path) -> list[Path]:
    manifest = manifest_dir / "nia.json"
    try:
        payload = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    roots: list[Path] = []
    for item in payload.get("local") or []:
        raw_path: str | None = None
        if isinstance(item, str):
            raw_path = item
        elif isinstance(item, dict):
            raw_path = item.get("path")
        if not raw_path:
            continue
        candidate = (manifest_dir / raw_path).resolve()
        try:
            candidate.relative_to(manifest_dir.resolve())
        except ValueError:
            continue
        if candidate.exists() and candidate.is_dir():
            roots.append(candidate)
    return roots


def _local_source_hits(
    query: str, *, roots: Sequence[Path], limit: int
) -> list[NiaContextHit]:
    terms = _query_terms(query)
    scored: list[tuple[int, str, int, NiaContextHit]] = []
    best_by_label: dict[str, tuple[int, str, int, NiaContextHit]] = {}
    for root in roots:
        for path in _iter_local_context_files(root):
            rel = path.relative_to(root).as_posix()
            best = _best_file_hit(path, rel, terms)
            if best is None:
                continue
            current = best_by_label.get(rel)
            if current is None or best[0] > current[0]:
                best_by_label[rel] = best
    scored.extend(best_by_label.values())
    scored.sort(key=lambda item: (-item[0], item[1], item[2]))
    return [hit for _, _, _, hit in scored[:limit]]


def _iter_local_context_files(root: Path) -> list[Path]:
    fixed = [
        root / "README.md",
        root / "CODEX_TASKS.md",
        root / "data" / "kb_seed_entries.json",
        root / "data" / "source_registry.json",
    ]
    paths: list[Path] = [path for path in fixed if path.exists() and path.is_file()]
    dirs = [
        root / "docs",
        root / "kb",
        root / "scenarios",
        root / "bench" / "scenarios",
        root / "data" / "orbital",
        root / "coke_zero",
        root / "services",
        root / "src",
        root / "scripts",
    ]
    suffixes = {".css", ".json", ".jsonl", ".md", ".py", ".ts", ".tsx", ".yaml", ".yml"}
    for directory in dirs:
        if not directory.exists() or not directory.is_dir():
            continue
        for path in directory.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in suffixes:
                continue
            paths.append(path)
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in paths:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(path)
    return unique


def _best_file_hit(
    path: Path, label: str, terms: set[str]
) -> tuple[int, str, int, NiaContextHit] | None:
    try:
        if path.stat().st_size > 500_000:
            return None
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return None
    best: tuple[int, str, int, NiaContextHit] | None = None
    for line_no, line in enumerate(lines[:1200], start=1):
        stripped = line.strip()
        if not stripped:
            continue
        score = _line_score(label, stripped, terms)
        if score <= 0:
            continue
        citation = f"{label}:{line_no}"
        hit = NiaContextHit(
            label=label,
            citation=citation,
            snippet=f"{citation} {stripped[:500]}",
        )
        candidate = (score, label, line_no, hit)
        if best is None or score > best[0]:
            best = candidate
    return best


def _query_terms(query: str) -> set[str]:
    stopwords = {
        "and",
        "code",
        "context",
        "entries",
        "entry",
        "for",
        "from",
        "indexed",
        "local",
        "notes",
        "none",
        "query",
        "repo",
        "search",
        "source",
        "sources",
        "support",
        "the",
        "with",
    }
    terms = set()
    for token in re.findall(r"[a-zA-Z0-9_/-]{3,}", query.lower()):
        normalized = token.replace("-", "_").replace("/", "_")
        if normalized not in stopwords:
            terms.add(normalized)
    terms.update({"coke_zero", "attribution", "decision", "kb", "kb_seed_entries", "scenario"})
    return terms


def _line_score(label: str, line: str, terms: set[str]) -> int:
    normalized_line = line.lower().replace("-", "_").replace("/", "_")
    normalized_label = label.lower().replace("-", "_").replace("/", "_")
    score = sum(1 for term in terms if term in normalized_line)
    score += sum(1 for term in terms if term in normalized_label)
    if label == "data/kb_seed_entries.json":
        score += 4
    elif label in {"README.md", "CODEX_TASKS.md"}:
        score += 2
    elif label.startswith(("docs/", "scenarios/", "coke_zero/")):
        score += 1
    return score
