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

export function createScene(container, { mobile = false } = {}) {
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

  // 그림자 맵은 폰에서 가장 비싼 항목 중 하나다 — 절반으로 줄인다
  const shadow = new ShadowGenerator(mobile ? 1024 : 2048, sun);
  shadow.usePercentageCloserFiltering = true;
  shadow.bias = 0.0006;

  // 화면 크기가 바뀌면 렌더 버퍼도 따라가야 한다.
  // 모바일은 resize만으로 부족하다 — 화면을 돌리거나 주소창이 접혔다 펴질 때
  // resize가 늦게 오거나 아예 안 오는 브라우저가 있어 세 가지를 모두 듣는다.
  let resizeT = null;
  const relayout = () => {
    if (resizeT) clearTimeout(resizeT);
    resizeT = setTimeout(() => { engine.resize(); resizeT = null; }, 60);
  };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);

  return { engine, scene, canvas, shadow };
}
