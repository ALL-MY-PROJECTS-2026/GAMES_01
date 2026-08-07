import { joinRoom, selfId } from 'trystero/nostr';

// P2P 멀티플레이 (STACK.md §13 / MULTIPLAYER.md)
// 원칙: 스탯·레벨·스킬은 각자 로컬에 남는다. 네트워크로는 "지금 무엇을 하는가"만 오간다.
//
// 권한 모델: peerId 사전순 최소값이 호스트. 몬스터 AI와 피해 판정은 호스트만 계산하고
// 결과를 뿌린다. 각자 계산하면 반드시 갈라진다.

const APP_ID = 'gwigok-chowon';
const STATE_HZ = 15;      // 내 상태 전송 빈도
const MONSTER_HZ = 10;    // 호스트가 뿌리는 몬스터 스냅샷 빈도

export class Net {
  constructor() {
    this.room = null;
    this.roomCode = null;
    this.selfId = selfId;
    this.peers = new Map();     // peerId → { state, lastAt }
    this.isHost = false;
    this.onPeerJoin = null;
    this.onPeerLeave = null;
    this.onMonsterSnapshot = null;
    this.onHitReport = null;
    this.onEvent = null;
    this._stateT = 0;
    this._monT = 0;
  }

  get connected() {
    return !!this.room;
  }

  get peerCount() {
    return this.peers.size;
  }

  join(code, password) {
    if (this.room) this.leave();
    this.roomCode = code;
    const cfg = { appId: APP_ID };
    if (password) cfg.password = password;
    this.room = joinRoom(cfg, code);

    // Trystero 0.25의 makeAction은 { send, onMessage } 객체를 돌려준다
    const aState = this.room.makeAction('state');
    const aMon = this.room.makeAction('mon');
    const aHit = this.room.makeAction('hit');
    const aEvt = this.room.makeAction('evt');
    this.sendState = aState.send;
    this.sendMonsters = aMon.send;
    this.sendHit = aHit.send;
    this.sendEvent = aEvt.send;

    aState.onMessage = (s, meta) => {
      const peerId = meta && meta.peerId ? meta.peerId : meta;
      if (typeof peerId !== 'string') return;
      const p = this.peers.get(peerId) || {};
      p.prev = p.state ? { ...p.state } : { ...s };
      p.state = s;
      p.lerpT = 0;
      this.peers.set(peerId, p);
    };
    aMon.onMessage = (snap, meta) => {
      const peerId = meta && meta.peerId ? meta.peerId : meta;
      // 호스트가 아닌 피어의 스냅샷은 무시한다
      if (peerId !== this._hostId() || this.isHost) return;
      if (this.onMonsterSnapshot) this.onMonsterSnapshot(snap);
    };
    aHit.onMessage = (rep, meta) => {
      const peerId = meta && meta.peerId ? meta.peerId : meta;
      if (this.isHost && this.onHitReport) this.onHitReport(rep, peerId);
    };
    aEvt.onMessage = (e, meta) => {
      const peerId = meta && meta.peerId ? meta.peerId : meta;
      if (this.onEvent) this.onEvent(e, peerId);
    };

    // room.onPeerJoin / onPeerLeave 도 대입 속성이다
    this.room.onPeerJoin = (id) => {
      this.peers.set(id, {});
      this._electHost();
      if (this.onPeerJoin) this.onPeerJoin(id);
    };
    this.room.onPeerLeave = (id) => {
      this.peers.delete(id);
      this._electHost();
      if (this.onPeerLeave) this.onPeerLeave(id);
    };

    this._electHost();
    return this;
  }

  leave() {
    if (!this.room) return;
    this.room.leave();
    this.room = null;
    this.peers.clear();
    this.isHost = false;
  }

  // peerId 사전순 최소값이 호스트 — 모두가 같은 결론에 도달한다
  _hostId() {
    const ids = [this.selfId, ...this.peers.keys()].sort();
    return ids[0];
  }

  _electHost() {
    this.isHost = this._hostId() === this.selfId;
  }

  /** 고정 스텝 루프에서 호출 — 매 프레임이 아니라 정해진 빈도로만 보낸다 */
  tick(delta, buildState, buildMonsters) {
    if (!this.room) return;

    this._stateT -= delta;
    if (this._stateT <= 0) {
      this._stateT = 1 / STATE_HZ;
      this.sendState(buildState());
    }

    if (this.isHost && buildMonsters) {
      this._monT -= delta;
      if (this._monT <= 0) {
        this._monT = 1 / MONSTER_HZ;
        this.sendMonsters(buildMonsters());
      }
    }

    // 원격 피어 보간 진행도
    for (const p of this.peers.values()) {
      if (p.lerpT !== undefined) p.lerpT = Math.min(1, p.lerpT + delta * STATE_HZ);
    }
  }

  /** 비호스트가 "내가 몬스터 i를 n만큼 때렸다"를 호스트에 알린다 */
  reportHit(index, damage, dirX, dirZ, knock, knockUp) {
    if (!this.room || this.isHost) return;
    this.sendHit({ i: index, d: damage, x: dirX, z: dirZ, k: knock, u: knockUp || 0 });
  }

  broadcast(evt) {
    if (this.room) this.sendEvent(evt);
  }
}

export const net = new Net();
