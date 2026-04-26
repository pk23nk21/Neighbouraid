"""Multi-aspect crisis triage.

Runs three zero-shot classifiers in parallel on `facebook/bart-large-mnli`:
  1. Urgency                        (critical / high / medium / low)
  2. Vulnerability signal           (child / elderly / pregnant / disabled / none)
  3. Time-sensitivity               (immediate / hours / days)

Each aspect comes with a confidence score and the top triggering keywords
("explainability") so volunteers can see WHY the system classified the way
it did, not just the final label.

If the HF model can't load (tight VM, offline dev, test environment), a
richer keyword heuristic fills in — with vocabulary covering English,
Hindi transliterations (Hinglish), and common Indian crisis idioms.

All paths are safe: classification never raises, so an alert submission
never fails because of an AI blip.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger(__name__)

_DISABLE = os.getenv("NA_DISABLE_AI_MODEL", "").lower() in ("1", "true", "yes")
_classifier = None
_load_failed = False


# --------------------------------------------------------------------------
# Zero-shot label sets
# --------------------------------------------------------------------------

URGENCY_LABELS = [
    "critical life-threatening emergency",
    "high urgency",
    "medium urgency",
    "low urgency",
]
URGENCY_MAP = {
    "critical life-threatening emergency": "CRITICAL",
    "high urgency": "HIGH",
    "medium urgency": "MEDIUM",
    "low urgency": "LOW",
}

VULNERABILITY_LABELS = [
    "a child or infant is affected",
    "an elderly person is affected",
    "a pregnant woman is affected",
    "a disabled or seriously injured person is affected",
    "no vulnerable person is mentioned",
]
VULNERABILITY_MAP = {
    "a child or infant is affected": "child",
    "an elderly person is affected": "elderly",
    "a pregnant woman is affected": "pregnant",
    "a disabled or seriously injured person is affected": "disabled",
    "no vulnerable person is mentioned": None,
}

TIME_LABELS = [
    "help is needed within minutes",
    "help is needed within hours",
    "help is needed within a day or later",
]
TIME_MAP = {
    "help is needed within minutes": "immediate",
    "help is needed within hours": "hours",
    "help is needed within a day or later": "days",
}


# --------------------------------------------------------------------------
# Indian-English + Hinglish vocabulary for the heuristic fallback
# --------------------------------------------------------------------------

_CRITICAL_TERMS = (
    "unconscious", "behosh", "cardiac", "heart attack", "not breathing",
    "saans nahi", "bleeding heavily", "khoon bahut", "stabbed", "shot",
    "gunshot", "drowning", "doob", "choking", "seizure", "convulsion",
    "stroke", "dead", "dying", "suicidal", "khudkushi", "marne wala",
)
_HIGH_TERMS = (
    "fire", "aag", "flood", "baadh", "trapped", "phansa", "collapse",
    "earthquake", "bhukamp", "fracture", "accident", "durghatna", "injury",
    "injured", "ghayal", "urgent", "zaroori", "help immediately", "madad",
    "ambulance", "rescue", "elderly alone", "pregnant in pain",
)
_LOW_TERMS = (
    "stray", "minor", "question", "tomorrow", "kal", "next week", "later",
    "information", "general inquiry",
)

_VULNERABLE = {
    "child": ("child", "baby", "infant", "kid", "bachcha", "bacha", "shishu", "minor"),
    "elderly": ("elderly", "old man", "old woman", "senior citizen", "buzurg", "budha", "budhi"),
    "pregnant": ("pregnant", "garbhvati", "expecting mother"),
    "disabled": ("disabled", "handicapped", "divyang", "wheelchair", "blind", "deaf"),
}

_DEVANAGARI_RE = re.compile(r"[ऀ-ॿ]")
_HINGLISH_MARKERS = ("hai ", "nahi", "kya ", "madad", "yahan", "mera ", "meri ", "bhai")


def detect_language(text: str) -> str:
    """Very rough — enough to flag Hindi/Hinglish for volunteers who can help."""
    if _DEVANAGARI_RE.search(text):
        return "hi"
    low = f" {text.lower()} "
    if any(m in low for m in _HINGLISH_MARKERS):
        return "hi-Latn"
    return "en"


# --------------------------------------------------------------------------
# Classifier bootstrap
# --------------------------------------------------------------------------

def _get_classifier():
    global _classifier, _load_failed
    if _classifier is not None or _load_failed:
        return _classifier
    if _DISABLE:
        _load_failed = True
        return None
    try:
        from transformers import pipeline  # heavy import, defer
        _classifier = pipeline(
            "zero-shot-classification",
            model="facebook/bart-large-mnli",
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("AI model unavailable, using heuristic fallback: %s", exc)
        _load_failed = True
    return _classifier


# --------------------------------------------------------------------------
# Heuristic helpers
# --------------------------------------------------------------------------

def _heuristic_urgency(text: str) -> tuple[str, str, list[str], float]:
    """Returns (urgency, reason, triggers, heuristic_confidence)."""
    low = text.lower()
    hits = [w for w in _CRITICAL_TERMS if w in low]
    if hits:
        return "CRITICAL", "keyword:critical", hits[:3], 0.8
    hits = [w for w in _HIGH_TERMS if w in low]
    if hits:
        return "HIGH", "keyword:high", hits[:3], 0.7
    hits = [w for w in _LOW_TERMS if w in low]
    if hits:
        return "LOW", "keyword:low", hits[:3], 0.6
    return "MEDIUM", "keyword:default", [], 0.4


def _heuristic_vulnerability(text: str) -> Optional[str]:
    low = text.lower()
    for tag, vocab in _VULNERABLE.items():
        if any(w in low for w in vocab):
            return tag
    return None


def _heuristic_time(text: str) -> str:
    low = text.lower()
    if any(w in low for w in ("immediately", "right now", "minute", "abhi", "turant", "jaldi")):
        return "immediate"
    if any(w in low for w in ("tomorrow", "next week", "later", "kal", "agle")):
        return "days"
    return "hours"


# --------------------------------------------------------------------------
# Public triage API
# --------------------------------------------------------------------------

URGENCY_WEIGHT = {"CRITICAL": 100, "HIGH": 70, "MEDIUM": 40, "LOW": 20}
TIME_BONUS = {"immediate": 20, "hours": 0, "days": -10}


@dataclass
class Triage:
    urgency: str
    urgency_confidence: float
    urgency_reason: str
    vulnerability: Optional[str]
    time_sensitivity: str
    language: str
    triggers: list[str]
    priority_score: int  # composite — used for volunteer dispatch ordering


def _compute_priority(urgency: str, vulnerability: Optional[str],
                      time_sensitivity: str, confidence: float) -> int:
    """Composite priority score 0–130. Higher = dispatch first."""
    base = URGENCY_WEIGHT.get(urgency, 40) * max(0.5, confidence)
    if vulnerability:
        base += 15
    base += TIME_BONUS.get(time_sensitivity, 0)
    return max(0, min(130, int(base)))


def _heuristic_triage(text: str) -> Triage:
    urgency, reason, triggers, confidence = _heuristic_urgency(text)
    vuln = _heuristic_vulnerability(text)
    time_s = _heuristic_time(text)
    return Triage(
        urgency=urgency,
        urgency_confidence=confidence,
        urgency_reason=reason,
        vulnerability=vuln,
        time_sensitivity=time_s,
        language=detect_language(text),
        triggers=triggers,
        priority_score=_compute_priority(urgency, vuln, time_s, confidence),
    )


def triage(text: str) -> Triage:
    classifier = _get_classifier()
    if classifier is None:
        return _heuristic_triage(text)

    try:
        urg_res = classifier(text, URGENCY_LABELS)
        vuln_res = classifier(text, VULNERABILITY_LABELS)
        time_res = classifier(text, TIME_LABELS)
    except Exception as exc:  # noqa: BLE001
        log.warning("AI triage runtime failure, falling back to heuristic: %s", exc)
        return _heuristic_triage(text)

    top_u = urg_res["labels"][0]
    confidence = float(urg_res["scores"][0])
    urgency = URGENCY_MAP.get(top_u, "MEDIUM")
    vuln = VULNERABILITY_MAP.get(vuln_res["labels"][0])
    time_s = TIME_MAP.get(time_res["labels"][0], "hours")

    # triggering terms: pull the heuristic matches (real explanation would
    # need attention/attribution — heuristic overlap is good enough for UX)
    _, _, triggers, _ = _heuristic_urgency(text)

    return Triage(
        urgency=urgency,
        urgency_confidence=round(confidence, 3),
        urgency_reason=top_u,
        vulnerability=vuln,
        time_sensitivity=time_s,
        language=detect_language(text),
        triggers=triggers,
        priority_score=_compute_priority(urgency, vuln, time_s, confidence),
    )


# --------------------------------------------------------------------------
# Headline summarisation
# --------------------------------------------------------------------------

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def generate_headline(text: str, max_len: int = 90) -> str:
    """Produce a short one-liner headline from a free-text description.

    Strategy:
    1. Prefer the first full sentence if it's reasonably short.
    2. Otherwise truncate at the nearest word boundary within `max_len`.
    No model dependency — fast, deterministic, works offline.
    """
    cleaned = text.strip().replace("\n", " ").replace("  ", " ")
    if not cleaned:
        return ""
    first_sentence = _SENTENCE_SPLIT.split(cleaned, maxsplit=1)[0]
    if len(first_sentence) <= max_len:
        return first_sentence
    cut = cleaned[:max_len].rsplit(" ", 1)[0]
    return f"{cut}…"


# --------------------------------------------------------------------------
# Lightweight semantic similarity (character 4-gram Jaccard)
# --------------------------------------------------------------------------
#
# Not as rich as sentence embeddings, but free, dependency-free, and robust
# to typos / reordering / minor Hinglish variations — which is what we need
# to fuse duplicate reports of the same incident described differently by
# different people ("fire near Gate 3" ≈ "aag gate 3 ke paas").


def _ngrams(text: str, n: int = 4) -> set[str]:
    low = re.sub(r"\s+", " ", text.lower())
    if len(low) < n:
        return {low}
    return {low[i : i + n] for i in range(len(low) - n + 1)}


def similarity(a: str, b: str) -> float:
    """Jaccard similarity of char 4-grams — 0.0 to 1.0."""
    if not a or not b:
        return 0.0
    ga, gb = _ngrams(a), _ngrams(b)
    inter = len(ga & gb)
    union = len(ga | gb)
    return round(inter / union, 3) if union else 0.0


def is_duplicate(a: str, b: str, threshold: float = 0.55) -> bool:
    return similarity(a, b) >= threshold


# --------------------------------------------------------------------------
# Back-compat shim for older callers & tests
# --------------------------------------------------------------------------

def classify_urgency(text: str) -> tuple[str, str]:
    t = triage(text)
    return t.urgency, t.urgency_reason
