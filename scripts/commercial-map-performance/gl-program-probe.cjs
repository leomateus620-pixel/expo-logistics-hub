// Opt-in diagnostic instrumentation, never imported by the application.
// Wrap only calls the renderer already makes: no extra GL query, compile,
// context, draw or state mutation. Timings from a probed run are diagnostic,
// not a benchmark. Full shader sources make variant differences reviewable.
function installCommercialMapGlProgramProbe() {
  const data = window.__commercialMapGlProgramProbe = {
    diagnostic: true, additionalGlQueries: false, startedAt: performance.now(),
    contexts: [], shaders: [], programs: [], truncated: false,
  };
  const contexts = new WeakMap(), shaders = new WeakMap(), programs = new WeakMap();
  const limit = 1024;
  const phase = gl => {
    const events = window.__commercialMapPerformance?.events;
    const last = events?.[events.length - 1];
    return { at: performance.now(), lastStage: last?.name ?? null, lastStageAt: last?.at ?? null,
      essentialReady: gl.canvas?.dataset?.commercialMapEssentialReady ?? null,
      ready: gl.canvas?.dataset?.commercialMapReady ?? null,
      hydration: gl.canvas?.dataset?.commercialMapHydration ?? null };
  };
  const contextId = gl => {
    if (!contexts.has(gl)) {
      const record = { id: data.contexts.length + 1, createdObservedAt: performance.now(),
        type: gl.constructor.name, canvasClass: gl.canvas?.className ?? null };
      data.contexts.push(record); contexts.set(gl, record.id);
    }
    return contexts.get(gl);
  };
  const wrap = (prototype, name, callback) => {
    const original = prototype[name];
    if (typeof original !== 'function') return;
    prototype[name] = function (...args) { return callback.call(this, original, args); };
  };
  const firstCall = (gl, original, args, name) => {
    const record = programs.get(args[0]);
    if (!record || record[name]) return original.apply(gl, args);
    const event = phase(gl); event.stack = new Error().stack;
    try { return original.apply(gl, args); }
    finally { event.synchronousMs = performance.now() - event.at; record[name] = event; }
  };
  for (const prototype of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
    if (!prototype) continue;
    wrap(prototype, 'createShader', function (original, args) {
      const shader = original.apply(this, args);
      if (shader && data.shaders.length < limit) {
        const record = { id: data.shaders.length + 1, contextId: contextId(this), type: args[0], source: null };
        data.shaders.push(record); shaders.set(shader, record);
      } else if (shader) data.truncated = true;
      return shader;
    });
    wrap(prototype, 'shaderSource', function (original, args) {
      const result = original.apply(this, args), record = shaders.get(args[0]);
      if (record) record.source = args[1];
      return result;
    });
    wrap(prototype, 'createProgram', function (original, args) {
      const program = original.apply(this, args);
      if (program && data.programs.length < limit) {
        const record = { id: data.programs.length + 1, contextId: contextId(this), created: phase(this), shaders: [], links: [], readinessPolls: 0 };
        data.programs.push(record); programs.set(program, record);
      } else if (program) data.truncated = true;
      return program;
    });
    wrap(prototype, 'attachShader', function (original, args) {
      const result = original.apply(this, args), record = programs.get(args[0]), shader = shaders.get(args[1]);
      if (record && shader) record.shaders.push(shader.id);
      return result;
    });
    wrap(prototype, 'linkProgram', function (original, args) {
      const record = programs.get(args[0]), event = phase(this);
      if (record) event.stack = new Error().stack;
      try { return original.apply(this, args); }
      finally { if (record) { event.synchronousMs = performance.now() - event.at; record.links.push(event); } }
    });
    wrap(prototype, 'getProgramParameter', function (original, args) {
      const record = programs.get(args[0]), parameter = args[1];
      // Constants avoid asking the context or extension for any information.
      const key = parameter === 0x8b82 ? 'firstLinkStatus' : parameter === 0x8b86 ? 'firstUniformCount'
        : parameter === 0x8b89 ? 'firstAttributeCount' : null;
      if (key) return firstCall(this, original, args, key);
      const result = original.apply(this, args);
      if (record && parameter === 0x91b1) {
        record.readinessPolls++;
        if (result && !record.readyObserved) record.readyObserved = phase(this);
      }
      return result;
    });
    for (const [method, name] of [['getProgramInfoLog', 'firstProgramInfoLog'], ['getActiveUniform', 'firstActiveUniform'],
      ['getActiveAttrib', 'firstActiveAttribute'], ['useProgram', 'firstUse']]) {
      wrap(prototype, method, function (original, args) { return firstCall(this, original, args, name); });
    }
  }
}

module.exports = { installCommercialMapGlProgramProbe };
