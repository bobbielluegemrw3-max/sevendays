/**
 * race-canvas — 2.5D TV中継風レース描画 Web Component
 *
 * 視点: 実ワールド座標(m)を簡易ピンホール投影でcanvasに描く。
 *  - カメラ: 自動ディレクション(中継カット割り) / サイド / ゴール正面 / 俯瞰
 *  - 風景: 競馬場ごとのスカイライン・スタンド・内馬場(池/植栽)・季節/時間帯
 *  - 馬: プロシージャル側面スプライト(ギャロップアニメ・騎手勝負服・ゼッケン)
 *  - 馬名/騎手チップ・追い抜きフラッシュ・ミニマップ・芝キック粒子・桜吹雪
 * Events: 'tick'(~10Hz) / 'goal' / 'finished'
 */
(function () {
  "use strict";
  const E = () => window.KeibaEngine;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const STYLE_BG = { "逃げ": "#c0392b", "先行": "#c77f1e", "差し": "#2e7dad", "追込": "#7d4fb3" };

  function hexBlend(a, b, t) {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return "#" + pa.map((v, i) => Math.round(lerp(v, pb[i], t)).toString(16).padStart(2, "0")).join("");
  }

  // ───────── パレット(時間帯×季節) ─────────
  function makePalette(time, season) {
    if (time === "void") {
      // Seven Days Derby CHAMPION theme (ADR-011): black background, gold effect.
      const p = {
        skyTop: "#050409", skyMid: "#0a0714", skyBot: "#120c1e",
        sun: { fx: 0.5, fy: 0.1, r: 70, c: "rgba(242,228,191,0.16)", glow: "rgba(201,168,106,0.12)" },
        cloud: "rgba(201,168,106,0.05)",
        turfA: "#141020", turfB: "#100d1a", grass: "#0d0a16", apron: "#181226",
        rail: "#c9a86a", silhouette: "#0d0a16", silhouette2: "#120e1e",
        shadow: 0.5, warm: 0,
        tree: "#0d0a16",
      };
      p.treeDark = p.tree;
      return p;
    }
    const day = time !== "dusk";
    let p = day ? {
      skyTop: "#4f9be8", skyMid: "#9cc9f0", skyBot: "#dcecf9",
      sun: { fx: 0.78, fy: 0.16, r: 46, c: "rgba(255,255,244,0.95)", glow: "rgba(255,255,230,0.35)" },
      cloud: "rgba(255,255,255,0.88)",
      turfA: "#57ae69", turfB: "#4ba05d", grass: "#459a59", apron: "#7cab68",
      rail: "#f8f9fa", silhouette: "#8fb4d6", silhouette2: "#a9c8e2",
      shadow: 0.22, warm: 0,
    } : {
      skyTop: "#2b3568", skyMid: "#b96f55", skyBot: "#f4c07c",
      sun: { fx: 0.32, fy: 0.86, r: 60, c: "rgba(255,196,110,0.95)", glow: "rgba(255,150,70,0.4)" },
      cloud: "rgba(255,210,180,0.55)",
      turfA: "#4d9159", turfB: "#428450", grass: "#3d7d4b", apron: "#6d9159",
      rail: "#f3e9da", silhouette: "#4a4668", silhouette2: "#615a7e",
      shadow: 0.3, warm: 0.16,
    };
    p.tree = "#2f7f46";
    p.treeDark = hexBlend(p.tree, "#1a2a1a", 0.3);
    return p;
  }

  // ───────── カメラ ─────────
  function makeCam(ex, ey, ez, tx, ty, tz, f, w, h) {
    let fx = tx - ex, fy = ty - ey, fz = tz - ez;
    const fl = Math.hypot(fx, fy, fz) || 1e-6; fx /= fl; fy /= fl; fz /= fl;
    let rx = fz, rz = -fx;
    const rl = Math.hypot(rx, rz) || 1e-6; rx /= rl; rz /= rl;
    const ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;
    const cx = w / 2, cy = h * 0.46;
    return {
      ex, ey, ez, fx, fy, fz, f, cx, cy,
      proj(px, py, pz) {
        const dx = px - ex, dy = py - ey, dz = pz - ez;
        const zc = dx * fx + dy * fy + dz * fz;
        if (zc < 1.6) return null;
        return {
          x: cx + (dx * rx + dz * rz) * f / zc,
          y: cy - (dx * ux + dy * uy + dz * uz) * f / zc,
          s: f / zc, z: zc,
        };
      },
    };
  }

  // ───────── 群衆パターン ─────────
  function crowdPattern(seedShift) {
    const c = document.createElement("canvas"); c.width = 56; c.height = 56;
    const g = c.getContext("2d");
    g.fillStyle = "#383d48"; g.fillRect(0, 0, 56, 56);
    let s = 1234 + seedShift;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const cols = ["#d8c8b0", "#b86a5a", "#5a78a8", "#c9b458", "#7a9a6a", "#a8a8b8", "#d09a78", "#806a98"];
    for (let i = 0; i < 140; i++) {
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.globalAlpha = 0.3 + rnd() * 0.3;
      g.fillRect(rnd() * 56, rnd() * 56, 1.5, 2.0);
    }
    return c;
  }

  class RaceCanvas extends HTMLElement {
    connectedCallback() {
      if (!this._init) {
        this._init = true;
        this._build();
      }
      // 再接続時もループを必ず再起動(Reactの再配置で一度外れることがある)
      this._ro.observe(this);
      this._resize();
      cancelAnimationFrame(this._raf);
      this._last = performance.now();
      this._lastTickAt = performance.now();
      const loop = (now) => {
        this._raf = requestAnimationFrame(loop);
        this._lastTickAt = now;
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        try { this._update(dt); this._render(dt); } catch (e) {
          if (!this._errLogged) { this._errLogged = true; console.error("race-canvas render error:", e); }
        }
      };
      this._loopFn = loop;
      this._raf = requestAnimationFrame(loop);
      // ウォッチドッグ: rAFが止まっていたら再起動(要素の付け替え競合対策)
      clearInterval(this._watchdog);
      this._watchdog = setInterval(() => {
        if (!this.isConnected) return;
        const now = performance.now();
        if (now - this._lastTickAt > 450) {
          // rAFが抑制されている(非表示タブ等) → 直接描画で生存
          const dt = Math.min(0.05, (now - this._last) / 1000);
          this._last = now; this._lastTickAt = now;
          try { this._update(dt); this._render(dt); } catch (e) {}
          cancelAnimationFrame(this._raf);
          this._raf = requestAnimationFrame(this._loopFn);
        }
      }, 350);
    }
    _build() {
      this.style.cssText = "display:block;width:100%;height:100%;position:relative;overflow:hidden;background:#0c1220";
      this.cv = document.createElement("canvas");
      this.cv.style.cssText = "width:100%;height:100%;display:block";
      this.appendChild(this.cv);
      this.ctx = this.cv.getContext("2d");
      this.glcv = document.createElement("canvas");
      this.glcv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
      this.appendChild(this.glcv);
      this.fxcv = document.createElement("canvas");
      this.fxcv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
      this.appendChild(this.fxcv);
      this.fctx = this.fxcv.getContext("2d");
      this._tintEl = document.createElement("div");
      this._tintEl.style.cssText = "position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;display:none;background:linear-gradient(rgba(255,214,170,0.92),rgba(255,182,130,0.85))";
      this.appendChild(this._tintEl);
      this._three = { status: "init" };
      this._badges = [];
      // 3D馬モード(GLB)。falseで2Dプロシージャル馬
      this._use3DHorses = true;
      if (this._use3DHorses) this._initThree(); else this._three = { status: "disabled" };
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this);
      this._resize();

      this.race = null; this.t = -3; this.playing = false; this.speed = 1;
      this.digest = false; this.camMode = "auto"; this._camZoom = 1;
      this._showMiniMap = true;   // ミニマップ(コース図)表示。setMiniMap(false)で非表示(モバイルで映像優先)
      this.env = { time: "day", season: "spring" };
      this.pal = makePalette("day", "spring");
      this._ph = {}; this._rankPrev = {}; this._flash = {};
      this._particles = []; this._petals = []; this._trails = {};
      this._goalFlash = 0; this._goalFired = false; this._finFired = false;
      this._tickAcc = 0; this._trailAcc = 0;
      this._cam = null; this._camKind = "";
      this._crowdA = crowdPattern(0); this._crowdB = crowdPattern(99);
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      clearInterval(this._watchdog);
      if (this._ro) this._ro.disconnect();
    }
    _resize() {
      const r = this.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cv.width = Math.max(2, Math.round(r.width * dpr));
      this.cv.height = Math.max(2, Math.round(r.height * dpr));
      if (this.fxcv) { this.fxcv.width = this.cv.width; this.fxcv.height = this.cv.height; }
      if (this._three && this._three.renderer) this._three.renderer.setSize(this.cv.width, this.cv.height, false);
      this._dpr = dpr;
    }

    // ── 公開API ──
    loadRace(race, env) {
      this.race = race;
      this.track = race.venue.track;
      if (env) this.env = env;
      this._ensureGallop();
      this.pal = makePalette(this.env.time, this.env.season);
      this.t = -3; this.playing = false; this.speed = 1;
      this._goalFired = false; this._finFired = false; this._goalFlash = 0;
      this._ph = {}; this._rankPrev = {}; this._flash = {}; this._trails = {};
      this._particles = []; this._petals = [];
      race.horses.forEach((h) => { this._ph[h.num] = Math.random() * 6; this._trails[h.num] = []; });
      this._buildScenery();
      this._cam = null;
      if (this._tintEl) this._tintEl.style.display = this.env.time === "dusk" ? "block" : "none";
      this._syncHorses3D();
      this._buildTurf3D();
      this._syncThreeEnv();
    }
    start() { if (!this.race) return; this.t = -2.0; this.playing = true; }
    pause() { this.playing = false; }
    resume() { if (this.race) this.playing = true; }
    seek(t) { this.t = clamp(t, -2, this.race ? this.race.duration : 0); this._particles = []; }
    setSpeed(v) { this.speed = v; }
    setDigest(b) { this.digest = b; }
    setCamera(m) { this.camMode = m; }
    /** ミニマップ(コース図)表示のON/OFF。モバイルで映像を遮る場合に消す。 */
    setMiniMap(b) { this._showMiniMap = b; }
    /** カメラ寄り(near>1)/引き(far<1)。追走カメラの画角に乗算。 */
    setCamZoom(z) { this._camZoom = z; }
    setEnv(env) {
      this.env = { ...this.env, ...env };
      this.pal = makePalette(this.env.time, this.env.season);
      this._buildScenery();
      if (this._tintEl) this._tintEl.style.display = this.env.time === "dusk" ? "block" : "none";
      this._syncThreeEnv();
    }

    // ── 3D馬(three.js + GLB)。読めない環境では2D描画へ自動フォールバック ──
    async _initThree() {
      try {
        const [T, L, SKmod] = await Promise.all([
          import("https://cdn.jsdelivr.net/npm/three@0.161.0/+esm"),
          import("https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/GLTFLoader.js/+esm"),
          import("https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/utils/SkeletonUtils.js/+esm"),
        ]);
        const renderer = new T.WebGLRenderer({ canvas: this.glcv, alpha: true, antialias: true });
        renderer.setClearColor(0x000000, 0);
        // フィルム調トーン(平面的な“フィギュア感”を抑える)
        if (T.ACESFilmicToneMapping) { renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; }
        // 接地影は一切置かない(投影影もブロブ影も俯瞰で“足元の円”に見えるため)。
        renderer.shadowMap.enabled = false;
        const scene = new T.Scene();
        // 環境光は控えめにし、環境マップで自然なアンビエント反射を与える
        const hemi = new T.HemisphereLight(0xeaf2ff, 0x6a7d55, 0.9);
        const sun = new T.DirectionalLight(0xfff4e0, 1.9);
        sun.position.set(40, 120, 60);
        sun.castShadow = false;
        scene.add(hemi); scene.add(sun); scene.add(sun.target);
        // 環境マップ(RoomEnvironment)。GLTFが平面的に潰れる“プラスチック感”を低減。失敗しても3Dは継続。
        try {
          const envMod = await import("https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/environments/RoomEnvironment.js/+esm");
          const pmrem = new T.PMREMGenerator(renderer);
          scene.environment = pmrem.fromScene(new envMod.RoomEnvironment(), 0.04).texture;
        } catch (e) { /* 環境マップ無しでも続行 */ }
        const camera = new T.PerspectiveCamera(40, 1, 0.5, 4000);
        // 馬モデル(4頭=毛色違い)をローカルから読み込み。無ければ無料CDNにフォールバック。
        const loader = new L.GLTFLoader();
        // Draco圧縮glbの復号にDRACOLoaderが必須(無いと読み込み失敗→簡易馬にフォールバックしてしまう)
        try {
          const DR = await import("https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/DRACOLoader.js/+esm");
          const draco = new DR.DRACOLoader();
          draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
          loader.setDRACOLoader(draco);
        } catch (e) { console.warn("DRACOLoader unavailable:", e); }
        // 走り(gallop/run/canter)のうち、トラック数が最多=全身を動かす完全なクリップを選ぶ。
        // さらにroot/前進(_RM)の移動トラックを除去して“その場走り”にする(位置はトラック制御のため二重移動を防ぐ)。
        const pickClip = (clips) => {
          const m = clips.filter((c) => /gallop|run|canter|走/i.test(c.name));
          const pool = m.length ? m : clips;
          const clip = pool.slice().sort((a, b) => (b.tracks ? b.tracks.length : 0) - (a.tracks ? a.tracks.length : 0))[0];
          if (clip && clip.tracks) {
            clip.tracks = clip.tracks.filter((tr) => !/(^|[:.])(Root|root|Hips|hips)\.position$/.test(tr.name));
          }
          return clip;
        };
        const toModel = (g) => {
          // 高さ・接地は必ずジオメトリ実寸(bind pose)で統一する。
          // setFromObject はスキン/骨格を含み、モデルごとに暴れて“ミニ馬/地面潜り”の原因になる。
          let gMin = Infinity, gMax = -Infinity;
          g.scene.traverse((n) => {
            if ((n.isMesh || n.isSkinnedMesh) && n.geometry) {
              if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
              gMin = Math.min(gMin, n.geometry.boundingBox.min.y);
              gMax = Math.max(gMax, n.geometry.boundingBox.max.y);
            }
          });
          const gh = (gMax - gMin) || 1;
          const scale = 4.2 / gh; // 任意の単位を4.2の高さに正規化(全頭統一)
          return { scene: g.scene, clip: pickClip(g.animations || []), scale, feetY: -gMin * scale, hH: gh * scale };
        };
        let models;
        try {
          // 写実モデル(Holsteiner・鞍/頭絡付き・gallopアニメ)。単位差はtoModelで正規化。
          const g = await loader.loadAsync("/champions/keiba/models/holsteiner.glb");
          models = [toModel(g)];
        } catch (e1) {
          const g = await loader.loadAsync("https://threejs.org/examples/models/gltf/Horse.glb");
          models = [toModel(g)];
        }
        // Seven Days メタリックマスター(Manus納品 2026-07-08)。404でも3Dは
        // 継続し、従来のcanvas色替えにフォールバックする。
        const sdLoad = (src) => new Promise((res) => {
          const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
        });
        const [sdMetal, sdEmis, sdOrm, sdTack] = await Promise.all([
          sdLoad("/champions/keiba/tex/horse_coat_metal.webp"),
          sdLoad("/champions/keiba/tex/horse_coat_emissive.webp"),
          sdLoad("/champions/keiba/tex/horse_coat_orm.webp"),
          sdLoad("/champions/keiba/tex/tack_black_gold.webp"),
        ]);
        this._three = {
          status: "ready", T, SK: SKmod, renderer, scene, camera, hemi, sun,
          models, horses: new Map(),
          sd: { metal: sdMetal, emis: sdEmis, orm: sdOrm, tack: sdTack },
        };
        renderer.setSize(this.cv.width, this.cv.height, false);
        this._yawFix = 0; // 進行方向(接線)に正対(向き反転バグ修正)
        this._syncThreeEnv();
        this._syncHorses3D();
        this._buildTurf3D();
      } catch (e) {
        console.warn("3D horses unavailable; falling back to 2D:", e);
        this._three = { status: "failed" };
      }
    }
    _use3D() { return this._three && this._three.status === "ready"; }
    _drawNumChip(o, c) {
      if (c.ppm < 1.4) return;
      const k = clamp(c.ppm * 0.5, 0.6, 1.2) * this._dpr;
      const sz = 19 * k;
      const x = c.x - sz / 2, y = c.y - sz;
      o.save();
      o.globalAlpha = clamp((c.ppm - 1.2) / 4, 0.4, 0.95);
      o.fillStyle = c.wc;
      o.beginPath(); o.roundRect(x, y, sz, sz, 4 * k); o.fill();
      o.strokeStyle = c.waku === 1 ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.9)";
      o.lineWidth = 1.3 * k; o.stroke();
      o.fillStyle = c.wt;
      o.textAlign = "center"; o.textBaseline = "middle";
      o.font = "800 " + (12 * k) + "px 'Oswald', sans-serif";
      o.fillText(String(c.num), c.x, y + sz * 0.52);
      // 脚質カラーバー(逃=赤/先=橙/差=青/追=紫)
      o.fillStyle = c.stBg;
      o.beginPath(); o.roundRect(x, y + sz + 1.5 * k, sz, 3.4 * k, 1.7 * k); o.fill();
      o.restore();
    }
    _clearThree() {
      if (this._use3D()) { try { this._three.renderer.clear(); } catch (e) {} }
    }
    _zekkenTexture(T, h) {
      const c = document.createElement("canvas"); c.width = 96; c.height = 72;
      const g = c.getContext("2d");
      g.fillStyle = h.wakuColor; g.fillRect(0, 0, 96, 72);
      g.strokeStyle = h.waku === 1 ? "#888888" : "#ffffff"; g.lineWidth = 6; g.strokeRect(3, 3, 90, 66);
      g.fillStyle = h.wakuText; g.font = "800 46px Oswald, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(h.num), 48, 39);
      const tex = new T.CanvasTexture(c);
      // 出馬表(CSS)と全く同じ色合いにするため sRGB 指定(これが無いと暗く/くすむ)
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }
    /** 鹿毛ベースの馬体テクスチャをcanvasブレンドで色変換し、毛色ごとのテクスチャ配列を生成(一度だけ・キャッシュ)。 */
    _coatTextures(T, COATS, isCoatMesh) {
      const t = this._three;
      if (t._coatTex !== undefined) return t._coatTex;
      let baseMap = null;
      for (const m of t.models) {
        m.scene.traverse((n) => {
          if (baseMap || !(n.isMesh || n.isSkinnedMesh) || !isCoatMesh(n)) return;
          const mat = Array.isArray(n.material) ? n.material[0] : n.material;
          if (mat && mat.map && mat.map.image) baseMap = mat.map;
        });
        if (baseMap) break;
      }
      if (!baseMap || !baseMap.image) { t._coatTex = null; t._coatBaseMap = null; return null; }
      t._coatBaseMap = baseMap; // 馬体コート材質の識別用(目/たてがみ等を除外する)
      if (this.env && this.env.metallic && t.sd && t.sd.metal) {
        // Seven Days: Manusマスター(シアン基準)を 'hue' ブレンドで各馬の色相へ。
        // 明度・彩度(=ブラッシュメタルの質感)は保たれ、色相だけが変わる。
        const key = JSON.stringify(COATS.map((c) => c.hex || c.jp));
        if (t._coatKey === key && t._coatTex) return t._coatTex;
        const mk = (srcImg) => COATS.map((coat) => {
          const c = document.createElement("canvas");
          c.width = srcImg.width; c.height = srcImg.height;
          const g = c.getContext("2d");
          g.drawImage(srcImg, 0, 0);
          g.globalCompositeOperation = "hue";
          g.fillStyle = coat.hex || coat.hair || "#7de3ff";
          g.fillRect(0, 0, c.width, c.height);
          g.globalCompositeOperation = "source-over";
          const tex = new T.CanvasTexture(c);
          tex.colorSpace = baseMap.colorSpace; tex.flipY = baseMap.flipY;
          tex.wrapS = baseMap.wrapS; tex.wrapT = baseMap.wrapT;
          tex.anisotropy = baseMap.anisotropy || 1;
          tex.needsUpdate = true;
          return tex;
        });
        t._coatTex = mk(t.sd.metal);
        t._emisTex = t.sd.emis ? mk(t.sd.emis) : null;
        if (t.sd.orm && !t._ormTex) {
          const tex = new T.Texture(t.sd.orm); // linear(質感データ)
          tex.flipY = baseMap.flipY; tex.wrapS = baseMap.wrapS; tex.wrapT = baseMap.wrapT;
          tex.needsUpdate = true;
          t._ormTex = tex;
        }
        if (t.sd.tack && !t._tackTex) {
          const tex = new T.Texture(t.sd.tack);
          tex.colorSpace = baseMap.colorSpace; tex.flipY = baseMap.flipY;
          tex.wrapS = baseMap.wrapS; tex.wrapT = baseMap.wrapT;
          tex.needsUpdate = true;
          t._tackTex = tex;
        }
        t._coatKey = key;
        return t._coatTex;
      }
      const img = baseMap.image;
      const w = img.width || 1024, h = img.height || 1024;
      const out = COATS.map((coat) => {
        if (!coat.ops || !coat.ops.length) return baseMap; // 鹿毛=元テクスチャそのまま
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0, w, h);
        coat.ops.forEach(([mode, col]) => { g.globalCompositeOperation = mode; g.fillStyle = col; g.fillRect(0, 0, w, h); });
        g.globalCompositeOperation = "source-over";
        const tex = new T.CanvasTexture(c);
        tex.colorSpace = baseMap.colorSpace; tex.flipY = baseMap.flipY;
        tex.wrapS = baseMap.wrapS; tex.wrapT = baseMap.wrapT;
        tex.anisotropy = baseMap.anisotropy || 1;
        tex.needsUpdate = true;
        return tex;
      });
      t._coatTex = out;
      return out;
    }
    _syncHorses3D() {
      if (!this._use3D() || !this.race) return;
      const t = this._three, T = t.T;
      t.horses.forEach((o) => { t.scene.remove(o.root); });
      t.horses.clear();
      // Seven Days metallic: 馬はNFTスプライトで描く(GLB馬は出さない)。
      // 3Dはアリーナ(床・走路・レール・ゴール板)の描画に専念する。
      if (this.env && this.env.metallic) return;
      // JRA公式8毛色。鹿毛ベーステクスチャをcanvasブレンドで色変換して再現する。
      // ops: [合成モード, 色] を順に適用。saturation=彩度抜き, color=色相置換, multiply=暗化, screen=明化。
      // mul: テクスチャが取得できない時の乗算フォールバック。hair: たてがみ/尻尾の色(実在の毛色に準拠)。
      // 鹿毛系は黒いたてがみ・尾(墨/黒点)、栗毛は同系の亜麻色、芦毛/白毛は灰白。
      const COATS = [
        { jp: "鹿毛", ops: [], mul: [1.00, 0.93, 0.84], hair: "#1b140e" },                                  // 赤褐色・墨色の長毛
        { jp: "黒鹿毛", ops: [["multiply", "#8a6346"]], mul: [0.55, 0.45, 0.40], hair: "#171009" },          // 暗い鹿毛
        { jp: "青鹿毛", ops: [["multiply", "#4f3e34"]], mul: [0.40, 0.34, 0.31], hair: "#15100b" },          // 黒に近い茶
        { jp: "青毛", ops: [["saturation", "#808080"], ["multiply", "#2e2e2e"]], mul: [0.26, 0.25, 0.25], hair: "#131313" }, // ほぼ黒
        { jp: "栗毛", ops: [["color", "#b56424"], ["screen", "#341c08"]], mul: [1.35, 0.74, 0.40], hair: "#a96a32" },        // 赤金・亜麻色の長毛
        { jp: "栃栗毛", ops: [["color", "#7c3c14"]], mul: [0.95, 0.55, 0.34], hair: "#5e3414" },             // 暗い栗毛
        { jp: "芦毛", ops: [["saturation", "#808080"], ["screen", "#9c9c9c"]], mul: [1.7, 1.62, 1.55], hair: "#c2c2c2" },    // 灰・白系の長毛
        { jp: "白毛", ops: [["saturation", "#808080"], ["screen", "#dadada"]], mul: [2.0, 1.95, 1.9], hair: "#e4e4e4" },     // 白(希少)
      ];
      // 馬番ごとの毛色割当(鹿毛系を多め、芦毛/栗毛を散らし、青毛/白毛は1頭=現実的分布)
      let COAT_BY_NUM = [0, 1, 4, 0, 6, 1, 4, 3, 0, 5, 2, 6, 1, 7];
      // Seven Days Derby: env.metallic=true なら各馬の coat(hex) からクローム調
      // レシピを動的生成(彩度を抜いて色を乗せ、ハイライトを持ち上げる)。
      let METALLIC = null;
      if (this.env && this.env.metallic) {
        const hexMul = (hex) => {
          const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
          return [0.6 + r * 1.2, 0.6 + g * 1.2, 0.6 + b * 1.2];
        };
        METALLIC = this.race.horses.map((h) => ({
          jp: "metal",
          hex: h.coat,
          ops: [["saturation", "#808080"], ["color", h.coat], ["screen", "#3a3a44"]],
          mul: hexMul(h.coat),
          hair: h.coat,
        }));
        COAT_BY_NUM = this.race.horses.map((_, i) => i);
      }
      const isCoatMesh = (n) => /Horse_Holsteiner|HorseBody|Fur/i.test(n.name || "") || /HorseBody/i.test((n.geometry && n.geometry.name) || "");
      // たてがみ/尻尾。M_Hairはヘアー用データテクスチャ(ID/深度/根)を色に誤用し緑色化するため、単色の毛色へ置換する。
      const isHairMesh = (n) => /Mane|Tail|Braids/i.test(n.name || "");
      const coatTex = this._coatTextures(T, METALLIC || COATS, isCoatMesh);
      this.race.horses.forEach((h) => {
        const root = new T.Group();
        const m = t.models[(h.num - 1) % t.models.length];
        // スキン付きモデルは SkeletonUtils.clone でないと骨が壊れる。テクスチャはそのまま保持。
        const body = (t.SK && t.SK.clone) ? t.SK.clone(m.scene) : m.scene.clone(true);
        body.scale.setScalar(m.scale);
        body.position.y = m.feetY; // 足を地面(y=0)に
        const PALETTE = METALLIC || COATS;
        const coatIdx = COAT_BY_NUM[(h.num - 1) % COAT_BY_NUM.length] % PALETTE.length;
        const coat = PALETTE[coatIdx];
        body.traverse((n) => {
          if (n.isMesh || n.isSkinnedMesh) {
            n.frustumCulled = false;
            n.castShadow = false; // 接地影は廃止(足元の円対策)
            // 手綱(reins)と蹄鉄(horseshoes)は地面高の輪状メッシュで“足元の楕円の輪”の正体。
            // 手綱は別スケルトンで未アニメ、蹄鉄は薄い輪。どちらも細部なので非表示にする。
            if (/Reins|Horseshoe/i.test(n.name || "")) { n.visible = false; return; }
            const coatMesh = isCoatMesh(n);
            const hairMesh = isHairMesh(n);
            // 馬体は完全つや消し＋環境反射ほぼ無し(ツルツルしたプラスチック光沢を消す)。テクスチャ・毛色は保持。
            let mats = Array.isArray(n.material) ? n.material : (n.material ? [n.material] : []);
            // 馬体コート(元map=ベースコート)と、たてがみ/尻尾(M_Hair等)を毛色に合わせて個別着色。目/馬具は保持。
            if ((coatMesh || hairMesh) && mats.length) {
              const origMats = mats;
              mats = origMats.map((mat) => {
                const isBodyCoat = coatMesh && coatTex && mat.map && mat.map === t._coatBaseMap;
                const isFallbackCoat = coatMesh && !coatTex && mat.map; // テクスチャ取得不可時はmap有り材質を近似着色
                if (!isBodyCoat && !isFallbackCoat && !hairMesh) return mat; // 目/小物等は共有のまま
                const cl = mat.clone();
                if (isBodyCoat) {
                cl.map = coatTex[coatIdx];
                if (cl.color) cl.color.setRGB(1, 1, 1);
                if (METALLIC) {
                  // Seven Days メタリック: Manusマスターの発光/質感マップを適用
                  if (t._emisTex && t._emisTex[coatIdx]) {
                    cl.emissiveMap = t._emisTex[coatIdx];
                    if (cl.emissive) cl.emissive.setRGB(1, 1, 1);
                    cl.emissiveIntensity = 1.5;
                  }
                  if (t._ormTex) {
                    cl.roughnessMap = t._ormTex;
                    cl.metalnessMap = t._ormTex;
                    if ("metalness" in cl) cl.metalness = 1.0;
                    if ("roughness" in cl) cl.roughness = 1.0;
                  } else {
                    if ("metalness" in cl) cl.metalness = 0.85;
                    if ("roughness" in cl) cl.roughness = 0.28;
                  }
                  if ("envMapIntensity" in cl) cl.envMapIntensity = 2.2;
                }
              }
                else if (hairMesh) {
                  cl.map = null;
                  if (METALLIC) {
                    // Seven Days: たてがみ/尻尾はネオン発光(NFTの流れる鬣の同一性)
                    if (cl.color) cl.color.set("#0a0714");
                    if (cl.emissive) { cl.emissive.set(coat.hair); cl.emissiveIntensity = 2.2; }
                  } else if (cl.color) cl.color.set(coat.hair);
                } // 緑のデータテクスチャを外し自然な毛色に
                else if (cl.color) cl.color.setRGB(coat.mul[0], coat.mul[1], coat.mul[2]);
                return cl;
              });
              n.material = Array.isArray(n.material) ? mats : mats[0];
            } else if (METALLIC && t._tackTex && mats.length && mats.some((mat) => mat && /M_Tack/i.test(mat.name || ""))) {
              // 装具(鞍・頭絡等)を黒レザー×ゴールドのチャンピオン仕様に
              mats = mats.map((mat) => {
                if (!mat || !/M_Tack/i.test(mat.name || "")) return mat;
                const cl = mat.clone();
                cl.map = t._tackTex;
                if (cl.color) cl.color.setRGB(1, 1, 1);
                if ("metalness" in cl) cl.metalness = 0.4;
                if ("roughness" in cl) cl.roughness = 0.55;
                if ("envMapIntensity" in cl) cl.envMapIntensity = 1.0;
                return cl;
              });
              n.material = Array.isArray(n.material) ? mats : mats[0];
            }
            // 実馬モードのみ全材質をつや消し化(プラスチック光沢対策)。
            // メタリックモードではクローム反射が主役なので保持する。
            if (!METALLIC) mats.forEach((mat) => {
              if ("roughness" in mat) { mat.roughness = 1.0; mat.metalness = 0.0; mat.envMapIntensity = 0.0; mat.needsUpdate = true; }
            });
          }
        });
        let mixer = null;
        if (m.clip) {
          mixer = new T.AnimationMixer(body);
          const act = mixer.clipAction(m.clip);
          act.play();
          act.time = Math.random() * (m.clip.duration || 1); // 脚の位相をずらし揃いすぎを防ぐ
        }
        root.add(body);
        // ゼッケン(枠色+馬番)。鞍はモデル付属なので追加せず、ゼッケンのみ実寸(hH)基準で側面に配置。
        // rootの子=スケール非依存。rootは進行方向へ回転するので側面に密着する。
        const hH = m.hH || 4.2;
        // 接地影は廃止(投影影・ブロブ影とも“足元の円”に見えるため馬の下には何も置かない)。
        // toneMapped:false で ACESトーンマッピングを通さず、出馬表の枠色と完全一致させる
        const zmat = new T.MeshBasicMaterial({ map: this._zekkenTexture(T, h), toneMapped: false });
        [-1, 1].forEach((sgn) => {
          const z = new T.Mesh(new T.PlaneGeometry(hH * 0.22, hH * 0.17), zmat);
          z.position.set(sgn * hH * 0.16, hH * 0.45, 0);
          z.rotation.y = sgn * Math.PI / 2;
          root.add(z);
        });
        t.scene.add(root);
        // GPUへボーン行列を確実に反映させるため、スキンメッシュを保持し毎フレームskeleton.update()する
        const skinned = [];
        body.traverse((n) => { if (n.isSkinnedMesh && n.skeleton) skinned.push(n); });
        // 尻尾の骨(根→先)を保持。ギャロップに尻尾の動きが無いので走行中に揺れを後付けする。
        const tail = [];
        body.traverse((n) => { if (n.isBone && /tail[._]?\d/i.test(n.name)) tail.push(n); });
        tail.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        t.horses.set(h.num, { root, mixer, skinned, tail, tphase: Math.random() * 6.28 });
      });
    }
    _syncThreeEnv() {
      if (!this._use3D()) return;
      const t = this._three, dusk = this.env.time === "dusk";
      if (this.env.time === "void") {
        // Seven Days CHAMPION: 漆黒のアリーナに金のリムライト
        t.hemi.color.set(0xf2e4bf);
        if (t.hemi.groundColor) t.hemi.groundColor.set(0x0b0814);
        t.hemi.intensity = 0.8;
        t.sun.color.set(0xf2e4bf);
        t.sun.intensity = 1.9;
        return;
      }
      t.hemi.color.set(dusk ? 0xd8b9a0 : 0xeaf2ff);
      t.hemi.intensity = dusk ? 0.7 : 0.9;
      t.sun.color.set(dusk ? 0xffb070 : 0xfff4e0);
      t.sun.intensity = dusk ? 1.3 : 1.7;
    }
    _renderThree(dt) {
      const t = this._three, c = this._cam;
      if (!c || !this._S) { this._clearThree(); return; }
      const W = this.cv.width, H = this.cv.height;
      const cam = t.camera;
      cam.aspect = W / H;
      cam.fov = (2 * Math.atan(H / (2 * c.f))) * 180 / Math.PI;
      cam.position.set(c.ex, c.ey, c.ez);
      cam.up.set(0, 1, 0);
      cam.lookAt(c.tx, c.ty, c.tz);
      cam.updateProjectionMatrix();
      this._S.forEach((sm) => {
        const o = t.horses.get(sm.h.num);
        if (!o) return;
        const w = this.track.laneWorld(Math.min(sm.d, this.race.distance + 80), sm.l);
        o.root.position.set(w.x, 0, w.z);
        o.root.rotation.y = Math.atan2(w.tx, w.tz) + (this._yawFix || 0);
        if (o.mixer) o.mixer.update(dt * clamp(sm.v / 11, 0.04, 1.7));
        // 尻尾の揺れを後付け(mixer適用後に追加回転)。速度に応じて後方へ流れ+左右になびく。
        if (o.tail && o.tail.length) {
          const T2 = t.T;
          if (!this._tq) { this._tq = new T2.Quaternion(); this._te = new T2.Euler(); }
          const spd = clamp(sm.v / 15, 0, 1);
          for (let i = 0; i < o.tail.length; i++) {
            const ph = this.t * 5.5 + o.tphase + i * 0.7; // 先端へ波が伝わる位相差
            const sway = Math.sin(ph) * (0.05 + 0.10 * spd);          // 左右の揺れ
            const flow = (0.04 + 0.05 * spd) + Math.sin(ph * 0.6) * 0.03 * spd; // 後方への流れ+うねり
            this._te.set(flow, 0, sway);
            this._tq.setFromEuler(this._te);
            o.tail[i].quaternion.multiply(this._tq); // 元の尻尾姿勢に揺れを合成
          }
        }
        // ボーンの最新姿勢をGPUのボーンテクスチャへ確実に反映(matrixWorld更新→skeleton.update)
        if (o.skinned && o.skinned.length) {
          o.root.updateMatrixWorld(true);
          for (let i = 0; i < o.skinned.length; i++) o.skinned[i].skeleton.update();
        }
      });
      try { t.renderer.render(t.scene, cam); } catch (e) {
        if (!this._threeErr) { this._threeErr = true; console.error(e); this._three.status = "failed"; }
      }
    }

    /** 3Dの芝(地面・馬場リボン・ラチ・ゴール板)と接地影ディスクを構築。馬本体には触れない。 */
    _buildTurf3D() {
      const t = this._three;
      if (!t || t.status !== "ready" || !t.T || !this.track) return;
      const T = t.T, tr = this.track;
      if (t.turf) {
        t.scene.remove(t.turf);
        t.turf.traverse((n) => {
          if (n.geometry) n.geometry.dispose();
          if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => m.dispose());
        });
      }
      const g = new T.Group();
      // 芝ディテール(グレースケール)を一度だけ生成してキャッシュ。色は各マテリアル側で付ける。
      // 低コントラスト＆細かい粒で“きれいに刈り込まれた芝”に。斑点状の汚れを避ける。
      if (!t.grassImg) {
        const c = document.createElement("canvas"); c.width = 256; c.height = 256;
        const gx = c.getContext("2d");
        gx.fillStyle = "#c6c6c6"; gx.fillRect(0, 0, 256, 256);
        let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
        // 細かく低コントラストな粒(芝の質感)。範囲を狭め(196-228)・透明度も低めにして滑らかに。
        for (let i = 0; i < 14000; i++) { const v = 196 + Math.floor(rnd() * 32); gx.fillStyle = `rgb(${v},${v},${v})`; gx.globalAlpha = 0.22; gx.fillRect(rnd() * 256, rnd() * 256, 1, 1); }
        // ごく淡い芝目(短い毛先)
        gx.globalAlpha = 0.10;
        for (let i = 0; i < 1800; i++) { const x = rnd() * 256, y = rnd() * 256, h = 1.6 + rnd() * 2; gx.strokeStyle = rnd() < 0.5 ? "#dadada" : "#b0b0b0"; gx.lineWidth = 0.7; gx.beginPath(); gx.moveTo(x, y); gx.lineTo(x + (rnd() - 0.5) * 0.8, y - h); gx.stroke(); }
        gx.globalAlpha = 1;
        t.grassImg = c;
      }
      const mkTex = (rx, ry) => {
        const tx = new T.CanvasTexture(t.grassImg);
        tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.repeat.set(rx, ry);
        tx.anisotropy = 8; // 斜め視点での芝のボケ/モアレを軽減
        if (T.SRGBColorSpace) tx.colorSpace = T.SRGBColorSpace;
        return tx;
      };
      // 地面(内馬場/外周)+ 芝ディテール。VOID(Seven Days)はManusのアリーナ床。
      const V = this.env && this.env.time === "void";
      const sdTile = (key, src, rx, ry) => {
        if (!t[key]) {
          const tex = new T.TextureLoader().load(src);
          tex.wrapS = tex.wrapT = T.RepeatWrapping;
          tex.repeat.set(rx, ry);
          tex.anisotropy = 8;
          if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
          t[key] = tex;
        }
        return t[key];
      };
      const floorTex = V ? sdTile("_sdFloorTex", "/champions/keiba/tex/arena_floor_tile.webp", 500, 500) : null;
      const trackTex = V ? sdTile("_sdTrackTex", "/champions/keiba/tex/track_surface_tile.webp", 1, 1) : null;
      const ground = new T.Mesh(
        new T.PlaneGeometry(6000, 6000),
        V
          ? new T.MeshStandardMaterial({ color: 0xffffff, map: floorTex, roughness: 0.95, metalness: 0.02, envMapIntensity: 0.2 })
          : new T.MeshStandardMaterial({ color: 0x4f9255, map: mkTex(1400, 1400), roughness: 1, metalness: 0 }),
      );
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
      g.add(ground);
      // 馬場リボン(オーバルに沿うストリップ・刈り跡の縞=頂点カラー × 芝ディテール=map)
      const segs = 260, pos = [], col = [], idx = [], uv = [];
      // 明るめの縞(map=グレースケールで暗くなるぶんを見越して持ち上げ)
      const ca = V ? new T.Color(0x1c1530) : new T.Color(0x7fce86),
            cb = V ? new T.Color(0x171128) : new T.Color(0x74c07c);
      for (let i = 0; i <= segs; i++) {
        const s = (i / segs) * tr.lap, p = tr.pointAtS(s % tr.lap);
        pos.push(p.x + p.nx * (tr.width / 2), 0.02, p.z + p.nz * (tr.width / 2),
                 p.x - p.nx * (tr.width / 2), 0.02, p.z - p.nz * (tr.width / 2));
        const c = Math.floor(s / 14) % 2 ? ca : cb;
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        uv.push(0, s / 4, tr.width / 4, s / 4); // 芝ディテールを約4mタイルで
      }
      for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const rg = new T.BufferGeometry();
      rg.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      rg.setAttribute("color", new T.Float32BufferAttribute(col, 3));
      rg.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      rg.setIndex(idx); rg.computeVertexNormals();
      const trackMesh = new T.Mesh(
        rg,
        V
          ? new T.MeshStandardMaterial({ vertexColors: false, color: 0xffffff, map: trackTex, roughness: 0.92, metalness: 0.04, envMapIntensity: 0.25 })
          : new T.MeshStandardMaterial({ vertexColors: true, map: mkTex(1, 1), roughness: 1, metalness: 0 }),
      );
      trackMesh.receiveShadow = true;
      g.add(trackMesh);
      // ラチ(内・外)
      const railMat = V
        ? new T.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.25, metalness: 0.85, emissive: 0x5a4520, emissiveIntensity: 0.55 })
        : new T.MeshStandardMaterial({ color: 0xf3f5f8, roughness: 0.6 });
      [0.3, tr.width - 0.3].forEach((lane) => {
        const pts = [];
        for (let i = 0; i <= 220; i++) {
          const s = (i / 220) * tr.lap, p = tr.pointAtS(s % tr.lap), k = tr.width / 2 - lane;
          pts.push(new T.Vector3(p.x + p.nx * k, 0.12, p.z + p.nz * k));
        }
        g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 220, 0.1, 6, true), railMat));
      });
      // ゴール板(白帯)
      const D = this.race ? this.race.distance : tr.distance;
      const a1 = tr.laneWorld(D, -0.4), a2 = tr.laneWorld(D, tr.width + 0.4),
            a3 = tr.laneWorld(D - 1.0, tr.width + 0.4), a4 = tr.laneWorld(D - 1.0, -0.4);
      const fg = new T.BufferGeometry();
      fg.setAttribute("position", new T.Float32BufferAttribute(
        [a1.x, 0.035, a1.z, a2.x, 0.035, a2.z, a3.x, 0.035, a3.z, a4.x, 0.035, a4.z], 3));
      fg.setIndex([0, 1, 2, 0, 2, 3]); fg.computeVertexNormals();
      g.add(new T.Mesh(fg, new T.MeshStandardMaterial({ color: V ? 0xf2e4bf : 0xffffff, roughness: V ? 0.4 : 0.8 })));
      // 接地影は本物のシャドウマップで表現(フェイクディスクは廃止)
      t.scene.add(g); t.turf = g; t.shadows = null;
    }

    // ── 風景プリコンパイル ──
    _buildScenery() {
      const tr = this.track; if (!tr) return;
      const outer = (s, off) => {
        const p = tr.pointAtS(s);
        return { x: p.x - p.nx * (tr.width / 2 + off), z: p.z - p.nz * (tr.width / 2 + off) };
      };
      // スタンド(ホーム直線外側)
      this._stands = [];
      const segLen = 26;
      for (let s = -segLen; s < tr.straight + segLen; s += segLen) {
        this._stands.push({ s0: s, s1: s + segLen });
      }
      // 樹木(スタンド範囲外の外周 + 内馬場クラスタ)
      this._trees = [];
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let s = tr.straight + 60; s < tr.lap - 30; s += 24 + rnd() * 26) {
        const p = outer(s, 7 + rnd() * 9);
        this._trees.push({ x: p.x, z: p.z, h: 5.5 + rnd() * 3.5, r: 2.6 + rnd() * 1.6, pink: rnd() < 0.35 });
      }
      // 内馬場の池
      const c = tr.centroid, bm = tr.backMid;
      const pc = { x: lerp(c.x, bm.x, 0.42), z: lerp(c.z, bm.z, 0.42) };
      const mkPond = (cx, cz, rx, rz, rot) => {
        const pts = [];
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          const wob = 1 + Math.sin(a * 3 + 1) * 0.12;
          const x0 = Math.cos(a) * rx * wob, z0 = Math.sin(a) * rz * wob;
          pts.push({
            x: cx + x0 * Math.cos(rot) - z0 * Math.sin(rot),
            z: cz + x0 * Math.sin(rot) + z0 * Math.cos(rot),
          });
        }
        return pts;
      };
      const kind = this.race ? this.race.venue.pond : "large";
      this._ponds = [];
      if (kind === "twin") {
        this._ponds.push(mkPond(pc.x - 70, pc.z - 8, 52, 26, 0.2), mkPond(pc.x + 75, pc.z + 6, 44, 22, -0.15));
      } else if (kind === "large") {
        this._ponds.push(mkPond(pc.x, pc.z, 95, 40, 0.1));
      } else if (kind === "garden") {
        this._ponds.push(mkPond(pc.x - 15, pc.z, 48, 24, 0.12), mkPond(pc.x + 62, pc.z - 6, 18, 12, 0));
      } else {
        this._ponds.push(mkPond(pc.x, pc.z, 38, 20, 0));
      }
      // 内馬場の植栽
      this._infieldTrees = [];
      for (let i = 0; i < 14; i++) {
        const a = rnd() * Math.PI * 2, rr = 30 + rnd() * 60;
        this._infieldTrees.push({
          x: c.x + Math.cos(a) * rr * 1.6, z: c.z + Math.sin(a) * rr * 0.7,
          h: 4 + rnd() * 3, r: 2.2 + rnd() * 1.4, pink: rnd() < 0.4,
        });
      }
      // 広告ボード(ホームストレッチ外側ラチ沿い)
      this._adBoards = [];
      const adCols = ["#1e7d46", "#ffffff", "#1a4fa0", "#1e7d46", "#d8432f", "#ffffff"];
      let ai = 0;
      for (let s2 = 12; s2 < tr.straight - 14; s2 += 19, ai++) {
        this._adBoards.push({ s0: s2, s1: s2 + 14, c: adCols[ai % adCols.length] });
      }
      // ターフビジョン(内馬場・ホーム直線の向かい)
      this._vision = { s: tr.straight * 0.42 };
    }

    // ── 更新 ──
    _update(dt) {
      if (!this.race) return;
      const race = this.race;
      if (this.playing) {
        let sp = this.speed;
        if (this.digest && this.t > 0) {
          const lead = Math.max(...race.horses.map((h) => E().sampleAt(h, this.t).d));
          sp = (race.distance - lead) > 900 ? Math.max(this.speed, 2.6) : this.speed;
        }
        this.t += dt * sp;
        if (this.t >= race.duration) { this.t = race.duration; this.playing = false; }
      }
      const t = Math.max(0, this.t);
      // サンプル
      this._S = race.horses.map((h) => {
        const s = E().sampleAt(h, t);
        return { h, ...s, fin: t >= h.finishTime };
      });
      this._S.forEach((s) => {
        const moving = this.t >= 0 && s.v > 0.3;
        this._ph[s.h.num] += moving ? s.v * dt * this.speedFactor(0.85) : dt * 1.1;
      });
      const sorted = [...this._S].sort((a, b) => b.d - a.d);
      this._lead = sorted[0];
      this._order = sorted;
      this._rankIdx = {};
      sorted.forEach((s, i) => { this._rankIdx[s.h.num] = i; });
      // 追い抜き検出
      sorted.forEach((s, i) => {
        const prev = this._rankPrev[s.h.num];
        if (prev !== undefined && i < prev && this.t > 1 && !s.fin) this._flash[s.h.num] = this.t + 1.4;
        this._rankPrev[s.h.num] = i;
      });
      // ゴール
      if (!this._goalFired && this._lead.d >= race.distance && this.t > 0) {
        this._goalFired = true; this._goalFlash = 1;
        this.dispatchEvent(new CustomEvent("goal", { detail: { num: this._lead.h.num } }));
      }
      if (this._goalFlash > 0) this._goalFlash = Math.max(0, this._goalFlash - dt * 1.4);
      if (!this._finFired && this.t >= race.duration - 0.01) {
        this._finFired = true;
        this.dispatchEvent(new CustomEvent("finished", { detail: {} }));
      }
      // trail (俯瞰用)
      this._trailAcc += dt;
      if (this._trailAcc > 0.14) {
        this._trailAcc = 0;
        this._S.forEach((s) => {
          const w = this.track.laneWorld(Math.min(s.d, race.distance), s.l);
          const tr = this._trails[s.h.num];
          tr.push({ x: w.x, z: w.z });
          if (tr.length > 36) tr.shift();
        });
      }
      // tick イベント
      this._tickAcc += dt;
      if (this._tickAcc > 0.1) {
        this._tickAcc = 0;
        const leadD = this._lead.d;
        this.dispatchEvent(new CustomEvent("tick", {
          detail: {
            t, raw: this.t,
            remaining: Math.max(0, Math.round(race.distance - leadD)),
            goal: this._goalFired,
            order: sorted.map((s) => ({
              num: s.h.num, name: s.h.name, waku: s.h.waku,
              wakuColor: s.h.wakuColor, wakuText: s.h.wakuText,
              gap: (leadD - s.d) / 2.4, fin: s.fin, v: s.v,
            })),
          },
        }));
      }
      this._updateCamera(dt);
      this._updateParticles(dt);
    }
    speedFactor(x) { return x; }

    _updateCamera(dt) {
      const race = this.race, tr = this.track;
      const w = this.cv.width, h = this.cv.height;
      let kind, ex, ey, ez, tx, ty, tz, f;
      const lead = this._lead ? this._lead.d : 0;
      const packMid = this._order ? (this._order[0].d + this._order[Math.min(5, this._order.length - 1)].d) / 2 : 0;
      // Seven Days metallic: ヒーロー用の並走超接写カメラ。TV中継の引き画では
      // どんな絵でも豆粒になる — 先頭集団の真横数mを並走し、2〜3頭が画面の
      // 半分を占めるNFT原寸感で見せる(カット切替なしの安定ショット)。
      if (this.env && this.env.metallic) {
        const focus = clamp(packMid + 4, 6, race.distance + 40);
        const pw = tr.laneWorld(focus, tr.width * 0.5);
        // 外側(レール外)へ12m・高さ3.4mから、やや上向きに集団前方を見る。
        // 高め+上向き=手前の地面(最速で流れる帯)を画面から減らし、静止した
        // 背景パノラマの比率を上げて体感速度を抑える。
        // 走路の内側から外向きに構える: 最終直線で馬が左→右(ゴールへ前進)に
        // 見える向き。外側からだと右→左になり「後退感」が出る(2026-07-08)
        // 24m: 近いレーンの馬が巨大化してサイズが暴れる(=揺れ・文字への
        // 重なり)のを防ぐ距離。17mでは至近5mの馬が画面を食っていた
        ex = pw.x + pw.nx * 24; ey = 3.8; ez = pw.z + pw.nz * 24;
        const tgt = tr.laneWorld(focus + 2.5, tr.width * 0.45);
        tx = tgt.x; ty = 2.1; tz = tgt.z;
        f = Math.min(w * 0.92, h * 1.65) * (this._camZoom || 1);
        if (!this._cam || this._camKind !== "sdchase") {
          this._cam = { ex, ey, ez, tx, ty, tz, f };
        } else {
          const k = 1 - Math.exp(-4.5 * dt);
          const c = this._cam;
          c.ex = lerp(c.ex, ex, k); c.ey = lerp(c.ey, ey, k); c.ez = lerp(c.ez, ez, k);
          c.tx = lerp(c.tx, tx, k); c.ty = lerp(c.ty, ty, k); c.tz = lerp(c.tz, tz, k);
          c.f = lerp(c.f, f, k);
        }
        this._camKind = "sdchase";
        return;
      }
      const remaining = race.distance - lead;
      let mode = this.camMode;
      if (mode === "auto") {
        // 自動は中継らしく“横からの追走”を基本に。頭撃ちゴール(おもちゃ走り)は自動では使わない(手動「ゴール」には残す)。
        if (this.t < 0.2) mode = "gate";
        else mode = "side";
      }
      if (mode === "over") { this._camKind = "over"; return; }
      if (mode === "gate") {
        const p = tr.laneWorld(22, tr.width + 26);
        const tp = tr.laneWorld(0, tr.width * 0.4);
        kind = "gate"; ex = p.x; ey = 17; ez = p.z; tx = tp.x; ty = 1.5; tz = tp.z;
        f = Math.min(w * 1.15, h * 2.0);
      } else if (mode === "goal") {
        const p = tr.laneWorld(race.distance + 34, tr.width * 0.72);
        const tgt = tr.laneWorld(Math.min(lead, race.distance - 2) - 4, tr.width * 0.42);
        const distEye = Math.max(40, (race.distance + 34) - lead);
        kind = "goal"; ex = p.x; ey = 5.4; ez = p.z; tx = tgt.x; ty = 1.7; tz = tgt.z;
        f = clamp(0.07 * h * distEye, w, w * 3.6);
      } else {
        // サイド(中継)追走。直線では先頭に寄せ、低め+わずかにズームしてゴールを迫力に。
        const near = remaining <= tr.straight;
        const focus = near ? lerp(packMid, lead, 0.6) : packMid;
        const p = tr.laneWorld(focus - 4, tr.width + (near ? 30 : 36));
        const tgt = tr.laneWorld(focus + 2, tr.width * 0.4);
        kind = "side"; ex = p.x; ey = near ? 16 : 21; ez = p.z; tx = tgt.x; ty = 0.9; tz = tgt.z;
        f = Math.min(w * 1.15, h * 2.05) * (near ? 1.12 : 1);
      }
      f *= this._camZoom || 1; // 近/標準/遠
      if (!this._cam || this._camKind !== kind) {
        this._cam = { ex, ey, ez, tx, ty, tz, f };   // カット切替(スナップ)
      } else {
        const k = 1 - Math.exp(-3.2 * dt);
        const c = this._cam;
        c.ex = lerp(c.ex, ex, k); c.ey = lerp(c.ey, ey, k); c.ez = lerp(c.ez, ez, k);
        c.tx = lerp(c.tx, tx, k); c.ty = lerp(c.ty, ty, k); c.tz = lerp(c.tz, tz, k);
        c.f = lerp(c.f, f, k);
      }
      this._camKind = kind;
    }

    _updateParticles(dt) {
      // 芝キック
      const ps = this._particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.vy -= 16 * dt;
        if (p.life <= 0 || p.y < 0) ps.splice(i, 1);
      }
      if (this.t > 0 && this._S && ps.length < 220) {
        this._S.forEach((s) => {
          if (s.v > 13 && Math.random() < 0.5) {
            const w = this.track.laneWorld(s.d - 1.6, s.l + (Math.random() - 0.5));
            ps.push({
              x: w.x, z: w.z, y: 0.3 + Math.random() * 0.5,
              vx: -w.tx * (3 + Math.random() * 4) + (Math.random() - 0.5) * 2,
              vz: -w.tz * (3 + Math.random() * 4) + (Math.random() - 0.5) * 2,
              vy: 2.5 + Math.random() * 2.5, life: 0.5 + Math.random() * 0.4,
              c: Math.random() < 0.5 ? "#3f7a4b" : "#6b5a3a",
            });
          }
        });
      }

    }

    // ── 描画 ──
    _render(dt) {
      const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
      const fctx = this.fctx;
      this._badges = [];
      this._chips = [];
      if (fctx) fctx.clearRect(0, 0, this.fxcv.width, this.fxcv.height);
      if (!this.race) {
        ctx.fillStyle = "#0c1220"; ctx.fillRect(0, 0, W, H);
        this._clearThree();
        return;
      }
      const mode = this.camMode === "auto" ? this._camKind : this.camMode;
      const isPlan = mode === "over" || this.camMode === "over";
      if (isPlan) {
        this._renderPlan(ctx, W, H, false);
        this._clearThree();
      } else {
        this._renderPersp(ctx, W, H);
        if (this._use3D()) this._renderThree(dt); else this._clearThree();
      }
      const o = fctx || ctx;
      const oW = fctx ? this.fxcv.width : W, oH = fctx ? this.fxcv.height : H;
      if (!isPlan && this._showMiniMap !== false) this._renderMiniMap(o, oW, oH);
      // 宙に浮く馬番チップは廃止(馬体のゼッケンとLIVE順位で識別)
      // 予想印バッジ(◎○▲を打った馬のみ・前面レイヤーへ)
      (this._badges || []).forEach((b) => this._drawMarkBadge(o, b.num, b.x, b.y, b.ppm));
      // ゴールフラッシュ
      if (this._goalFlash > 0) {
        o.fillStyle = "rgba(255,255,255," + (this._goalFlash * 0.55).toFixed(3) + ")";
        o.fillRect(0, 0, oW, oH);
      }
      // ビネット
      const vg = o.createRadialGradient(oW / 2, oH / 2, Math.min(oW, oH) * 0.45, oW / 2, oH / 2, Math.max(oW, oH) * 0.72);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(4,10,24,0.26)");
      o.fillStyle = vg; o.fillRect(0, 0, oW, oH);
    }

    // ── 透視描画 ──
    _renderPersp(ctx, W, H) {
      const tr = this.track, race = this.race, pal = this.pal;
      const c = this._cam;
      if (!c) { ctx.fillStyle = pal.skyBot; ctx.fillRect(0, 0, W, H); return; }
      const cam = makeCam(c.ex, c.ey, c.ez, c.tx, c.ty, c.tz, c.f, W, H);

      // 地平線
      const fhx = cam.fx, fhz = cam.fz;
      const fl = Math.hypot(fhx, fhz) || 1e-6;
      const far = cam.proj(c.ex + (fhx / fl) * 5000, 0, c.ez + (fhz / fl) * 5000);
      const horizon = far ? clamp(far.y, H * 0.12, H * 0.7) : H * 0.34;

      // 3Dモードでは芝・コースは3Dジオメトリ(_buildTurf3D)が描く。空/雲/山/観客席は非表示でクリーンに。
      const is3D = this._use3D();
      const MET = this.env && this.env.metallic;
      if (is3D && MET) {
        // Seven Days: 2D層は透明のまま — 背面のManusアリーナパノラマ(サイバー
        // パンク遠景)を見せ、地面は3Dのアリーナ床が描く。
        ctx.clearRect(0, 0, W, H);
      } else if (is3D) {
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, "#1b2a32"); bg.addColorStop(0.55, "#22352f"); bg.addColorStop(1, "#1b2c28");
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      } else {
        // 空
        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, pal.skyTop); sky.addColorStop(0.62, pal.skyMid); sky.addColorStop(1, pal.skyBot);
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 2);
        // 太陽
        const sun = pal.sun;
        const sx = W * sun.fx, sy = horizon * sun.fy + (this.env.time === "dusk" ? horizon * 0.78 : 0);
        const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, sun.r * this._dpr * 2.6);
        sg.addColorStop(0, sun.c); sg.addColorStop(0.35, sun.glow); sg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sun.r * this._dpr * 2.6, 0, 7); ctx.fill();
        // 雲
        const yaw = Math.atan2(cam.fx, cam.fz);
        const par = -yaw * W * 0.35;
        ctx.fillStyle = pal.cloud;
        [[0.16, 0.3, 90], [0.45, 0.18, 130], [0.8, 0.4, 70], [1.1, 0.24, 110]].forEach(([fx2, fy2, r]) => {
          const cxp = ((fx2 * W + par) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2;
          const cyp = horizon * fy2;
          ctx.beginPath();
          ctx.ellipse(cxp, cyp, r * this._dpr, r * 0.32 * this._dpr, 0, 0, 7);
          ctx.ellipse(cxp + r * 0.6 * this._dpr, cyp + 6, r * 0.6 * this._dpr, r * 0.22 * this._dpr, 0, 0, 7);
          ctx.fill();
        });
        // 鳥
        ctx.strokeStyle = this.env.time === "dusk" ? "rgba(45,32,55,0.55)" : "rgba(55,75,100,0.5)";
        ctx.lineWidth = 1.4 * this._dpr;
        for (let bi = 0; bi < 3; bi++) {
          const bx = ((this._last * 0.009 * (1 + bi * 0.25) + bi * 340 + par * 0.5) % (W + 160) + (W + 160)) % (W + 160) - 80;
          const by = horizon * (0.2 + 0.14 * bi) + Math.sin(this._last * 0.001 + bi * 2) * 8 * this._dpr;
          const ww2 = (5 + bi) * this._dpr;
          const fl3 = Math.abs(Math.sin(this._last * 0.012 + bi)) * 3.5 * this._dpr;
          ctx.beginPath();
          ctx.moveTo(bx - ww2, by);
          ctx.quadraticCurveTo(bx - ww2 * 0.4, by - 3 * this._dpr - fl3, bx, by);
          ctx.quadraticCurveTo(bx + ww2 * 0.4, by - 3 * this._dpr - fl3, bx + ww2, by);
          ctx.stroke();
        }
        // スカイライン
        this._drawSkyline(ctx, W, horizon, par, race.venue.skyline, pal);
        // 地面
        const gg = ctx.createLinearGradient(0, horizon, 0, H);
        gg.addColorStop(0, hexBlend(pal.grass, pal.skyBot, 0.55));
        gg.addColorStop(0.18, pal.grass);
        gg.addColorStop(1, hexBlend(pal.grass, "#1c3a24", 0.25));
        ctx.fillStyle = gg; ctx.fillRect(0, horizon, W, H - horizon);
        // 池(平面)
        this._ponds.forEach((poly) => {
          const pts = poly.map((p) => cam.proj(p.x, 0, p.z));
          if (pts.some((p) => !p)) return;
          ctx.beginPath();
          pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
          ctx.closePath();
          ctx.fillStyle = this.env.time === "dusk" ? "#8d83ab" : "#6f9fc4";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.2 * this._dpr; ctx.stroke();
        });
        // 馬場リボン
        const focusD = this._lead ? clamp((this._order[0].d + this._order[this._order.length - 1].d) / 2, 0, race.distance + 60) : 0;
        const focusS = tr.raceToS(clamp(focusD, 0, race.distance));
        this._drawRibbon(ctx, cam, focusS);
        // ゴールライン(平面)
        this._drawFinishFlat(ctx, cam);
      }

      // 立体物を奥→手前で
      const bills = [];
      const camPos = { x: c.ex, z: c.ez };
      const zOf = (x, z) => (x - c.ex) * cam.fx + (z - c.ez) * cam.fz;
      // スタンド
      this._stands.forEach((sg2) => {
        const mid = this._outerPt((sg2.s0 + sg2.s1) / 2, 16);
        bills.push({ z: zOf(mid.x, mid.z), kind: "stand", o: sg2 });
      });
      // 樹木
      this._trees.concat(this._infieldTrees).forEach((t2) => {
        bills.push({ z: zOf(t2.x, t2.z), kind: "tree", o: t2 });
      });
      // ハロン棒
      for (let k = 1; k * 200 < race.distance; k++) {
        const d = race.distance - k * 200;
        const wpos = tr.laneWorld(d, -1.6);
        bills.push({ z: zOf(wpos.x, wpos.z), kind: "pole", o: { w: wpos, k } });
      }
      // 決勝柱
      const fin1 = tr.laneWorld(race.distance, -2.0), fin2 = tr.laneWorld(race.distance, tr.width + 2.0);
      bills.push({ z: zOf(fin1.x, fin1.z), kind: "finpole", o: { w: fin1, disc: false } });
      bills.push({ z: zOf(fin2.x, fin2.z), kind: "finpole", o: { w: fin2, disc: true } });
      // 広告ボード
      (this._adBoards || []).forEach((ad) => {
        const mid = this._outerPt((ad.s0 + ad.s1) / 2, 1.4);
        bills.push({ z: zOf(mid.x, mid.z), kind: "ad", o: ad });
      });
      // ターフビジョン
      if (this._vision) {
        const vp = tr.pointAtS(this._vision.s);
        const vo = tr.width / 2 + 10;
        bills.push({ z: zOf(vp.x + vp.nx * vo, vp.z + vp.nz * vo), kind: "vision", o: null });
      }
      // ゲート
      if (this.t < 5) {
        const g0 = tr.laneWorld(0, tr.width / 2);
        bills.push({ z: zOf(g0.x, g0.z), kind: "gate", o: null });
      }
      // 馬
      this._S.forEach((s) => {
        const wpos = tr.laneWorld(Math.min(s.d, race.distance + 80), s.l);
        bills.push({ z: zOf(wpos.x, wpos.z), kind: "horse", o: s, w: wpos });
      });
      // 粒子
      this._particles.forEach((p) => bills.push({ z: zOf(p.x, p.z), kind: "pt", o: p }));

      bills.sort((a, b) => b.z - a.z);
      const labels = [];
      bills.forEach((b) => {
        // 3D時は地上物(スタンド/木/ハロン棒/ゴール柱/広告/ビジョン/ゲート/粒子)は描かない。馬だけ補助描画。
        if (is3D && b.kind !== "horse") return;
        if (MET && (b.kind === "stand" || b.kind === "tree" || b.kind === "ad" || b.kind === "vision")) return; // Seven Days: 実競馬場の書き割りは出さない
        if ((b.kind === "stand" || b.kind === "tree") && b.z < 25) return; // カメラ至近は描かない
        if (b.kind === "stand") this._drawStand(ctx, cam, b.o);
        else if (b.kind === "tree") this._drawTree(ctx, cam, b.o);
        else if (b.kind === "pole") this._drawFurlong(ctx, cam, b.o);
        else if (b.kind === "finpole") this._drawFinPole(ctx, cam, b.o);
        else if (b.kind === "ad") this._drawAd(ctx, cam, b.o);
        else if (b.kind === "vision") this._drawVision(ctx, cam);
        else if (b.kind === "gate") { if (!(this.env && this.env.metallic)) this._drawGate(ctx, cam); }
        else if (b.kind === "pt") {
          const p = cam.proj(b.o.x, b.o.y, b.o.z);
          if (p) { ctx.fillStyle = b.o.c; ctx.globalAlpha = clamp(b.o.life * 1.6, 0, 0.8); ctx.fillRect(p.x, p.y, Math.max(1.5, p.s * 0.1), Math.max(1.5, p.s * 0.1)); ctx.globalAlpha = 1; }
        }
        else if (b.kind === "horse") {
          if (this.env && this.env.metallic) {
            // Seven Days: NFTスプライト経路(コマ未ロード中は描かない=フラッシュ防止)。
            // ⚠ キャンバスは3層(cv=2D背景 / glcv=3D / fxcv=最上)。cvに描くと
            // 3Dの床に隠れるため、スプライトはチップと同じ最上層(fctx)に描く。
            if (this._gallop) {
              const octx = this.fctx || ctx;
              this._drawSpriteHorse(octx, cam, b.o, b.w);
              const pj = cam.proj(b.w.x, 0, b.w.z);
              if (pj) {
                if ((this._flash[b.o.h.num] || 0) > this.t && pj.s > 3) {
                  octx.strokeStyle = "rgba(255,205,80,0.8)";
                  octx.lineWidth = Math.max(1.5, pj.s * 0.07);
                  octx.beginPath(); octx.ellipse(pj.x, pj.y + 0.04 * pj.s, 1.95 * pj.s, 0.34 * pj.s, 0, 0, 7); octx.stroke();
                }
                this._badges.push({ num: b.o.h.num, x: pj.x, y: pj.y, ppm: pj.s });
                const mk = this.race.marks;
                const marked = mk && (mk.tan === b.o.h.num || mk.ren === b.o.h.num || mk.san === b.o.h.num);
                if (!marked) {
                  this._chips.push({
                    num: b.o.h.num, x: pj.x, y: pj.y - 4.6 * pj.s, ppm: pj.s,
                    wc: b.o.h.wakuColor, wt: b.o.h.wakuText, waku: b.o.h.waku,
                    stBg: STYLE_BG[b.o.h.style] || "#888888",
                  });
                }
              }
            }
          } else if (this._use3D()) {
            const pj = cam.proj(b.w.x, 0, b.w.z);
            if (pj) {
              // 接地影は本物の3Dシャドウマップで描く。2Dの偽影楕円は廃止(足元の円形ノイズ除去)。
              // 追い抜き時のみ金色リングを2Dで重ねる(演出)。
              if ((this._flash[b.o.h.num] || 0) > this.t && pj.s > 3) {
                ctx.strokeStyle = "rgba(255,205,80,0.8)";
                ctx.lineWidth = Math.max(1.5, pj.s * 0.07);
                ctx.beginPath(); ctx.ellipse(pj.x, pj.y + 0.04 * pj.s, 1.95 * pj.s, 0.34 * pj.s, 0, 0, 7); ctx.stroke();
              }
              this._badges.push({ num: b.o.h.num, x: pj.x, y: pj.y, ppm: pj.s });
              // 馬番チップ(印のある馬はバッジが出るので省略)
              const mk = this.race.marks;
              const marked = mk && (mk.tan === b.o.h.num || mk.ren === b.o.h.num || mk.san === b.o.h.num);
              if (!marked) {
                this._chips.push({
                  num: b.o.h.num, x: pj.x, y: pj.y - 3.55 * pj.s, ppm: pj.s,
                  wc: b.o.h.wakuColor, wt: b.o.h.wakuText, waku: b.o.h.waku,
                  stBg: STYLE_BG[b.o.h.style] || "#888888",
                });
              }
            }
          } else {
            // metallic(Seven Days)モード: 3Dロード中は2Dスプライトを出さない
            // (読込完了と同時に3Dで登場させ、見た目の切替ショックを無くす)。
            const threeLoading = this.env && this.env.metallic &&
              this._three && (this._three.status === "init");
            if (!threeLoading) {
              const lbl = this._drawHorse(ctx, cam, b.o, b.w);
              if (lbl) labels.push(lbl);
            }
          }
        }
      });
      // ラベルチップ(最後にまとめて)
      labels.forEach((l) => this._drawChip(ctx, l));
      // レール(最前面に近い線として再ストローク済み: _drawRibbon内)
    }

    _outerPt(s, off) {
      const tr = this.track, p = tr.pointAtS(s);
      return { x: p.x - p.nx * (tr.width / 2 + off), z: p.z - p.nz * (tr.width / 2 + off), nx: p.nx, nz: p.nz };
    }

    _drawSkyline(ctx, W, horizon, par, kind, pal) {
      ctx.save();
      ctx.fillStyle = pal.silhouette;
      const base = horizon + 1;
      const span = W * 1.5;
      const xo = ((par % span) + span) % span - span * 0.25;
      if (kind === "fuji") {
        ctx.beginPath();
        ctx.moveTo(xo - 80, base);
        ctx.lineTo(xo + W * 0.18, base - horizon * 0.42);
        ctx.lineTo(xo + W * 0.23, base - horizon * 0.40);
        ctx.lineTo(xo + W * 0.28, base - horizon * 0.44);
        ctx.lineTo(xo + W * 0.52, base);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.moveTo(xo + W * 0.205, base - horizon * 0.355);
        ctx.lineTo(xo + W * 0.23, base - horizon * 0.40);
        ctx.lineTo(xo + W * 0.262, base - horizon * 0.36);
        ctx.lineTo(xo + W * 0.245, base - horizon * 0.30);
        ctx.lineTo(xo + W * 0.218, base - horizon * 0.31);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = pal.silhouette2;
        ctx.beginPath(); ctx.moveTo(xo + W * 0.5, base);
        ctx.quadraticCurveTo(xo + W * 0.72, base - horizon * 0.16, xo + W * 0.95, base);
        ctx.closePath(); ctx.fill();
      } else if (kind === "city") {
        for (let i = 0; i < 16; i++) {
          const bx = xo + i * W * 0.07, bw = W * (0.02 + (i % 4) * 0.008);
          const bh = horizon * (0.1 + ((i * 37) % 23) / 90);
          ctx.fillStyle = i % 2 ? pal.silhouette : pal.silhouette2;
          ctx.fillRect(bx, base - bh, bw, bh);
        }
      } else if (kind === "rokko") {
        [[0.0, 0.30, 0.55], [0.35, 0.38, 0.95], [0.7, 0.26, 1.3]].forEach(([fx, fh, fw], i) => {
          ctx.fillStyle = i % 2 ? pal.silhouette : pal.silhouette2;
          ctx.beginPath(); ctx.moveTo(xo + fx * W - W * 0.1, base);
          ctx.quadraticCurveTo(xo + fx * W + fw * W * 0.22, base - horizon * fh, xo + fx * W + fw * W * 0.5, base);
          ctx.closePath(); ctx.fill();
        });
      } else { // hills(京都)
        [[0.05, 0.2, 0.8], [0.5, 0.27, 1.0], [0.95, 0.18, 0.7]].forEach(([fx, fh, fw], i) => {
          ctx.fillStyle = i % 2 ? pal.silhouette2 : pal.silhouette;
          ctx.beginPath(); ctx.moveTo(xo + fx * W - fw * W * 0.4, base);
          ctx.quadraticCurveTo(xo + fx * W, base - horizon * fh, xo + fx * W + fw * W * 0.4, base);
          ctx.closePath(); ctx.fill();
        });
        // 塔
        ctx.fillStyle = pal.silhouette;
        ctx.fillRect(xo + W * 0.62, base - horizon * 0.3, W * 0.006, horizon * 0.3);
        ctx.beginPath(); ctx.moveTo(xo + W * 0.62 - 8, base - horizon * 0.3);
        ctx.lineTo(xo + W * 0.623, base - horizon * 0.36); ctx.lineTo(xo + W * 0.63, base - horizon * 0.3);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    _drawRibbon(ctx, cam, focusS) {
      const tr = this.track, pal = this.pal;
      const lap = tr.lap;
      // セグメントリスト(近傍4m / 遠方14m)
      const segs = [];
      let s = 0;
      while (s < lap) {
        let dd = Math.abs(((s - focusS) % lap + lap) % lap);
        dd = Math.min(dd, lap - dd);
        const step = dd < 300 ? 5 : 16;
        segs.push([s, Math.min(s + step, lap)]);
        s += step;
      }
      const edge = (sv, lane) => {
        const p = tr.pointAtS(sv % lap);
        const off = tr.width / 2 - lane;
        return cam.proj(p.x + p.nx * off, 0, p.z + p.nz * off);
      };
      segs.forEach(([s0, s1]) => {
        const a = edge(s0, -0.4), b2 = edge(s0, tr.width + 0.4);
        const c2 = edge(s1, tr.width + 0.4), d2 = edge(s1, -0.4);
        if (!a || !b2 || !c2 || !d2) return;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y);
        ctx.closePath();
        ctx.fillStyle = Math.floor(s0 / 14) % 2 ? pal.turfA : pal.turfB;
        ctx.fill();
      });
      // 内ラチ沿いの蹄跡(走破ライン)
      for (let sv = focusS - 200; sv < focusS + 260; sv += 9) {
        const ss = ((sv % lap) + lap) % lap;
        const a2 = edge(ss, 0.5), b3 = edge(ss, 2.0);
        const c3 = edge((ss + 9.5) % lap, 2.0), d3 = edge((ss + 9.5) % lap, 0.5);
        if (!a2 || !b3 || !c3 || !d3) continue;
        ctx.beginPath();
        ctx.moveTo(a2.x, a2.y); ctx.lineTo(b3.x, b3.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(d3.x, d3.y);
        ctx.closePath();
        ctx.fillStyle = "rgba(55,75,38,0.16)";
        ctx.fill();
      }
      // ラチ(内外) — 全周ポリライン
      [-0.6, tr.width + 0.6].forEach((lane, li) => {
        ctx.beginPath();
        let started = false;
        for (let sv = 0; sv <= lap; sv += 8) {
          const p = tr.pointAtS(sv % lap);
          const off = tr.width / 2 - lane;
          const pr = cam.proj(p.x + p.nx * off, 0.9, p.z + p.nz * off);
          if (!pr) { started = false; continue; }
          if (!started) { ctx.moveTo(pr.x, pr.y); started = true; }
          else ctx.lineTo(pr.x, pr.y);
        }
        ctx.strokeStyle = pal.rail;
        ctx.lineWidth = 1.4 * this._dpr;
        ctx.stroke();
      });
      // 近傍のラチ支柱
      for (let sv = focusS - 160; sv < focusS + 260; sv += 9) {
        [-0.6, tr.width + 0.6].forEach((lane) => {
          const p = tr.pointAtS(((sv % lap) + lap) % lap);
          const off = tr.width / 2 - lane;
          const b1 = cam.proj(p.x + p.nx * off, 0, p.z + p.nz * off);
          const t1 = cam.proj(p.x + p.nx * off, 0.9, p.z + p.nz * off);
          if (!b1 || !t1 || b1.s < 1.2) return;
          ctx.strokeStyle = pal.rail;
          ctx.lineWidth = Math.max(1, b1.s * 0.05);
          ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
        });
      }
    }

    _drawFinishFlat(ctx, cam) {
      const tr = this.track, D = this.race.distance;
      const a = (l) => { const w = tr.laneWorld(D, l); return cam.proj(w.x, 0.02, w.z); };
      const b = (l) => { const w = tr.laneWorld(D + 1.1, l); return cam.proj(w.x, 0.02, w.z); };
      const p1 = a(-0.4), p2 = a(tr.width + 0.4), p3 = b(tr.width + 0.4), p4 = b(-0.4);
      if (!p1 || !p2 || !p3 || !p4) return;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
      ctx.closePath(); ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fill();
    }

    _drawStand(ctx, cam, sg) {
      const tr = this.track, pal = this.pal;
      const pA = this._outerPt(sg.s0, 8), pB = this._outerPt(sg.s1, 8);
      const bA = cam.proj(pA.x, 0, pA.z), bB = cam.proj(pB.x, 0, pB.z);
      const tA = cam.proj(pA.x, 11, pA.z), tB = cam.proj(pB.x, 11, pB.z);
      if (!bA || !bB || !tA || !tB) return;
      ctx.save();
      ctx.globalAlpha = clamp(1.2 - bA.z / 850, 0.3, 1);
      // 観客面
      ctx.beginPath();
      ctx.moveTo(bA.x, bA.y); ctx.lineTo(bB.x, bB.y); ctx.lineTo(tB.x, tB.y); ctx.lineTo(tA.x, tA.y);
      ctx.closePath();
      const cheer = this.race && this._lead && (this.race.distance - this._lead.d) < 500;
      ctx.fillStyle = "#41464f"; ctx.fill();
      ctx.save(); ctx.clip();
      const pat = ctx.createPattern(cheer && Math.floor(this.t * 6) % 2 ? this._crowdB : this._crowdA, "repeat");
      const k = clamp(bA.s * 0.14, 0.5, 3.5); // 近いほど粗く(遠近感)
      ctx.scale(k, k);
      ctx.fillStyle = pat;
      const minx = Math.min(bA.x, bB.x, tA.x, tB.x) / k, miny = Math.min(tA.y, tB.y) / k;
      ctx.fillRect(minx, miny, (Math.abs(bB.x - bA.x) + 80) / k, (Math.abs(Math.max(bA.y, bB.y) - miny * k) + 40) / k);
      ctx.restore();
      // 白い手すり段
      for (let i = 1; i <= 3; i++) {
        const f = i / 4;
        ctx.strokeStyle = "rgba(235,238,242,0.55)";
        ctx.lineWidth = 1 * this._dpr;
        ctx.beginPath();
        ctx.moveTo(lerp(bA.x, tA.x, f), lerp(bA.y, tA.y, f));
        ctx.lineTo(lerp(bB.x, tB.x, f), lerp(bB.y, tB.y, f));
        ctx.stroke();
      }
      // 屋根
      const rA = this._outerPt(sg.s0, 30), rB = this._outerPt(sg.s1, 30);
      const rA2 = cam.proj(rA.x, 14.5, rA.z), rB2 = cam.proj(rB.x, 14.5, rB.z);
      if (rA2 && rB2) {
        ctx.beginPath();
        ctx.moveTo(tA.x, tA.y); ctx.lineTo(tB.x, tB.y); ctx.lineTo(rB2.x, rB2.y); ctx.lineTo(rA2.x, rA2.y);
        ctx.closePath();
        ctx.fillStyle = this.env.time === "dusk" ? "#cbb49a" : "#e3e8ee";
        ctx.fill();
        ctx.strokeStyle = "rgba(120,130,145,0.6)"; ctx.lineWidth = 1; ctx.stroke();
        // 屋根の旗(揺れる)
        if (bA.s > 1.6) {
          for (let fi = 0; fi < 2; fi++) {
            const fW = this._outerPt(sg.s0 + (sg.s1 - sg.s0) * (0.25 + fi * 0.5), 30);
            const fb = cam.proj(fW.x, 14.5, fW.z), ft = cam.proj(fW.x, 16.6, fW.z);
            if (!fb || !ft) continue;
            ctx.strokeStyle = "#aab2bc"; ctx.lineWidth = Math.max(1, fb.s * 0.05);
            ctx.beginPath(); ctx.moveTo(fb.x, fb.y); ctx.lineTo(ft.x, ft.y); ctx.stroke();
            const wav = Math.sin(this.t * 3 + sg.s0 * 0.21 + fi * 2) * 0.35;
            ctx.fillStyle = fi % 2 ? "#d8432f" : "#1a4fa0";
            ctx.beginPath();
            ctx.moveTo(ft.x, ft.y);
            ctx.lineTo(ft.x + fb.s * (1.0 + wav), ft.y + fb.s * 0.3);
            ctx.lineTo(ft.x, ft.y + fb.s * 0.6);
            ctx.closePath(); ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    _drawTree(ctx, cam, t2) {
      const b = cam.proj(t2.x, 0, t2.z);
      const top = cam.proj(t2.x, t2.h, t2.z);
      if (!b || !top || b.s < 0.4) return;
      const pal = this.pal;
      const r = t2.r * b.s;
      if (r < 1) return;
      ctx.strokeStyle = "#5a4632";
      ctx.lineWidth = Math.max(1, b.s * 0.22);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(top.x, top.y + r * 0.5); ctx.stroke();
      ctx.fillStyle = pal.tree;
      ctx.beginPath(); ctx.arc(top.x, top.y, r, 0, 7); ctx.fill();
      ctx.fillStyle = hexBlend(pal.tree, "#cfe8b0", 0.22);
      ctx.beginPath(); ctx.arc(top.x - r * 0.3, top.y - r * 0.32, r * 0.55, 0, 7); ctx.fill();
    }

    _drawFurlong(ctx, cam, o) {
      const b = cam.proj(o.w.x, 0, o.w.z), t1 = cam.proj(o.w.x, 3.0, o.w.z);
      if (!b || !t1 || b.s < 1.6) return;
      ctx.strokeStyle = "#f2f2f2"; ctx.lineWidth = Math.max(1, b.s * 0.1);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
      ctx.fillStyle = "#d2332e";
      ctx.beginPath(); ctx.arc(t1.x, t1.y, Math.max(2, b.s * 0.34), 0, 7); ctx.fill();
      if (b.s > 7) {
        ctx.fillStyle = "#fff";
        ctx.font = `700 ${Math.max(8, b.s * 0.32)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(String(o.k), t1.x, t1.y + b.s * 0.12);
      }
    }

    _drawFinPole(ctx, cam, o) {
      const w = o.w;
      const b = cam.proj(w.x, 0, w.z), t1 = cam.proj(w.x, 4.6, w.z);
      if (!b || !t1 || b.s < 1.2) return;
      const lw = Math.max(1.5, b.s * 0.16);
      const n = 6;
      for (let i = 0; i < n; i++) {
        ctx.strokeStyle = i % 2 ? "#e2342f" : "#ffffff";
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(lerp(b.x, t1.x, i / n), lerp(b.y, t1.y, i / n));
        ctx.lineTo(lerp(b.x, t1.x, (i + 1) / n), lerp(b.y, t1.y, (i + 1) / n));
        ctx.stroke();
      }
      if (o.disc) {
        // ゴール板(白縁の赤円盤)
        const r2 = Math.max(3, b.s * 0.55);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(t1.x, t1.y - r2 * 0.7, r2, 0, 7); ctx.fill();
        ctx.fillStyle = "#e2342f";
        ctx.beginPath(); ctx.arc(t1.x, t1.y - r2 * 0.7, r2 * 0.66, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = "#e2342f";
        ctx.beginPath(); ctx.arc(t1.x, t1.y, lw * 1.5, 0, 7); ctx.fill();
      }
    }

    /** ラチ沿いの広告ボード */
    _drawAd(ctx, cam, o) {
      const tr = this.track;
      const e = (s2, h2) => {
        const p = tr.pointAtS(((s2 % tr.lap) + tr.lap) % tr.lap);
        const off = tr.width / 2 + 1.4;
        return cam.proj(p.x - p.nx * off, h2, p.z - p.nz * off);
      };
      const a = e(o.s0, 0.15), b = e(o.s1, 0.15), c = e(o.s1, 1.25), d = e(o.s0, 1.25);
      if (!a || !b || !c || !d || a.s < 1) return;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fillStyle = o.c; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = Math.max(1, a.s * 0.045); ctx.stroke();
      if (a.s > 4.5) {
        // 文字風の帯
        ctx.strokeStyle = o.c === "#ffffff" ? "rgba(30,100,65,0.65)" : "rgba(255,255,255,0.7)";
        ctx.lineWidth = Math.max(1.2, a.s * 0.3);
        const my = (a.y + d.y) / 2, my2 = (b.y + c.y) / 2;
        ctx.beginPath();
        ctx.moveTo(lerp(a.x, b.x, 0.16), lerp(my, my2, 0.16));
        ctx.lineTo(lerp(a.x, b.x, 0.6), lerp(my, my2, 0.6));
        ctx.stroke();
      }
    }

    /** ターフビジョン(大型映像装置) */
    _drawVision(ctx, cam) {
      const tr = this.track;
      const sC = this._vision.s;
      const pt = (off) => {
        const p = tr.pointAtS(((sC + off) % tr.lap + tr.lap) % tr.lap);
        const o2 = tr.width / 2 + 10;
        return { x: p.x + p.nx * o2, z: p.z + p.nz * o2 };
      };
      const a = pt(-9), b = pt(9);
      const c1 = cam.proj(a.x, 3.2, a.z), c2 = cam.proj(b.x, 3.2, b.z);
      const c3 = cam.proj(b.x, 12, b.z), c4 = cam.proj(a.x, 12, a.z);
      if (!c1 || !c2 || !c3 || !c4) return;
      [a, b].forEach((p2) => { // 支柱
        const b1 = cam.proj(p2.x, 0, p2.z), t1 = cam.proj(p2.x, 3.2, p2.z);
        if (b1 && t1) {
          ctx.strokeStyle = "#6a7280"; ctx.lineWidth = Math.max(1.5, b1.s * 0.18);
          ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
        }
      });
      const face = () => {
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
        ctx.closePath();
      };
      face(); ctx.fillStyle = "#0e141d"; ctx.fill();
      ctx.strokeStyle = "#c9d2dc"; ctx.lineWidth = Math.max(1.5, c1.s * 0.45); ctx.stroke();
      const sc2 = c1.s;
      if (sc2 > 1.1) {
        face(); ctx.save(); ctx.clip();
        const cx2 = (c1.x + c3.x) / 2, cy2 = (c1.y + c3.y) / 2;
        const gl = ctx.createLinearGradient(c4.x, c4.y, c1.x, c1.y);
        gl.addColorStop(0, "rgba(60,220,160,0.2)"); gl.addColorStop(1, "rgba(20,80,140,0.18)");
        ctx.fillStyle = gl; ctx.fillRect(Math.min(c1.x, c4.x) - 50, Math.min(c4.y, c3.y) - 30, Math.abs(c2.x - c1.x) + 100, Math.abs(c1.y - c4.y) + 60);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#eaf6ef";
        ctx.font = "700 " + Math.max(8, sc2 * 2.4) + "px 'Oswald', sans-serif";
        const rem = this.race && this._lead ? Math.max(0, Math.round(this.race.distance - this._lead.d)) : null;
        if (rem !== null && this.t > 0) {
          ctx.fillText("残り " + rem + "m", cx2, cy2 - sc2 * 1.1);
          ctx.fillStyle = "#ffd75e";
          ctx.font = "700 " + Math.max(7, sc2 * 1.6) + "px 'Zen Kaku Gothic New', sans-serif";
          ctx.fillText(this.race.pace + "ペース", cx2, cy2 + sc2 * 1.7);
        } else {
          ctx.fillText("TURF VISION", cx2, cy2);
        }
        ctx.restore();
      }
    }

    /**
     * Seven Days: NFTギャロップ連続画(Manus納品12コマ)のプリロード。
     * metallicモードの馬はGLBではなくこのスプライトで描く(=NFTそのものが走る)。
     */
    _ensureGallop() {
      if (this._gallopReq || !(this.env && this.env.metallic)) return;
      this._gallopReq = true;
      // 3タイプ納品(2026-07-08): NFTアーキタイプ v2/v3/v4 × 12コマ ×
      // coat(色相回転する層)+gold(金装甲・回転しない層)
      const ARCHS = ["v2", "v3", "v4"];
      this._gallopSets = {};
      let loaded = 0;
      const NEED = ARCHS.length * 12;
      ARCHS.forEach((arch) => {
        const coats = new Array(12).fill(null);
        const golds = new Array(12).fill(null);
        this._gallopSets[arch] = { coats, golds };
        for (let i = 1; i <= 12; i++) {
          const idx = i - 1;
          const nn = String(i).padStart(2, "0");
          const coat = new Image();
          coat.onload = () => {
            loaded += 1;
            if (loaded === NEED) this._gallop = true; // 全タイプ準備完了ゲート
          };
          coat.onerror = () => { /* 1枚でも欠けたらGLB経路のまま */ };
          coat.src = "/champions/keiba/tex/gallop_" + arch + "_" + nn + "_coat.webp";
          coats[idx] = coat;
          const gold = new Image();
          gold.onerror = () => { golds[idx] = null; };
          gold.src = "/champions/keiba/tex/gallop_" + arch + "_" + nn + "_gold.webp";
          golds[idx] = gold;
        }
      });
    }
    /**
     * 馬ごとの色付き連続画を事前ベイク(384px)。'hue'合成で色相だけ差し替え
     * (質感=明度/彩度は保持)、destination-inで透過を復元する。
     * ctx.filterのhue-rotateは環境依存で効かないことがあるため使わない。
     */
    _spriteFramesFor(h) {
      if (!this._gallop || !this._gallopSets) return null;
      const set = this._gallopSets[h.arch] || this._gallopSets.v2;
      if (!set) return null;
      if (!this._spriteCache) this._spriteCache = new Map();
      const key = h.num + ":" + (h.coat || "") + ":" + (h.arch || "v2") + ":" + (h.coatDeg ?? "x");
      let baked = this._spriteCache.get(key);
      if (baked) return baked;
      const S = 512;
      // 着色はNFTアート(NftHorseArt)と同一: 真HSVの色相回転。マスター(シアン
      // ≈190°)から各馬の色相への差分だけ回す。彩度・明度=絵の質感は不変なので
      // 「NFTと同じ発色」になる。hue/color合成の即席着色は廃止(2026-07-08)。
      // NFTカードと完全同一の回転: 承認済みbodyDeg(12角度)をそのまま使う。
      // 独自hex→絶対色相の変換は公式576ルック外の色を作るため廃止(2026-07-08)。
      let rotDeg;
      if (Number.isFinite(h.coatDeg)) {
        rotDeg = ((h.coatDeg % 360) + 360) % 360;
      } else {
        const hex = h.coat || "#7de3ff";
        const hr = parseInt(hex.slice(1, 3), 16) / 255,
              hg = parseInt(hex.slice(3, 5), 16) / 255,
              hb = parseInt(hex.slice(5, 7), 16) / 255;
        const hmx = Math.max(hr, hg, hb), hmn = Math.min(hr, hg, hb), hd = hmx - hmn;
        let targetHue = 0;
        if (hd > 1e-6) {
          if (hmx === hr) targetHue = ((hg - hb) / hd) % 6;
          else if (hmx === hg) targetHue = (hb - hr) / hd + 2;
          else targetHue = (hr - hg) / hd + 4;
          targetHue *= 60; if (targetHue < 0) targetHue += 360;
        }
        rotDeg = ((targetHue - 190) % 360 + 360) % 360;
      }
      const rotNorm = rotDeg / 360;
      const bakeOne = (SZ) => set.coats.map((img, i) => {
        const c = document.createElement("canvas");
        c.width = SZ; c.height = SZ;
        const g = c.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(img, 0, 0, SZ, SZ);
        if (true) {
          const id = g.getImageData(0, 0, SZ, SZ);
          const d = id.data;
          for (let px = 0; px < d.length; px += 4) {
            if (d[px + 3] === 0) continue;
            const r = d[px] / 255, gg2 = d[px + 1] / 255, b = d[px + 2] / 255;
            const mx = Math.max(r, gg2, b), mn = Math.min(r, gg2, b), diff = mx - mn;
            if (diff < 1e-6) continue; // 無彩色(クローム)は回転不要
            let hh = 0;
            if (mx === r) hh = ((gg2 - b) / diff) % 6;
            else if (mx === gg2) hh = (b - r) / diff + 2;
            else hh = (r - gg2) / diff + 4;
            hh /= 6; if (hh < 0) hh += 1;
            let sat = mx > 1e-6 ? diff / mx : 0;
            // webp圧縮で眠くなった彩度を補正(NFT原画のくっきり感に寄せる)
            sat = Math.min(1, sat * 1.05);
            const v = mx;
            hh = (hh + rotNorm) % 1;
            const k = Math.floor(hh * 6) % 6;
            const f = hh * 6 - Math.floor(hh * 6);
            const p0 = v * (1 - sat), q0 = v * (1 - f * sat), t0 = v * (1 - (1 - f) * sat);
            let nr = v, ng = t0, nb = p0;
            if (k === 1) { nr = q0; ng = v; nb = p0; }
            else if (k === 2) { nr = p0; ng = v; nb = t0; }
            else if (k === 3) { nr = p0; ng = q0; nb = v; }
            else if (k === 4) { nr = t0; ng = p0; nb = v; }
            else if (k === 5) { nr = v; ng = p0; nb = q0; }
            d[px] = Math.round(nr * 255); d[px + 1] = Math.round(ng * 255); d[px + 2] = Math.round(nb * 255);
          }
          // 体の半透明を固化(2026-07-08): 原画は画風として体に半透明部分を含む。
          // カードの暗背景では見えないが、レースでは背後の金レール等が透けて
          // 「滲み」に見える。中間アルファを不透明側へ増幅し、淡いたなびき
          // (α<40)だけソフトなまま残す。
          for (let px = 3; px < d.length; px += 4) {
            const a = d[px];
            if (a >= 60) d[px] = 255;                                   // 体=完全不透明(液体クローム対策)
            else if (a >= 25) d[px] = Math.min(255, Math.round(a * 2.5)); // 中間=強め固化
          }
          // 浮遊グリッチ線の除去(2026-07-08): 体・鬣・尻尾は一続きの連結成分、
          // 後方に散るグリッチ線は本体から切り離れた孤立島。最大成分(=馬本体)
          // 以外の小さな島を消す。NFTカードでは美しい線もレースではノイズになる
          // (オーナー指摘)。カード表示(NftHorseArt)は不変。
          {
            const Wp = SZ, Hp = SZ, N = Wp * Hp;
            const label = new Int32Array(N); // 0=未訪問
            const stack = new Int32Array(N);
            let nextLabel = 0, bestLabel = 0, bestSize = 0;
            const sizes = [0];
            for (let i0 = 0; i0 < N; i0++) {
              if (label[i0] !== 0 || d[i0 * 4 + 3] < 25) continue;
              nextLabel += 1;
              let sp = 0, size = 0;
              stack[sp++] = i0; label[i0] = nextLabel;
              while (sp > 0) {
                const i = stack[--sp];
                size += 1;
                const x = i % Wp, y = (i / Wp) | 0;
                if (x > 0 && label[i - 1] === 0 && d[(i - 1) * 4 + 3] >= 25) { label[i - 1] = nextLabel; stack[sp++] = i - 1; }
                if (x < Wp - 1 && label[i + 1] === 0 && d[(i + 1) * 4 + 3] >= 25) { label[i + 1] = nextLabel; stack[sp++] = i + 1; }
                if (y > 0 && label[i - Wp] === 0 && d[(i - Wp) * 4 + 3] >= 25) { label[i - Wp] = nextLabel; stack[sp++] = i - Wp; }
                if (y < Hp - 1 && label[i + Wp] === 0 && d[(i + Wp) * 4 + 3] >= 25) { label[i + Wp] = nextLabel; stack[sp++] = i + Wp; }
              }
              sizes.push(size);
              if (size > bestSize) { bestSize = size; bestLabel = nextLabel; }
            }
            for (let i = 0; i < N; i++) {
              const lb = label[i];
              if (lb !== 0 && lb !== bestLabel) d[i * 4 + 3] = 0; // 孤立島は消す
            }
          }
          g.putImageData(id, 0, 0);
        }
        // 金装甲レイヤーは回転させず不透明で重ねる(NFTのaccents層と同一思想。
        // 半透明重ねは他馬が透けるためやらない — オーナー指摘 2026-07-08)
        const gold = set.golds[i];
        if (gold && gold.complete && gold.naturalWidth) g.drawImage(gold, 0, 0, SZ, SZ);
        return c;
      });
      const hi = bakeOne(S);
      const lo = bakeOne(256);
      // 胴体の上下ジッター安定化(2026-07-08): AI生成コマは胴体高さが不規則に
      // ぶれる(=走りの違和感)。不透明画素の重心を測り、平均へ7割寄せる補正を
      // コマごとに持たせる(描画時に縦オフセット)。蹄の接地感を壊さない範囲。
      const dyNorm = hi.map((c) => {
        const g2 = c.getContext("2d");
        const dd = g2.getImageData(0, 0, c.width, c.height).data;
        let sum = 0, n = 0;
        for (let px = 3; px < dd.length; px += 4) {
          if (dd[px] >= 220) { sum += ((px - 3) / 4 / c.width) | 0; n++; }
        }
        return n ? sum / n / c.height : 0.5;
      });
      const meanCy = dyNorm.reduce((a, b) => a + b, 0) / dyNorm.length;
      const dy = dyNorm.map((cy) => (meanCy - cy) * 0.7);
      baked = { hi, lo, dy };
      this._spriteCache.set(key, baked);
      return baked;
    }
    /** NFT連続画ビルボード: 実レースエンジンの運動に載せて絵そのものを走らせる。 */
    _drawSpriteHorse(ctx, cam, s, w) {
      const mips = this._spriteFramesFor(s.h);
      if (!mips) return;
      const frames = mips.hi;
      const p = cam.proj(w.x, 0, w.z);
      if (!p || p.s < 0.8) return;
      const ppm = p.s;
      const w2 = this.track.laneWorld(Math.min(s.d, this.race.distance + 80) + 3, s.l);
      const p2 = cam.proj(w2.x, 0, w2.z);
      // 向きの決定: 投影失敗時に右向き固定へ落ちると「地面と逆に走る」瞬間が
      // 生まれる — 前回の向きを保持する(オーナー指摘 2026-07-08)
      if (!this._dirPrev) this._dirPrev = {};
      let dir;
      if (p2) {
        dir = p2.x < p.x ? -1 : 1;
        this._dirPrev[s.h.num] = dir;
      } else {
        dir = this._dirPrev[s.h.num] || 1;
      }
      // AI生成コマは1枚ごとに模様が揺れる(ボイリング)ため、切替を隣接コマの
      // クロスフェードで滑らかにする。コマ切替そのものが「本体が高速で描き
      // 直される」16倍速感の正体(オーナー観察 2026-07-08)。
      const strideM = this.env && Number.isFinite(this.env.strideM) && this.env.strideM > 0 ? this.env.strideM : 7;
      // ⚠ _ph は2D脚アニメ用に毎フレーム加算されるカウンタ(これを混ぜると
      // コマが毎描画2〜3枚跳んで全身が高速ストロボする — 実測で確認済み)。
      // 位相ずらしは馬番から決める固定値を使う。
      const phase = ((s.h.num * 0.618) % 1);
      const cyc = (s.d / strideM + phase) % 1;
      const fpos = ((cyc + 1) % 1) * frames.length;
      const f0 = Math.floor(fpos) % frames.length;
      // 画像内で馬体は約45%(鬣・余白込みの1024px正方)。セカンドゲームの看板と
      // してのインパクト優先で全高≈5.8m相当(オーナー指示 2026-07-08)
      const H = 5.8 * ppm;
      const FEET = 0.92;     // 接地基準(納品仕様: 下端から8%)
      // 接地影
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 1.6 * ppm, 0.26 * ppm, 0, 0, 7);
      ctx.fill();
      ctx.save();
      ctx.imageSmoothingQuality = "high";
      // 動きの滲み対策(2026-07-08): 位置は整数px・サイズは8px刻みに量子化。
      // サブピクセル移動+毎フレームの微小スケール変化が再サンプリング揺らぎ
      // (=動くと滲む)の正体。静止画が綺麗で動画が滲む場合はここ。
      // 上限=キャンバス高の62%: 至近の馬が画面とタイトルを覆い尽くさない
      const Hcap = (this.cv ? this.cv.height : 1200) * 0.62;
      const Hq = Math.max(48, Math.min(Math.round(H / 8) * 8, Math.round(Hcap / 8) * 8));
      const dyPix = mips.dy ? Math.round((mips.dy[f0] || 0) * Hq) : 0;
      ctx.translate(Math.round(p.x), Math.round(p.y) + dyPix);
      if (dir < 0) ctx.scale(-1, 1);
      // 遠い馬は256px版から縮小(512から一気に縮めると滲む)
      const srcSet = Hq < 300 ? mips.lo : mips.hi;
      ctx.drawImage(srcSet[f0], Math.round(-Hq / 2), Math.round(-Hq * FEET), Hq, Hq);
      ctx.restore();
    }
    _drawGate(ctx, cam) {
      const tr = this.track, race = this.race;
      const N = race.horses.length;
      const lane = (i) => 1.4 + (i / (N - 1)) * (tr.width - 4.5);
      // 上枠
      const top = [];
      for (let i = -1; i <= N; i++) {
        const l = i < 0 ? lane(0) - 1.4 : i >= N ? lane(N - 1) + 1.4 : lane(i);
        const w = tr.laneWorld(-0.8, l);
        const p = cam.proj(w.x, 2.6, w.z);
        if (p) top.push(p);
      }
      if (top.length > 1) {
        ctx.strokeStyle = "#3f9a4f"; ctx.lineWidth = Math.max(2, top[0].s * 0.3);
        ctx.beginPath();
        top.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.stroke();
      }
      // 各枠の支柱
      for (let i = 0; i < N; i++) {
        const w = tr.laneWorld(-0.8, lane(i) + 0.9);
        const b = cam.proj(w.x, 0, w.z), t1 = cam.proj(w.x, 2.6, w.z);
        if (!b || !t1) continue;
        ctx.strokeStyle = "#dde3e8"; ctx.lineWidth = Math.max(1, b.s * 0.08);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
      }
    }

    // ── 馬 ──
    // ギャロップ周期キーフレーム(マイブリッジの連続写真を参考にした回転襲歩)
    // [周期位置, 振り角(rad,+前方), 関節屈曲(rad)] / body: [周期位置, 体の上下(m,+下), 首の伸び(0..1)]
    _poseTables() {
      if (this._PT) return this._PT;
      this._PT = {
        front: [
          [0.00, -0.70, 0.25], [0.15, -0.50, 1.55], [0.30, 0.30, 2.05], [0.45, 0.85, 1.05],
          [0.55, 0.95, 0.22], [0.70, 0.45, 0.05], [0.85, -0.15, 0.10], [1.00, -0.70, 0.25],
        ],
        hind: [
          [0.00, 0.72, 0.50], [0.15, 0.30, 0.22], [0.30, -0.42, 0.15], [0.45, -0.95, 0.50],
          [0.60, -0.70, 1.45], [0.75, 0.10, 1.65], [0.90, 0.62, 0.95], [1.00, 0.72, 0.50],
        ],
        body: [
          [0.00, 0.030, 0.30], [0.20, 0.045, 0.55], [0.40, -0.020, 0.85], [0.55, -0.085, 1.00],
          [0.70, -0.045, 0.55], [0.85, 0.035, 0.15], [1.00, 0.030, 0.30],
        ],
      };
      return this._PT;
    }
    _kfEval(table, tIn) {
      let u = tIn % 1; if (u < 0) u += 1;
      for (let i = 1; i < table.length; i++) {
        if (u <= table[i][0]) {
          const a = table[i - 1], b = table[i];
          const f = (u - a[0]) / ((b[0] - a[0]) || 1);
          const out = [];
          for (let k = 1; k < a.length; k++) out.push(a[k] + (b[k] - a[k]) * f);
          return out;
        }
      }
      return table[0].slice(1);
    }

    _drawHorse(ctx, cam, s, w) {
      const p = cam.proj(w.x, 0, w.z);
      if (!p) return null;
      const ppm = p.s;
      if (ppm < 0.8) return null;
      const w2pos = this.track.laneWorld(Math.min(s.d, this.race.distance + 80) + 3, s.l);
      const p2 = cam.proj(w2pos.x, 0, w2pos.z);
      const dx = p2 ? p2.x - p.x : 1;
      const dir = dx >= 0 ? 1 : -1;
      const tilt = p2 ? clamp(Math.atan2(p2.y - p.y, Math.abs(dx)) * (dir), -0.22, 0.22) : 0;
      // カメラ視線と進行方向の内積: -1=こちらへ向かってくる
      const flh = Math.hypot(cam.fx, cam.fz) || 1e-6;
      const fd = (w.tx * cam.fx + w.tz * cam.fz) / flh;
      const ws = clamp(Math.sqrt(Math.max(0, 1 - fd * fd)) * 1.05, 0.42, 1);
      const ph = this._ph[s.h.num];
      const m = clamp(s.v / 5, 0, 1);
      const coat = s.h.coat;
      const coatD = hexBlend(coat, "#140b06", 0.45);
      const coatL = hexBlend(coat, "#ffeedd", 0.32);
      const dark = "#1a120c";
      const flashing = (this._flash[s.h.num] || 0) > this.t;
      const u = ph / 6.28318;
      const T = this._poseTables();
      const bodyKf = this._kfEval(T.body, u - 0.28);
      const bodyDy = lerp(Math.sin(ph * 0.5) * 0.012, bodyKf[0], m);
      const ext = lerp(0.3, bodyKf[1], m); // 首・体の伸び(サスペンション期=1)

      ctx.save();
      ctx.translate(p.x, p.y);
      // 影(伸びに合わせて長く)
      ctx.fillStyle = "rgba(8,14,8," + this.pal.shadow + ")";
      ctx.beginPath();
      ctx.ellipse(0, 0, (1.4 + ext * 0.3) * ppm * Math.max(ws, 0.55), 0.23 * ppm, 0, 0, 7);
      ctx.fill();
      // 追い抜きハイライト(金のリング)
      if (flashing && ppm > 3) {
        ctx.strokeStyle = "rgba(255,205,80,0.8)";
        ctx.lineWidth = Math.max(1.5, ppm * 0.07);
        ctx.beginPath(); ctx.ellipse(0, 0.04 * ppm, 1.7 * ppm, 0.3 * ppm, 0, 0, 7); ctx.stroke();
      }
      if (fd < -0.55 && ppm > 3) {
        // こちらへ向かってくる → 正面ビュー
        this._drawHorseFront(ctx, s, ppm, ph, m);
        ctx.restore();
        this._badges.push({ num: s.h.num, x: p.x, y: p.y, ppm });
        return null;
      }
      ctx.rotate(tilt * dir);
      ctx.scale(ppm * dir * ws, ppm);
      ctx.translate(0, bodyDy);
      ctx.lineCap = "round"; ctx.lineJoin = "round";

      // 3関節脚(肩/股→膝/飛節→球節→蹄)。面ポリゴン+接地IK
      const leg3 = (px2, py2, pose, near, isFront) => {
        const lens = isFront ? [0.52, 0.56, 0.26] : [0.56, 0.58, 0.26];
        const a1 = lerp(isFront ? 0.03 : -0.04, pose[0], m);
        const bend = lerp(0.06, pose[1], m);
        const a2 = a1 - bend;
        const a3 = a2 + bend * 0.38;
        const kx = px2 + Math.sin(a1) * lens[0], ky = py2 + Math.cos(a1) * lens[0];
        const fx2 = kx + Math.sin(a2) * lens[1], fy2 = ky + Math.cos(a2) * lens[1];
        let tx2 = fx2 + Math.sin(a3) * lens[2], ty2 = fy2 + Math.cos(a3) * lens[2];
        // 接地IK: スタンス期は蹄を地面まで届かせる(浮き防止)
        if (bend < 0.5 && ty2 < -0.04 && ty2 > -0.36) ty2 = -0.04;
        const col = near ? coat : coatD;
        const colEdge = near ? coatD : hexBlend(coatD, "#000000", 0.25);
        const sock = s.h.num % 3 === 1;
        // 腿の筋肉量(回転に追従)
        if (near) {
          ctx.save(); ctx.translate(px2, py2); ctx.rotate(a1);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.ellipse(0, lens[0] * 0.36, isFront ? 0.135 : 0.185, lens[0] * 0.5, 0, 0, 7);
          ctx.fill();
          ctx.restore();
        }
        // 先細りの脚シルエット
        const P = [[px2, py2], [kx, ky], [fx2, fy2], [tx2, ty2]];
        const Wd = isFront ? [0.115, 0.062, 0.047, 0.04] : [0.135, 0.068, 0.05, 0.04];
        const Lp = [], Rp = [];
        for (let i = 0; i < P.length; i++) {
          const pPrev = P[Math.max(0, i - 1)], pNext = P[Math.min(P.length - 1, i + 1)];
          let ddx = pNext[0] - pPrev[0], ddy = pNext[1] - pPrev[1];
          const dl = Math.hypot(ddx, ddy) || 1e-6; ddx /= dl; ddy /= dl;
          Lp.push([P[i][0] - ddy * Wd[i], P[i][1] + ddx * Wd[i]]);
          Rp.push([P[i][0] + ddy * Wd[i], P[i][1] - ddx * Wd[i]]);
        }
        ctx.beginPath();
        ctx.moveTo(Lp[0][0], Lp[0][1]);
        for (let i = 1; i < Lp.length; i++) ctx.lineTo(Lp[i][0], Lp[i][1]);
        for (let i = Rp.length - 1; i >= 0; i--) ctx.lineTo(Rp[i][0], Rp[i][1]);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        if (near) { ctx.strokeStyle = "rgba(20,11,6,0.35)"; ctx.lineWidth = 0.025; ctx.stroke(); }
        // 球節〜繋の靴下
        if (sock) {
          ctx.strokeStyle = near ? "#e9e5dc" : "#9d978c";
          ctx.lineWidth = 0.075;
          ctx.beginPath(); ctx.moveTo(fx2, fy2); ctx.lineTo(tx2, ty2); ctx.stroke();
        }
        // 関節(膝/飛節)
        ctx.fillStyle = colEdge; ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.arc(kx, ky, Wd[1] * 0.85, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
        // 速い折りたたみの残像(モーションブラー)
        if (near && m > 0.9 && bend > 1.3) {
          ctx.globalAlpha = 0.16;
          ctx.strokeStyle = col; ctx.lineWidth = 0.085;
          ctx.beginPath(); ctx.moveTo(kx, ky);
          ctx.lineTo(kx + Math.sin(a2 + 0.55) * lens[1], ky + Math.cos(a2 + 0.55) * lens[1]);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // 蹄(ハイライト付き)
        ctx.save(); ctx.translate(tx2, ty2); ctx.rotate(a3);
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.ellipse(0, 0.02, 0.09, 0.062, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath(); ctx.ellipse(-0.02, 0.0, 0.035, 0.02, 0, 0, 7); ctx.fill();
        ctx.restore();
      };

      if (ppm > 4.5) {
        const pitch = Math.sin(ph + 0.6) * 0.035 * m;
        const grad = ctx.createLinearGradient(0, -2.0, 0, -0.9);
        grad.addColorStop(0, coatL); grad.addColorStop(0.45, coat); grad.addColorStop(1, coatD);
        // 奥脚
        leg3(0.56, -1.28, this._kfEval(T.front, u - 0.16), false, true);
        leg3(-0.76, -1.32, this._kfEval(T.hind, u + 0.12), false, false);
        // 尻尾(なびく面+房)
        const tw2 = Math.sin(ph * 0.55) * 0.10 * (0.35 + 0.65 * m) + ext * 0.05;
        ctx.fillStyle = "#2a1a0e";
        ctx.beginPath();
        ctx.moveTo(-1.08, -1.55);
        ctx.quadraticCurveTo(-1.5, -1.5 + tw2, -1.78, -1.18 + tw2 * 1.6);
        ctx.quadraticCurveTo(-1.52, -1.28 + tw2, -1.16, -1.38);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#23150c"; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(-1.62, -1.3 + tw2);
        ctx.quadraticCurveTo(-1.78, -1.12 + tw2 * 1.7, -1.88, -0.96 + tw2 * 2); ctx.stroke();

        ctx.save(); ctx.rotate(pitch);
        // 胴体(バレル)
        const barrel = () => {
          ctx.beginPath();
          ctx.moveTo(-1.12, -1.52);
          ctx.quadraticCurveTo(-0.55, -1.69, 0.30, -1.58);
          ctx.quadraticCurveTo(0.52, -1.55, 0.68, -1.47);
          ctx.quadraticCurveTo(0.82, -1.30, 0.66, -1.02);
          ctx.quadraticCurveTo(0.15, -0.90, -0.38, -0.99);
          ctx.quadraticCurveTo(-0.88, -1.06, -1.07, -1.18);
          ctx.quadraticCurveTo(-1.33, -1.32, -1.12, -1.52);
          ctx.closePath();
        };
        barrel(); ctx.fillStyle = grad; ctx.fill();
        // 首+頭(伸縮グループ)
        const nAng = lerp(0.12, -0.10, ext);
        ctx.save();
        ctx.translate(0.50, -1.50); ctx.rotate(nAng); ctx.translate(-0.50, 1.50);
        const neck = () => {
          ctx.beginPath();
          ctx.moveTo(0.30, -1.57);
          ctx.quadraticCurveTo(0.72, -1.64, 1.04, -1.91);
          ctx.lineTo(1.17, -1.97);
          ctx.quadraticCurveTo(1.42, -1.90, 1.53, -1.73);
          ctx.lineTo(1.49, -1.60);
          ctx.quadraticCurveTo(1.25, -1.53, 1.12, -1.56);
          ctx.quadraticCurveTo(0.92, -1.42, 0.78, -1.24);
          ctx.quadraticCurveTo(0.62, -1.10, 0.46, -1.05);
          ctx.lineTo(0.32, -1.32);
          ctx.closePath();
        };
        neck(); ctx.fillStyle = grad; ctx.fill();
        neck(); ctx.strokeStyle = "rgba(20,11,6,0.75)"; ctx.lineWidth = 0.05; ctx.stroke();
        // たてがみ
        ctx.strokeStyle = "#23150c";
        ctx.lineWidth = 0.09;
        ctx.beginPath(); ctx.moveTo(1.10, -1.93); ctx.quadraticCurveTo(0.78, -1.82, 0.52, -1.60); ctx.stroke();
        ctx.lineWidth = 0.06;
        ctx.beginPath(); ctx.moveTo(1.02, -1.86); ctx.quadraticCurveTo(0.76, -1.74, 0.56, -1.54); ctx.stroke();
        // 耳・目・鼻孔
        ctx.fillStyle = coatD;
        ctx.beginPath(); ctx.moveTo(1.13, -1.95); ctx.lineTo(1.18, -2.12); ctx.lineTo(1.25, -1.95); ctx.closePath(); ctx.fill();
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.arc(1.30, -1.80, 0.035, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(1.46, -1.65, 0.022, 0, 7); ctx.fill();
        // 頭絡・手綱
        ctx.strokeStyle = "#241a12"; ctx.lineWidth = 0.024;
        ctx.beginPath(); ctx.moveTo(1.16, -1.90); ctx.lineTo(1.38, -1.66); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(1.30, -1.58); ctx.quadraticCurveTo(1.40, -1.66, 1.48, -1.68); ctx.stroke();
        ctx.strokeStyle = "#3a2c20"; ctx.lineWidth = 0.025;
        ctx.beginPath(); ctx.moveTo(1.44, -1.59); ctx.quadraticCurveTo(1.1, -1.74, 0.88, -1.80); ctx.stroke();
        ctx.restore(); // 首グループ
        // 陰影(腹・筋肉・逆光リム)
        ctx.globalAlpha = 0.30; ctx.fillStyle = coatD;
        ctx.beginPath(); ctx.ellipse(-0.18, -1.00, 0.62, 0.13, 0.04, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.33; ctx.fillStyle = coatL;
        ctx.beginPath(); ctx.ellipse(-0.72, -1.33, 0.30, 0.21, -0.28, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0.40, -1.26, 0.21, 0.17, 0.35, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.20; ctx.fillStyle = coatD;
        ctx.beginPath(); ctx.ellipse(-0.30, -1.18, 0.34, 0.16, 0.1, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
        barrel(); ctx.strokeStyle = "rgba(20,11,6,0.75)"; ctx.lineWidth = 0.052; ctx.stroke();
        ctx.strokeStyle = "rgba(255,244,226,0.5)"; ctx.lineWidth = 0.055;
        ctx.beginPath(); ctx.moveTo(-1.0, -1.565); ctx.quadraticCurveTo(-0.5, -1.685, 0.25, -1.585); ctx.stroke();
        // 芦毛はダップル(連銭)模様
        if (s.h.coat === "#8a8f96") {
          ctx.globalAlpha = 0.16; ctx.fillStyle = "#f2f3f5";
          for (let di = 0; di < 8; di++) {
            const dxp = -0.95 + ((di * 37) % 150) / 100, dyp = -1.55 + ((di * 53) % 48) / 100;
            ctx.beginPath(); ctx.arc(dxp, dyp, 0.075, 0, 7); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        // 腹帯
        ctx.strokeStyle = "#2a2118"; ctx.lineWidth = 0.055;
        ctx.beginPath(); ctx.moveTo(0.3, -1.45); ctx.quadraticCurveTo(0.37, -1.16, 0.3, -0.97); ctx.stroke();
        // ゼッケン(枠色)
        ctx.fillStyle = s.h.wakuColor;
        ctx.beginPath(); ctx.roundRect(-0.18, -1.52, 0.54, 0.44, 0.06); ctx.fill();
        ctx.strokeStyle = s.h.waku === 1 ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.92)";
        ctx.lineWidth = 0.03; ctx.stroke();
        ctx.save(); ctx.translate(0.09, -1.18); ctx.scale(dir, 1);
        ctx.fillStyle = s.h.wakuText; ctx.font = "800 0.36px 'Oswald', sans-serif"; ctx.textAlign = "center";
        ctx.fillText(String(s.h.num), 0, 0);
        ctx.restore();
        ctx.restore(); // pitch
        // 手前脚
        leg3(0.60, -1.30, this._kfEval(T.front, u - 0.28), true, true);
        leg3(-0.80, -1.34, this._kfEval(T.hind, u), true, false);
        // 騎手(低いモンキー乗り・ストライドと連動)
        const jb = Math.sin(ph + 1.3) * 0.03 * m;
        // 鞍+鐙革+鐙
        ctx.fillStyle = "#3a2a1c";
        ctx.beginPath(); ctx.ellipse(0.07, -1.56 + jb * 0.5, 0.21, 0.07, -0.06, 0, 7); ctx.fill();
        ctx.strokeStyle = "#2d2114"; ctx.lineWidth = 0.035;
        ctx.beginPath(); ctx.moveTo(0.16, -1.52 + jb); ctx.lineTo(0.235, -1.41); ctx.stroke();
        ctx.strokeStyle = "#cfd4da"; ctx.lineWidth = 0.042;
        ctx.beginPath(); ctx.arc(0.245, -1.375, 0.045, 0, 7); ctx.stroke();
        // 騎手の脚: 白い腿→膝→ブーツ(鐙へ)
        ctx.strokeStyle = "#f4f2ec"; ctx.lineWidth = 0.115;
        ctx.beginPath(); ctx.moveTo(-0.02, -1.74 + jb); ctx.lineTo(0.17, -1.62 + jb); ctx.stroke();
        ctx.strokeStyle = "#23252b"; ctx.lineWidth = 0.1;
        ctx.beginPath(); ctx.moveTo(0.17, -1.62 + jb); ctx.lineTo(0.235, -1.42); ctx.stroke();
        ctx.save(); ctx.translate(0.14, -1.94 + jb); ctx.rotate(-0.42 - ext * 0.08);
        ctx.fillStyle = s.h.silks;
        ctx.beginPath(); ctx.ellipse(0, 0, 0.37, 0.165, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 0.025; ctx.stroke();
        ctx.restore();
        // 奥側の腕
        ctx.strokeStyle = hexBlend(s.h.silks, "#000000", 0.35); ctx.lineWidth = 0.08;
        ctx.beginPath(); ctx.moveTo(0.30, -1.95 + jb);
        ctx.lineTo(0.56 + ext * 0.05, -1.85 + jb); ctx.lineTo(0.78 + ext * 0.06, -1.75); ctx.stroke();
        // 手前の腕(伸びに合わせ前へ)
        ctx.strokeStyle = s.h.silks; ctx.lineWidth = 0.085;
        ctx.beginPath(); ctx.moveTo(0.36, -1.98 + jb);
        ctx.lineTo(0.60 + ext * 0.05, -1.87 + jb); ctx.lineTo(0.84 + ext * 0.06, -1.76); ctx.stroke();
        // 追い(残り320mでムチ)
        if (this.race && (this.race.distance - s.d) < 320 && !s.fin && m > 0.8) {
          const wa = Math.sin(ph * 1.05) * 0.6 - 0.45;
          ctx.save(); ctx.translate(0.3, -1.95 + jb); ctx.rotate(wa);
          ctx.strokeStyle = s.h.silks; ctx.lineWidth = 0.08;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-0.2, -0.22); ctx.stroke();
          ctx.strokeStyle = "#2d2620"; ctx.lineWidth = 0.035;
          ctx.beginPath(); ctx.moveTo(-0.2, -0.22); ctx.lineTo(-0.46, -0.40); ctx.stroke();
          ctx.restore();
        }
        // 頭・帽(枠色)・ゴーグル
        const hx2 = 0.5, hy2 = -2.05 + jb;
        ctx.fillStyle = "#e2b48c";
        ctx.beginPath(); ctx.arc(hx2, hy2, 0.115, 0, 7); ctx.fill();
        ctx.fillStyle = s.h.wakuColor;
        ctx.beginPath(); ctx.arc(hx2, hy2 - 0.02, 0.118, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 0.018;
        ctx.beginPath(); ctx.arc(hx2, hy2 - 0.02, 0.12, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
        ctx.strokeStyle = "#20242c"; ctx.lineWidth = 0.045;
        ctx.beginPath(); ctx.moveTo(hx2 + 0.02, hy2 + 0.005); ctx.lineTo(hx2 + 0.112, hy2 - 0.015); ctx.stroke();
        // スピードライン
        if (s.v > 16.2 && m > 0.9) {
          ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 0.05;
          ctx.beginPath(); ctx.moveTo(-1.32, -1.55); ctx.lineTo(-1.88, -1.5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-1.26, -1.08); ctx.lineTo(-1.72, -1.04); ctx.stroke();
        }
      } else {
        // 遠距離LOD
        ctx.fillStyle = coatD;
        ctx.beginPath(); ctx.ellipse(0, -1.2, 0.98, 0.4, 0, 0, 7); ctx.fill();
        ctx.fillStyle = s.h.silks;
        ctx.beginPath(); ctx.arc(0.12, -1.72, 0.26, 0, 7); ctx.fill();
        const ql = (hx, off) => {
          const a1 = Math.sin(ph + off) * 0.7 * m;
          ctx.strokeStyle = coatD; ctx.lineWidth = 0.14;
          ctx.beginPath(); ctx.moveTo(hx, -1.1);
          ctx.lineTo(hx + Math.sin(a1) * 0.55, -1.1 + Math.cos(a1) * 0.55);
          ctx.lineTo(hx + Math.sin(a1) * 1.0, -1.1 + Math.cos(a1) * 1.05);
          ctx.stroke();
        };
        ql(0.55, 0); ql(-0.55, Math.PI);
      }
      ctx.restore();
      this._badges.push({ num: s.h.num, x: p.x, y: p.y, ppm });
      return null; // 馬名チップは廃止(ゼッケン+帽色+順位ストリップで識別)
    }

    /** 予想印(◎○▲)を打った馬の頭上に浮かぶバッジ */
    _drawMarkBadge(ctx, num, x, y, ppm) {
      const marks = this.race && this.race.marks;
      if (!marks || ppm < 1.6) return;
      let sym = null, col = null;
      if (marks.tan === num) { sym = "◎"; col = "#ffd75e"; }
      else if (marks.ren === num) { sym = "○"; col = "#e9eff6"; }
      else if (marks.san === num) { sym = "▲"; col = "#f0a64f"; }
      if (!sym) return;
      const fs = clamp(ppm * 2.0, 13, 30);
      const fl2 = Math.sin(this._last * 0.004 + num) * fs * 0.08;
      const by = y - 3.05 * ppm - fs * 0.85 + fl2;
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "rgba(8,12,20,0.8)";
      ctx.beginPath(); ctx.arc(x, by, fs * 0.68, 0, 7); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, fs * 0.09); ctx.stroke();
      ctx.fillStyle = col;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "800 " + fs + "px sans-serif";
      ctx.fillText(sym, x, by + fs * 0.03);
      ctx.beginPath();
      ctx.moveTo(x - fs * 0.18, by + fs * 0.66);
      ctx.lineTo(x + fs * 0.18, by + fs * 0.66);
      ctx.lineTo(x, by + fs * 0.98);
      ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.restore();
    }

    /** 正面ビュー(ゴール前カメラなど、こちらへ向かって走る馬) */
    _drawHorseFront(ctx, s, ppm, ph, m) {
      const coat = s.h.coat;
      const coatD = hexBlend(coat, "#140b06", 0.45);
      const coatL = hexBlend(coat, "#ffeedd", 0.30);
      const dark = "#1a120c";
      const T = this._poseTables();
      const u = ph / 6.28318;
      ctx.scale(ppm * 1.04, ppm * 1.04);
      const sway = Math.sin(ph) * 0.05 * m;
      ctx.translate(sway, Math.sin(ph * 2) * 0.02 * m);
      ctx.rotate(Math.sin(ph + 0.8) * 0.05 * m);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      // 後脚(外側に少し見える)
      const hleg = (sx2, off) => {
        const pose = this._kfEval(T.hind, u + off);
        const lift = clamp(pose[1] / 1.65, 0, 1) * m;
        ctx.strokeStyle = coatD; ctx.lineWidth = 0.13;
        ctx.beginPath(); ctx.moveTo(sx2 * 0.78, -0.95);
        ctx.lineTo(sx2 * (1 + lift * 0.12), -0.46 + lift * 0.2);
        ctx.lineTo(sx2 * (1.12 + lift * 0.1), -0.05 - lift * 0.34); ctx.stroke();
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.ellipse(sx2 * (1.12 + lift * 0.1), -0.05 - lift * 0.34, 0.07, 0.05, 0, 0, 7); ctx.fill();
      };
      hleg(-0.3, 0.5); hleg(0.3, 0.62);
      // 胸(左右グラデ+大胸筋)
      const g = ctx.createLinearGradient(-0.4, 0, 0.4, 0);
      g.addColorStop(0, coatD); g.addColorStop(0.2, coat); g.addColorStop(0.5, coatL);
      g.addColorStop(0.8, coat); g.addColorStop(1, coatD);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -1.12, 0.37, 0.5, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(20,11,6,0.72)"; ctx.lineWidth = 0.045; ctx.stroke();
      ctx.strokeStyle = "rgba(20,11,6,0.3)"; ctx.lineWidth = 0.028;
      ctx.beginPath(); ctx.moveTo(0, -0.98); ctx.quadraticCurveTo(-0.17, -1.07, -0.25, -0.97); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -0.98); ctx.quadraticCurveTo(0.17, -1.07, 0.25, -0.97); ctx.stroke();
      // ゼッケン(胸前にも番号)
      ctx.fillStyle = s.h.wakuColor;
      ctx.beginPath(); ctx.roundRect(-0.15, -0.96, 0.3, 0.24, 0.04); ctx.fill();
      ctx.strokeStyle = s.h.waku === 1 ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.92)";
      ctx.lineWidth = 0.022; ctx.stroke();
      ctx.fillStyle = s.h.wakuText;
      ctx.font = "800 0.19px 'Oswald', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(s.h.num), 0, -0.84);
      // 前脚(膝の折りたたみが見える2関節)
      const fleg = (sx2, off) => {
        const pose = this._kfEval(T.front, u + off);
        const lift = clamp(pose[1] / 2.05, 0, 1) * m;
        const reach = clamp(pose[0] / 0.95, -1, 1) * m;
        const kxx = sx2 * (1 + lift * 0.2), kyy = -0.62 + lift * 0.3;
        const hxx = sx2 * (1 + lift * 0.34) + reach * 0.04, hyy = -0.06 - lift * 0.56;
        const sock = s.h.num % 3 === 1;
        ctx.strokeStyle = coat; ctx.lineWidth = 0.15;
        ctx.beginPath(); ctx.moveTo(sx2, -1.02); ctx.lineTo(kxx, kyy); ctx.stroke();
        ctx.strokeStyle = sock ? "#e9e5dc" : coat; ctx.lineWidth = 0.1;
        ctx.beginPath(); ctx.moveTo(kxx, kyy); ctx.lineTo(hxx, hyy); ctx.stroke();
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.ellipse(hxx, hyy, 0.078, 0.058, 0, 0, 7); ctx.fill();
      };
      fleg(-0.17, 0); fleg(0.17, 0.12);
      // 首
      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.moveTo(-0.18, -1.45);
      ctx.quadraticCurveTo(-0.15, -1.85, -0.11, -1.97);
      ctx.lineTo(0.11, -1.97);
      ctx.quadraticCurveTo(0.15, -1.85, 0.18, -1.45);
      ctx.closePath(); ctx.fill();
      // 頭(うなずき+立体陰影)
      const hb = Math.sin(ph + 0.5) * 0.06 * m;
      ctx.save(); ctx.translate(0, hb);
      ctx.fillStyle = coat;
      ctx.beginPath(); ctx.ellipse(0, -1.65, 0.155, 0.32, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(20,11,6,0.72)"; ctx.lineWidth = 0.04; ctx.stroke();
      ctx.globalAlpha = 0.2; ctx.fillStyle = dark;
      ctx.beginPath(); ctx.ellipse(0.06, -1.62, 0.1, 0.28, 0.05, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = coatD;
      ctx.beginPath(); ctx.ellipse(0, -1.43, 0.108, 0.135, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(245,240,235,0.85)";
      ctx.beginPath(); ctx.roundRect(-0.028, -1.93, 0.056, 0.34, 0.03); ctx.fill();
      ctx.fillStyle = coatD;
      ctx.beginPath(); ctx.moveTo(-0.13, -1.93); ctx.lineTo(-0.18, -2.1); ctx.lineTo(-0.055, -1.96); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.13, -1.93); ctx.lineTo(0.18, -2.1); ctx.lineTo(0.055, -1.96); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#23150c"; ctx.lineWidth = 0.05; // 前髪
      ctx.beginPath(); ctx.moveTo(-0.04, -1.95); ctx.quadraticCurveTo(0.0, -1.88, 0.05, -1.93); ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(-0.112, -1.79, 0.033, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(0.112, -1.79, 0.033, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(-0.05, -1.42, 0.023, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(0.05, -1.42, 0.023, 0, 7); ctx.fill();
      ctx.strokeStyle = "#241a12"; ctx.lineWidth = 0.022; // 頭絡
      ctx.beginPath(); ctx.moveTo(-0.14, -1.76); ctx.quadraticCurveTo(0, -1.7, 0.14, -1.76); ctx.stroke();
      ctx.restore();
      // 騎手(頭上・腕のプッシュ)
      const jb = Math.sin(ph + 1.2) * 0.035 * m;
      const pump = Math.sin(ph) * 0.04 * m;
      ctx.strokeStyle = s.h.silks; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.moveTo(-0.27, -1.98 + jb); ctx.lineTo(-0.31, -1.68 + pump); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.27, -1.98 + jb); ctx.lineTo(0.31, -1.68 - pump); ctx.stroke();
      ctx.fillStyle = s.h.silks;
      ctx.beginPath(); ctx.ellipse(0, -2.0 + jb, 0.3, 0.14, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 0.025; ctx.stroke();
      // 追いムチ(残り320m)
      if (this.race && (this.race.distance - s.d) < 320 && !s.fin && m > 0.8) {
        const wa = Math.sin(ph * 1.05) * 0.5;
        ctx.save(); ctx.translate(0.3, -2.0 + jb); ctx.rotate(wa * 0.4);
        ctx.strokeStyle = "#2d2620"; ctx.lineWidth = 0.035;
        ctx.beginPath(); ctx.moveTo(0.05, -0.05); ctx.lineTo(0.22, -0.3); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = "#e2b48c";
      ctx.beginPath(); ctx.arc(0, -2.18 + jb, 0.11, 0, 7); ctx.fill();
      ctx.fillStyle = s.h.wakuColor;
      ctx.beginPath(); ctx.arc(0, -2.21 + jb, 0.115, Math.PI, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 0.018;
      ctx.beginPath(); ctx.arc(0, -2.21 + jb, 0.117, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#20242c"; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.moveTo(-0.085, -2.19 + jb); ctx.lineTo(0.085, -2.19 + jb); ctx.stroke();
    }
    _drawChip(ctx, l) {
      const dpr = this._dpr;
      if (l.ppm < 2.2) return;
      const big = l.ppm > 7;
      const fs = clamp(l.ppm * 1.45, 8.5, 13) * dpr;
      ctx.font = `700 ${fs}px 'Zen Kaku Gothic New', sans-serif`;
      const nameW = ctx.measureText(l.name).width;
      const numW = fs * 1.25;
      const jW = big ? fs * 0.78 * (l.jockey.length * 0.62) : 0;
      const w = numW + nameW + fs * 0.8 + (big ? jW + fs * 0.5 : 0);
      const h = fs * 1.5;
      const x = l.x - w / 2 + (l.stag % 2 ? 26 : -26) * (l.stag > 1 ? 1.6 : 1) * this._dpr;
      const y = Math.max(6 * dpr, l.y - h - l.stag * h * 1.04);
      ctx.save();
      ctx.globalAlpha = clamp((l.ppm - 2) / 5, 0.4, 0.92);
      ctx.fillStyle = "rgba(10,14,22,0.78)";
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 3 * dpr); ctx.fill();
      if (l.flash) {
        ctx.strokeStyle = "#ffd75e"; ctx.lineWidth = 1.6 * dpr; ctx.stroke();
      }
      // 接続線
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1 * dpr;
      ctx.beginPath(); ctx.moveTo(x + w / 2, y + h); ctx.lineTo(l.x, l.y - 2.45 * l.ppm); ctx.stroke();
      // 枠色馬番
      ctx.fillStyle = l.wc;
      ctx.beginPath(); ctx.roundRect(x + 2 * dpr, y + h * 0.12, numW, h * 0.76, 2 * dpr); ctx.fill();
      if (l.waku === 1) { ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = l.wt;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `800 ${fs * 0.92}px 'Oswald', sans-serif`;
      ctx.fillText(String(l.num), x + 2 * dpr + numW / 2, y + h * 0.54);
      // 馬名
      ctx.fillStyle = "#f5f7fa";
      ctx.textAlign = "left";
      ctx.font = `700 ${fs}px 'Zen Kaku Gothic New', sans-serif`;
      ctx.fillText(l.name, x + numW + fs * 0.45, y + h * 0.55);
      // 騎手
      if (big) {
        ctx.fillStyle = "rgba(200,210,225,0.85)";
        ctx.font = `500 ${fs * 0.74}px 'Zen Kaku Gothic New', sans-serif`;
        ctx.fillText(l.jockey, x + numW + nameW + fs * 0.8, y + h * 0.56);
      }
      if (l.flash) {
        ctx.fillStyle = "#ffd75e";
        ctx.font = `800 ${fs}px sans-serif`;
        ctx.fillText("▲", x + w + 2 * dpr, y + h * 0.58);
      }
      ctx.restore();
    }

    // ── 俯瞰 ──
    _planXform(W, H, pad) {
      const b = this.track.bounds;
      const bw = b.maxX - b.minX, bh = b.maxZ - b.minZ;
      const sc = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
      const ox = (W - bw * sc) / 2 - b.minX * sc;
      const oy = (H + bh * sc) / 2 + b.minZ * sc;
      return (x, z) => [ox + x * sc, oy - z * sc - (H - bh * sc) * 0 ];
    }
    _renderPlan(ctx, W, H, mini) {
      const tr = this.track, pal = this.pal, race = this.race;
      ctx.fillStyle = hexBlend(pal.grass, "#10240f", 0.18);
      ctx.fillRect(0, 0, W, H);
      const X = this._planXform(W, H, 60 * this._dpr);
      const edgePt = (s, lane) => {
        const p = tr.pointAtS(s % tr.lap);
        const off = tr.width / 2 - lane;
        return X(p.x + p.nx * off, p.z + p.nz * off);
      };
      // 内馬場
      ctx.beginPath();
      for (let s = 0; s <= tr.lap; s += 12) {
        const [x, y] = edgePt(s, -0.5);
        s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fillStyle = pal.grass; ctx.fill();
      // 池
      this._ponds.forEach((poly) => {
        ctx.beginPath();
        poly.forEach((p, i) => { const [x, y] = X(p.x, p.z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.closePath();
        ctx.fillStyle = this.env.time === "dusk" ? "#8d83ab" : "#6f9fc4"; ctx.fill();
      });
      // 内馬場の木
      this._infieldTrees.forEach((t2) => {
        const [x, y] = X(t2.x, t2.z);
        ctx.fillStyle = pal.tree;
        ctx.beginPath(); ctx.arc(x, y, t2.r * 1.2 * this._dpr, 0, 7); ctx.fill();
      });
      // 馬場リボン
      for (let s = 0; s < tr.lap; s += 10) {
        const a = edgePt(s, -0.4), b2 = edgePt(s, tr.width + 0.4);
        const c2 = edgePt(s + 10.5, tr.width + 0.4), d2 = edgePt(s + 10.5, -0.4);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(d2[0], d2[1]);
        ctx.closePath();
        ctx.fillStyle = Math.floor(s / 14) % 2 ? pal.turfA : pal.turfB;
        ctx.fill();
      }
      // ラチ
      [-0.6, tr.width + 0.6].forEach((lane) => {
        ctx.beginPath();
        for (let s = 0; s <= tr.lap; s += 10) {
          const [x, y] = edgePt(s, lane);
          s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = pal.rail; ctx.lineWidth = 1.3 * this._dpr; ctx.stroke();
      });
      // スタンド帯
      ctx.beginPath();
      [[6, 0], [6, 1], [26, 1], [26, 0]].forEach(([off, end], i) => {
        const s = end ? tr.straight : 0;
        const p = this._outerPt(s, off);
        const [x, y] = X(p.x, p.z);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "#4b515c"; ctx.fill();
      ctx.strokeStyle = "#9aa3af"; ctx.lineWidth = 1 * this._dpr; ctx.stroke();
      // ゴール&ゲート
      const [g1x, g1y] = edgePt(tr.raceToS(race.distance), -1), [g2x, g2y] = edgePt(tr.raceToS(race.distance), tr.width + 1);
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.2 * this._dpr;
      ctx.beginPath(); ctx.moveTo(g1x, g1y); ctx.lineTo(g2x, g2y); ctx.stroke();
      const [s1x, s1y] = edgePt(tr.raceToS(0), -1), [s2x, s2y] = edgePt(tr.raceToS(0), tr.width + 1);
      ctx.strokeStyle = "#ffd75e"; ctx.lineWidth = 1.6 * this._dpr;
      ctx.beginPath(); ctx.moveTo(s1x, s1y); ctx.lineTo(s2x, s2y); ctx.stroke();
      // トレイル
      if (this._S) {
        this._S.forEach((s) => {
          const trl = this._trails[s.h.num];
          if (!trl || trl.length < 2) return;
          ctx.beginPath();
          trl.forEach((p, i) => { const [x, y] = X(p.x, p.z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          ctx.strokeStyle = s.h.silks; ctx.globalAlpha = 0.4; ctx.lineWidth = 1.6 * this._dpr; ctx.stroke();
          ctx.globalAlpha = 1;
        });
        // 馬ドット
        [...this._S].sort((a, b) => a.d - b.d).forEach((s, i, arr) => {
          const w = tr.laneWorld(Math.min(s.d, race.distance + 60), s.l);
          const [x, y] = X(w.x, w.z);
          const isLead = s === this._lead;
          const r = (isLead ? 9 : 7.5) * this._dpr;
          ctx.fillStyle = s.h.wakuColor;
          ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
          ctx.strokeStyle = isLead ? "#ffffff" : "rgba(0,0,0,0.4)";
          ctx.lineWidth = (isLead ? 2.4 : 1.2) * this._dpr; ctx.stroke();
          ctx.fillStyle = s.h.wakuText;
          ctx.font = `800 ${9.5 * this._dpr}px 'Oswald', sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(String(s.h.num), x, y + 0.5);
        });
      }
    }

    _renderMiniMap(ctx, W, H) {
      if (!this.race || !this._S) return;
      const dpr = this._dpr;
      const mw = 218 * dpr, mh = 138 * dpr, mx = W - mw - 14 * dpr, my = 14 * dpr;
      ctx.save();
      ctx.fillStyle = "rgba(8,12,20,0.62)";
      ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 9 * dpr); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.translate(mx, my);
      ctx.beginPath(); ctx.roundRect(0, 0, mw, mh, 9 * dpr); ctx.clip();
      const tr = this.track, race = this.race;
      const b = tr.bounds;
      const pad = 16 * dpr;
      const sc = Math.min((mw - pad * 2) / (b.maxX - b.minX), (mh - pad * 2) / (b.maxZ - b.minZ));
      const X = (x, z) => [
        (mw - (b.maxX - b.minX) * sc) / 2 + (x - b.minX) * sc,
        (mh + (b.maxZ - b.minZ) * sc) / 2 - (z - b.minZ) * sc,
      ];
      // コース
      ctx.beginPath();
      for (let s = 0; s <= tr.lap; s += 16) {
        const p = tr.pointAtS(s % tr.lap);
        const [x, y] = X(p.x, p.z);
        s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(120,200,140,0.9)";
      ctx.lineWidth = Math.max(3, tr.width * sc);
      ctx.stroke();
      // ゴール
      const gp = tr.pointAtS(tr.finishS);
      const [gx, gy] = X(gp.x, gp.z);
      ctx.fillStyle = "#fff";
      ctx.fillRect(gx - 1.5 * dpr, gy - 6 * dpr, 3 * dpr, 12 * dpr);
      // 馬ドット
      [...this._S].sort((a, b2) => a.d - b2.d).forEach((s) => {
        const w = tr.laneWorld(Math.min(s.d, race.distance + 60), s.l);
        const [x, y] = X(w.x, w.z);
        ctx.fillStyle = s.h.wakuColor;
        ctx.beginPath(); ctx.arc(x, y, (s === this._lead ? 4 : 3) * dpr, 0, 7); ctx.fill();
        if (s === this._lead) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4 * dpr; ctx.stroke(); }
      });
      ctx.restore();
    }
  }

  if (!customElements.get("race-canvas")) {
    customElements.define("race-canvas", RaceCanvas);
  }
})();
