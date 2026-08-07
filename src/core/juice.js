// 타격 연출(히트스톱·카메라 쉐이크) 전역 상태 — PHYSICS.md §2 참조
export const juice = { hitstopT: 0, shakeT: 0, shakeMag: 0 };

export function hitstop(t) {
  juice.hitstopT = Math.max(juice.hitstopT, t);
}

export function shake(mag, t) {
  juice.shakeMag = Math.max(juice.shakeMag, mag);
  juice.shakeT = Math.max(juice.shakeT, t);
}
