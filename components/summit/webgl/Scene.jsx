"use client";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { stakeholders } from "../data/content";
import { vertex, fluidFragment, textFragment } from "./shaders";
const clamp = THREE.MathUtils.clamp,
  lerp = THREE.MathUtils.lerp;
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
// The outer silhouette also covers the gaps between the logo's strokes,
// keeping incoming letters behind the entire mark.
function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a, b, c) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (list) => {
    const result = [];
    for (const point of list) {
      while (
        result.length > 1 &&
        cross(result.at(-2), result.at(-1), point) <= 0
      )
        result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
function Logo({ motion }) {
  const { scene } = useGLTF("/models/aidsl-logo.glb");
  const group = useRef();
  const target = useMemo(() => new THREE.Vector3(), []);
  const { viewport, size: screen, camera } = useThree();
  const titleMasks = useRef([]);
  const lastMasks = useRef([]);
  useEffect(() => {
    const masks = ["[data-title-one]", "[data-title-two]"].map(
      (selector) => document.querySelector(selector)?.parentElement,
    );
    titleMasks.current = masks;
    return () =>
      masks.forEach((mask) => mask?.style.removeProperty("clip-path"));
  }, []);
  const navAnchor = useRef({ x: 0.08, y: 0.045 });
  useEffect(() => {
    const mark = document.querySelector("[data-nav] img");
    if (!mark) return;
    const rect = mark.getBoundingClientRect();
    navAnchor.current = {
      x: (rect.left + rect.width / 2) / screen.width,
      y: (rect.top + rect.height / 2) / screen.height,
    };
  }, [screen.width, screen.height]);
  const { model, normalization, outline } = useMemo(() => {
    const model = scene.clone(true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3());
    model.position.sub(center);
    model.updateMatrixWorld(true);
    const points = [];
    let near = -Infinity,
      far = Infinity;
    model.traverse((node) => {
      const vertices = node.geometry?.attributes.position;
      if (!vertices) return;
      for (let i = 0; i < vertices.count; i++) {
        const point = new THREE.Vector3()
          .fromBufferAttribute(vertices, i)
          .applyMatrix4(node.matrixWorld);
        points.push(point);
        near = Math.max(near, point.z);
        far = Math.min(far, point.z);
      }
    });
    return {
      model,
      normalization: 1 / Math.max(size.x, size.y),
      outline: convexHull(points).flatMap(({ x, y }) => [
        new THREE.Vector3(x, y, near),
        new THREE.Vector3(x, y, far),
      ]),
    };
  }, [scene]);
  useFrame((_, dt) => {
    if (document.hidden || !group.current) return;
    const s = motion.current,
      p = s.scene === "hero" ? s.heroProgress : s.progress,
      w = viewport.width,
      h = viewport.height;
    const navX = (navAnchor.current.x - 0.5) * w,
      navY = (0.5 - navAnchor.current.y) * h;
    let visible = ["hero", "registration", "contact"].includes(s.scene),
      x = 0,
      y = 0,
      size = w * 0.22,
      rx = 0,
      ry = 0,
      rz = 0;
    if (s.scene === "hero") {
      size = w * (w < 6 ? 0.36 : 0.23) * lerp(0.84, 1, s.intro);
      rz = lerp(-0.052, 0, s.intro);
      if (p < 0.2) {
        const k = smooth(p / 0.2);
        x = w * 0.12 * k;
        y = -h * 0.015 * k;
        rx = -0.122 * k;
        ry = 0.21 * k;
        rz += 0.052 * k;
        size *= lerp(1, 1.05, k);
      } else if (p < 0.72) {
        const k = smooth((p - 0.2) / 0.25);
        x = lerp(w * 0.12, 0, k);
        y = lerp(-h * 0.015, 0, k);
        rx = lerp(-0.122, 0.21, k);
        ry = lerp(0.21, 0.96, k);
        rz += lerp(0.052, 0, k);
        size *= 1.05;
      } else {
        const k = smooth((p - 0.72) / 0.28);
        rx = lerp(0.21, 0, k);
        ry = lerp(0.96, 0, k);
        // The mark travels into the fixed navigation identity as the
        // molten handoff completes, instead of disappearing in open space.
        size = lerp(size * 1.05, w * 0.025, k);
        x = lerp(0, navX, k);
        y = lerp(0, navY, k);
        visible = true;
      }
    } else if (s.scene === "manifesto") {
      // Settle into the navigation mark, then clear the canvas for the
      // manifesto composition.
      x = navX;
      y = navY;
      const merge = smooth(s.progress / 0.12);
      size = lerp(w * 0.025, 0, merge);
      visible = merge < 1;
    } else if (s.scene === "registration") {
      const reading = smooth(s.registrationOffset / (screen.height * 0.55));
      x = w * (w < 6 ? 0.32 : 0.27);
      y =
        -h * (w < 6 ? 0.21 : 0.05) + (s.registrationOffset / screen.height) * h;
      size = w * (w < 6 ? 0.27 : 0.34) * clamp(p / 0.2, 0, 1) * (1 - reading);
      ry = -0.15;
      visible = p > 0.02 && p < 0.83 && reading < 1;
    } else if (s.scene === "contact") {
      // Reserve space for the full silhouette, including its pointer tilt.
      const portrait = viewport.aspect < 0.8;
      size = Math.min(w * (portrait ? 0.35 : 0.28), h * 0.52);
      const extent = size * 0.6;
      x = w * 0.5 - extent - w * 0.045;
      y = -h * 0.5 + extent + h * 0.09;
      rx = 0.087;
      ry = lerp(-0.262, 0.175, p);
    }
    if (s.reduced) {
      visible = s.scene === "hero";
      size = w * 0.2;
    }
    if (
      ["registration", "contact"].includes(s.scene) &&
      s.pointer.active &&
      !s.reduced
    ) {
      ry += (s.pointer.x - 0.5) * 0.28;
      rx += (s.pointer.y - 0.5) * 0.175;
    }
    group.current.visible = visible && s.intro > 0.04;
    const a = 1 - Math.exp(-dt * 9);
    group.current.position.lerp(target.set(x, y, 0), a);
    group.current.rotation.x = lerp(group.current.rotation.x, rx, a);
    group.current.rotation.y = lerp(group.current.rotation.y, ry, a);
    group.current.rotation.z = lerp(group.current.rotation.z, rz, a);
    group.current.scale.setScalar(
      ["hero", "manifesto"].includes(s.scene)
        ? lerp(group.current.scale.x, size * normalization, a)
        : size * normalization,
    );
    if (
      s.scene === "hero" &&
      s.heroProgress === 0 &&
      titleMasks.current.length === 2 &&
      titleMasks.current.every(Boolean)
    ) {
      group.current.updateMatrixWorld(true);
      const rect = titleMasks.current[0].getBoundingClientRect();
      const hull = convexHull(
        outline.map((point) => {
          const projected = point
            .clone()
            .applyMatrix4(group.current.matrixWorld)
            .project(camera);
          return {
            x: ((projected.x + 1) * screen.width) / 2 - rect.left,
            y: ((1 - projected.y) * screen.height) / 2 - rect.top,
          };
        }),
      );
      const top = hull.reduce(
        (best, point, i) => (point.y < hull[best].y ? i : best),
        0,
      );
      const bottom = hull.reduce(
        (best, point, i) => (point.y > hull[best].y ? i : best),
        0,
      );
      const chain = (step) => {
        const points = [hull[top]];
        for (let i = top; i !== bottom; ) {
          i = (i + step + hull.length) % hull.length;
          points.push(hull[i]);
        }
        return points;
      };
      const sides = [chain(1), chain(-1)].sort(
        (a, b) =>
          a.reduce((sum, point) => sum + point.x, 0) / a.length -
          b.reduce((sum, point) => sum + point.x, 0) / b.length,
      );
      sides.forEach((side, i) => {
        const edge = i === 0 ? 0 : rect.width;
        const boundary = side.map(({ x, y }) => ({
          x: x + (i === 0 ? -2 : 2),
          y,
        }));
        const polygon = [
          { x: edge, y: 0 },
          { x: boundary[0].x, y: 0 },
          ...boundary,
          { x: boundary.at(-1).x, y: rect.height },
          { x: edge, y: rect.height },
        ]
          .map(({ x, y }) => `${x.toFixed(2)}px ${y.toFixed(2)}px`)
          .join(", ");
        const value = `polygon(${polygon})`;
        if (lastMasks.current[i] !== value) {
          titleMasks.current[i].style.clipPath = value;
          lastMasks.current[i] = value;
        }
      });
    }
  });
  return (
    <group ref={group} scale={0}>
      <primitive object={model} />
    </group>
  );
}
function OrangeFluid({ motion }) {
  const mesh = useRef();
  const { viewport } = useThree();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uIntensity: { value: 1 },
      uPanel: { value: 0 },
      uAspect: { value: 1 },
      uPanelTop: { value: 0.87 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    }),
    [],
  );
  useFrame((_, dt) => {
    if (document.hidden) return;
    const s = motion.current;
    let progress = 0;
    if (s.scene === "hero")
      progress = clamp((s.heroProgress - 0.7) / 0.28, 0, 1.2);
    if (s.scene === "manifesto") progress = 1.2;
    if (s.scene === "registration") progress = clamp(s.progress / 0.22, 0, 1.2);
    if (s.scene === "contact") progress = 1.2;
    mesh.current.visible = progress > 0 && !s.reduced;
    const live = mesh.current.material.uniforms;
    live.uTime.value += dt;
    live.uProgress.value = progress;
    live.uMouse.value.set(s.pointer.x, 1 - s.pointer.y);
    live.uIntensity.value = s.scene === "contact" ? 0.85 : 1;
    live.uPanel.value = s.scene === "registration" ? 1 : 0;
    live.uAspect.value = viewport.width / viewport.height;
    live.uPanelTop.value = innerWidth < 600 ? 0.9 : 0.87;
  });
  return (
    <mesh
      ref={mesh}
      position={[0, 0, -4]}
      scale={[viewport.width * 1.5, viewport.height * 1.5, 1]}
    >
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={vertex}
        fragmentShader={fluidFragment}
      />
    </mesh>
  );
}
function Ecosystem({ motion }) {
  const texture = useTexture("/graphics/aidsl-ecosystem.webp");
  const group = useRef(),
    art = useRef(),
    words = useRef([]);
  const { viewport } = useThree();
  const heatMaterials = useMemo(
    () =>
      stakeholders.map(() => {
        const material = new THREE.MeshBasicMaterial({
          transparent: true,
          depthWrite: false,
        });
        material.userData.heat = {
          uHeat: { value: 0 },
          uHeatTime: { value: 0 },
        };
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, material.userData.heat);
          shader.vertexShader =
            "uniform float uHeat; uniform float uHeatTime;\n" +
            shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\ntransformed.x += sin(position.y * 34.0 + uHeatTime) * uHeat * 0.022; transformed.y += sin(position.x * 28.0 + uHeatTime * 0.7) * uHeat * 0.012;",
          );
        };
        material.customProgramCacheKey = () => "summit-orbit-heat";
        return material;
      }),
    [],
  );
  useEffect(
    () => () => heatMaterials.forEach((material) => material.dispose()),
    [heatMaterials],
  );
  useFrame(() => {
    if (document.hidden) return;
    const s = motion.current,
      p = s.progress;
    group.current.visible = s.scene === "ecosystem" && !s.reduced;
    if (!group.current.visible) return;
    const size = Math.min(
        viewport.width * (viewport.aspect < 0.8 ? 0.86 : 0.67),
        viewport.height * 0.83,
      ),
      arrival = clamp(p / 0.3, 0, 1);
    art.current.scale.setScalar(
      size *
        lerp(0.65, 1, arrival) *
        (1 + clamp((p - 0.85) / 0.15, 0, 1) * 0.12),
    );
    art.current.position.y = lerp(-viewport.height * 0.4, 0, arrival);
    words.current.forEach((word, i) => {
      if (!word) return;
      const a = (i / 6) * Math.PI * 2 + p * Math.PI * 2.2;
      let x = Math.cos(a) * size * (viewport.aspect < 0.8 ? 0.5 : 0.52),
        y = Math.sin(a) * size * 0.19,
        z = -Math.sin(a) * 1.1;
      // Tilt the elliptical orbit to follow the artwork's diagonal ring.
      const tilt = 0.46,
        tx = x * Math.cos(tilt) - y * Math.sin(tilt),
        ty = x * Math.sin(tilt) + y * Math.cos(tilt);
      x = tx;
      y = ty + size * 0.12;
      if (p > 0.7) {
        const release = clamp((p - 0.7) / 0.15, 0, 1);
        const positions = [
          [-0.75, 0.36],
          [0, -0.42],
          [-0.68, -0.32],
          [0, 0.43],
          [0.7, -0.3],
          [0.72, 0.34],
        ];
        x = lerp(x, positions[i][0] * size, release);
        y = lerp(y, positions[i][1] * size, release);
        z = lerp(z, 0.4, release);
      }
      if (p > 0.85) {
        const collapse = clamp((p - 0.85) / 0.12, 0, 1);
        x *= 1 - collapse;
        y *= 1 - collapse;
        z = lerp(z, -0.5, collapse);
      }
      word.position.set(x, y, z);
      const front = (1 - Math.sin(a)) / 2;
      word.scale.setScalar(lerp(0.82, 1.1, front));
      word.fillOpacity =
        clamp((p - 0.22) / 0.12, 0, 1) *
        lerp(0.4, 1, front) *
        (1 - clamp((p - 0.9) / 0.07, 0, 1));
      word.color = front > 0.9 ? "#e8450a" : "#fcf9e7";
      let tangentAngle =
        Math.atan2(Math.cos(a) * 0.19, -Math.sin(a) * 0.52) + tilt;
      if (tangentAngle > Math.PI / 2) tangentAngle -= Math.PI;
      if (tangentAngle < -Math.PI / 2) tangentAngle += Math.PI;
      const releaseRotation = 1 - clamp((p - 0.7) / 0.15, 0, 1);
      word.rotation.z = tangentAngle * releaseRotation;
      word.rotation.y = -Math.cos(a) * 0.4 * releaseRotation;
      word.visible = p > 0.22 && p < 0.98;
      const heat = heatMaterials[i].userData.heat;
      heat.uHeat.value =
        z > 0 ? clamp(1 - Math.abs(x) / (size * 0.3), 0, 1) : 0;
      heat.uHeatTime.value = p * 12;
    });
  });
  return (
    <group ref={group} visible={false}>
      <mesh ref={art} position={[0, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={texture}
          transparent
          alphaTest={0.08}
          depthWrite
          toneMapped={false}
        />
      </mesh>
      {stakeholders.map((word, i) => (
        <Text
          key={word}
          ref={(el) => (words.current[i] = el)}
          font="/fonts/summit-orbit.ttf"
          fontSize={Math.min(
            viewport.width * (viewport.aspect < 0.8 ? 0.032 : 0.023),
            0.21,
          )}
          anchorX="center"
          anchorY="middle"
          letterSpacing={-0.04}
          outlineWidth={0}
          material={heatMaterials[i]}
        >
          {word}
        </Text>
      ))}
    </group>
  );
}
function LiquidHeading({ motion }) {
  const mesh = useRef();
  const { viewport, size } = useThree();
  const [texture, setTexture] = useState(null);
  const uniforms = useMemo(
    () => ({
      uTexture: { value: null },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uTargetMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uTime: { value: 0 },
      uRadius: { value: 0.25 },
      uStrength: { value: 0 },
      uVelocity: { value: 0 },
      uAspect: { value: 1 },
    }),
    [],
  );
  useEffect(() => {
    let disposed = false,
      created;
    document.fonts.ready.then(() => {
      if (disposed) return;
      const el = document.querySelector("[data-contact-heading]");
      if (!el) return;
      const css = getComputedStyle(el),
        r = el.getBoundingClientRect(),
        canvas = document.createElement("canvas");
      const dpr = Math.min(devicePixelRatio, 1.75);
      canvas.width = Math.ceil(r.width * dpr);
      canvas.height = Math.ceil(r.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#fcf9e7";
      ctx.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
      ctx.textBaseline = "top";
      ctx.letterSpacing = css.letterSpacing;
      const fontSize = parseFloat(css.fontSize),
        line = parseFloat(css.lineHeight);
      ["LET’S SHAPE", "SRI LANKA’S", "AI FUTURE."].forEach((text, i) =>
        ctx.fillText(text, 0, i * line - fontSize * 0.08),
      );
      created = new THREE.CanvasTexture(canvas);
      created.colorSpace = THREE.SRGBColorSpace;
      uniforms.uTexture.value = created;
      setTexture({
        width: r.width,
        height: r.height,
        left: r.left,
        top: parseFloat(css.top),
        map: created,
      });
    });
    return () => {
      disposed = true;
      created?.dispose();
    };
  }, [size.width, size.height, uniforms]);
  useFrame((_, dt) => {
    if (!mesh.current || document.hidden) return;
    const live = mesh.current.material.uniforms;
    const s = motion.current;
    mesh.current.visible = s.scene === "contact" && !s.reduced;
    if (!texture) return;
    const px = s.pointer.x * size.width,
      py = s.pointer.y * size.height;
    const target = new THREE.Vector2(
      (px - texture.left) / texture.width,
      1 - (py - texture.top) / texture.height,
    );
    live.uTargetMouse.value.copy(target);
    live.uVelocity.value = lerp(
      live.uVelocity.value,
      Math.min(target.distanceTo(live.uMouse.value), 1),
      0.08,
    );
    live.uMouse.value.lerp(target, 0.08);
    live.uStrength.value = lerp(
      live.uStrength.value,
      s.pointer.active ? 1 : 0,
      0.08,
    );
    live.uTime.value += dt;
    live.uRadius.value = 210 / texture.height;
    live.uAspect.value = texture.width / texture.height;
  });
  if (!texture) return null;
  return (
    <mesh
      ref={mesh}
      position={[
        ((texture.left + texture.width / 2) / size.width) * viewport.width -
          viewport.width / 2,
        viewport.height / 2 -
          ((texture.top + texture.height / 2) / size.height) * viewport.height,
        0,
      ]}
      scale={[
        (texture.width / size.width) * viewport.width,
        (texture.height / size.height) * viewport.height,
        1,
      ]}
    >
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertex}
        fragmentShader={textFragment}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
function World({ motion, onReady }) {
  const key = useRef();
  useEffect(() => {
    onReady();
  }, [onReady]);
  useFrame(() => {
    if (key.current)
      key.current.intensity =
        motion.current.scene === "hero" ? motion.current.intro * 2.1 : 2.1;
  });
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight
        ref={key}
        position={[3, 4, 6]}
        color="#fff0d8"
        intensity={2.1}
      />
      <directionalLight position={[-4, 2, -3]} color="#ff4b00" intensity={3} />
      <directionalLight
        position={[-3, -1, 3]}
        color="#921f0d"
        intensity={0.65}
      />
      <OrangeFluid motion={motion} />
      <Logo motion={motion} />
      <Ecosystem motion={motion} />
      <LiquidHeading motion={motion} />
    </>
  );
}
class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function Scene({ motion, reduced, onReady, onFailure }) {
  const [visible, setVisible] = useState(true),
    [supported, setSupported] = useState(false);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    const available = Boolean(canvas.getContext("webgl2"));
    setSupported(available);
    if (!available) onFailure?.();
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  if (!supported || reduced) return null;
  return (
    <Boundary onFailure={onFailure}>
      <Canvas
        dpr={[1, innerWidth < 650 ? 1.25 : 1.75]}
        camera={{ position: [0, 0, 8], fov: 40 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        frameloop={visible ? "always" : "never"}
        onCreated={({ gl }) => {
          gl.setClearColor("#070505", 0);
        }}
      >
        <Suspense fallback={null}>
          <World motion={motion} onReady={onReady} />
        </Suspense>
      </Canvas>
    </Boundary>
  );
}
