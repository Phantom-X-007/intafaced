/**
 * Adapted from franky-adl/3d-wave-grid (MIT)
 * https://github.com/franky-adl/3d-wave-grid
 * Copyright (c) 2026 franky-adl — themed for INTAFACED (void + lime), no debug GUI.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteRGBShiftShader } from './VignetteRGBShiftShader';

const MAX_TRAIL = 128;

export type WaveGridQuality = 'high' | 'medium' | 'low';

export type WaveGridOptions = {
  canvas: HTMLCanvasElement;
  quality?: WaveGridQuality;
  /** Parent element for pointer rect (hero region). */
  pointerRoot?: HTMLElement | null;
};

function qualityConfig(q: WaveGridQuality) {
  if (q === 'high') {
    return {
      gridSize: 40,
      shadows: true,
      dpr: Math.min(window.devicePixelRatio, 1.75),
      post: true,
    };
  }
  if (q === 'medium') {
    return {
      gridSize: 32,
      shadows: true,
      dpr: Math.min(window.devicePixelRatio, 1.5),
      post: true,
    };
  }
  return {
    gridSize: 24,
    shadows: false,
    dpr: Math.min(window.devicePixelRatio, 1.25),
    post: false,
  };
}

export class WaveGridEngine {
  private canvas: HTMLCanvasElement;
  private pointerRoot: HTMLElement;
  private quality: WaveGridQuality;
  private cfg: ReturnType<typeof qualityConfig>;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private mesh!: THREE.InstancedMesh;
  private offsetAttribute!: THREE.InstancedBufferAttribute;
  private shaderRef: THREE.WebGLProgramParametersWithUniforms | null = null;

  private trail: { x: number; z: number; age: number; distDelta: number }[] = [];
  private trailData = new Float32Array(MAX_TRAIL * 4);
  private trailTexture!: THREE.DataTexture;
  private uTrailCount = { value: 0 };
  private uFadeTime = { value: 2.2 };
  private lastPoint: { x: number; z: number } | null = null;
  private timeSinceLastMove = 0;
  private randomPointTimer = 0;
  private isPlacingRandom = true;

  private raycaster = new THREE.Raycaster();
  private rayPlane!: THREE.Mesh;
  private mouseNdc = new THREE.Vector2(0, 0);
  private camMouse = new THREE.Vector2(0, 0);
  private camLerped = new THREE.Vector2(0, 0);
  private camRadius = 13.5;
  private bounds = 0;

  private running = false;
  private visible = true;
  private lastT = 0;
  private onPointerMove!: (e: PointerEvent) => void;
  private onWinMove!: (e: MouseEvent) => void;
  private onResize!: () => void;
  private rect = new DOMRect();

  private cubeWidth = 0.8;
  private cubeHeight = 3;
  private gap = 0.01;

  constructor(opts: WaveGridOptions) {
    this.canvas = opts.canvas;
    this.pointerRoot = opts.pointerRoot ?? opts.canvas;
    this.quality = opts.quality ?? 'high';
    this.cfg = qualityConfig(this.quality);
    this.init();
  }

  private init() {
    const gridSize = this.cfg.gridSize;
    this.bounds = gridSize * (this.cubeWidth + this.gap);

    this.scene = new THREE.Scene();
    // Dark void — half of base for subtle ground plane feel
    this.scene.background = new THREE.Color('#050806');
    this.scene.fog = new THREE.FogExp2(0x050806, 0.018);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.updateCameraPose(0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.55;
    this.renderer.shadowMap.enabled = this.cfg.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#050806');
    this.renderer.setPixelRatio(this.cfg.dpr);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xe8ffe0, 3.2);
    key.position.set(-18, 12, 8);
    if (this.cfg.shadows) {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.radius = 5;
      key.shadow.camera.near = 0.1;
      key.shadow.camera.far = 60;
      key.shadow.camera.left = -22;
      key.shadow.camera.right = 22;
      key.shadow.camera.top = 22;
      key.shadow.camera.bottom = -22;
      key.shadow.bias = 0.0001;
    }
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc6ff3d, 0.85);
    fill.position.set(12, 6, -4);
    this.scene.add(fill);

    // Trail texture
    this.trailTexture = new THREE.DataTexture(this.trailData, MAX_TRAIL, 1, THREE.RGBAFormat, THREE.FloatType);
    this.trailTexture.needsUpdate = true;

    // Ray plane
    this.rayPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(this.bounds, this.bounds),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, visible: false }),
    );
    this.rayPlane.rotation.x = -Math.PI / 2;
    this.rayPlane.updateMatrixWorld(true);
    this.scene.add(this.rayPlane);

    this.buildGrid(gridSize);

    if (this.cfg.post) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const vignette = new ShaderPass(VignetteRGBShiftShader);
      // Tasteful: very soft vignette, minimal RGB split (avoid "AI neon")
      vignette.uniforms.shiftAmount.value = 0.0018;
      vignette.uniforms.vignetteRadius.value = 0.42;
      vignette.uniforms.vignetteSoftness.value = 0.45;
      this.composer.addPass(vignette);
      this.composer.addPass(new OutputPass());
    }

    this.bindEvents();
    this.resize();
    // Seed several waves so first fade-in is already alive (not a flat grid)
    for (let i = 0; i < 6; i++) this.addRandomPoint(0.85 + Math.random() * 0.25);
  }

  private overrideVertexShader(vertexShader: string) {
    return vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vHeight;
        attribute vec2 aOffset;
        uniform sampler2D uTrailTexture;
        uniform int       uTrailCount;
        uniform float     uWaveSpeed;
        uniform float     uWaveFreq;
        uniform float     uWaveWidth;
        uniform float     uFadeTime;
        uniform float     uAmplitude;
        uniform float     uJitter;
        uniform float     uMaxHeight;
        vec2 hash2( vec2 p ) {
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return fract(sin(p) * 43758.5453123) - 0.5;
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vHeight = 0.0;
        if ( position.y > 0.0 ) {
            vec2 jitter  = hash2( aOffset ) * uJitter;
            vec2 worldXZ = aOffset + jitter;
            float waveHeight  = 0.0;
            float totalWeight = 0.0;
            for ( int i = 0; i < uTrailCount; i++ ) {
                vec4 td = texture2D(uTrailTexture, vec2((float(i) + 0.5) / 128.0, 0.5));
                float dist      = length(worldXZ - td.rg);
                float wavefront = uWaveSpeed * td.b;
                float relDist   = dist - wavefront;
                float window = exp(-(relDist * relDist) / (uWaveWidth * uWaveWidth));
                float fade   = exp(-td.b / uFadeTime);
                float atten  = 1.0 / (1.0 + dist * 0.1);
                float weight = fade * window * atten * td.a;
                waveHeight  += weight * cos(uWaveFreq * relDist);
                totalWeight += weight;
            }
            waveHeight /= max(totalWeight, 1.0);
            float displacement = clamp(waveHeight * uAmplitude, -uMaxHeight, uMaxHeight);
            transformed.y += displacement;
            vHeight = displacement;
        }`,
      );
  }

  private buildGrid(gridSize: number) {
    const count = gridSize * gridSize;
    const geometry = new THREE.BoxGeometry(this.cubeWidth, this.cubeHeight, this.cubeWidth);
    this.offsetAttribute = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
    geometry.setAttribute('aOffset', this.offsetAttribute);

    // Dark base → lime peaks (INTAFACED)
    const material = new THREE.MeshPhongMaterial({ color: 0x1a2420 });
    const params = {
      waveSpeed: 6.0,
      waveFrequency: 1.2,
      waveWidth: 3.0,
      waveAmplitude: 0.45,
      waveJitter: 0.2,
      waveMaxHeight: 0.45,
      colorBase: '#1a2420',
      colorHigh: '#c6ff3d',
      fadeTime: 2.2,
    };
    this.uFadeTime.value = params.fadeTime;

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTrailTexture = { value: this.trailTexture };
      shader.uniforms.uTrailCount = this.uTrailCount;
      shader.uniforms.uFadeTime = this.uFadeTime;
      shader.uniforms.uWaveSpeed = { value: params.waveSpeed };
      shader.uniforms.uWaveFreq = { value: params.waveFrequency };
      shader.uniforms.uWaveWidth = { value: params.waveWidth };
      shader.uniforms.uAmplitude = { value: params.waveAmplitude };
      shader.uniforms.uJitter = { value: params.waveJitter };
      shader.uniforms.uMaxHeight = { value: params.waveMaxHeight };
      shader.uniforms.uColorBase = {
        value: new THREE.Color(params.colorBase),
      };
      shader.uniforms.uColorHigh = {
        value: new THREE.Color(params.colorHigh),
      };
      shader.vertexShader = this.overrideVertexShader(shader.vertexShader);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vHeight;
          uniform vec3  uColorBase;
          uniform vec3  uColorHigh;
          uniform float uMaxHeight;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float t = clamp(vHeight / uMaxHeight, 0.0, 1.0);
          diffuseColor.rgb = mix(uColorBase, uColorHigh, t);`,
        );
      this.shaderRef = shader;
    };

    if (this.cfg.shadows) {
      const depthMaterial = new THREE.MeshDepthMaterial();
      depthMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.uTrailTexture = { value: this.trailTexture };
        shader.uniforms.uTrailCount = this.uTrailCount;
        shader.uniforms.uFadeTime = this.uFadeTime;
        shader.uniforms.uWaveSpeed = { value: params.waveSpeed };
        shader.uniforms.uWaveFreq = { value: params.waveFrequency };
        shader.uniforms.uWaveWidth = { value: params.waveWidth };
        shader.uniforms.uAmplitude = { value: params.waveAmplitude };
        shader.uniforms.uJitter = { value: params.waveJitter };
        shader.uniforms.uMaxHeight = { value: params.waveMaxHeight };
        shader.vertexShader = this.overrideVertexShader(shader.vertexShader);
      };
      this.mesh = new THREE.InstancedMesh(geometry, material, count);
      this.mesh.customDepthMaterial = depthMaterial;
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
    } else {
      this.mesh = new THREE.InstancedMesh(geometry, material, count);
    }

    this.scene.add(this.mesh);

    const dummy = new THREE.Object3D();
    const spacing = this.cubeWidth + this.gap;
    const offset = ((gridSize - 1) * spacing) / 2;
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const index = i * gridSize + j;
        const x = i * spacing - offset;
        const z = j * spacing - offset;
        dummy.position.set(x, 0, z);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(index, dummy.matrix);
        this.offsetAttribute.setXY(index, x, z);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.offsetAttribute.needsUpdate = true;
  }

  private updateCameraPose(mx: number, my: number) {
    const alpha = my * Math.PI * 0.03;
    const beta = mx * Math.PI * 0.05;
    const r = this.camRadius;
    this.camera.position.set(-r * Math.cos(alpha) * Math.sin(beta), r * Math.cos(alpha) * Math.cos(beta), r * Math.sin(alpha));
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
  }

  private bindEvents() {
    this.onPointerMove = (e: PointerEvent) => {
      this.rect = this.pointerRoot.getBoundingClientRect();
      if (this.rect.width < 1 || this.rect.height < 1) return;

      this.mouseNdc.set(
        ((e.clientX - this.rect.left) / this.rect.width) * 2 - 1,
        -((e.clientY - this.rect.top) / this.rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.mouseNdc, this.camera);
      const hits = this.raycaster.intersectObject(this.rayPlane);
      if (!hits.length) return;
      const { x, z } = hits[0].point;
      let distDelta = 0;
      if (this.lastPoint) {
        const dx = x - this.lastPoint.x;
        const dz = z - this.lastPoint.z;
        distDelta = Math.hypot(dx, dz);
        if (distDelta < 0.1) return;
      }
      if (this.trail.length >= MAX_TRAIL) this.trail.shift();
      this.trail.push({ x, z, age: 0, distDelta: Math.max(distDelta, 0.15) });
      this.lastPoint = { x, z };
      this.timeSinceLastMove = 0;
      this.isPlacingRandom = false;
      this.randomPointTimer = 0;
    };

    // Listen on window so canvas can stay pointer-events:none (CTAs clickable)
    this.onWinMove = (e: MouseEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      this.camMouse.x = (e.clientX / w) * 2 - 1;
      this.camMouse.y = -(e.clientY / h) * 2 + 1;
      // Only trail when over hero root
      this.rect = this.pointerRoot.getBoundingClientRect();
      if (e.clientX >= this.rect.left && e.clientX <= this.rect.right && e.clientY >= this.rect.top && e.clientY <= this.rect.bottom) {
        this.onPointerMove(e as unknown as PointerEvent);
      }
    };

    this.onResize = () => this.resize();
    window.addEventListener('pointermove', this.onWinMove, { passive: true });
    window.addEventListener('resize', this.onResize);
  }

  private addRandomPoint(strength = 0.8) {
    const x = (Math.random() * 0.5 - 0.25) * this.bounds;
    const z = (Math.random() * 0.5 - 0.25) * this.bounds;
    if (this.trail.length >= MAX_TRAIL) this.trail.shift();
    this.trail.push({
      x,
      z,
      age: 0,
      distDelta: strength + Math.random() * 0.2,
    });
  }

  private updateTrail(delta: number) {
    const expiry = this.uFadeTime.value * 4;
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].age += delta;
      if (this.trail[i].age > expiry) this.trail.splice(i, 1);
    }
    this.timeSinceLastMove += delta;
    if (this.timeSinceLastMove >= 2.5 && !this.isPlacingRandom) {
      this.isPlacingRandom = true;
      this.randomPointTimer = 0;
    }
    if (this.isPlacingRandom) {
      this.randomPointTimer += delta;
      if (this.randomPointTimer >= 1.35) {
        this.addRandomPoint();
        this.randomPointTimer = 0;
      }
    }
    const count = Math.min(this.trail.length, MAX_TRAIL);
    for (let i = 0; i < count; i++) {
      const ti = i * 4;
      this.trailData[ti] = this.trail[i].x;
      this.trailData[ti + 1] = this.trail[i].z;
      this.trailData[ti + 2] = this.trail[i].age;
      this.trailData[ti + 3] = this.trail[i].distDelta;
    }
    this.trailTexture.needsUpdate = true;
    this.uTrailCount.value = count;
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || Math.min(window.innerHeight * 0.92, 820);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.rect = this.pointerRoot.getBoundingClientRect();
  }

  setVisible(v: boolean) {
    this.visible = v;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private tick() {
    if (!this.running) return;
    if (document.hidden || !this.visible) return;

    const now = performance.now();
    const delta = Math.min((now - this.lastT) / 1000, 0.05);
    this.lastT = now;

    this.updateTrail(delta);
    this.camLerped.x += (this.camMouse.x - this.camLerped.x) * 0.04;
    this.camLerped.y += (this.camMouse.y - this.camLerped.y) * 0.04;
    this.updateCameraPose(this.camLerped.x, this.camLerped.y);

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    window.removeEventListener('pointermove', this.onWinMove);
    window.removeEventListener('resize', this.onResize);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose?.();
      }
    });
    this.trailTexture.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

export function pickQuality(): WaveGridQuality {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const w = window.innerWidth;
  if (w < 768) return 'low';
  if (w < 1024 || cores <= 4 || (mem !== undefined && mem <= 4)) return 'medium';
  return 'high';
}
