import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PotMesh } from './PotMesh.jsx';
import { createTaperedTubeGeometry, quaternionFromDirection } from './geometryUtils.js';

/**
 * A procedural golden tree grown from the eight daily reference renders
 * (TREE/0 … TREE/7). The layout (trunk curve, branch fan, sub-branches,
 * leaf clusters, roots) is deterministic and fixed; a single continuous
 * growth value `f` (0..7, spring-eased toward the current day) drives
 * every organ through its own reveal window in biological order:
 *
 *   roots (day 0) → trunk (continuously) → primary branches
 *   (one by one, day ~1.5+) → secondary branches (after their parent)
 *   → leaves (as each branch tip passes them).
 *
 * Stage targets (trunk height/radius) interpolate between the day
 * checkpoints, so the tree never pops, teleports, or uniform-scales —
 * each tube grows along its own curve.
 */

const MAX_PRIMARIES = 12;
const MAX_SECONDARIES = MAX_PRIMARIES * 2;
const MAX_LEAVES = 224;
const SPROUT_LEAF_COUNT = 5;
const FULL_TRUNK_HEIGHT = 1.5;

/** Day checkpoints matching the reference progression. */
const STAGES = [
  { trunkH: 0.34, trunkR: 0.032 }, // 0 — tiny sprout
  { trunkH: 0.52, trunkR: 0.038 }, // 1 — sprout with tip leaves
  { trunkH: 0.70, trunkR: 0.044 }, // 2 — first branch nubs
  { trunkH: 0.88, trunkR: 0.050 }, // 3 — two/three branches, sparse leaves
  { trunkH: 1.05, trunkR: 0.056 }, // 4 — spreading branches
  { trunkH: 1.22, trunkR: 0.062 }, // 5 — wider canopy
  { trunkH: 1.38, trunkR: 0.070 }, // 6 — dense canopy
  { trunkH: 1.50, trunkR: 0.078 }, // 7 — full mature tree
];

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Deterministic PRNG so the tree layout is stable across renders. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTrunkCurve(height) {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.045, height * 0.33, 0.02),
    new THREE.Vector3(-0.03, height * 0.66, -0.02),
    new THREE.Vector3(0.012, height, 0.012),
  ]);
}

function createLeafGeometry() {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    0, 0.34, 0,         // tip
    -0.16, -0.06, 0.05, // left base
    0.16, -0.06, -0.05, // right base
    0, -0.2, 0,         // stem base
  ]);
  const indices = [0, 1, 2, 2, 1, 3];
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Soft radial gold halo texture matching the reference canopy glow. */
function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255, 217, 154, 0.85)');
  gradient.addColorStop(0.35, 'rgba(232, 178, 96, 0.38)');
  gradient.addColorStop(0.75, 'rgba(196, 140, 66, 0.12)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Fixed layout: trunk curve (full height), primary branch curves with
 * birth times, secondary branch curves, leaf placements on secondaries,
 * sprout leaves at the trunk tip, and roots at the base.
 */
function buildTreeLayout() {
  const rand = mulberry32(20260916);
  const trunkCurve = buildTrunkCurve(FULL_TRUNK_HEIGHT);

  const primaries = [];
  for (let i = 0; i < MAX_PRIMARIES; i += 1) {
    const baseT = 0.30 + (i / (MAX_PRIMARIES - 1)) * 0.55 + (rand() - 0.5) * 0.05;
    const azimuth = i * 2.399963 + (rand() - 0.5) * 0.55;
    const tilt = 0.65 + rand() * 0.5;
    const length = 0.55 + rand() * 0.35;

    const base = trunkCurve.getPointAt(Math.min(0.98, baseT));
    const direction = new THREE.Vector3(
      Math.sin(tilt) * Math.cos(azimuth),
      Math.cos(tilt),
      Math.sin(tilt) * Math.sin(azimuth),
    ).normalize();

    const mid = base.clone().addScaledVector(direction, length * 0.45);
    mid.y += length * 0.12;
    const end = base.clone().addScaledVector(direction, length);
    end.y += length * 0.3;

    primaries.push({
      curve: new THREE.CatmullRomCurve3([base, mid, end]),
      birth: 1.45 + (i / (MAX_PRIMARIES - 1)) * 5.1,
      direction,
      radiusStart: 0.017 - i * 0.0005,
      radiusEnd: 0.005,
    });
  }

  const secondaries = [];
  for (let p = 0; p < MAX_PRIMARIES; p += 1) {
    const parent = primaries[p];
    for (let j = 0; j < 2; j += 1) {
      const t = 0.42 + j * 0.34 + (rand() - 0.5) * 0.06;
      const azimuth = rand() * Math.PI * 2;
      const tilt = 0.3 + rand() * 0.55;
      const length = 0.28 + rand() * 0.24;

      const base = parent.curve.getPointAt(t);
      const parentQuat = quaternionFromDirection(parent.curve.getTangentAt(t));
      const direction = new THREE.Vector3(
        Math.sin(tilt) * Math.cos(azimuth),
        Math.cos(tilt),
        Math.sin(tilt) * Math.sin(azimuth),
      ).applyQuaternion(parentQuat).normalize();

      const mid = base.clone().addScaledVector(direction, length * 0.5);
      mid.y += length * 0.1;
      const end = base.clone().addScaledVector(direction, length);
      end.y += length * 0.18;

      secondaries.push({
        curve: new THREE.CatmullRomCurve3([base, mid, end]),
        parentIndex: p,
        orderInParent: j,
        direction,
        radiusStart: 0.009,
        radiusEnd: 0.003,
      });
    }
  }

  const leaves = [];
  for (let s = 0; s < MAX_SECONDARIES; s += 1) {
    const secondary = secondaries[s];
    const clusterSize = 4 + Math.floor(rand() * 3);
    for (let c = 0; c < clusterSize && leaves.length < MAX_LEAVES; c += 1) {
      const t = 0.5 + rand() * 0.45;
      const base = secondary.curve.getPointAt(t);
      const tangent = secondary.curve.getTangentAt(t);
      const outward = secondary.direction.clone().normalize();
      const side = new THREE.Vector3().crossVectors(tangent, outward).normalize();
      const offset = (rand() - 0.5) * 0.26;
      const position = base
        .clone()
        .addScaledVector(outward, 0.06 + rand() * 0.1)
        .addScaledVector(side, offset);

      const quaternion = quaternionFromDirection(tangent)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35 + rand() * 0.7))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI));

      leaves.push({
        kind: 'secondary',
        secondaryIndex: s,
        t,
        position,
        quaternion,
        size: 0.1 + rand() * 0.06,
        threshold: (leaves.length / (MAX_LEAVES - 1)) * 0.88,
      });
    }
  }

  // Tip clusters at the end of each primary branch fill the outer canopy.
  for (let p = 0; p < MAX_PRIMARIES && leaves.length < MAX_LEAVES; p += 1) {
    const primary = primaries[p];
    const tipCount = 3 + Math.floor(rand() * 3);
    for (let c = 0; c < tipCount && leaves.length < MAX_LEAVES; c += 1) {
      const t = 0.72 + rand() * 0.26;
      const base = primary.curve.getPointAt(t);
      const tangent = primary.curve.getTangentAt(t);
      const outward = primary.direction.clone().normalize();
      const side = new THREE.Vector3().crossVectors(tangent, outward).normalize();
      const offset = (rand() - 0.5) * 0.24;
      const position = base
        .clone()
        .addScaledVector(outward, 0.05 + rand() * 0.09)
        .addScaledVector(side, offset);

      const quaternion = quaternionFromDirection(tangent)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.3 + rand() * 0.6))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI));

      leaves.push({
        kind: 'tip',
        primaryIndex: p,
        t,
        position,
        quaternion,
        size: 0.1 + rand() * 0.06,
        threshold: (leaves.length / (MAX_LEAVES - 1)) * 0.88,
      });
    }
  }

  const sproutLeaves = [];
  for (let i = 0; i < SPROUT_LEAF_COUNT; i += 1) {
    const azimuth = (i / SPROUT_LEAF_COUNT) * Math.PI * 2 + 0.3;
    sproutLeaves.push({
      offset: new THREE.Vector3(Math.cos(azimuth) * 0.07, 0, Math.sin(azimuth) * 0.07),
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.85)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), azimuth)),
      size: 0.05 + (i % 2) * 0.02,
    });
  }

  const roots = [];
  for (let i = 0; i < 4; i += 1) {
    const azimuth = (i / 4) * Math.PI * 2 + 0.4;
    const length = 0.14 + rand() * 0.1;
    const direction = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const base = new THREE.Vector3(direction.x * 0.05, -0.02, direction.z * 0.05);
    const end = base.clone().addScaledVector(direction, length);
    end.y -= 0.1;
    roots.push(new THREE.CatmullRomCurve3([
      base,
      base.clone().addScaledVector(direction, length * 0.5).setY(-0.06),
      end,
    ]));
  }

  return { primaries, secondaries, leaves, sproutLeaves, roots };
}

/** Returns the interpolated stage checkpoint config for growth value f. */
function getConfig(f) {
  const lower = Math.min(7, Math.floor(f));
  const upper = Math.min(7, lower + 1);
  const t = f - lower;
  const a = STAGES[lower];
  const b = STAGES[upper];
  return {
    trunkH: lerp(a.trunkH, b.trunkH, t),
    trunkR: lerp(a.trunkR, b.trunkR, t),
  };
}

/** Builds a tapered tube along `curve`, grown up to `reveal` of its length. */
function buildRevealedTube(curve, reveal, radiusStart, radiusEnd) {
  if (reveal <= 0.02) {
    return null;
  }

  const sampleCount = 24;
  const grownSamples = Math.max(3, Math.round(sampleCount * Math.min(0.999, reveal)));
  const points = curve.getPoints(sampleCount).slice(0, grownSamples);
  const subCurve = new THREE.CatmullRomCurve3(points);
  return createTaperedTubeGeometry(subCurve, {
    radiusStart,
    radiusEnd,
    tubularSegments: Math.max(6, Math.round(24 * reveal)),
    radialSegments: 7,
  });
}

const GROW_STEP = 0.004;

export function ProceduralTree({ stage = 0, waterPulse = 0, reducedMotion = false }) {
  const layout = useMemo(() => buildTreeLayout(), []);
  const leafGeometry = useMemo(() => createLeafGeometry(), []);
  const glowTexture = useMemo(() => createGlowTexture(), []);
  const emptyGeometry = useMemo(() => new THREE.BufferGeometry(), []);

  const trunkMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#9a6f38',
    emissive: '#3a2508',
    emissiveIntensity: 0.05,
    metalness: 0.5,
    roughness: 0.38,
    clearcoat: 0.35,
    envMapIntensity: 1.2,
  }), []);

  const branchMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#a97c3f',
    metalness: 0.55,
    roughness: 0.34,
    clearcoat: 0.3,
    envMapIntensity: 1.2,
  }), []);

  const rootMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#7a5730',
    metalness: 0.4,
    roughness: 0.5,
    envMapIntensity: 1,
  }), []);

  const leafMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#cfa356',
    emissive: '#2a1c05',
    emissiveIntensity: 0.16,
    metalness: 0.85,
    roughness: 0.25,
    clearcoat: 0.4,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5,
  }), []);

  const soilMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#120d08', roughness: 1 }), []);

  useEffect(() => () => {
    leafGeometry.dispose();
    emptyGeometry.dispose();
    glowTexture.dispose();
    trunkMaterial.dispose();
    branchMaterial.dispose();
    rootMaterial.dispose();
    leafMaterial.dispose();
    soilMaterial.dispose();
  }, [leafGeometry, emptyGeometry, glowTexture, trunkMaterial, branchMaterial, rootMaterial, leafMaterial, soilMaterial]);

  const swayRef = useRef(null);
  const trunkMeshRef = useRef(null);
  const branchMeshRefs = useRef([]);
  const rootMeshRefs = useRef([]);
  const sproutLeafRefs = useRef([]);
  const leafMeshRef = useRef(null);
  const glowMeshRef = useRef(null);
  const glowMaterialRef = useRef(null);
  const trunkCurveRef = useRef(buildTrunkCurve(STAGES[0].trunkH));
  const trunkHeightRef = useRef(-1);
  const growthRef = useRef(stage);
  const velocityRef = useRef(0);
  const lastAppliedRef = useRef(-1);
  const pulseStartRef = useRef(-Infinity);

  const branchGeometriesRef = useRef([]);
  const rootGeometriesRef = useRef([]);

  // Zero every leaf instance on mount so nothing flashes at the origin
  // before the first growth pass runs.
  useEffect(() => {
    const mesh = leafMeshRef.current;
    if (!mesh) {
      return;
    }
    const matrix = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    for (let i = 0; i < MAX_LEAVES; i += 1) {
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useEffect(() => {
    if (waterPulse) {
      pulseStartRef.current = performance.now();
    }
  }, [waterPulse]);

  useEffect(() => () => {
    trunkMeshRef.current?.geometry.dispose();
    branchGeometriesRef.current.forEach((entry) => entry?.geometry.dispose());
    rootGeometriesRef.current.forEach((entry) => entry?.geometry.dispose());
  }, []);

  const applyGrowth = (f) => {
    const cfg = getConfig(f);

    // Trunk grows continuously toward its checkpoint height.
    if (Math.abs(cfg.trunkH - trunkHeightRef.current) > 0.0001 && trunkMeshRef.current) {
      trunkHeightRef.current = cfg.trunkH;
      trunkCurveRef.current = buildTrunkCurve(cfg.trunkH);
      const next = createTaperedTubeGeometry(trunkCurveRef.current, {
        radiusStart: cfg.trunkR,
        radiusEnd: cfg.trunkR * 0.45,
        tubularSegments: 28,
        radialSegments: 8,
      });
      trunkMeshRef.current.geometry.dispose();
      trunkMeshRef.current.geometry = next;
    }

    // Roots reveal early (day 0–1).
    const rootReveal = clamp01((f - 0.02) / 1.1);
    layout.roots.forEach((curve, index) => {
      const mesh = rootMeshRefs.current[index];
      if (!mesh) return;
      const previous = rootGeometriesRef.current[index];
      const rounded = Math.round(rootReveal / GROW_STEP) * GROW_STEP;
      if (rounded !== previous?.reveal) {
        const geometry = buildRevealedTube(curve, rootReveal, 0.013, 0.004);
        if (geometry) {
          previous?.geometry.dispose();
          mesh.geometry = geometry;
          mesh.visible = true;
          rootGeometriesRef.current[index] = { reveal: rounded, geometry };
        } else {
          mesh.visible = false;
          rootGeometriesRef.current[index] = { reveal: rounded, geometry: previous?.geometry };
        }
      }
    });

    // Primary branches appear one at a time across the week.
    const primaryReveals = layout.primaries.map((branch) => clamp01((f - branch.birth) / 0.6));
    layout.primaries.forEach((branch, index) => {
      const mesh = branchMeshRefs.current[index];
      if (!mesh) return;
      const previous = branchGeometriesRef.current[index];
      const reveal = primaryReveals[index];
      const rounded = Math.round(reveal / GROW_STEP) * GROW_STEP;
      if (rounded !== previous?.reveal) {
        const geometry = buildRevealedTube(branch.curve, reveal, branch.radiusStart, branch.radiusEnd);
        if (geometry) {
          previous?.geometry.dispose();
          mesh.geometry = geometry;
          mesh.visible = true;
          branchGeometriesRef.current[index] = { reveal: rounded, geometry };
        } else {
          mesh.visible = false;
          branchGeometriesRef.current[index] = { reveal: rounded, geometry: previous?.geometry };
        }
      }
    });

    // Secondaries follow their parent branch's growth.
    layout.secondaries.forEach((secondary, index) => {
      const meshIndex = MAX_PRIMARIES + index;
      const mesh = branchMeshRefs.current[meshIndex];
      if (!mesh) return;
      const previous = branchGeometriesRef.current[meshIndex];
      const parentReveal = primaryReveals[secondary.parentIndex];
      const reveal = clamp01((parentReveal - 0.28 - secondary.orderInParent * 0.3) / 0.42);
      const rounded = Math.round(reveal / GROW_STEP) * GROW_STEP;
      if (rounded !== previous?.reveal) {
        const geometry = buildRevealedTube(secondary.curve, reveal, secondary.radiusStart, secondary.radiusEnd);
        if (geometry) {
          previous?.geometry.dispose();
          mesh.geometry = geometry;
          mesh.visible = true;
          branchGeometriesRef.current[meshIndex] = { reveal: rounded, geometry };
        } else {
          mesh.visible = false;
          branchGeometriesRef.current[meshIndex] = { reveal: rounded, geometry: previous?.geometry };
        }
      }
    });

    // Sprout leaves ride the trunk tip while the tree is young; already
    // visible on day 0 (the reference shows a sprout with tiny leaves).
    const sproutReveal = clamp01((f + 0.2) / 0.4);
    const trunkTip = trunkCurveRef.current.getPointAt(0.93);
    layout.sproutLeaves.forEach((leaf, index) => {
      const mesh = sproutLeafRefs.current[index];
      if (!mesh) return;
      const scale = sproutReveal <= 0.001 ? 0.0001 : leaf.size * easeOutBack(sproutReveal);
      mesh.position.set(trunkTip.x + leaf.offset.x, trunkTip.y + leaf.offset.y, trunkTip.z + leaf.offset.z);
      mesh.quaternion.copy(leaf.quaternion);
      mesh.scale.setScalar(scale);
    });

    // Canopy halo: the references carry a warm golden glow around the
    // foliage from stage ~2 onward; scale and fade it in with growth.
    if (glowMeshRef.current && glowMaterialRef.current) {
      const glow = clamp01((f - 1.8) / 3.2);
      const canopyCenterY = cfg.trunkH * 0.82;
      const canopySize = 1.0 + cfg.trunkH * 0.9;
      glowMeshRef.current.position.y = canopyCenterY;
      glowMeshRef.current.scale.setScalar(canopySize * glow);
      glowMaterialRef.current.opacity = glow * 0.5;
      glowMeshRef.current.visible = glow > 0.01;
    }

    // Leaves pop in as their parent branch tip passes them, gated by the
    // global foliage density that fills the canopy bottom-to-top.
    const leafGlobal = clamp01((f - 1.55) / 4.9);
    const secondaryReveals = layout.secondaries.map((secondary) => {
      const parentReveal = primaryReveals[secondary.parentIndex];
      return clamp01((parentReveal - 0.28 - secondary.orderInParent * 0.3) / 0.42);
    });

    const leafMesh = leafMeshRef.current;
    if (leafMesh) {
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();

      for (let i = 0; i < layout.leaves.length; i += 1) {
        const leaf = layout.leaves[i];
        const parentReveal = leaf.kind === 'tip'
          ? primaryReveals[leaf.primaryIndex]
          : secondaryReveals[leaf.secondaryIndex];
        const branchGate = clamp01((parentReveal - (leaf.t - 0.08)) / 0.12);
        const densityGate = clamp01((leafGlobal - leaf.threshold + 0.15) / 0.15);
        const reveal = branchGate * densityGate;

        if (reveal <= 0.001) {
          scale.setScalar(0.0001);
        } else {
          scale.setScalar(leaf.size * easeOutBack(reveal));
        }
        position.copy(leaf.position);
        quaternion.copy(leaf.quaternion);
        matrix.compose(position, quaternion, scale);
        leafMesh.setMatrixAt(i, matrix);
      }
      leafMesh.instanceMatrix.needsUpdate = true;
    }
  };

  useFrame((state) => {
    const target = THREE.MathUtils.clamp(stage, 0, 7);

    if (reducedMotion) {
      growthRef.current = target;
    } else {
      const force = (target - growthRef.current) * 0.05;
      velocityRef.current = (velocityRef.current + force) * 0.85;
      growthRef.current += velocityRef.current;
    }

    const f = THREE.MathUtils.clamp(growthRef.current, 0, 7);
    const rounded = Math.round(f / GROW_STEP) * GROW_STEP;
    if (rounded !== lastAppliedRef.current) {
      lastAppliedRef.current = rounded;
      applyGrowth(f);
    }

    if (swayRef.current) {
      if (reducedMotion) {
        swayRef.current.rotation.y = 0;
        swayRef.current.rotation.z = 0;
      } else {
        const time = state.clock.getElapsedTime();
        swayRef.current.rotation.y = Math.sin(time * 0.25) * 0.05;
        swayRef.current.rotation.z = Math.sin(time * 0.8) * 0.012;
      }
    }

    const pulseDuration = reducedMotion ? 0.6 : 1.8;
    const elapsed = (performance.now() - pulseStartRef.current) / 1000;
    const wave = elapsed >= 0 && elapsed < pulseDuration
      ? Math.max(0, Math.sin((elapsed / pulseDuration) * Math.PI))
      : 0;

    trunkMaterial.emissiveIntensity = 0.05 + wave * 0.9;
    leafMaterial.emissiveIntensity = 0.16 + wave * 1.1;
  });

  return (
    <group>
      <PotMesh />

      {/* The tree itself; only this group sways, never the pot */}
      <group ref={swayRef} position={[0, -0.06, 0]}>
        {/* Soil */}
        <mesh position={[0, -0.03, 0]} receiveShadow material={soilMaterial}>
          <cylinderGeometry args={[0.5, 0.46, 0.06, 32]} />
        </mesh>

        {/* Trunk */}
        <mesh ref={trunkMeshRef} material={trunkMaterial} castShadow>
          <primitive object={emptyGeometry} attach="geometry" />
        </mesh>

        {/* Roots */}
        {layout.roots.map((curve, index) => (
          <mesh
            key={`root-${index}`}
            ref={(element) => {
              rootMeshRefs.current[index] = element;
            }}
            material={rootMaterial}
            visible={false}
          >
            <primitive object={emptyGeometry} attach="geometry" />
          </mesh>
        ))}

        {/* Primary and secondary branches share one material */}
        {[...layout.primaries, ...layout.secondaries].map((branch, index) => (
          <mesh
            key={`branch-${index}`}
            ref={(element) => {
              branchMeshRefs.current[index] = element;
            }}
            material={branchMaterial}
            visible={false}
            castShadow
          >
            <primitive object={emptyGeometry} attach="geometry" />
          </mesh>
        ))}

        {/* Sprout leaves at the trunk tip (days 0–2) */}
        {layout.sproutLeaves.map((leaf, index) => (
          <mesh
            key={`sprout-${index}`}
            ref={(element) => {
              sproutLeafRefs.current[index] = element;
            }}
            geometry={leafGeometry}
            material={leafMaterial}
            scale={0.0001}
          />
        ))}

        {/* Canopy leaves (instanced) */}
        <instancedMesh ref={leafMeshRef} args={[leafGeometry, leafMaterial, MAX_LEAVES]} />

        {/* Warm halo matching the reference canopy glow */}
        <mesh ref={glowMeshRef} position={[0, 1.1, 0]} scale={0.0001} visible={false}>
          <planeGeometry />
          <meshBasicMaterial
            ref={glowMaterialRef}
            map={glowTexture}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}
