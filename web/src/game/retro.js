import * as THREE from 'three';

/**
 * Render pipeline: draw the scene into an offscreen target, then present it
 * through a colour-grade pass. Two independent switches:
 *
 *   pixels  'smooth' — full resolution, 4× MSAA, no dithering (clean low-poly)
 *           'retro'  — small target upscaled with nearest filtering, 1-pixel
 *                      depth outlines, gentle ordered dither + colour quantize
 *                      (clean pixel-art look)
 *   palette 'bright' — saturated, sunny grade
 *           'pastel' — softened saturation, lifted shadows, warm cream tint
 */
const PALETTES = {
  bright: { sat: 1.14, contrast: 1.06, bright: 1.03, lift: 0.0, tint: [1, 1, 1] },
  // Colours are already pastel (see palette.js); the grade only softens a touch.
  pastel: { sat: 0.95, contrast: 0.95, bright: 1.04, lift: 0.06, tint: [1.0, 0.99, 1.0] },
};

export class RetroRenderer {
  constructor(renderer) {
    this.renderer = renderer;
    this.pixelSize = 3;
    this.mode = { pixels: 'smooth', palette: 'bright' };
    this.size = [2, 2];
    this.target = this.#makeTarget();

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uRes: { value: new THREE.Vector2(2, 2) },
        uLevels: { value: 22.0 },
        uDither: { value: 0.45 },
        tDepth: { value: null },
        uOutline: { value: 1 },
        uRetro: { value: 0 },
        uSat: { value: 1.14 },
        uContrast: { value: 1.06 },
        uBright: { value: 1.03 },
        uLift: { value: 0 },
        uLiftColor: { value: new THREE.Color(0xfff4e6) },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform float uOutline;
        uniform vec2 uRes;
        uniform float uLevels, uDither, uRetro, uSat, uContrast, uBright, uLift;
        uniform vec3 uLiftColor, uTint;
        varying vec2 vUv;
        float bayer4(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16];
          m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;
          m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
          for (int k = 0; k < 16; k++) { if (k == i) return m[k] / 16.0 - 0.5; }
          return 0.0;
        }
        void main() {
          vec2 px = floor(vUv * uRes);
          vec3 col = uRetro > 0.5 ? texture2D(tDiffuse, (px + 0.5) / uRes).rgb : texture2D(tDiffuse, vUv).rgb;
          col *= uBright;
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(l), col, uSat);
          col = (col - 0.5) * uContrast + 0.5;
          col = mix(col, uLiftColor, uLift * (1.0 - l * 0.6));  // lift darks toward cream: pastel
          col *= uTint;
          if (uRetro > 0.5) {
            // 1-pixel outlines where a nearer object meets something farther away
            if (uOutline > 0.5) {
              vec2 o = 1.0 / uRes, c = (px + 0.5) / uRes;
              float d0 = texture2D(tDepth, c).r;
              float dn = max(max(texture2D(tDepth, c + vec2(o.x, 0.0)).r, texture2D(tDepth, c - vec2(o.x, 0.0)).r),
                             max(texture2D(tDepth, c + vec2(0.0, o.y)).r, texture2D(tDepth, c - vec2(0.0, o.y)).r));
              float edge = smoothstep(0.0005, 0.0018, dn - d0);
              col = mix(col, col * vec3(0.32, 0.30, 0.42), edge * 0.85);
            }
            float dth = bayer4(px) * uDither / uLevels;
            col = floor((col + dth) * uLevels + 0.5) / uLevels;
          }
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.material.uniforms.tDepth.value = this.target.depthTexture || null;
    this.setMode({});
  }

  #makeTarget() {
    const retro = this.mode.pixels === 'retro';
    const t = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: retro ? THREE.NearestFilter : THREE.LinearFilter,
      magFilter: retro ? THREE.NearestFilter : THREE.LinearFilter,
      depthBuffer: true,
      samples: retro ? 0 : 4,
    });
    t.texture.colorSpace = THREE.SRGBColorSpace;
    if (retro) {
      t.depthTexture = new THREE.DepthTexture(2, 2);
      t.depthTexture.type = THREE.UnsignedIntType;
      t.depthTexture.minFilter = t.depthTexture.magFilter = THREE.NearestFilter;
    }
    return t;
  }

  /** setMode({ pixels: 'smooth'|'retro', palette: 'bright'|'pastel' }) */
  setMode(mode) {
    const pixelsChanged = mode.pixels && mode.pixels !== this.mode.pixels;
    Object.assign(this.mode, mode);
    if (pixelsChanged) {
      this.target.dispose();
      this.target = this.#makeTarget();
      this.material.uniforms.tDiffuse.value = this.target.texture;
      this.material.uniforms.tDepth.value = this.target.depthTexture || null;
      this.setSize(...this.size);
    }
    const u = this.material.uniforms, p = PALETTES[this.mode.palette] || PALETTES.bright;
    u.uRetro.value = this.mode.pixels === 'retro' ? 1 : 0;
    u.uSat.value = p.sat; u.uContrast.value = p.contrast; u.uBright.value = p.bright; u.uLift.value = p.lift;
    u.uTint.value.set(...p.tint);
  }

  setSize(cssW, cssH) {
    this.size = [cssW, cssH];
    let w, h;
    if (this.mode.pixels === 'retro') {
      // Pixel size from the short side so phones (portrait) keep enough horizontal detail.
      // Finer pixels than before (2 on most screens, 3 on big ones) for more detail.
      this.pixelSize = Math.min(3, Math.max(2, Math.round(Math.min(cssW, cssH) / 360)));
      w = Math.ceil(cssW / this.pixelSize); h = Math.ceil(cssH / this.pixelSize);
    } else {
      // Smooth: render at screen resolution (up to 1.5× on high-DPI screens).
      this.pixelSize = 1 / Math.min(1.5, window.devicePixelRatio || 1);
      w = Math.round(cssW / this.pixelSize); h = Math.round(cssH / this.pixelSize);
    }
    this.target.setSize(Math.max(1, w), Math.max(1, h));
    this.material.uniforms.uRes.value.set(Math.max(1, w), Math.max(1, h));
    this.renderer.setSize(cssW, cssH, false);
    this.renderer.setPixelRatio(1);
    this.renderer.domElement.width = Math.max(1, w); this.renderer.domElement.height = Math.max(1, h);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.setViewport(0, 0, this.target.width, this.target.height);
    r.render(this.quadScene, this.quadCam);
  }
}
