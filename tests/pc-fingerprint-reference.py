"""Synthetic cross-language reference copied from the PC collector normalizer."""
import hashlib
import json
import math


def _firebase_value(value):
    if isinstance(value, dict):
        return {k: v for k, original in value.items() if (v := _firebase_value(original)) not in (None, {}, [])}
    if isinstance(value, list):
        return [_firebase_value(item) for item in value]
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError('invalid synthetic number')
        if value.is_integer():
            return int(value)
    return value


def _fingerprint(value):
    raw = json.dumps(_firebase_value(value), sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()
