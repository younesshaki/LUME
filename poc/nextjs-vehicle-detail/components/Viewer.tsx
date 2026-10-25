'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import vertexShader from '../shaders/vertex.glsl';
import fragmentShader from '../shaders/fragment.glsl';

export default function Viewer({ url }: { url: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading R2 model');
  useEffect(() => {
    const element = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setStatus('WebGL unavailable; vehicle photograph remains available'); return; }
    let disposed = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#171b24');
    const camera = new THREE.PerspectiveCamera(45, 2, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 3));
    const light = new THREE.DirectionalLight(0xffffff, 4); light.position.set(3, 5, 5); scene.add(light);
    // Exact shader bodies copied from src/shaders/example, compiled in WebGL.
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { uTime: { value: 0 } } });
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.08), material);
    scene.add(marker);
    element.appendChild(renderer.domElement);
    const resize = () => { const width = element.clientWidth; renderer.setSize(width, 360); camera.aspect = width / 360; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const draco = new DRACOLoader().setDecoderPath('/draco/');
    new GLTFLoader().setDRACOLoader(draco).load(url, gltf => {
      if (disposed) { disposeObject(gltf.scene); return; }
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3()).length();
      const center = box.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(center);
      scene.add(gltf.scene); camera.position.set(0, size * .25, size * 1.5);
      camera.near = size / 100; camera.far = size * 100; camera.updateProjectionMatrix();
      marker.position.set(size * .6, 0, 0); marker.scale.setScalar(size);
      setStatus('R2 model loaded');
    }, undefined, () => { if (!disposed) setStatus('Model unavailable; vehicle photograph remains available'); });
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => { material.uniforms.uTime.value = clock.getElapsedTime(); controls.update(); renderer.render(scene, camera); });
    return () => { disposed = true; observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); draco.dispose(); disposeObject(scene); renderer.dispose(); renderer.domElement.remove(); };
  }, [url]);
  return <div><p role="status">{status}</p><div data-testid="model-viewer" ref={mount} /></div>;
}
function disposeObject(root: THREE.Object3D) {
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    }
  });
}
