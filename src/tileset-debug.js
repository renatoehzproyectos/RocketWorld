// Tileset3D debugging instrumentation for root-cause analysis of flickering
// Instruments visibility transitions, cache eviction, SSE changes, and refinement gaps

export class TilesetDebugger {
  constructor() {
    this.tileHistory = new Map();        // tile.id -> { states: [], visibility: [], created: ms }
    this.visibilityShifts = [];          // {frame, tileId, before, after, reason}
    this.evictionEvents = [];            // {frame, tileId, reason}
    this.sseShifts = [];                 // {frame, before, after, ratio}
    this.refinementGaps = [];            // {frame, tileId, parentId, readyChildren, totalChildren}
    this.frameSnapshot = [];             // {frame, visibleCount, loadedCount, pendingCount, cachedCount}
    this.selectedButNotLoaded = [];      // {frame, tileId, tileGE}
    this.parents = new WeakMap();        // child -> parent tracking
    this.tileIdMap = new Map();          // numeric id -> tile for tracking
    this.nextTileId = 0;
    this.enabled = true;
    this.maxHistoryFrames = 300;
  }

  getTileId(tile) {
    if (!this.tileIdMap.has(tile)) {
      this.tileIdMap.set(tile, this.nextTileId++);
    }
    return this.tileIdMap.get(tile);
  }

  trackParentChild(child, parent) {
    if (parent) this.parents.set(child, parent);
  }

  onVisibilityChange(frame, tile, wasVisible, isVisible, reason = '?') {
    if (!this.enabled) return;
    const id = this.getTileId(tile);
    const key = `t${id}`;
    if (!this.tileHistory.has(key)) this.tileHistory.set(key, { created: performance.now(), states: [], visibility: [] });
    const hist = this.tileHistory.get(key);
    hist.visibility.push({ frame, before: wasVisible, after: isVisible, reason });
    this.visibilityShifts.push({ frame, tileId: id, before: wasVisible, after: isVisible, reason, ge: tile.ge, state: tile.state });
    if (this.visibilityShifts.length > 1000) this.visibilityShifts.shift();
  }

  onStateChange(frame, tile, oldState, newState) {
    if (!this.enabled) return;
    const id = this.getTileId(tile);
    const key = `t${id}`;
    if (!this.tileHistory.has(key)) this.tileHistory.set(key, { created: performance.now(), states: [], visibility: [] });
    const hist = this.tileHistory.get(key);
    hist.states.push({ frame, from: oldState, to: newState });
  }

  onEviction(frame, tile, reason) {
    if (!this.enabled) return;
    const id = this.getTileId(tile);
    this.evictionEvents.push({ frame, tileId: id, reason, ge: tile.ge, bytes: tile.bytes });
    if (this.evictionEvents.length > 500) this.evictionEvents.shift();
  }

  onSSEChange(frame, before, after) {
    if (!this.enabled) return;
    const ratio = after / before;
    this.sseShifts.push({ frame, before, after, ratio });
    if (this.sseShifts.length > 200) this.sseShifts.shift();
  }

  onRefinementGap(frame, tile, readyChildren, totalChildren) {
    if (!this.enabled) return;
    const id = this.getTileId(tile);
    const parentId = this.parents.has(tile) ? this.getTileId(this.parents.get(tile)) : null;
    this.refinementGaps.push({ frame, tileId: id, parentId, readyChildren, totalChildren, ge: tile.ge });
    if (this.refinementGaps.length > 500) this.refinementGaps.shift();
  }

  onFrameSnapshot(frame, stats) {
    if (!this.enabled) return;
    this.frameSnapshot.push({ frame, ...stats });
    if (this.frameSnapshot.length > this.maxHistoryFrames) this.frameSnapshot.shift();
  }

  onSelectedButUnloaded(frame, tile) {
    if (!this.enabled) return;
    const id = this.getTileId(tile);
    this.selectedButNotLoaded.push({ frame, tileId: id, ge: tile.ge, state: tile.state });
    if (this.selectedButNotLoaded.length > 200) this.selectedButNotLoaded.shift();
  }

  // Analyze recent events to find patterns
  analyzeFlickering() {
    const out = [];
    if (!this.frameSnapshot.length) return out;

    // Check for rapid visibility-to-invisible transitions (same tile in consecutive frames)
    const flickerMap = new Map();
    for (const evt of this.visibilityShifts.slice(-200)) {
      if (!flickerMap.has(evt.tileId)) flickerMap.set(evt.tileId, []);
      flickerMap.get(evt.tileId).push(evt);
    }
    for (const [tid, events] of flickerMap.entries()) {
      let transitions = 0;
      for (let i = 1; i < events.length; i++) {
        if (events[i].before !== events[i - 1].after) transitions++;
      }
      if (transitions > 2) {
        out.push(`🔴 FLICKER PATTERN: tile ${tid} toggled visibility ${transitions} times in recent frames (reasons: ${[...new Set(events.map(e => e.reason))].join(', ')})`);
      }
    }

    // Check for zero-visible-tiles windows
    let zeroStreak = 0, maxZeroStreak = 0, zeroFrame = 0;
    for (const snap of this.frameSnapshot.slice(-100)) {
      if (snap.visibleCount === 0) {
        if (zeroStreak === 0) zeroFrame = snap.frame;
        zeroStreak++;
        maxZeroStreak = Math.max(maxZeroStreak, zeroStreak);
      } else {
        zeroStreak = 0;
      }
    }
    if (maxZeroStreak > 10) out.push(`🔴 MAP INVISIBLE: ${maxZeroStreak} consecutive frames with 0 visible tiles (frame ~${zeroFrame})`);

    // Check for refinement gaps (parent visible but children not ready)
    const gapsByParent = new Map();
    for (const gap of this.refinementGaps.slice(-100)) {
      if (!gapsByParent.has(gap.parentId || gap.tileId)) gapsByParent.set(gap.parentId || gap.tileId, []);
      gapsByParent.get(gap.parentId || gap.tileId).push(gap);
    }
    for (const [pid, gaps] of gapsByParent.entries()) {
      const incomplete = gaps.filter(g => g.readyChildren < g.totalChildren);
      if (incomplete.length > 5) {
        out.push(`🟡 INCOMPLETE REFINEMENT: parent ${pid} had ${incomplete.length} frames with partial children (${incomplete[0].readyChildren}/${incomplete[0].totalChildren})`);
      }
    }

    // Check for SSE oscillation
    let sseOscillations = 0;
    for (let i = 1; i < this.sseShifts.length - 1; i++) {
      const prev = this.sseShifts[i - 1], curr = this.sseShifts[i], next = this.sseShifts[i + 1];
      if ((prev.after < curr.after && curr.after > next.after) || (prev.after > curr.after && curr.after < next.after)) {
        sseOscillations++;
      }
    }
    if (sseOscillations > 5) out.push(`🟡 SSE OSCILLATION: ${sseOscillations} direction changes in SSE threshold (dynamic adjustment unstable)`);

    return out;
  }

  reportRecent(windowSecs = 10) {
    const now = performance.now();
    const t0 = now - windowSecs * 1000;
    const out = [];

    out.push(`\n=== TILESET DEBUG REPORT (last ${windowSecs}s) ===`);
    out.push(`Total events tracked: ${this.visibilityShifts.length} visibility, ${this.evictionEvents.length} eviction, ${this.sseShifts.length} SSE, ${this.refinementGaps.length} gaps`);

    const recentViz = this.visibilityShifts.filter(e => performance.now() - t0 < windowSecs * 1000).slice(-30);
    if (recentViz.length) {
      out.push(`\nRecent visibility changes (last 30):`);
      for (const v of recentViz) {
        const arrow = v.before ? '→OFF' : '→ON';
        out.push(`  frame ${v.frame}: tile${v.tileId} ${arrow} (ge=${v.ge}, state=${v.state}, reason=${v.reason})`);
      }
    }

    const recentEvict = this.evictionEvents.slice(-10);
    if (recentEvict.length) {
      out.push(`\nRecent evictions (last 10):`);
      for (const e of recentEvict) {
        out.push(`  frame ${e.frame}: tile${e.tileId} (ge=${e.ge}, ${e.bytes} bytes, reason: ${e.reason})`);
      }
    }

    const analysis = this.analyzeFlickering();
    if (analysis.length) {
      out.push(`\nANOMALY DETECTION:`);
      for (const a of analysis) out.push(`  ${a}`);
    }

    return out.join('\n');
  }

  clear() {
    this.visibilityShifts = [];
    this.evictionEvents = [];
    this.sseShifts = [];
    this.refinementGaps = [];
    this.frameSnapshot = [];
    this.selectedButNotLoaded = [];
    this.tileHistory.clear();
  }
}

// Patch into Tileset3D: call this after instantiation
export function attachDebugger(tileset, debugger) {
  tileset.__debug = debugger;
  debugger.trackParentChild = (c, p) => debugger.trackParentChild(c, p);

  // Hook into existing methods
  const origUpdate = tileset.update.bind(tileset);
  const origVisit = tileset.visit.bind(tileset);
  const origFree = tileset.free.bind(tileset);
  const origEvictOne = tileset.evictOne.bind(tileset);
  const origSelect = tileset.select.bind(tileset);

  tileset.update = function(renderer) {
    const f = this.frame;
    const oldSse = this.sseCur;
    const oldVis = new Set(this.sel.map(t => this.getTileId ? this.getTileId(t) : t));
    
    origUpdate.call(this, renderer);
    
    if (oldSse !== this.sseCur) {
      debugger.onSSEChange(f, oldSse, this.sseCur);
    }
    
    const newVis = new Set(this.sel.map(t => this.getTileId ? this.getTileId(t) : t));
    for (const id of oldVis) {
      if (!newVis.has(id)) {
        debugger.onVisibilityChange(f, { getTileId: () => id, ge: 0, state: 0 }, true, false, 'deselected');
      }
    }
    for (const id of newVis) {
      if (!oldVis.has(id)) {
        debugger.onVisibilityChange(f, { getTileId: () => id, ge: 0, state: 0 }, false, true, 'selected');
      }
    }

    debugger.onFrameSnapshot(f, {
      visibleCount: this.sel.length,
      loadedCount: this.loaded.size,
      pendingCount: this.queue.length,
      activeRequests: this.active,
      cachedBytes: this.bytes,
      texCount: this.texCount
    });
  };

  tileset.select = function(t, dist, f) {
    if (t.state !== 2) {
      debugger.onSelectedButUnloaded(f, t);
    }
    return origSelect.call(this, t, dist, f);
  };

  tileset.free = function(t) {
    debugger.onEviction(this.frame, t, 'cache-eviction');
    return origFree.call(this, t);
  };

  return debugger;
}
