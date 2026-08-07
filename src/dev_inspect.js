// 개발용: GLB 모델의 애니메이션 클립·본 구조를 콘솔에서 조회하기 위한 헬퍼
import { SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export async function inspectGlb(scene, file) {
  const res = await SceneLoader.ImportMeshAsync('', 'models/', file, scene);
  const root = res.meshes[0];
  const { min, max } = root.getHierarchyBoundingVectors(true);
  const bones = [];
  for (const sk of res.skeletons) for (const b of sk.bones) bones.push(b.name);
  const info = {
    clips: res.animationGroups.map((a) => a.name),
    clipCount: res.animationGroups.length,
    height: +(max.y - min.y).toFixed(2),
    meshCount: res.meshes.length,
    boneCount: bones.length,
    handBones: bones.filter((b) => /hand|weapon|palm/i.test(b))
  };
  for (const a of res.animationGroups) { a.stop(); a.dispose(); }
  for (const m of res.meshes) m.dispose();
  for (const s of res.skeletons) s.dispose();
  return info;
}

window.__inspectGlb = inspectGlb;
