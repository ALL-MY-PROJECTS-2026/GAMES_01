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

const SKY = new Color4(0.24, 0.27, 0.44, 1);

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
  scene.fogStart = 40;
  scene.fogEnd = 150;
  scene.fogColor = new Color3(0.24, 0.27, 0.44);

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.55;
  hemi.diffuse = new Color3(0.55, 0.6, 0.85);
  hemi.groundColor = new Color3(0.2, 0.32, 0.26);

  const moon = new DirectionalLight('moon', new Vector3(-0.45, -1, -0.3), scene);
  moon.position = new Vector3(40, 60, 20);
  moon.intensity = 0.95;
  moon.diffuse = new Color3(0.75, 0.8, 1.0);
  moon.autoCalcShadowZBounds = true;
  const sun = moon;

  const shadow = new ShadowGenerator(2048, sun);
  shadow.usePercentageCloserFiltering = true;
  shadow.bias = 0.0006;

  window.addEventListener('resize', () => engine.resize());

  return { engine, scene, canvas, shadow };
}
