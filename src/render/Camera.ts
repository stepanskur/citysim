import * as THREE from 'three';
import { clamp, lerp } from '../util';
export class CameraCtl {
  tx = 0; tz = 0; dist = 900; yaw = 0.7; pitch = 0.9;
  gx = 0; gz = 0; gdist = 900; gyaw = 0.7; gpitch = 0.9;
  keys = new Set<string>();
  rotating = false; panning = false; lx = 0; ly = 0;
  constructor(public cam: THREE.PerspectiveCamera, public dom: HTMLElement, public groundH: (x: number, z: number) => number, public M: number, public pick: (cx: number, cy: number) => THREE.Vector3 | null) {
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('pointerdown', e => {
      if (e.button === 2) { this.rotating = true; } else if (e.button === 1 || (e.button === 0 && (e.shiftKey || this.panLeft))) { this.panning = true; e.preventDefault(); }
      this.lx = e.clientX; this.ly = e.clientY;
    });
    window.addEventListener('pointerup', () => { this.rotating = false; this.panning = false; });
    window.addEventListener('pointermove', e => {
      const dx = e.clientX - this.lx, dy = e.clientY - this.ly; this.lx = e.clientX; this.ly = e.clientY;
      if (this.rotating) { this.gyaw -= dx * 0.005; this.gpitch = clamp(this.gpitch + dy * 0.004, 0.15, 1.5); }
      if (this.panning) { const s = this.gdist * 0.0016; this.panBy(-dx * s, -dy * s); }
    });
    dom.addEventListener('wheel', e => {
      e.preventDefault(); const f = Math.exp(e.deltaY * 0.0012); const nd = clamp(this.gdist * f, 40, this.M * 1.2);
      const p = this.pick(e.clientX, e.clientY);
      if (p && f < 1) { const k = 1 - nd / this.gdist; this.gx += (p.x - this.gx) * k; this.gz += (p.z - this.gz) * k; }
      this.gdist = nd;
    }, { passive: false });
    window.addEventListener('keydown', e => { if ((e.target as HTMLElement).tagName === 'INPUT') return; this.keys.add(e.code); });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  panLeft = false;
  panBy(rx: number, fz: number) { this._pan(rx, fz); }
  private _pan(rx: number, fz: number) {
    const c = Math.cos(this.gyaw), s = Math.sin(this.gyaw);
    // right vector
    const rxv = c, rzv = -s; const fxv = -s, fzv = -c;
    this.gx += rx * rxv - fz * fxv; this.gz += rx * rzv - fz * fzv;
  }
  jump(x: number, z: number, dist?: number) { this.gx = x; this.gz = z; if (dist) this.gdist = dist; }
  update(dt: number) {
    const sp = this.gdist * 1.2 * dt;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) this._pan(0, -sp);
    if (k.has('KeyS') || k.has('ArrowDown')) this._pan(0, sp);
    if (k.has('KeyA') || k.has('ArrowLeft')) this._pan(-sp, 0);
    if (k.has('KeyD') || k.has('ArrowRight')) this._pan(sp, 0);
    if (k.has('KeyQ')) this.gyaw += dt * 1.5; if (k.has('KeyE')) this.gyaw -= dt * 1.5;
    if (k.has('KeyR')) this.gpitch = clamp(this.gpitch + dt, 0.15, 1.5); if (k.has('KeyF')) this.gpitch = clamp(this.gpitch - dt, 0.15, 1.5);
    if (k.has('Equal') || k.has('NumpadAdd')) this.gdist = clamp(this.gdist * (1 - dt * 1.5), 40, this.M * 1.2);
    if (k.has('Minus') || k.has('NumpadSubtract')) this.gdist = clamp(this.gdist * (1 + dt * 1.5), 40, this.M * 1.2);
    this.gx = clamp(this.gx, 0, this.M); this.gz = clamp(this.gz, 0, this.M);
    const a = 1 - Math.exp(-dt * 10);
    this.tx = lerp(this.tx, this.gx, a); this.tz = lerp(this.tz, this.gz, a); this.dist = lerp(this.dist, this.gdist, a);
    this.yaw = lerp(this.yaw, this.gyaw, a); this.pitch = lerp(this.pitch, this.gpitch, a);
    const ty = Math.max(0, this.groundH(this.tx, this.tz));
    const cp = Math.cos(this.pitch), spp = Math.sin(this.pitch);
    let px = this.tx + Math.sin(this.yaw) * cp * this.dist, pz = this.tz + Math.cos(this.yaw) * cp * this.dist, py = ty + spp * this.dist;
    const gh = Math.max(0, this.groundH(px, pz)) + 8; if (py < gh) py = gh;
    this.cam.position.set(px, py, pz); this.cam.lookAt(this.tx, ty, this.tz);
  }
}
