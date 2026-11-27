/*
 * DioTa privacy shield. Loaded first in <head> (before any other script) on every DioTa page, in the
 * browser and in the Android app. It turns off or blurs the browser features used to fingerprint a
 * device, so no script running on the page can build a stable ID of the phone:
 *
 *  - Global Privacy Control / Do Not Track signals set (navigator.globalPrivacyControl, doNotTrack).
 *  - Canvas: per-session, deterministic noise in toDataURL / toBlob / getImageData / readPixels.
 *  - WebGL / WebGL2: the GPU vendor and renderer (e.g. "ARM Mali-G57") are masked.
 *  - Audio: per-session noise in AudioBuffer.getChannelData and AnalyserNode readings.
 *  - Battery, network information, keyboard layout: neutralised; device memory, CPU count,
 *    screen and colour depth normalised; User-Agent client hints reduced to the low-entropy ones.
 *  - Font probing via document.fonts.check: only fonts the page itself loaded are reported.
 *  - Media devices: an empty list until the user has granted camera / microphone access.
 *  - WebRTC: relay-only ICE, and host / server-reflexive candidates are dropped, so no local or
 *    public IP address can leak through it.
 *
 * Every attempt is counted and announced (window event "dt:fingerprint", detail {api, at}) and kept
 * in window.__dtShield.attempts. Plain ES5-compatible code with no dependencies; it never throws.
 */
(function () {
  "use strict";
  if (window.__dtShield) return;

  var attempts = [];
  var seen = {};
  function note(api) {
    try {
      var now = Date.now();
      // At most one record per API per second (fingerprinting scripts call these in tight loops).
      if (seen[api] && now - seen[api] < 1000) return;
      seen[api] = now;
      var e = { api: api, at: new Date(now).toISOString() };
      attempts.push(e);
      if (attempts.length > 200) attempts.shift();
      window.dispatchEvent(new CustomEvent("dt:fingerprint", { detail: e }));
    } catch (_) {}
  }

  // ---- per-session seed (same noise for the whole session, different every session) ----
  var seed = 0;
  try {
    var s = sessionStorage.getItem("dt_fp_seed");
    if (!s) {
      var r = new Uint32Array(1);
      crypto.getRandomValues(r);
      s = String(r[0] || 1);
      sessionStorage.setItem("dt_fp_seed", s);
    }
    seed = Number(s) >>> 0;
  } catch (_) {
    seed = (Math.random() * 4294967295) >>> 0;
  }
  function rand(i) {
    // Small, fast integer hash of (seed, i): deterministic per session.
    var x = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x85ebca6b) >>> 0;
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
  }

  function define(obj, prop, getter) {
    try {
      Object.defineProperty(obj, prop, { get: getter, configurable: true, enumerable: true });
    } catch (_) {}
  }
  function wrap(proto, name, make) {
    try {
      var orig = proto && proto[name];
      if (typeof orig !== "function") return;
      var w = make(orig);
      try {
        Object.defineProperty(w, "name", { value: name });
        w.toString = function () {
          return "function " + name + "() { [native code] }";
        };
      } catch (_) {}
      proto[name] = w;
    } catch (_) {}
  }

  var nav = window.navigator;
  var NavProto = Object.getPrototypeOf(nav);

  // ---- privacy signals ----
  define(NavProto, "globalPrivacyControl", function () {
    return true;
  });
  define(NavProto, "doNotTrack", function () {
    return "1";
  });

  // ---- hardware / network / battery ----
  define(NavProto, "hardwareConcurrency", function () {
    note("hardwareConcurrency");
    return 8;
  });
  define(NavProto, "deviceMemory", function () {
    note("deviceMemory");
    return 8;
  });
  define(NavProto, "connection", function () {
    note("connection");
    return undefined;
  });
  define(NavProto, "keyboard", function () {
    note("keyboard");
    return undefined;
  });
  if ("getBattery" in nav) {
    NavProto.getBattery = function getBattery() {
      note("getBattery");
      return Promise.resolve({
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: 1,
        onchargingchange: null,
        onchargingtimechange: null,
        ondischargingtimechange: null,
        onlevelchange: null,
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {
          return false;
        },
      });
    };
  }

  // ---- User-Agent client hints: only the low-entropy values ----
  try {
    var uad = nav.userAgentData;
    if (uad && uad.getHighEntropyValues) {
      var low = { brands: uad.brands, mobile: uad.mobile, platform: uad.platform };
      var UadProto = Object.getPrototypeOf(uad);
      wrap(UadProto, "getHighEntropyValues", function () {
        return function () {
          note("userAgentData");
          return Promise.resolve({ brands: low.brands, mobile: low.mobile, platform: low.platform });
        };
      });
    }
  } catch (_) {}

  // ---- screen ----
  try {
    var ScreenProto = Object.getPrototypeOf(window.screen);
    var sw = Object.getOwnPropertyDescriptor(ScreenProto, "width");
    var sh = Object.getOwnPropertyDescriptor(ScreenProto, "height");
    define(ScreenProto, "colorDepth", function () {
      note("screen");
      return 24;
    });
    define(ScreenProto, "pixelDepth", function () {
      return 24;
    });
    if (sw && sw.get && sh && sh.get) {
      define(ScreenProto, "availWidth", function () {
        return sw.get.call(this);
      });
      define(ScreenProto, "availHeight", function () {
        return sh.get.call(this);
      });
    }
  } catch (_) {}

  // ---- canvas ----
  function noisePixels(data, w) {
    // Flip the lowest bit of ~1 in 64 colour values: invisible, but changes every hash.
    for (var i = 0; i < data.length; i += 4) {
      var h = rand((i >> 2) + w * 131);
      if ((h & 63) === 0) {
        var c = i + (h >>> 8) % 3;
        data[c] = data[c] ^ 1;
      }
    }
  }
  var C2D = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  var origGetImageData = C2D && C2D.getImageData;
  wrap(C2D, "getImageData", function (orig) {
    return function () {
      var img = orig.apply(this, arguments);
      note("canvas");
      try {
        noisePixels(img.data, img.width);
      } catch (_) {}
      return img;
    };
  });
  function noisyCopy(canvas) {
    try {
      var w = canvas.width;
      var h = canvas.height;
      if (!w || !h || w * h > 4096 * 4096) return null;
      var ctx = canvas.getContext && canvas.__dtCtx2d;
      if (!ctx) return null; // not a 2D canvas (WebGL canvases are handled through readPixels)
      var copy = document.createElement("canvas");
      copy.width = w;
      copy.height = h;
      var cctx = copy.getContext("2d");
      var img = origGetImageData.call(ctx, 0, 0, w, h);
      noisePixels(img.data, w);
      cctx.putImageData(img, 0, 0);
      return copy;
    } catch (_) {
      return null;
    }
  }
  var CanvasProto = window.HTMLCanvasElement && HTMLCanvasElement.prototype;
  wrap(CanvasProto, "getContext", function (orig) {
    return function (type) {
      var ctx = orig.apply(this, arguments);
      try {
        if (ctx && type === "2d") Object.defineProperty(this, "__dtCtx2d", { value: ctx, configurable: true });
      } catch (_) {}
      return ctx;
    };
  });
  wrap(CanvasProto, "toDataURL", function (orig) {
    return function () {
      note("canvas");
      var copy = noisyCopy(this);
      return orig.apply(copy || this, arguments);
    };
  });
  wrap(CanvasProto, "toBlob", function (orig) {
    return function () {
      note("canvas");
      var copy = noisyCopy(this);
      return orig.apply(copy || this, arguments);
    };
  });
  if (window.OffscreenCanvasRenderingContext2D) wrap(OffscreenCanvasRenderingContext2D.prototype, "getImageData", function (orig) {
    return function () {
      var img = orig.apply(this, arguments);
      note("canvas");
      try {
        noisePixels(img.data, img.width);
      } catch (_) {}
      return img;
    };
  });

  // ---- WebGL / WebGL2 ----
  var UNMASKED_VENDOR = 0x9245;
  var UNMASKED_RENDERER = 0x9246;
  function glPatch(proto) {
    if (!proto) return;
    wrap(proto, "getParameter", function (orig) {
      return function (p) {
        if (p === UNMASKED_VENDOR || p === UNMASKED_RENDERER) {
          note("webgl");
          return p === UNMASKED_VENDOR ? "WebKit" : "WebKit WebGL";
        }
        return orig.apply(this, arguments);
      };
    });
    wrap(proto, "getExtension", function (orig) {
      return function (name) {
        if (String(name).toLowerCase() === "webgl_debug_renderer_info") {
          note("webgl");
          return null;
        }
        return orig.apply(this, arguments);
      };
    });
    wrap(proto, "getSupportedExtensions", function (orig) {
      return function () {
        var list = orig.apply(this, arguments);
        return list ? list.filter(function (e) {
          return e !== "WEBGL_debug_renderer_info";
        }) : list;
      };
    });
    wrap(proto, "readPixels", function (orig) {
      return function () {
        var r = orig.apply(this, arguments);
        note("webgl");
        try {
          var px = arguments[6];
          if (px && px.length) noisePixels(px, arguments[2] | 0);
        } catch (_) {}
        return r;
      };
    });
  }
  glPatch(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  glPatch(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);

  // ---- audio ----
  var touchedBuffers = typeof WeakSet === "function" ? new WeakSet() : null;
  if (window.AudioBuffer) wrap(AudioBuffer.prototype, "getChannelData", function (orig) {
    return function () {
      var d = orig.apply(this, arguments);
      note("audio");
      try {
        if (touchedBuffers && !touchedBuffers.has(d)) {
          touchedBuffers.add(d);
          for (var i = 0; i < d.length; i += 97) d[i] = d[i] + ((rand(i) & 0xff) - 128) * 1e-9;
        }
      } catch (_) {}
      return d;
    };
  });
  if (window.AnalyserNode) {
    ["getFloatFrequencyData", "getFloatTimeDomainData"].forEach(function (m) {
      wrap(AnalyserNode.prototype, m, function (orig) {
        return function (arr) {
          var r = orig.apply(this, arguments);
          note("audio");
          try {
            for (var i = 0; i < arr.length; i += 7) arr[i] = arr[i] + ((rand(i) & 0xff) - 128) * 1e-7;
          } catch (_) {}
          return r;
        };
      });
    });
    ["getByteFrequencyData", "getByteTimeDomainData"].forEach(function (m) {
      wrap(AnalyserNode.prototype, m, function (orig) {
        return function (arr) {
          var r = orig.apply(this, arguments);
          note("audio");
          try {
            for (var i = 0; i < arr.length; i += 31) if ((rand(i) & 3) === 0) arr[i] = arr[i] ^ 1;
          } catch (_) {}
          return r;
        };
      });
    });
  }

  // ---- fonts ----
  try {
    if (document.fonts && document.fonts.check) {
      var FontsProto = Object.getPrototypeOf(document.fonts);
      var generic = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|math|emoji|fangsong)$/i;
      wrap(FontsProto, "check", function (orig) {
        return function (font) {
          note("fonts");
          try {
            var fam = String(font).replace(/^.*?\d+(\.\d+)?(px|pt|em|rem|%)\s*(\/\s*\S+\s*)?/, "").split(",")[0].trim().replace(/^["']|["']$/g, "");
            if (generic.test(fam)) return true;
            var loaded = false;
            document.fonts.forEach(function (f) {
              if (String(f.family).replace(/^["']|["']$/g, "").toLowerCase() === fam.toLowerCase()) loaded = true;
            });
            return loaded ? orig.apply(this, arguments) : false;
          } catch (_) {
            return false;
          }
        };
      });
    }
  } catch (_) {}

  // ---- media devices ----
  try {
    var md = nav.mediaDevices;
    if (md) {
      var granted = false;
      var MdProto = Object.getPrototypeOf(md);
      wrap(MdProto, "getUserMedia", function (orig) {
        return function () {
          return orig.apply(this, arguments).then(function (s) {
            granted = true;
            return s;
          });
        };
      });
      wrap(MdProto, "enumerateDevices", function (orig) {
        return function () {
          if (granted) return orig.apply(this, arguments);
          note("mediaDevices");
          return Promise.resolve([]);
        };
      });
    }
  } catch (_) {}

  // ---- WebRTC: relay only, no host / reflexive candidates ----
  try {
    var PC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (PC) {
      var leaky = /\btyp (host|srflx|prflx)\b/;
      var Shield = function (config) {
        note("webrtc");
        var c = {};
        if (config) for (var k in config) c[k] = config[k];
        c.iceTransportPolicy = "relay";
        var pc = new PC(c, arguments[1]);
        var origAdd = pc.addEventListener;
        pc.addEventListener = function (type, fn) {
          if (type !== "icecandidate" || typeof fn !== "function") return origAdd.apply(this, arguments);
          var args = Array.prototype.slice.call(arguments);
          args[1] = function (ev) {
            if (ev && ev.candidate && leaky.test(ev.candidate.candidate || "")) return;
            return fn.apply(this, arguments);
          };
          return origAdd.apply(this, args);
        };
        var handler = null;
        Object.defineProperty(pc, "onicecandidate", {
          configurable: true,
          get: function () {
            return handler;
          },
          set: function (fn) {
            handler = fn;
          },
        });
        origAdd.call(pc, "icecandidate", function (ev) {
          if (!handler) return;
          if (ev && ev.candidate && leaky.test(ev.candidate.candidate || "")) return;
          handler.call(pc, ev);
        });
        var origSetConf = pc.setConfiguration;
        if (origSetConf) pc.setConfiguration = function (conf) {
          var cc = {};
          if (conf) for (var k2 in conf) cc[k2] = conf[k2];
          cc.iceTransportPolicy = "relay";
          return origSetConf.call(pc, cc);
        };
        return pc;
      };
      Shield.prototype = PC.prototype;
      try {
        Object.defineProperty(Shield, "name", { value: "RTCPeerConnection" });
      } catch (_) {}
      if (PC.generateCertificate) Shield.generateCertificate = PC.generateCertificate.bind(PC);
      window.RTCPeerConnection = Shield;
      if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = Shield;
    }
  } catch (_) {}

  // ---- ad containers collapse (a constructed style sheet: no DOM change, and no effect on DioTa's
  // own pages, which have no ads) ----
  try {
    if (window.CSSStyleSheet && "adoptedStyleSheets" in document) {
      var sheet = new CSSStyleSheet();
      sheet.replaceSync(
        "ins.adsbygoogle,[id^='google_ads_'],[id^='div-gpt-ad'],iframe[src*='doubleclick.net'],iframe[src*='googlesyndication.com'],iframe[src*='amazon-adsystem.com'],iframe[src*='adnxs.com'],[data-ad-slot],[data-ad-unit]{display:none!important;width:0!important;height:0!important}",
      );
      document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
    }
  } catch (_) {}

  window.__dtShield = {
    version: 1,
    attempts: attempts,
  };
})();
