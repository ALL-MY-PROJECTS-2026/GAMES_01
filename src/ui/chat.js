// 채팅 — Enter로 입력창을 열고, 다시 Enter로 보낸다.
// 입력 중에는 게임 단축키가 먹지 않아야 한다 (WASD로 걸어다니면 안 되니까).
const MAX_LINES = 40;
const FADE_AFTER = 12;   // 초 — 입력창이 닫혀 있으면 이만큼 뒤 흐려진다

let open = false;
let onSend = null;
let idleT = 0;

export function initChat(sendHandler) {
  onSend = sendHandler;
  const input = document.getElementById('chat-input');
  if (!input) return;

  // 입력창 안에서는 게임이 키를 못 보게 막는다
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = input.value.trim();
      if (text && onSend) onSend(text);
      input.value = '';
      closeChat();
    } else if (e.key === 'Escape') {
      input.value = '';
      closeChat();
    }
  });
}

export function isChatOpen() {
  return open;
}

export function openChat() {
  if (open) return;
  open = true;
  const box = document.getElementById('chat');
  const input = document.getElementById('chat-input');
  box.classList.add('open');
  input.style.display = 'block';
  input.focus();
  idleT = 0;
}

export function closeChat() {
  if (!open) return;
  open = false;
  const box = document.getElementById('chat');
  const input = document.getElementById('chat-input');
  input.blur();
  input.style.display = 'none';
  box.classList.remove('open');
  idleT = 0;
}

export function toggleChat() {
  if (open) closeChat();
  else openChat();
}

/** kind: 'me' | 'peer' | 'system' */
export function pushChat(name, text, kind = 'peer') {
  const log = document.getElementById('chat-log');
  if (!log) return;
  const line = document.createElement('div');
  line.className = 'chat-line ' + kind;
  if (kind === 'system') {
    line.textContent = text;
  } else {
    line.innerHTML = `<b>${escapeHtml(name)}</b> ${escapeHtml(text)}`;
  }
  log.appendChild(line);
  while (log.children.length > MAX_LINES) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
  // 새 말이 오면 잠시 진하게 보여준다
  document.getElementById('chat').classList.remove('faded');
  idleT = 0;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 조용하면 창을 흐리게 해서 시야를 막지 않는다 */
export function updateChat(delta) {
  if (open) { idleT = 0; return; }
  idleT += delta;
  if (idleT > FADE_AFTER) document.getElementById('chat').classList.add('faded');
}
