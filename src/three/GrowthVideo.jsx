import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const MAX_STAGE = 7;
const VIDEO_SRC = '/tree/tree07.mp4';
const VIDEO_ASPECT = 960 / 906;
const PLAYBACK_RATE = 0.7;
const SNAP_EPSILON = 0.04;

// Final-day performance: a looping full-tree video that replaces the
// static final frame with a living "dream" sequence, shown at full
// frame size exactly where the tree sits. This is a 448x720 center crop
// of `dream.mp4`: the tree and its golden ribbons occupy only the middle
// third of the wide 16:9 frame, and the crop window is the full glow
// extent (x 416..864) plus a bottom margin, so nothing of the tree or
// its swirls is ever cut while the tree renders ~2.2x larger on screen.
const DREAM_VIDEO_SRC = '/tree/dream-tree.mp4';
const DREAM_VIDEO_ASPECT = 448 / 720;
const DREAM_APPEAR_DAY = 6.99;

/**
 * The growth video frames were composed with the young tree leaning left
 * of the frame center: the trunk and pot sit left on days 1-3 and only
 * drift toward center as the tree grows. The frame is pure black around
 * the tree, so shifting the plane to re-center the tree per day is
 * invisible except for the tree itself. Each value is the fraction of
 * the frame width to shift right, balancing the trunk/pot position (what
 * the eye anchors on) with the crown, measured at the exact pause time
 * of that day.
 */
const STAGE_CENTER_OFFSET = [0.15, 0.12, 0.066, 0.02, 0.02, 0.025, 0.03, 0.03];

function centerOffsetForDay(day) {
  const clamped = THREE.MathUtils.clamp(day, 0, MAX_STAGE);
  const lower = Math.floor(clamped);
  const upper = Math.min(MAX_STAGE, lower + 1);
  const t = clamped - lower;
  const from = STAGE_CENTER_OFFSET[lower] ?? 0;
  const to = STAGE_CENTER_OFFSET[upper] ?? 0;
  return from + (to - from) * t;
}

function targetTimeFor(stage, duration) {
  return (THREE.MathUtils.clamp(stage, 0, MAX_STAGE) / MAX_STAGE) * duration;
}

/**
 * The golden tree as a video timeline. `public/tree/tree07.mp4` is one
 * continuous 7-second clip of the tree growing from day 0 to day 7 —
 * each second is one check-in day, so the day stage maps linearly onto
 * the video's time axis (day N = second N). When the stage changes the
 * video plays toward the new position at a gentle rate — watering feels
 * like a cutscene — and pauses once it arrives. Under reduced motion the
 * video seeks instantly instead of playing.
 *
 * On the final day the static frame crossfades into a looping full-tree
 * performance (`public/tree/dream.mp4`).
 */
export function GrowthVideo({ stage = 0, waterPulse = 0, reducedMotion = false, onError }) {
  const groupRef = useRef(null);
  const meshRef = useRef(null);
  const washMeshRef = useRef(null);
  const glowMaterialRef = useRef(null);
  const dreamMeshRef = useRef(null);
  const dreamMaterialRef = useRef(null);
  const pulseStartRef = useRef(-Infinity);
  const stageRef = useRef(stage);
  const reducedMotionRef = useRef(reducedMotion);
  const readyRef = useRef(false);
  const durationRef = useRef(0);
  const dreamFailedRef = useRef(false);

  stageRef.current = stage;
  reducedMotionRef.current = reducedMotion;

  const video = useMemo(() => {
    const element = document.createElement('video');
    element.src = VIDEO_SRC;
    element.muted = true;
    element.playsInline = true;
    element.preload = 'auto';
    return element;
  }, []);

  const texture = useMemo(() => {
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    return videoTexture;
  }, [video]);

  const dreamVideo = useMemo(() => {
    const element = document.createElement('video');
    element.src = DREAM_VIDEO_SRC;
    element.muted = true;
    element.playsInline = true;
    element.loop = true;
    element.preload = 'auto';
    return element;
  }, []);

  const dreamTexture = useMemo(() => {
    const dreamVideoTexture = new THREE.VideoTexture(dreamVideo);
    dreamVideoTexture.colorSpace = THREE.SRGBColorSpace;
    return dreamVideoTexture;
  }, [dreamVideo]);

  useEffect(() => {
    const handleLoadedMetadata = () => {
      durationRef.current = video.duration;
      readyRef.current = true;
      video.currentTime = targetTimeFor(stageRef.current, video.duration);
      if (meshRef.current) {
        meshRef.current.visible = true;
      }
    };

    const handleCanPlay = () => {
      if (meshRef.current) {
        meshRef.current.visible = true;
      }
    };

    const handleDreamError = () => {
      dreamFailedRef.current = true;
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', onError);
    dreamVideo.addEventListener('error', handleDreamError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', onError);
      dreamVideo.removeEventListener('error', handleDreamError);
      video.pause();
      texture.dispose();
      dreamVideo.pause();
      dreamTexture.dispose();
    };
  }, [video, texture, dreamVideo, dreamTexture, onError]);

  useEffect(() => {
    if (waterPulse) {
      pulseStartRef.current = performance.now();
    }
  }, [waterPulse]);

  const viewport = useThree((state) => state.viewport);
  // Fit the ENTIRE video frame inside the viewport on both axes so the
  // frame is never cropped (the early-day frames have a visible glow
  // background), while staying as large as possible and centered.
  const planeHeight = Math.min(viewport.height, viewport.width / VIDEO_ASPECT) * 0.97;
  const planeScale = [planeHeight * VIDEO_ASPECT, planeHeight, 1];
  const dreamPlaneHeight = Math.min(viewport.height, viewport.width / DREAM_VIDEO_ASPECT) * 0.97;
  const dreamPlaneScale = [dreamPlaneHeight * DREAM_VIDEO_ASPECT, dreamPlaneHeight, 1];

  useFrame((state) => {
    // Keep the GPU textures in sync with the video elements every frame.
    if (readyRef.current) {
      texture.needsUpdate = true;
    }
    if (dreamVideo.readyState >= 2) {
      dreamTexture.needsUpdate = true;
    }

    if (groupRef.current) {
      if (reducedMotion) {
        groupRef.current.position.y = 0;
      } else {
        // Gentle bob only — no rotation, so the flat card never looks
        // like a tilting billboard.
        const time = state.clock.getElapsedTime();
        groupRef.current.position.y = Math.sin(time * 0.5) * 0.03;
      }
    }

    if (readyRef.current && durationRef.current > 0) {
      const targetTime = targetTimeFor(stageRef.current, durationRef.current);
      const delta = targetTime - video.currentTime;

      if (reducedMotionRef.current) {
        if (Math.abs(delta) > SNAP_EPSILON) {
          video.currentTime = targetTime;
        }
        if (!video.paused) {
          video.pause();
        }
      } else if (Math.abs(delta) > SNAP_EPSILON) {
        if (delta < 0) {
          // Going backward (new week after the reward): snap instantly.
          // Rewinding the growth makes the full tree visibly shrink and
          // slide left through every stage, which reads as a glitch.
          if (!video.paused) {
            video.pause();
          }
          video.currentTime = targetTime;
        } else {
          if (video.paused) {
            video.play().catch(() => {});
          }
          video.playbackRate = PLAYBACK_RATE;
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
        if (Math.abs(video.currentTime - targetTime) > 0.001) {
          video.currentTime = targetTime;
        }
      }
    }

    // Final-day performance: at the last day the static frame is
    // replaced outright by the looping dream video, full frame.
    const currentDay = readyRef.current && durationRef.current > 0
      ? (video.currentTime / durationRef.current) * MAX_STAGE
      : THREE.MathUtils.clamp(stageRef.current, 0, MAX_STAGE);
    const dreamActive = !dreamFailedRef.current && currentDay >= DREAM_APPEAR_DAY;

    if (dreamMeshRef.current && dreamMaterialRef.current) {
      dreamMeshRef.current.visible = dreamActive;
      dreamMaterialRef.current.opacity = dreamActive ? 1 : 0;

      if (dreamActive) {
        if (!reducedMotionRef.current && dreamVideo.paused) {
          dreamVideo.play().catch(() => {});
        }
        if (reducedMotionRef.current && !dreamVideo.paused) {
          dreamVideo.pause();
        }
      } else if (!dreamVideo.paused) {
        dreamVideo.pause();
      }
    }

    // The static tree hands the frame over to the dream entirely.
    if (meshRef.current) {
      meshRef.current.visible = !dreamActive;
    }

    // Re-center the tree's visual mass per day: the video frames lean
    // left early on, so the plane shifts right by the stage offset.
    // The frame is black around the tree, so only the tree moves.
    const centerOffsetX = centerOffsetForDay(currentDay) * planeHeight * VIDEO_ASPECT;
    if (meshRef.current) {
      meshRef.current.position.x = centerOffsetX;
    }
    if (washMeshRef.current) {
      washMeshRef.current.position.x = centerOffsetX;
    }

    // Frame enlargement for the last three days is handled in CSS
    // (is-late-stage): the 3D plane must stay at 1× so the video is
    // never cropped by the camera frustum.

    if (glowMaterialRef.current) {
      const pulseDuration = reducedMotionRef.current ? 0.6 : 1.8;
      const elapsed = (performance.now() - pulseStartRef.current) / 1000;
      const wave = elapsed >= 0 && elapsed < pulseDuration
        ? Math.max(0, Math.sin((elapsed / pulseDuration) * Math.PI))
        : 0;
      glowMaterialRef.current.opacity = wave * 0.28;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} visible={false} position={[0, 0, 0]} scale={planeScale}>
        <planeGeometry />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      {/* Final-day looping performance (full tree, full frame) */}
      <mesh ref={dreamMeshRef} visible={false} position={[0, 0, 0.001]} scale={dreamPlaneScale}>
        <planeGeometry />
        <meshBasicMaterial
          ref={dreamMaterialRef}
          map={dreamTexture}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Additive gold wash shown only while the water pulse is active */}
      <mesh ref={washMeshRef} position={[0, 0, 0.004]} scale={planeScale}>
        <meshBasicMaterial
          ref={glowMaterialRef}
          color="#ffdf9e"
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
