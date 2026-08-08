import {
  FreeCamera,
  Camera,
  Vector3,
  Viewport,
  MeshBuilder,
  StandardMaterial,
  Color3
} from '@babylonjs/core';

export const MINIMAP_SIZE = 200;
const VIEW_HALF = 30;

export class Minimap {
  constructor(scene, engine, player) {
    this.engine = engine;
    this.player = player;

    this.cam = new FreeCamera('miniCam', new Vector3(0, 80, 0), scene);
    this.cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.cam.orthoLeft = -VIEW_HALF;
    this.cam.orthoRight = VIEW_HALF;
    this.cam.orthoTop = VIEW_HALF;
    this.cam.orthoBottom = -VIEW_HALF;
    this.cam.minZ = 1;
    this.cam.maxZ = 200;
    this.cam.upVector = new Vector3(0, 0, -1);
    this.cam.setTarget(new Vector3(0, 0, 0));
    this.cam.layerMask = 0x3;

    const arrowMat = new StandardMaterial('arrowMat', scene);
    arrowMat.emissiveColor = Color3.FromHexString('#d13b30');
    arrowMat.disableLighting = true;
    this.arrow = MeshBuilder.CreateCylinder(
      'miniArrow',
      { diameterTop: 0, diameterBottom: 4, height: 4.5, tessellation: 3 },
      scene
    );
    this.arrow.material = arrowMat;
    this.arrow.rotation.x = Math.PI / 2;
    this.arrow.layerMask = 0x2;
    this.arrow.applyFog = false;
  }

  update() {
    const p = this.player.group.position;
    this.cam.position.set(p.x, 80, p.z);
    this.cam.setTarget(new Vector3(p.x, 0, p.z));
    this.arrow.position.set(p.x, 40, p.z);
    this.arrow.rotation.set(Math.PI / 2, this.player.group.rotation.y, 0);

    // 미니맵이 그려질 자리는 CSS가 정한다 — 화면 크기에 따라 프레임이 움직이므로
    // 픽셀 값을 코드에 박아 두면 폰에서 렌더만 엉뚱한 데 남는다.
    // DOM 프레임의 실제 위치를 그대로 뷰포트로 옮긴다.
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    if (w <= 0 || h <= 0) return;
    const scale = this.engine.getHardwareScalingLevel();
    const cssW = w * scale;
    const cssH = h * scale;

    const frame = this.frame || (this.frame = document.getElementById('minimap-frame'));
    let left = cssW - MINIMAP_SIZE - 10;
    let bottom = 10;
    let size = MINIMAP_SIZE;
    if (frame) {
      const r = frame.getBoundingClientRect();
      if (r.width > 0) {
        left = r.left;
        bottom = cssH - r.bottom;
        size = r.width;
      }
    }
    this.cam.viewport = new Viewport(left / cssW, bottom / cssH, size / cssW, size / cssH);
  }
}
