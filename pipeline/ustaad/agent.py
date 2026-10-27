"""Deterministic agent state machine.

The vision verdict picks the next tool call. This is the "agentic" layer: the
camera's decision *drives control flow*, it is not merely reported.

Tools:
  verify_step            - run the vision pipeline on the latest stable frame
  next_step              - advance the procedure
  flag_error(region)     - PASS failed; tell the worker where, re-verify later
  request_human_approval - uncertain; escalate to a human
  log_evidence           - persist frame + decision to the audit trail

Policy:
  PASS   -> log_evidence, next_step
  FAIL   -> flag_error(region); stay on the same step, re-verify next stable moment
  UNSURE -> request_human_approval; offline we auto-record "awaiting human" then
            advance so the run completes (a real deployment would block here).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Optional

PASS, FAIL, UNSURE = "PASS", "FAIL", "UNSURE"


@dataclass
class TraceEntry:
    t_video: float
    step: int               # 1-based step number
    tool: str
    score: Optional[float]
    inliers: int
    align_method: str
    latency_ms: float
    decision: str
    region: Optional[str]

    def to_dict(self) -> dict:
        return {
            "t_video": round(self.t_video, 3),
            "step": self.step,
            "tool": self.tool,
            "score": None if self.score is None else round(self.score, 4),
            "inliers": self.inliers,
            "align_method": self.align_method,
            "latency_ms": round(self.latency_ms, 1),
            "decision": self.decision,
            "region": self.region,
        }


def decide(score: Optional[float], aligned: bool, cfg) -> str:
    """Map a score (and alignment success) to PASS / FAIL / UNSURE."""
    if not aligned or score is None:
        return UNSURE
    if score >= cfg.tau_pass:
        return PASS
    if score < cfg.tau_fail:
        return FAIL
    return UNSURE


@dataclass
class Observation:
    """What the vision layer hands the agent at one stable moment."""
    t_video: float
    score: Optional[float]
    inliers: int
    align_method: str
    aligned: bool
    region: Optional[str]
    latency_ms: float


@dataclass
class Agent:
    n_steps: int
    cfg: object
    trace: List[TraceEntry] = field(default_factory=list)
    current: int = 0                      # 0-based index of the step we're on
    results: List[dict] = field(default_factory=list)
    on_evidence: Optional[Callable] = None  # hook(step_idx, decision) -> path

    @property
    def done(self) -> bool:
        return self.current >= self.n_steps

    def _log(self, tool, obs: Observation, decision):
        self.trace.append(TraceEntry(
            t_video=obs.t_video, step=self.current + 1, tool=tool,
            score=obs.score, inliers=obs.inliers, align_method=obs.align_method,
            latency_ms=obs.latency_ms, decision=decision, region=obs.region))

    def observe(self, obs: Observation) -> str:
        """Feed one stable-moment observation; returns the decision taken."""
        if self.done:
            return "COMPLETE"
        decision = decide(obs.score, obs.aligned, self.cfg)

        # 1. the verify_step tool call that produced this verdict
        self._log("verify_step", obs, decision)

        if decision == PASS:
            self._log("log_evidence", obs, decision)
            if self.on_evidence:
                self.on_evidence(self.current, decision)
            self.results.append(self._result(decision, obs))
            self._log("next_step", obs, decision)
            self.current += 1

        elif decision == FAIL:
            self._log("flag_error", obs, decision)
            if self.on_evidence:
                self.on_evidence(self.current, decision)
            # stay on the same step; it will be re-verified at the next stable moment
            self.results.append(self._result(decision, obs))

        else:  # UNSURE
            self._log("request_human_approval", obs, decision)
            if self.on_evidence:
                self.on_evidence(self.current, decision)
            # offline: record "awaiting human", then continue so the run completes
            self._log("log_evidence", obs, "AWAITING_HUMAN")
            self.results.append(self._result(decision, obs, human=True))
            self.current += 1

        return decision

    def _result(self, decision, obs: Observation, human=False) -> dict:
        return {
            "step": self.current + 1,
            "decision": decision,
            "score": None if obs.score is None else round(obs.score, 4),
            "align_method": obs.align_method,
            "inliers": obs.inliers,
            "region": obs.region,
            "t_video": round(obs.t_video, 3),
            "awaiting_human": human,
        }

    def trace_dicts(self) -> list[dict]:
        return [e.to_dict() for e in self.trace]
