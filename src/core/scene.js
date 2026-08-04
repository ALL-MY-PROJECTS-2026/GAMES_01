import {
  Engine,
  Scene,
  Color3,
  Color4,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator
} from '@babylonjs/core';

const SKY = new Color4(0.75, 0.89, 0.97, 1);

export function createScene(container) {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  container.appendChild(canvas);

  const engine = new Engine(canvas, true, { stencil: false });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = SKY;

  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 60;
  scene.fogEnd = 180;
  scene.fogColor = new Color3(0.75, 0.89, 0.97);

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.75;
  hemi.diffuse = new Color3(0.85, 0.92, 1.0);
  hemi.groundColor = new Color3(0.45, 0.62, 0.35);

  const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, -0.3), scene);
  sun.position = new Vector3(40, 60, 20);
  sun.intensity = 1.25;
  sun.diffuse = new Color3(1.0, 0.95, 0.8);
  sun.autoCalcShadowZBounds = true;

  const shadow = new ShadowGenerator(2048, sun);
  shadow.usePercentageCloserFiltering = true;
  shadow.bias = 0.0006;

  window.addEventListener('resize', () => engine.resize());

  return { engine, scene, canvas, shadow };
}
