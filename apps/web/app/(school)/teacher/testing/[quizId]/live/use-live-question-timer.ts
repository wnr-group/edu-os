"use client";

import { useEffect, useRef, useState } from "react";

// Countdown is derived from the server's live_question_started_at + the
// question's time_limit_seconds on every tick — never from a locally
// running counter — so it can't drift from what advance_live_question
// actually enforces server-side, and a re-render/remount just recomputes
// the same deadline instead of restarting the clock.
export function useLiveQuestionTimer({
  questionStartedAt,
  timeLimitSeconds,
  active,
  onExpire,
}: {
  questionStartedAt: string | null;
  timeLimitSeconds: number | null;
  active: boolean;
  onExpire: () => void;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!active || !questionStartedAt || !timeLimitSeconds) {
      setSecondsRemaining(null);
      return;
    }
    const deadline = new Date(questionStartedAt).getTime() + timeLimitSeconds * 1000;
    let fired = false;

    function tick() {
      const remainingMs = deadline - Date.now();
      setSecondsRemaining(Math.max(0, Math.ceil(remainingMs / 1000)));
      if (remainingMs <= 0 && !fired) {
        fired = true;
        onExpireRef.current();
      }
    }

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [questionStartedAt, timeLimitSeconds, active]);

  return { secondsRemaining };
}
