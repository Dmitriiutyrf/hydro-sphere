import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Stars, Sparkles, Text } from '@react-three/drei';

interface Fragment {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number;
  age: number;
  state: 'spawning' | 'floating' | 'collecting' | 'fading';
  progress: number;
  orbitOffset: number;
}

interface FloatingNumber {
  id: number;
  position: THREE.Vector3;
  age: number;
}

const liquidVertexShader = `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const liquidFragmentShader = `
  varying vec3 vColor;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float glow = pow(1.0 - dist * 2.0, 2.0);
    gl_FragColor = vec4(vColor * (1.0 + glow), glow * 0.8);
  }
`;

const sphereVertexShader = `
  uniform float uTime;
  uniform float uInteract;
  uniform float uSpeak;
  uniform float uRecord;
  uniform float uPixelRatio;
  varying vec3 vColor;

  // Simplex 3D Noise for Liquid Effect
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod289(i);
    vec4 p = permute( permute( permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 1.0/7.0;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    vec3 pos = position;
    
    // Liquid time (slower, more viscous)
    float t = uTime * 0.3;
    
    // Base liquid distortion
    float noise1 = snoise(pos * 1.2 + vec3(t, t*0.5, -t*0.2));
    float noise2 = snoise(pos * 2.5 - vec3(-t*1.5, t, t*0.8)) * 0.4;
    float n = noise1 + noise2;
    
    // Magnetic Repulsion Logic
    // Particles are pushed away from the center based on activity
    float repulsionForce = 0.4 + uInteract * 0.5 + uSpeak * 1.2 + uRecord * 0.3;
    
    // Add a "pulsing" magnet effect
    float pulse = sin(uTime * 3.0) * 0.1 * uSpeak;
    float totalRepulsion = (repulsionForce + pulse) * (1.0 + n * 0.2);
    
    // Displace along normal (repelling from center)
    pos += normal * totalRepulsion;
    
    // Swirling effect (tangential displacement)
    vec3 swirl = vec3(
      snoise(pos * 1.5 + vec3(t, 0.0, 0.0)),
      snoise(pos * 1.5 + vec3(0.0, t, 0.0)),
      snoise(pos * 1.5 + vec3(0.0, 0.0, t))
    ) * 0.25;
    
    pos += swirl * (1.0 + uSpeak * 0.5);

    // Color logic
    float hue = uTime * 0.08 + length(pos) * 0.5 + n * 0.3;
    vec3 chameleon = 0.5 + 0.5 * cos(6.28318 * (vec3(hue) + vec3(0.0, 0.33, 0.67)));
    
    vec3 color1 = vec3(0.0, 0.2, 0.8); // Deep Blue
    vec3 color2 = vec3(0.0, 0.8, 1.0); // Cyan
    vec3 color3 = vec3(0.5, 0.0, 0.5); // Purple
    
    if (uRecord > 0.5) {
      color1 = vec3(0.8, 0.0, 0.0); // Red for recording
      color2 = vec3(1.0, 0.2, 0.0);
    } else if (uSpeak > 0.5) {
      color1 = vec3(0.0, 0.8, 0.2); // Green for speaking
      color2 = vec3(0.2, 1.0, 0.5);
    }
    
    vec3 baseColor = mix(color1, color2, sin(uTime * 0.3 + pos.y * 1.5) * 0.5 + 0.5);
    baseColor = mix(baseColor, color3, sin(uTime * 0.5 + pos.x * 1.5) * 0.5 + 0.5);
    
    vColor = mix(baseColor, chameleon, 0.5 + uInteract * 0.3);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    float sizeNoise = snoise(pos * 4.0 + vec3(t)) * 0.5 + 0.5;
    gl_PointSize = (10.0 + sizeNoise * 12.0) * (1.0 / -mvPosition.z) * uPixelRatio;
  }
`;

const sphereFragmentShader = `
  varying vec3 vColor;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.1, dist);
    vec3 finalColor = vColor + smoothstep(0.2, 0.0, dist) * 0.4;
    gl_FragColor = vec4(finalColor, alpha * 0.75);
  }
`;

const coreVertexShader = `
  uniform float uTime;
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 pos = position;
    // Simple liquid wobble for the core
    float wobble = sin(pos.x * 4.0 + uTime * 2.0) * cos(pos.y * 4.0 + uTime * 1.5) * 0.05;
    pos += normal * wobble;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const coreFragmentShader = `
  uniform float uTime;
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.6 - dot(vNormal, vec3(0, 0, 1.0)), 3.0);
    vec3 color = vec3(0.4, 0.7, 1.0) * intensity;
    float pulse = 0.5 + 0.5 * sin(uTime * 3.0);
    gl_FragColor = vec4(color * (1.0 + pulse * 0.5), intensity * (0.6 + pulse * 0.4));
  }
`;

const cosmicVertexShader = `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cosmicFragmentShader = `
  uniform float uTime;
  varying vec3 vPos;

  void main() {
    vec3 pos = normalize(vPos);
    
    // Ultra-cheap procedural galaxy/nebula using basic trig (zero lag)
    float t = uTime * 0.05;
    
    // Two simple waves combining to make a cloudy cosmic pattern
    float w1 = sin(pos.x * 3.0 + t) * cos(pos.y * 2.0 + t * 0.8);
    float w2 = sin(pos.z * 2.5 - t * 1.2) * cos(pos.x * 4.0 - t * 0.5);
    
    float cloud = (w1 + w2) * 0.5 + 0.5; // Normalize to 0.0 - 1.0
    
    // Colors: Deep space, Purple Nebula, Cyan Highlights (Darkened to prevent bloom blowout)
    vec3 space = vec3(0.002, 0.002, 0.01);
    vec3 purple = vec3(0.04, 0.01, 0.08);
    vec3 cyan = vec3(0.0, 0.05, 0.1);
    
    // Mix colors based on the wave pattern
    vec3 finalColor = mix(space, purple, smoothstep(0.2, 0.8, cloud));
    finalColor = mix(finalColor, cyan, smoothstep(0.6, 1.0, cloud + w1 * 0.2));
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function CosmicBackground() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const timer = useMemo(() => new (THREE as any).Timer(), []);

  useFrame((state, delta) => {
    timer.update(state.clock.elapsedTime);
    const time = timer.getElapsed();
    
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time;
    }
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.03; // Slow cinematic rotation
    }
  });
  return (
    <mesh ref={meshRef} scale={[50, 50, 50]} raycast={() => null}>
      <sphereGeometry args={[1, 32, 32]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={cosmicVertexShader}
        fragmentShader={cosmicFragmentShader}
        uniforms={{ uTime: { value: 0 } }}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

interface HydraCoreProps {
  isInteracting: boolean;
  isSpeaking: boolean;
  isRecording: boolean;
  analyser?: React.MutableRefObject<AnalyserNode | null>;
  dataArray?: React.MutableRefObject<Uint8Array | null>;
}

export function HydraCore({ isInteracting, isSpeaking, isRecording, analyser, dataArray }: HydraCoreProps) {
  const { camera, viewport } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const coreMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const fragmentMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const fragmentPointsRef = useRef<THREE.Points>(null);
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const nextId = useRef(0);
  const mouse = useRef(new THREE.Vector2());
  const timer = useMemo(() => new (THREE as any).Timer(), []);

  // Drastically reduced particle counts for mobile performance
  const count = viewport.width < 6 ? 600 : 1500;
  const radius = viewport.width < 6 ? 1.2 : 1.5;

  const [positions, normals] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const norm = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Volumetric distribution
      const r = radius * Math.pow(Math.random(), 0.5); 
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      
      pos.set([x, y, z], i * 3);
      const len = Math.sqrt(x*x + y*y + z*z);
      norm.set([x/len, y/len, z/len], i * 3);
    }
    return [pos, norm];
  }, [count, radius]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uInteract: { value: 0 },
    uSpeak: { value: 0 },
    uRecord: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
  }), []);

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
      mouse.current.x = (x / window.innerWidth) * 2 - 1;
      mouse.current.y = -(y / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
    };
  }, []);

  useFrame((state, delta) => {
    timer.update(state.clock.elapsedTime);
    const time = timer.getElapsed();

    if (materialRef.current) {
      let currentVolume = 0;
      if (isSpeaking && analyser?.current && dataArray?.current) {
        analyser.current.getByteFrequencyData(dataArray.current);
        let sum = 0;
        for (let i = 0; i < dataArray.current.length; i++) {
          sum += dataArray.current[i];
        }
        currentVolume = (sum / dataArray.current.length) / 255.0; // 0.0 to 1.0
      }

      materialRef.current.uniforms.uTime.value = time;
      materialRef.current.uniforms.uInteract.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uInteract.value, isInteracting ? 1 : 0, delta * 5);
      
      // Combine boolean isSpeaking with actual volume for a dynamic effect
      const targetSpeak = isSpeaking ? 0.2 + currentVolume * 1.5 : 0;
      materialRef.current.uniforms.uSpeak.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uSpeak.value, targetSpeak, delta * 15);
      
      materialRef.current.uniforms.uRecord.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uRecord.value, isRecording ? 1 : 0, delta * 5);
    }

    if (coreMaterialRef.current) {
      coreMaterialRef.current.uniforms.uTime.value = time;
    }

    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.08;
      pointsRef.current.rotation.x += delta * 0.03;
    }

    // Birth fragments from the center when AI is thinking
    if (isInteracting && Math.random() > 0.85) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const velDir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi)
      );
      const vel = velDir.multiplyScalar(3.0 + Math.random() * 2.0);
      
      setFragments(prev => {
        if (prev.length > 200) return prev; // Max particles
        return [...prev, {
          id: nextId.current++,
          position: new THREE.Vector3(0, 0, 0),
          velocity: vel,
          rotation: new THREE.Euler(),
          scale: 0.08 + Math.random() * 0.05,
          age: 0,
          state: 'spawning',
          progress: 0,
          orbitOffset: Math.random() * Math.PI * 2
        }];
      });
    }

    // Update fragments
    setFragments(prev => {
      const next = prev.map(f => {
        f.age += delta;

        if (f.state === 'spawning') {
          f.position.add(f.velocity.clone().multiplyScalar(delta));
          f.velocity.multiplyScalar(0.92); // Slow down
          if (f.velocity.length() < 0.5 || f.age > 1.5) {
            f.state = 'floating';
          }
        } else if (f.state === 'floating') {
          // Hover logic: orbit around the sphere
          const orbitSpeed = 0.5;
          const orbitRadius = 0.01;
          f.position.x += Math.sin(time * orbitSpeed + f.orbitOffset) * orbitRadius;
          f.position.y += Math.cos(time * orbitSpeed + f.orbitOffset) * orbitRadius;
          f.position.z += Math.sin(time * orbitSpeed * 0.8 + f.orbitOffset) * orbitRadius;

          // Automatically fade after floating for a short time
          if (f.age > 4.0) {
            f.state = 'fading';
            f.progress = 0;
          }
        } else if (f.state === 'collecting') {
          f.progress += delta * 2.0;
          const target = new THREE.Vector3(3, 3.5, -2).applyMatrix4(camera.matrixWorld);
          f.position.lerp(target, f.progress);
          if (f.progress >= 1) {
            return null;
          }
        } else if (f.state === 'fading') {
          f.progress += delta;
          f.scale *= 0.9;
          if (f.progress >= 1) return null;
        }
        return f;
      }).filter((f): f is Fragment => f !== null);

      return next;
    });

    // Update floating numbers logic removed
    
    if (fragmentPointsRef.current) {
      const posAttr = fragmentPointsRef.current.geometry.attributes.position;
      const sizeAttr = fragmentPointsRef.current.geometry.attributes.aSize;
      const colorAttr = fragmentPointsRef.current.geometry.attributes.aColor;
      
      fragments.forEach((f, i) => {
        if (i < 200) {
          posAttr.setXYZ(i, f.position.x, f.position.y, f.position.z);
          let s = f.scale;
          if (f.state === 'collecting' || f.state === 'fading') s *= (1.0 - f.progress);
          sizeAttr.setX(i, s * 2.5); // Make sparks significantly larger and brighter
          
          // Chameleon-like color shifting for sparks
          const hue = (time * 0.15 + i * 0.05 + f.position.length() * 0.3) % 1.0;
          const color = new THREE.Color().setHSL(hue, 0.9, 0.7);
          colorAttr.setXYZ(i, color.r, color.g, color.b);
        }
      });
      
      // Reset unused points
      for (let i = fragments.length; i < 200; i++) {
        posAttr.setXYZ(i, 1000, 1000, 1000);
      }
      
      posAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
    }
  });

  const fragmentGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(200 * 3), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(200), 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(200 * 3), 3));
    return geo;
  }, []);

  return (
    <group>
      {/* Deep Space Nebula Background */}
      <CosmicBackground />
      
      {/* Dynamic Starfield */}
      <Stars radius={50} depth={20} count={viewport.width < 6 ? 600 : 1500} factor={4} saturation={1} fade speed={1.5} />
      
      {/* Magical Floating Dust (Wow effect, strictly limited for mobile) */}
      <Sparkles count={viewport.width < 6 ? 20 : 50} scale={20} size={4} speed={0.2} opacity={0.4} color="#88ccff" />
      
      {/* Core Inner Glow (The Soul) */}
      <mesh scale={[radius * 0.5, radius * 0.5, radius * 0.5]}>
        <sphereGeometry args={[1, 32, 32]} />
        <shaderMaterial
          ref={coreMaterialRef}
          vertexShader={coreVertexShader}
          fragmentShader={coreFragmentShader}
          uniforms={{ uTime: { value: 0 } }}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      
      {/* Floating Numbers logic removed */}

      {/* Invisible Hitbox removed */}

      <group ref={groupRef}>
        <points ref={pointsRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            <bufferAttribute attach="attributes-normal" count={count} array={normals} itemSize={3} />
          </bufferGeometry>
          <shaderMaterial
            ref={materialRef}
            vertexShader={sphereVertexShader}
            fragmentShader={sphereFragmentShader}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>

      <points ref={fragmentPointsRef} geometry={fragmentGeometry}>
        <shaderMaterial
          ref={fragmentMaterialRef}
          vertexShader={liquidVertexShader}
          fragmentShader={liquidFragmentShader}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
