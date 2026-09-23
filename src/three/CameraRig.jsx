import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

const SHAKE_DURATION = 0.45;

/**
 * Camera choreography for the garden scenes: a slow idle drift, an eased
 * push-in while watering (`focus` 0..1), and a brief decaying shake each
 * time `shakeKey` changes. Under reduced motion the camera stays locked
 * at its base position and only the `focus` offset is applied.
 */
export function RitualCamera({ focus = 0, shakeKey = 0, reducedMotion = false }) {
  const camera = useThree((state) => state.camera);
  const shakeStartRef = useRef(-Infinity);

  useEffect(() => {
    if (shakeKey) {
      shakeStartRef.current = performance.now();
    }
  }, [shakeKey]);

  useFrame((state) => {
    if (reducedMotion) {
      camera.position.set(0, 0.5, 5.8 - focus * 1.1);
      camera.lookAt(0, -0.05 * focus, 0);
      return;
    }

    const time = state.clock.getElapsedTime();
    const driftX = Math.sin(time * 0.22) * 0.09;
    const driftY = 0.5 + Math.sin(time * 0.31) * 0.05;
    const targetZ = 5.8 - focus * 1.1;
    const easedZ = camera.position.z + (targetZ - camera.position.z) * 0.06;

    const elapsed = (performance.now() - shakeStartRef.current) / 1000;
    let shakeX = 0;
    let shakeY = 0;
    if (elapsed >= 0 && elapsed < SHAKE_DURATION) {
      const decay = 1 - elapsed / SHAKE_DURATION;
      shakeX = (Math.random() - 0.5) * 0.06 * decay;
      shakeY = (Math.random() - 0.5) * 0.05 * decay;
    }

    camera.position.set(driftX + shakeX, driftY + shakeY, easedZ);
    camera.lookAt(0, -0.05 * focus, 0);
  });

  return null;
}

/**
 * Shared mutable pointer state in -1..1 range, read by ParallaxGroup
 * every frame without triggering React re-renders.
 */
export function usePointerParallax() {
  const pointerRef = useRef({ x: 0, y: 0 });

  const handleMove = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerRef.current.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  }, []);

  const handleLeave = useCallback(() => {
    pointerRef.current.x = 0;
    pointerRef.current.y = 0;
  }, []);

  return { pointerRef, handleMove, handleLeave };
}

/**
 * Eases its children toward the pointer position, scaled by `multiplier`
 * so nearer layers (higher multiplier) move more than deeper ones.
 */
export function ParallaxGroup({ pointerRef, multiplier = 1, reducedMotion = false, children }) {
  const ref = useRef(null);

  useFrame(() => {
    if (!ref.current) {
      return;
    }

    const { x, y } = pointerRef.current;
    const targetX = reducedMotion ? 0 : x * 0.14 * multiplier;
    const targetY = reducedMotion ? 0 : y * 0.09 * multiplier;
    ref.current.position.x += (targetX - ref.current.position.x) * 0.06;
    ref.current.position.y += (targetY - ref.current.position.y) * 0.06;
  });

  return <group ref={ref}>{children}</group>;
}
