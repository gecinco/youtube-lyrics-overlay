/**
 * Keeps a smooth playhead between sparse OS / extension updates.
 * Extension timing is trusted; Windows/SMTC timing is best-effort only.
 */
function createPlaybackClock() {
  let baseTime = 0;
  let baseAt = Date.now();
  let playing = false;
  let duration = 0;
  let lastExtensionAt = 0;

  function now() {
    if (!playing) return baseTime;
    const elapsed = (Date.now() - baseAt) / 1000;
    const value = baseTime + elapsed;
    if (duration > 0) return Math.min(value, duration);
    return value;
  }

  function hasFreshExtension(maxAgeMs = 2500) {
    return Date.now() - lastExtensionAt < maxAgeMs;
  }

  function sync({
    currentTime,
    isPlaying,
    duration: nextDuration,
    source = 'windows',
  } = {}) {
    const incoming = Number(currentTime);
    const fromExtension = source === 'extension';

    if (fromExtension) {
      lastExtensionAt = Date.now();
    }

    if (Number.isFinite(incoming) && incoming >= 0) {
      if (fromExtension) {
        baseTime = incoming;
        baseAt = Date.now();
      } else if (!hasFreshExtension()) {
        const live = now();
        // YouTube via Windows often reports 0 — never rewind for that.
        const bogusZero = incoming < 0.35 && live > 1.25;
        const bigBackward = incoming + 1.5 < live;
        if (!bogusZero && !bigBackward) {
          baseTime = incoming;
          baseAt = Date.now();
        }
      }
    }

    if (typeof isPlaying === 'boolean') {
      // Don't let flaky Windows pause override a live extension playhead.
      if (fromExtension || !hasFreshExtension()) {
        if (isPlaying && !playing) {
          baseAt = Date.now();
        }
        playing = isPlaying;
      }
    }

    if (Number.isFinite(nextDuration) && nextDuration > 0) {
      duration = nextDuration;
    }
  }

  function reset() {
    baseTime = 0;
    baseAt = Date.now();
    playing = false;
    duration = 0;
    lastExtensionAt = 0;
  }

  return {
    sync,
    now,
    reset,
    getDuration: () => duration,
    hasFreshExtension,
  };
}

module.exports = { createPlaybackClock };
