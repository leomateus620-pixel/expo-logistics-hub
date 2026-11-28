/** Short original Foley. A falling sine and filtered noise, with no audio downloads. */
export function playCue(audio: AudioContext, cue: 'passagem' | 'papel') {
  if (audio.state !== 'running') return;
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.connect(audio.destination);
  if (cue === 'passagem') {
    const tone = audio.createOscillator();
    tone.frequency.setValueAtTime(96, now);
    tone.frequency.exponentialRampToValueAtTime(44, now + 0.16);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    tone.connect(gain);
    tone.start();
    tone.stop(now + 0.22);
    tone.onended = () => {
      tone.disconnect();
      gain.disconnect();
    };
    return;
  }
  const length = Math.ceil(audio.sampleRate * 0.095);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp((-6 * i) / length);
  const source = audio.createBufferSource(),
    filter = audio.createBiquadFilter();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = 1840;
  filter.Q.value = 0.78;
  gain.gain.value = 0.22;
  source.connect(filter);
  filter.connect(gain);
  source.start();
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}
