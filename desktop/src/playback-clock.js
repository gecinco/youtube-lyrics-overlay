/**
 * Keeps a smooth playhead between sparse OS / extension updates.
 */
function createPlaybackClock() {
  let baseTime = 0;
  let baseAt = 0;
  let playing = false;
  let duration = 0;

  function sync({ currentTime, isPlaying, duration: nextDuration } = {}) {
    const incoming = Number(currentTime);
    if (Number.isFinite(incoming) && incoming >= 0) {
      // Ignore bogus zeros that would yank the playhead back to the start.
      const live = now();
      if (!(incoming === 0 && live > 3 && playing)) {
        baseTime = incoming;
        baseAt = Date.now();
      }
    }

    if (typeof isPlaying === 'boolean') {
      if (isPlaying && !playing) {
        baseAt = Date.now();
      }
      playing = isPlaying;
    }

    if (Number.isFinite(nextDuration) && nextDuration > 0) {
      duration = nextDuration;
    }
  }

  function now() {
    if (!playing) return baseTime;
    const elapsed = (Date.now() - baseAt) / 1000;
    const value = baseTime + elapsed;
    if (duration > 0) return Math.min(value, duration);
    return value;
  }

  function reset() {
    baseTime = 0;
    baseAt = Date.now();
    playing = false;
    duration = 0;
  }

  return { sync, now, reset, getDuration: () => duration };
}

module.exports = { createPlaybackClock };
