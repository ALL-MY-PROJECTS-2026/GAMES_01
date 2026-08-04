let open = false;
let npc = null;
let idx = 0;

function panel() {
  return document.getElementById('dialog');
}

function render() {
  document.getElementById('dialog-name').textContent = npc.name;
  document.getElementById('dialog-text').textContent = npc.lines[idx];
  document.getElementById('dialog-next').textContent =
    idx < npc.lines.length - 1 ? 'E 또는 클릭으로 계속 ▸' : 'E 또는 클릭으로 닫기';
}

export function isDialogOpen() {
  return open;
}

export function openDialog(target) {
  npc = target;
  idx = 0;
  open = true;
  panel().style.display = 'block';
  render();
}

export function advanceDialog() {
  if (!open) return;
  idx++;
  if (idx >= npc.lines.length) closeDialog();
  else render();
}

export function closeDialog() {
  open = false;
  npc = null;
  panel().style.display = 'none';
}

export function initDialog() {
  panel().addEventListener('click', advanceDialog);
}
