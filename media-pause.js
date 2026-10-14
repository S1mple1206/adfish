// Runs in each web frame; no Node.js or privileged API is exposed to websites.
function setMediaPaused(away) {
  const key = Symbol.for('adfish.pauseOnLeave');
  let state = globalThis[key];
  if (!state) {
    state = globalThis[key] = { away: false, media: new Map() };
    state.pause = event => {
      const media = event.target;
      if (!state.away || !(media instanceof HTMLMediaElement) || media.paused || media.ended) return;
      if (!state.media.has(media)) state.media.set(media, media.currentSrc || media.srcObject);
      media.pause();
    };
  }
  if (state.away === away) return;
  state.away = away;
  if (away) {
    document.addEventListener('play', state.pause, true);
    for (const media of document.querySelectorAll('video, audio')) state.pause({ target: media });
  } else {
    document.removeEventListener('play', state.pause, true);
    const mediaToResume = [...state.media];
    state.media.clear();
    for (const [media, source] of mediaToResume) {
      if (media.isConnected && media.paused && !media.ended && (media.currentSrc || media.srcObject) === source) {
        media.play().catch(() => {});
      }
    }
  }
}

module.exports = away => `(${setMediaPaused.toString()})(${!!away})`;
