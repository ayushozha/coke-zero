"""coke-zero data ingest adapters.

Each adapter emits canonical Signal dictionaries. The hackathon adapters read
cached public data or deterministic JSONL mocks; production adapters can replace
their internals while preserving the same Signal envelope.
"""

