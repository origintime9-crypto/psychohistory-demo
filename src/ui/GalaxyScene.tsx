import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gsap from 'gsap';
import { Rng } from '../engine/rng';
import type { World } from '../engine/types';

export interface SceneSector {
  color: string;
  label: string;
  status: string;
  phase: number;
  event?: 'crisis' | 'science' | 'politics';
}
interface Props {
  world?: World;
  sectors?: SceneSector[];
  selected?: number;
  intro?: boolean;
  decorative?: boolean;
  network?: boolean;
  onSelect?: (sector: number) => void;
}
export interface GalaxyHandle {
  reset: () => void;
  zoom: (factor: number) => void;
}
interface Runtime {
  focus: (sector?: number) => void;
  zoom: (factor: number) => void;
  refresh: () => void;
}
const particleVertex = `
  attribute vec3 color;
  attribute float size;
  uniform float uTime;
  uniform float uAssembly;
  uniform float uDpr;
  varying vec3 vColor;
  void main() {
    float r = length(position.xz);
    float angle = uTime * 0.018 / (0.7 + r * 0.06);
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec3 p = position;
    p.xz = rot * p.xz;
    p *= 1.0 + (1.0 - uAssembly) * 4.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(size * uDpr * 120.0 / -mv.z, 1.0, 9.0 * uDpr);
    vColor = color;
  }
`;
const particleFragment = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float glow = pow(1.0 - d, 2.5);
    gl_FragColor = vec4(vColor * 1.25, glow * 0.88);
  }
`;
const planetFragment = `
  uniform vec3 uColor;
  uniform float uSeed;
  uniform float uTime;
  uniform float uDim;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 n = normalize(vNormal);
    float light = max(0.0, dot(n, normalize(vec3(-0.8, 0.7, 1.0))));
    float bands = sin(vPosition.y * 19.0 + sin(vPosition.x * 14.0 + uSeed) * 2.0 + uTime * 0.1);
    float continents = sin(vPosition.x * 13.0 + uSeed) * cos(vPosition.z * 11.0 + sin(vPosition.y * 15.0));
    vec3 surface = uColor * (0.52 + bands * 0.12 + continents * 0.13);
    float rim = pow(1.0 - max(0.0, n.z), 3.0);
    gl_FragColor = vec4((surface * (0.32 + light * 1.15) + uColor * rim * 0.7) * uDim, 1.0);
  }
`;
const sphereVertex = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
function sectorPosition(world: World, i: number) {
  return new THREE.Vector3(world.x[i] * 11.3, 0.22 + Math.sin(i * 3.1) * 0.18, world.y[i] * 11.3);
}
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.15, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/** Bake the diffuse spiral once; the star points keep their separate depth and motion. */
function nebulaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const random = new Rng('seldon-nebula-visual-only');
  ctx.globalCompositeOperation = 'lighter';
  const cloud = (x: number, y: number, radius: number, color: string) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  for (let i = 0; i < 900; i++) {
    const radius = Math.pow(random.uniform(), 0.66) * 210;
    const angle = ((i % 4) * Math.PI) / 2 + radius * 0.028;
    const spread = (random.uniform() - 0.5) * (8 + radius * 0.1);
    cloud(
      256 + Math.cos(angle) * radius + spread,
      256 + Math.sin(angle) * radius + spread,
      12 + random.uniform() * 17,
      radius < 65
        ? 'rgba(185,136,101,0.035)'
        : i % 3
          ? 'rgba(62,113,175,0.04)'
          : 'rgba(113,72,161,0.045)',
    );
  }
  cloud(256, 256, 100, 'rgba(220,170,111,0.5)');
  cloud(256, 256, 35, 'rgba(255,225,184,0.7)');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** WebGL is only the visual layer. HTML nodes retain keyboard interaction and labels. */
const GalaxyScene = forwardRef<GalaxyHandle, Props>(function GalaxyScene(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const runtime = useRef<Runtime | null>(null);
  const [fallback, setFallback] = useState(false);
  const [quality, setQuality] = useState('');
  useImperativeHandle(
    ref,
    () => ({
      reset: () => runtime.current?.focus(),
      zoom: (factor) => runtime.current?.zoom(factor),
    }),
    [],
  );

  useEffect(() => {
    const el = host.current!;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const small = window.matchMedia('(max-width: 760px)').matches;
    const economical = small || navigator.hardwareConcurrency <= 4;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !economical,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setFallback(true);
      return;
    }
    setFallback(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, economical ? 1.25 : 1.65));
    renderer.setClearColor(0x03070f, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
    const home = new THREE.Vector3(0, 26, 20);
    camera.position.copy(home);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 8;
    controls.maxDistance = props.intro ? 90 : 52;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.enabled = !props.decorative && !props.intro;
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.update();
    const random = new Rng('seldon-galaxy-visual-only');
    const count = economical ? 6500 : 18000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const radius = Math.pow(random.uniform(), 0.66) * 12.5;
      const arm = i % 4;
      const angle =
        (arm * Math.PI) / 2 + radius * 0.48 + (random.uniform() - 0.5) * (0.2 + 1.3 / (radius + 1));
      const spread = (random.uniform() - 0.5) * (0.25 + radius * 0.1);
      positions.set(
        [
          Math.cos(angle) * radius + spread,
          (random.uniform() - 0.5) * (0.12 + (1 - radius / 13) * 0.9),
          Math.sin(angle) * radius + spread,
        ],
        i * 3,
      );
      const color = new THREE.Color().setRGB(
        0.28 + (1 - radius / 13) * 0.6,
        0.46 + random.uniform() * 0.2,
        0.76 + random.uniform() * 0.24,
      );
      if (random.uniform() < 0.13) color.setRGB(0.75, 0.63, 0.4);
      colors.set([color.r, color.g, color.b], i * 3);
      sizes[i] = 0.28 + random.uniform() * 0.7;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const particleMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      uniforms: {
        uTime: { value: 0 },
        uAssembly: { value: props.intro && !motion.matches ? 0 : 1 },
        uDpr: { value: renderer.getPixelRatio() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(dust);
    const nebulaMap = nebulaTexture();
    const nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshBasicMaterial({
        map: nebulaMap,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    nebula.rotation.x = -Math.PI / 2;
    nebula.position.y = -0.12;
    scene.add(nebula);
    const starPositions = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++)
      starPositions.set(
        [
          (random.uniform() - 0.5) * 100,
          (random.uniform() - 0.5) * 55 - 5,
          (random.uniform() - 0.5) * 100,
        ],
        i * 3,
      );
    const starGeometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.BufferAttribute(starPositions, 3),
    );
    scene.add(
      new THREE.Points(
        starGeometry,
        new THREE.PointsMaterial({
          color: 0x8199bd,
          size: 0.05,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        }),
      ),
    );
    const texture = glowTexture();
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color: 0xd4c9b7,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.72,
      }),
    );
    core.scale.set(7.2, 7.2, 1);
    scene.add(core);
    const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
    const ringGeometry = new THREE.RingGeometry(0.9, 1, 56);
    const planets: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>[] = [];
    const halos: THREE.Sprite[] = [];
    const waves: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
    const lines: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>[] = [];
    const world = props.world;
    if (world) {
      for (let i = 0; i < world.n; i++) {
        const pos = sectorPosition(world, i);
        const material = new THREE.ShaderMaterial({
          vertexShader: sphereVertex,
          fragmentShader: planetFragment,
          uniforms: {
            uColor: { value: new THREE.Color('#7da8ce') },
            uSeed: { value: i * 17.3 },
            uTime: { value: 0 },
            uDim: { value: 1 },
          },
        });
        const planet = new THREE.Mesh(sphereGeometry, material);
        const radius =
          i === world.capital ? 0.26 : i === world.terminus ? 0.22 : 0.14 + world.weights[i] * 0.6;
        planet.position.copy(pos);
        planet.scale.setScalar(Math.min(0.25, radius));
        scene.add(planet);
        planets.push(planet);
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.45,
          }),
        );
        halo.position.copy(pos);
        halo.scale.setScalar(radius * 5.5);
        scene.add(halo);
        halos.push(halo);
        const wave = new THREE.Mesh(
          ringGeometry,
          new THREE.MeshBasicMaterial({
            color: 0xe7ba79,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        wave.position.copy(pos);
        wave.rotation.x = -Math.PI / 2;
        scene.add(wave);
        waves.push(wave);
      }
      for (const [a, b] of world.edges) {
        const start = sectorPosition(world, a),
          end = sectorPosition(world, b);
        const midpoint = start.clone().lerp(end, 0.5);
        midpoint.y += start.distanceTo(end) * 0.12;
        const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)),
          new THREE.LineDashedMaterial({
            color: 0x437283,
            transparent: true,
            opacity: 0.14,
            dashSize: 0.3,
            gapSize: 0.15,
            depthWrite: false,
          }),
        );
        line.material.onBeforeCompile = (shader) => {
          shader.uniforms.uFlow = { value: 0 };
          shader.fragmentShader =
            'uniform float uFlow;\n' +
            shader.fragmentShader.replace(
              'mod( vLineDistance, totalSize )',
              'mod( vLineDistance + uFlow, totalSize )',
            );
          line.userData.shader = shader;
        };
        line.computeLineDistances();
        scene.add(line);
        lines.push(line);
      }
    }
    let composer: EffectComposer | null = null;
    if (!economical && !motion.matches) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.45, 0.7));
      composer.addPass(new OutputPass());
    }
    const refresh = () => {
      const p = latest.current;
      planets.forEach((planet, i) => {
        const sector = p.sectors?.[i];
        if (!sector) return;
        const color = sector.color;
        planet.material.uniforms.uColor.value.set(color);
        planet.material.uniforms.uDim.value =
          p.selected === undefined || i === p.selected || world!.neighbors[p.selected].includes(i)
            ? 1
            : 0.38;
        halos[i].material.color.set(color);
        halos[i].material.opacity = p.selected !== undefined && i !== p.selected ? 0.2 : 0.55;
        waves[i].material.color.set(
          sector.event === 'science'
            ? '#85dcf1'
            : sector.event === 'politics'
              ? '#e6bb73'
              : '#f37888',
        );
      });
      lines.forEach((line, i) => {
        const [a, b] = world!.edges[i];
        const highlighted = p.selected === a || p.selected === b;
        const hot =
          p.sectors?.[a].phase === 1 ||
          p.sectors?.[a].phase === 2 ||
          p.sectors?.[b].phase === 1 ||
          p.sectors?.[b].phase === 2;
        line.visible = !!p.network;
        line.material.color.set(highlighted ? (hot ? '#e5a590' : '#7ad9e8') : '#427286');
        line.material.opacity = highlighted ? 0.62 : p.selected !== undefined ? 0.06 : 0.16;
      });
    };
    const tweenTargets: object[] = [
      camera.position,
      controls.target,
      particleMaterial.uniforms.uAssembly,
    ];
    const cancelCameraMove = () => {
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(controls.target);
    };
    controls.addEventListener('start', cancelCameraMove);
    const focus = (sector?: number) => {
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(controls.target);
      const target =
        sector === undefined || !world ? new THREE.Vector3() : sectorPosition(world, sector);
      const dest =
        sector === undefined ? home.clone() : target.clone().add(new THREE.Vector3(0, 12, 10));
      // Bias the view toward the planet, leaving the right-hand side for its archive drawer.
      if (sector !== undefined && el.clientWidth > 760) {
        target.x += 3.3;
        dest.x += 3.3;
      }
      const duration = motion.matches ? 0 : 1.35;
      gsap.to(camera.position, { x: dest.x, y: dest.y, z: dest.z, duration, ease: 'power2.inOut' });
      gsap.to(controls.target, {
        x: target.x,
        y: target.y,
        z: target.z,
        duration,
        ease: 'power2.inOut',
      });
    };
    const zoom = (factor: number) => {
      gsap.killTweensOf(camera.position);
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(
        offset.length() * factor,
        controls.minDistance,
        controls.maxDistance,
      );
      const dest = controls.target.clone().add(offset.setLength(distance));
      gsap.to(camera.position, {
        x: dest.x,
        y: dest.y,
        z: dest.z,
        duration: motion.matches ? 0 : 0.35,
        ease: 'power2.out',
      });
    };
    runtime.current = { focus, zoom, refresh };
    refresh();
    if (props.intro && !motion.matches) {
      camera.position.set(0, 58, 44);
      gsap.to(particleMaterial.uniforms.uAssembly, {
        value: 1,
        duration: 1.15,
        ease: 'power2.out',
      });
      gsap.to(camera.position, {
        x: 0,
        y: 26,
        z: 20,
        duration: 1.6,
        delay: 0.9,
        ease: 'power2.inOut',
      });
    }
    let width = 1,
      height = 1;
    const resize = () => {
      const previousWidth = width;
      width = el.clientWidth || 1;
      height = el.clientHeight || 1;
      renderer.setSize(width, height);
      composer?.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      home.set(0, 26, 20).multiplyScalar(Math.min(1.55, Math.max(1, 1.1 / camera.aspect)));
      if (world && (previousWidth === 1 || previousWidth > 760 !== width > 760)) {
        focus(latest.current.selected);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    let visible = true,
      lost = false,
      alive = true;
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    });
    intersection.observe(el);
    const contextLost = (event: globalThis.Event) => {
      event.preventDefault();
      lost = true;
      setFallback(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    const projection = new THREE.Vector3();
    const frameLabels = () => {
      if (!world || !labels.current) return;
      const p = latest.current;
      const nodes = Array.from(labels.current.children) as HTMLButtonElement[];
      const occupied: { x: number; y: number }[] = [];
      const order = nodes
        .map((_, i) => i)
        .sort(
          (a, b) =>
            (b === p.selected
              ? 100
              : b === world.capital || b === world.terminus
                ? 50
                : p.sectors?.[b].event
                  ? 20
                  : 0) -
            (a === p.selected
              ? 100
              : a === world.capital || a === world.terminus
                ? 50
                : p.sectors?.[a].event
                  ? 20
                  : 0),
        );
      for (const i of order) {
        projection.copy(planets[i].position).project(camera);
        const x = (projection.x * 0.5 + 0.5) * width,
          y = (-projection.y * 0.5 + 0.5) * height;
        const inFrame =
          projection.z < 1 &&
          projection.z > -1 &&
          x > 12 &&
          x < width - 12 &&
          y > 12 &&
          y < height - 12;
        nodes[i].style.transform = `translate(${x}px, ${y}px)`;
        nodes[i].style.visibility = inFrame ? 'visible' : 'hidden';
        const show =
          inFrame &&
          (i === p.selected ||
            i === world.capital ||
            i === world.terminus ||
            !!p.sectors?.[i].event);
        const collides = occupied.some((q) => Math.abs(q.x - x) < 155 && Math.abs(q.y - y) < 44);
        nodes[i].dataset.label = show && (!collides || i === p.selected) ? 'visible' : 'hidden';
        if (show && !collides) occupied.push({ x, y });
      }
    };
    let frame = 0,
      last = performance.now(),
      sampleStart = last,
      samples = 0,
      downgraded = economical;
    let elapsed = 0;
    const draw = (now: number) => {
      if (!alive) return;
      frame = requestAnimationFrame(draw);
      if (!visible || document.hidden || lost) {
        last = now;
        sampleStart = now;
        samples = 0;
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!motion.matches) elapsed += dt;
      particleMaterial.uniforms.uTime.value = elapsed;
      nebula.rotation.z = -elapsed * 0.007;
      nebula.material.opacity =
        (latest.current.selected === undefined ? 0.46 : 0.25) *
        particleMaterial.uniforms.uAssembly.value;
      planets.forEach((planet, i) => {
        planet.material.uniforms.uTime.value = elapsed;
        if (!motion.matches) planet.rotation.y += dt * 0.06;
        const active = latest.current.sectors?.[i].event || i === latest.current.selected;
        const progress = motion.matches ? 0.38 : (elapsed * 0.38 + i * 0.13) % 1;
        waves[i].visible = !!active;
        waves[i].scale.setScalar(0.28 + progress * 1.1);
        waves[i].material.opacity = active ? (1 - progress) * 0.55 : 0;
      });
      if (!motion.matches)
        lines.forEach((line) => {
          if (line.userData.shader) line.userData.shader.uniforms.uFlow.value = -elapsed * 0.16;
        });
      controls.update();
      camera.updateMatrixWorld();
      frameLabels();
      if (composer) composer.render();
      else renderer.render(scene, camera);
      samples++;
      if (!downgraded && now - sampleStart > 3000) {
        const fps = (samples * 1000) / (now - sampleStart);
        if (fps < 32) {
          composer?.passes.forEach((pass) => pass.dispose());
          composer?.dispose();
          composer = null;
          renderer.setPixelRatio(1);
          particleMaterial.uniforms.uDpr.value = 1;
          particleGeometry.setDrawRange(0, 6500);
          resize();
          downgraded = true;
          setQuality('流畅模式');
        }
        sampleStart = now;
        samples = 0;
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      tweenTargets.forEach((target) => gsap.killTweensOf(target));
      runtime.current = null;
      observer.disconnect();
      intersection.disconnect();
      controls.removeEventListener('start', cancelCameraMove);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        if (mesh.material)
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) =>
            materials.add(m),
          );
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      texture.dispose();
      nebulaMap.dispose();
      composer?.passes.forEach((pass) => pass.dispose());
      composer?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [props.world, props.intro, props.decorative]);
  useEffect(() => {
    runtime.current?.refresh();
  }, [props.sectors, props.selected, props.network]);
  useEffect(() => {
    if (props.world) runtime.current?.focus(props.selected);
  }, [props.selected, props.world]);

  return (
    <div
      ref={host}
      className={`galaxy-scene ${props.decorative ? 'decorative' : ''} ${fallback ? 'galaxy-fallback' : ''}`}
      aria-hidden={props.decorative || undefined}
    >
      {fallback && (
        <div className="fallback-nebula" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
      {props.world && (
        <div className={`galaxy-nodes ${fallback ? 'fallback-nodes' : ''}`} ref={labels}>
          {props.sectors?.map((sector, i) => (
            <button
              key={i}
              type="button"
              className={`galaxy-node ${i === props.world!.capital ? 'capital-node' : ''} ${props.selected === i ? 'selected' : ''} ${sector.event ? 'has-event' : ''}`}
              style={
                {
                  '--star-color': sector.color,
                  ...(fallback
                    ? {
                        left: `${50 + props.world!.x[i] * 40}%`,
                        top: `${48 + props.world!.y[i] * 35}%`,
                        transform: 'none',
                      }
                    : {}),
                } as React.CSSProperties
              }
              aria-label={`${sector.label}，${sector.status}`}
              aria-pressed={props.selected === i}
              onClick={() => latest.current.onSelect?.(i)}
            >
              <span className="node-point" />
              <span className="node-label">
                <b>{sector.label}</b>
                <small>
                  {sector.event ? '◈ ' : ''}
                  {sector.status}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
      {!props.decorative && (fallback || quality) && (
        <span className="scene-quality">{fallback ? '平面星图 · 仍可选择星区' : quality}</span>
      )}
    </div>
  );
});
export default GalaxyScene;
