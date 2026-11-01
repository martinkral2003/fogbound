// FOGBOUND: HERO minimal debug HUD (bars, zone, quick slots, messages). Shown only until the UI agents' hud.js exists.
export function createDebugHud(game, parent) {
  const el = document.createElement('div');
  el.id = 'rpgDebugHud';
  el.style.cssText = 'position:fixed;left:14px;bottom:14px;width:260px;padding:8px 10px;background:rgba(8,10,12,.72);border:1px solid #3a3f44;border-radius:6px;color:#d8dccf;font:12px ui-monospace,Consolas,monospace;z-index:5;pointer-events:none';
  el.innerHTML = '<div id="dhName" style="font:bold 14px Georgia,serif;color:#e0bb5c"></div><div id="dhBars"></div><div id="dhInfo" style="margin-top:4px;color:#9aa4a8"></div>';
  const msgs = document.createElement('div');
  msgs.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);text-align:center;color:#ffe6a0;font:15px Georgia,serif;text-shadow:0 1px 3px #000;z-index:5;pointer-events:none';
  parent.append(el, msgs);
  const bar = (c) => `<div style="height:9px;margin:3px 0;background:#15191c;border:1px solid #2a2f33"><i style="display:block;height:100%;width:0;background:${c}"></i></div>`;
  el.querySelector('#dhBars').innerHTML = bar('#b83a30') + bar('#c8b030') + bar('#3a6ad0');
  const fills = el.querySelectorAll('i'), info = el.querySelector('#dhInfo'), name = el.querySelector('#dhName');
  const toasts = [];
  let hidden = false;
  function toast(t) { const d = document.createElement('div'); d.textContent = t; msgs.appendChild(d); toasts.push({ d, t: 0 }); if (toasts.length > 4) toasts.shift().d.remove(); }
  function handleEvents(events) {
    for (const e of events) {
      if (e.type === 'announce') toast(e.text);
      else if (e.type === 'msg' && (!e.actor || e.actor === game.st.player.id)) toast(e.text);
      else if (e.type === 'pickup' && e.actor === game.st.player.id) toast('Picked up ' + e.name);
      else if (e.type === 'levelup' && e.actor === game.st.player.id) toast('Level ' + e.lvl + '!');
    }
  }
  function update(dt, uiHud) {
    if (uiHud !== hidden) { hidden = uiHud; el.style.display = uiHud ? 'none' : 'block'; }
    for (let i = toasts.length - 1; i >= 0; i--) { const q = toasts[i]; q.t += dt; q.d.style.opacity = String(Math.min(1, 4 - q.t)); if (q.t > 4) { q.d.remove(); toasts.splice(i, 1); } }
    if (uiHud) return;
    const st = game.st, p = st.player; if (!p) return;
    fills[0].style.width = (100 * Math.max(0, p.hp) / p.maxHp) + '%'; fills[1].style.width = (100 * p.stamina / p.maxStamina) + '%'; fills[2].style.width = (100 * p.mana / p.maxMana) + '%';
    name.textContent = `${p.name}  L${p.lvl}`;
    const z = st.zone, d = z ? Math.hypot(p.x - z.cx, p.z - z.cz) - z.r : 0, m = st.match;
    info.textContent = `HP ${Math.ceil(p.hp)}/${Math.round(p.maxHp)}  gold ${p.gold}  alive ${m ? m.alive : '?'}/${m ? m.total : '?'}\n` + (z ? `fog ${z.state} stage ${z.stage}  edge ${d > 0 ? '+' : ''}${d.toFixed(0)} m` : '');
    info.style.whiteSpace = 'pre';
  }
  return { el, toast, update, handleEvents };
}
