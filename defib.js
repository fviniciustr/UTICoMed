/**
 * Cardioversor Bifásico Vivo Gold (CMOS DRAKE)
 * Visualização de 3 canais ECG simultâneos + Tela Touchscreen 7" com dados do paciente,
 * telemetria multiparamétrica, Carga/Choque Bifásico, Cardioversão Sincronizada (SINC) e DEA.
 */
(function (global) {
  'use strict';

  const ENERGY_STEPS = [2, 5, 10, 20, 30, 50, 70, 100, 150, 200, 300, 360];

  class VivoGoldCardioverter {
    constructor(engine, monitor, audio, onShock) {
      this.engine = engine;
      this.monitor = monitor;
      this.audio = audio;
      this.onShock = onShock;

      this.standby = false;
      this.mode = 'MANUAL'; // 'MANUAL' | 'SINC' | 'DEA' | 'MP'
      this.syncEnabled = false;
      this.leadSet = 'I-II-III'; // 'I-II-III' | 'II-V1-V5'
      this.gain = 1.0;
      this.energyIdx = ENERGY_STEPS.indexOf(200);
      this.chargeState = 'idle'; // 'idle' | 'charging' | 'ready'
      this.chargePct = 0;
      this.shockCount = 0;
      this.shockFlashTimer = 0;
      this.animTime = 0;
      this.pacerAccum = 0;
      this.patientDrawerOpen = false;
      this.alarmsMuted = false;
      this.deaStatusText = '';

      // Buffer circular de 3 canais de ECG (4.5 segundos @ 200 Hz = 900 pontos)
      this.bufferLen = 900;
      this.writeIdx = 0;
      this.ch1Buf = new Float32Array(this.bufferLen);
      this.ch2Buf = new Float32Array(this.bufferLen);
      this.ch3Buf = new Float32Array(this.bufferLen);
      this.syncMarks = new Uint8Array(this.bufferLen);
      this.shockMarks = new Uint8Array(this.bufferLen);
      this.pacerMarks = new Uint8Array(this.bufferLen);
      this.lastMonIdx = -1;
      this.syncCooldown = 0;

      // Referências DOM
      this.chassisEl = document.getElementById('vgChassis');
      this.canvas = document.getElementById('canvasVgEcg');
      this.standbyEl = document.getElementById('vgStandbyOverlay');
      this.patientDrawerEl = document.getElementById('vgPatientDrawer');

      this._bindEvents();
      this.syncUI();
    }

    get energyJ() {
      return ENERGY_STEPS[this.energyIdx] || 200;
    }

    resetUI() {
      this.mode = 'MANUAL';
      this.syncEnabled = false;
      this.patientDrawerOpen = false;
      this.chargeState = 'idle';
      this.chargePct = 0;
      this.shockCount = 0;
      this.shockFlashTimer = 0;
      this.deaStatusText = '';
      this.syncMarks.fill(0);
      this.shockMarks.fill(0);
      this.pacerMarks.fill(0);
      if (this.engine && this.engine.setExternalPacer) {
        this.engine.setExternalPacer(false, 70);
      }
      this._updateRotaryKnob();
      this.syncUI();
    }

    _updateRotaryKnob() {
      const knob = document.getElementById('vgRotaryKnob');
      if (knob) {
        knob.style.transform = `rotate(${(this.energyIdx - 6) * 20}deg)`;
      }
    }

    _bindEvents() {
      if (!this.chassisEl) return;

      this.chassisEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-vg-action]');
        if (!btn) return;
        const action = btn.dataset.vgAction;
        if (this.audio) {
          let soundKind = 'vgKey';
          if (action === 'charge' || action === 'emerg') soundKind = 'vgCharge';
          else if (action === 'toggleSync' || action === 'toggleDea' || action === 'togglePacer') soundKind = 'vgSync';
          else if (action === 'energyUp' || action === 'energyDown' || action === 'energySet') soundKind = 'knob';
          else if (action === 'mute') soundKind = 'silence';
          else if (action === 'power') soundKind = this.standby ? 'powerOn' : 'powerOff';
          else if (action === 'wake') soundKind = 'powerOn';
          else if (action === 'shock') soundKind = this.chargeState === 'ready' ? null : 'vgCharge';
          if (soundKind) this.audio.playUiClick(soundKind);
        }
        this._handleAction(action, btn.dataset.vgVal);
      });

      const knob = document.getElementById('vgRotaryKnob');
      if (knob) {
        knob.addEventListener('wheel', (e) => {
          e.preventDefault();
          if (this.standby) return;
          if (this.audio) this.audio.playUiClick('knob');
          this._stepEnergy(e.deltaY < 0 ? 1 : -1);
        }, { passive: false });
      }
    }

    _handleAction(action, val) {
      if (action === 'power') {
        this.standby = !this.standby;
        if (this.standby) {
          this.patientDrawerOpen = false;
          this._disarm();
        }
        if (this.engine && this.engine.setExternalPacer) {
          this.engine.setExternalPacer(this.mode === 'MP' && !this.standby, 70);
        }
        if (this.engine && this.engine.onLog) {
          this.engine.onLog(this.standby ? 'Vivo Gold colocado em Standby' : 'Vivo Gold ligado');
        }
        this.syncUI();
        return;
      }
      if (action === 'wake') {
        this.standby = false;
        if (this.engine && this.engine.setExternalPacer) {
          this.engine.setExternalPacer(this.mode === 'MP', 70);
        }
        if (this.engine && this.engine.onLog) {
          this.engine.onLog('Vivo Gold ligado');
        }
        this.syncUI();
        return;
      }
      if (this.standby) {
        if (action === 'togglePatient') {
          this.patientDrawerOpen = false;
          this.syncUI();
        }
        return;
      }

      switch (action) {
        case 'energyUp':
          this._stepEnergy(1);
          break;
        case 'energyDown':
          this._stepEnergy(-1);
          break;
        case 'energySet': {
          const idx = ENERGY_STEPS.indexOf(Number(val));
          if (idx >= 0) {
            this.energyIdx = idx;
            if (this.chargeState !== 'idle') this._disarm();
            this._updateRotaryKnob();
          }
          break;
        }
        case 'modeCycle': {
          const order = ['MANUAL', 'SINC', 'DEA', 'MP'];
          const next = order[(order.indexOf(this.mode) + 1) % order.length];
          this._setMode(next);
          break;
        }
        case 'toggleSync': {
          const nextSync = !this.syncEnabled;
          if (nextSync) {
            this._setMode('SINC');
          } else {
            this._setMode('MANUAL');
          }
          break;
        }
        case 'toggleDea':
          this._setMode(this.mode === 'DEA' ? 'MANUAL' : 'DEA');
          break;
        case 'togglePacer':
          this._setMode(this.mode === 'MP' ? 'MANUAL' : 'MP');
          break;
        case 'toggleLeads':
          this.leadSet = this.leadSet === 'I-II-III' ? 'II-V1-V5' : 'I-II-III';
          if (this.engine && this.engine.onLog) {
            this.engine.onLog(`Vivo Gold: Derivações alteradas para ${this.leadSet === 'II-V1-V5' ? 'DII • V1 • V5' : 'DI • DII • DIII'}`);
          }
          break;
        case 'cycleGain':
          this.gain = this.gain === 1.0 ? 2.0 : this.gain === 2.0 ? 0.5 : 1.0;
          if (this.engine && this.engine.onLog) {
            this.engine.onLog(`Vivo Gold: Ganho ECG ajustado para x${this.gain}`);
          }
          break;
        case 'togglePatient':
          this.patientDrawerOpen = !this.patientDrawerOpen;
          break;
        case 'mute':
          this.alarmsMuted = !this.alarmsMuted;
          if (this.engine && this.engine.onLog) {
            this.engine.onLog(this.alarmsMuted ? 'Vivo Gold: Alertas sonoros silenciados' : 'Vivo Gold: Alertas sonoros reativados');
          }
          break;
        case 'charge':
          this._startCharge();
          break;
        case 'emerg':
          this.energyIdx = ENERGY_STEPS.indexOf(200);
          this._setMode('MANUAL');
          this._updateRotaryKnob();
          this._startCharge();
          if (this.engine && this.engine.onLog) {
            this.engine.onLog('Vivo Gold EMERGÊNCIA: Carregando 200J imediatamente!');
          }
          break;
        case 'disarm':
          this._disarm();
          if (this.engine && this.engine.onLog) {
            this.engine.onLog('Vivo Gold: Carga anulada / capacitor desarmado');
          }
          break;
        case 'shock':
          this._deliverShock();
          break;
        default:
          break;
      }
      this.syncUI();
    }

    _setMode(mode) {
      this.mode = mode;
      this.syncEnabled = mode === 'SINC';
      this.deaStatusText = '';
      if (this.engine && this.engine.setExternalPacer) {
        this.engine.setExternalPacer(mode === 'MP' && !this.standby, 70);
      }
      if (mode === 'DEA') {
        this.energyIdx = ENERGY_STEPS.indexOf(200);
        this._updateRotaryKnob();
        const r = (this.engine.vitals && this.engine.vitals.rhythm) || 'sinus';
        const shockable = r === 'vf' || r === 'vtach' || r === 'torsades';
        if (shockable) {
          this.deaStatusText = 'DEA • CHOQUE IND.';
          this._startCharge();
          if (this.engine.onLog) this.engine.onLog('DEA Vivo Gold: Ritmo chocável detectado (FV/TV) — Carregando 200J!');
        } else {
          this.deaStatusText = 'DEA • NÃO CHOCÁVEL';
          this._disarm();
          if (this.engine.onLog) this.engine.onLog('DEA Vivo Gold: Ritmo não chocável — Choque não indicado');
        }
      }
    }

    _stepEnergy(dir) {
      this.energyIdx = Math.max(0, Math.min(ENERGY_STEPS.length - 1, this.energyIdx + dir));
      if (this.chargeState !== 'idle') this._disarm();
      this._updateRotaryKnob();
    }

    _startCharge() {
      if (this.chargeState === 'ready') return;
      this.chargeState = 'charging';
      if (this.chargePct < 5) this.chargePct = 8;
    }

    _disarm() {
      this.chargeState = 'idle';
      this.chargePct = 0;
    }

    _deliverShock() {
      if (this.chargeState !== 'ready') {
        // Se usuário clicar no botão ⚡ sem carregar antes, inicia carga rápida automaticamente
        this._startCharge();
        return;
      }
      const energy = this.energyJ;
      if (this.audio) this.audio.playDefibChargeAndShock();
      this.shockFlashTimer = 0.34;
      this.shockCount += 1;
      const markIdx = (this.writeIdx - 1 + this.bufferLen) % this.bufferLen;
      this.shockMarks[markIdx] = 1;
      const res = this.engine.defibrillate({ energyJ: energy, sync: this.syncEnabled });
      this._disarm();
      if (typeof this.onShock === 'function') {
        this.onShock(res, energy);
      }
      this.syncUI();
    }

    resize() {
      if (!this.canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.canvas.width = Math.round(rect.width * dpr);
        this.canvas.height = Math.round(rect.height * dpr);
      }
    }

    step(dt) {
      if (this.standby) return;
      this.animTime += dt;

      // Atualizar progresso de carga dos capacitores bifásicos
      if (this.chargeState === 'charging') {
        this.chargePct = Math.min(100, this.chargePct + dt * 82);
        if (this.chargePct >= 100) {
          this.chargePct = 100;
          this.chargeState = 'ready';
        }
      }

      if (this.shockFlashTimer > 0) {
        this.shockFlashTimer = Math.max(0, this.shockFlashTimer - dt);
        if (this.shockFlashTimer === 0 && this.chassisEl) {
          this.chassisEl.classList.remove('vg-shocking');
        }
      }

      // Consumir amostras novas do buffer do Monitor (200 Hz) para 3 canais sincronizados
      if (!this.monitor || !this.monitor.buffers) return;
      const monBuf = this.monitor.buffers.ecg;
      const monLen = this.monitor.bufferLen;
      const monWrite = this.monitor.writeIdx;
      if (this.lastMonIdx < 0) {
        this.lastMonIdx = (monWrite - 1 + monLen) % monLen;
      }

      let steps = (monWrite - this.lastMonIdx + monLen) % monLen;
      if (steps > 80) {
        this.lastMonIdx = (monWrite - 2 + monLen) % monLen;
        steps = 2;
      }

      const rhythm = (this.engine.vitals && this.engine.vitals.rhythm) || 'sinus';
      for (let s = 0; s < steps; s++) {
        this.lastMonIdx = (this.lastMonIdx + 1) % monLen;
        const d2 = monBuf[this.lastMonIdx];
        const prevD2 = monBuf[(this.lastMonIdx - 1 + monLen) % monLen];

        // Derivação Einthoven realista (DI, DII, DIII / V1, V5)
        let ch1, ch2, ch3;
        if (this.leadSet === 'II-V1-V5') {
          ch1 = d2; // DII
          ch2 = -0.68 * d2 + 0.14 * (d2 - prevD2); // V1 (predominantemente negativa em DII positivo)
          ch3 = rhythm === 'asystole' ? 0 : 1.14 * d2 + 0.08 * Math.sin(this.writeIdx * 0.04); // V5 alta amplitude
        } else {
          // DI + DII + DIII (Lei de Einthoven: DII = DI + DIII)
          ch1 = 0.66 * d2 + 0.10 * (d2 - prevD2);
          ch2 = d2;
          ch3 = d2 - ch1 * 0.85;
        }

        const idx = this.writeIdx;
        this.ch1Buf[idx] = ch1;
        this.ch2Buf[idx] = ch2;
        this.ch3Buf[idx] = ch3;
        this.shockMarks[idx] = 0;

        // Marcador de espícula de marcapasso transcutâneo (70 bpm -> 0.857 s = ~171 amostras @ 200Hz)
        if (this.mode === 'MP') {
          this.pacerAccum += 1;
          if (this.pacerAccum >= 171) {
            this.pacerAccum = 0;
            this.pacerMarks[idx] = 1;
          } else {
            this.pacerMarks[idx] = 0;
          }
        } else {
          this.pacerMarks[idx] = 0;
        }

        // Marcador R-wave para cardioversão sincronizada (SINC)
        if (this.syncCooldown > 0) this.syncCooldown -= 1;
        const organized = rhythm !== 'vf' && rhythm !== 'asystole' && rhythm !== 'torsades';
        const isPeak = organized && d2 > 0.62 && d2 >= prevD2 && this.syncCooldown === 0;
        this.syncMarks[idx] = isPeak ? 1 : 0;
        if (isPeak) this.syncCooldown = 38;

        this.writeIdx = (idx + 1) % this.bufferLen;
      }
    }

    render() {
      if (this.standby || !this.canvas || !this.canvas.width || !this.canvas.height) return;
      const Sweep = global.ICUSim.Sweep;
      const ctx = this.canvas.getContext('2d');
      const w = this.canvas.width;
      const h = this.canvas.height;
      const dpr = Sweep.getDpr();

      ctx.clearRect(0, 0, w, h);

      // Grade milimetrada sutil 3 canais (1 único batch path) + divisórias
      Sweep.drawGrid(ctx, w, h, dpr, 18, 9, 'rgba(34, 197, 94, 0.08)');
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, h / 3); ctx.lineTo(w, h / 3);
      ctx.moveTo(0, (2 * h) / 3); ctx.lineTo(w, (2 * h) / 3);
      ctx.stroke();
      ctx.restore();

      const labels = this.leadSet === 'II-V1-V5' ? ['DII', 'V1', 'V5'] : ['DI', 'DII', 'DIII'];
      const buffers = [this.ch1Buf, this.ch2Buf, this.ch3Buf];
      const colors = ['#22ff66', '#22ff66', '#4ade80'];

      const len = this.bufferLen;
      const cursor = this.writeIdx;
      const gapSamples = 24;
      const resumeIdx = cursor + gapSamples;
      const chH = h / 3;

      for (let ch = 0; ch < 3; ch++) {
        const buf = buffers[ch];
        const col = colors[ch];
        const topY = ch * chH;
        const midY = topY + chH * 0.56;
        const ampPx = chH * 0.36 * this.gain;

        // Tag do canal (DI / DII / DIII)
        ctx.save();
        ctx.fillStyle = '#86efac';
        ctx.font = `700 ${10 * dpr}px monospace`;
        ctx.fillText(`${labels[ch]}  ${this.gain === 1 ? 'x1' : 'x' + this.gain}`, 6 * dpr, topY + 13 * dpr);
        ctx.restore();

        const toX = (i) => (i / (len - 1)) * w;
        const toY = (v) => Math.max(topY + 4 * dpr, Math.min(topY + chH - 4 * dpr, midY - v * ampPx));

        Sweep.drawSweepTrace(ctx, {
          buf,
          len,
          cursor,
          gapSamples,
          fadeLen: 42,
          tailHighlight: 26,
          color: col,
          lineWidth: 1.8,
          dpr,
          toX,
          toY,
          topY: topY + 2 * dpr,
          botY: topY + chH - 2 * dpr,
          glow: true
        });

        // Espículas de Marcapasso (modo MP) & Marcadores de Choque Bifásico aplicado
        ctx.save();
        for (let i = 0; i < len; i++) {
          if (i >= cursor && i < resumeIdx) continue;
          if (this.mode === 'MP' && this.pacerMarks[i]) {
            const px = toX(i);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.4 * dpr;
            ctx.beginPath();
            ctx.moveTo(px, topY + 6 * dpr);
            ctx.lineTo(px, topY + chH - 6 * dpr);
            ctx.stroke();
          }
          if (this.shockMarks[i]) {
            const sx = toX(i);
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2.0 * dpr;
            ctx.beginPath();
            ctx.moveTo(sx, topY + 3 * dpr);
            ctx.lineTo(sx, topY + chH - 3 * dpr);
            ctx.stroke();
          }
        }
        ctx.restore();

        // Marcadores de Sincronismo R-wave pulsantes no Canal 2 quando SINC ativo
        if (ch === 1 && this.syncEnabled) {
          const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 8.5);
          ctx.save();
          for (let i = 0; i < len; i++) {
            if (i >= cursor && i < resumeIdx) continue;
            if (this.syncMarks[i]) {
              const mx = toX(i);
              const my = Math.max(topY + 11 * dpr, toY(buf[i]) - 6 * dpr);
              ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
              ctx.lineWidth = 1.2 * dpr;
              ctx.beginPath();
              ctx.arc(mx, my, (4.2 + pulse * 2.2) * dpr, 0, Math.PI * 2);
              ctx.stroke();

              ctx.fillStyle = '#facc15';
              ctx.beginPath();
              ctx.moveTo(mx, my + 4.5 * dpr);
              ctx.lineTo(mx - 3.3 * dpr, my - 2 * dpr);
              ctx.lineTo(mx + 3.3 * dpr, my - 2 * dpr);
              ctx.closePath();
              ctx.fill();
            }
          }
          ctx.restore();
        }
      }

      // Barra de varredura de análise automática quando em modo DEA
      if (this.mode === 'DEA') {
        const scanX = ((this.animTime * 0.42) % 1) * w;
        ctx.save();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
        ctx.fillRect(Math.max(0, scanX - 18 * dpr), 0, 18 * dpr, h);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(scanX, 0);
        ctx.lineTo(scanX, h);
        ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.font = `700 ${9 * dpr}px monospace`;
        ctx.fillText('ANALISANDO RITMO DEA...', Math.max(8 * dpr, Math.min(w - 140 * dpr, scanX + 6 * dpr)), 13 * dpr);
        ctx.restore();
      }

      // Flash de descarga + curva esquemática bifásica exponencial truncada no disparo
      if (this.shockFlashTimer > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.68, this.shockFlashTimer * 2.2).toFixed(2)})`;
        ctx.fillRect(0, 0, w, h);

        // Mini pulso bifásico exponencial truncado
        const bw = 64 * dpr;
        const bh = 38 * dpr;
        const bx = w - bw - 10 * dpr;
        const by = 10 * dpr;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.5 * dpr;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
        const mid = by + bh * 0.55;
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(bx + 6 * dpr, mid);
        ctx.lineTo(bx + 12 * dpr, mid - 12 * dpr);
        ctx.lineTo(bx + 30 * dpr, mid - 7 * dpr);
        ctx.lineTo(bx + 30 * dpr, mid + 9 * dpr);
        ctx.lineTo(bx + 48 * dpr, mid + 5 * dpr);
        ctx.lineTo(bx + 52 * dpr, mid);
        ctx.stroke();
        ctx.restore();
      }
    }

    syncUI() {
      if (!this.chassisEl) return;
      const v = this.engine.vitals || {};
      const p = this.engine.patient || {};
      const aw = this.engine.airway || {};

      if (this.standbyEl) {
        this.standbyEl.classList.toggle('hidden', !this.standby);
      }
      if (this.chassisEl) {
        this.chassisEl.classList.toggle('vg-charging', this.chargeState === 'charging');
        this.chassisEl.classList.toggle('vg-ready', this.chargeState === 'ready');
        this.chassisEl.classList.toggle('vg-sync', this.syncEnabled);
        this.chassisEl.classList.toggle('vg-standby', this.standby);
        this.chassisEl.classList.toggle('vg-shocking', this.shockFlashTimer > 0);
      }
      if (this.patientDrawerEl) {
        this.patientDrawerEl.classList.toggle('hidden', !this.patientDrawerOpen || this.standby);
      }

      const setText = (id, txt) => {
        const el = document.getElementById(id);
        if (el && el.textContent !== String(txt)) el.textContent = String(txt);
      };

      const modeLabels = {
        MANUAL: 'MANUAL',
        SINC: 'CARDIOVERSÃO SINC',
        DEA: this.deaStatusText || 'DEA • ANÁLISE',
        MP: 'MARCAPASSO 70bpm'
      };
      setText('vgModeChip', modeLabels[this.mode] || this.mode);
      setText('vgEnergyVal', this.energyJ);
      setText('vgGainTag', `x${this.gain}`);
      setText('vgLeadSetTag', this.leadSet === 'II-V1-V5' ? 'DII • V1 • V5' : 'DI • DII • DIII');

      // Status da carga
      const chgChip = document.getElementById('vgChargeChip');
      if (chgChip) {
        if (this.chargeState === 'ready') {
          chgChip.textContent = `PRONTO ${this.energyJ}J ⚡`;
          chgChip.className = 'vg-status-chip ready mono';
        } else if (this.chargeState === 'charging') {
          chgChip.textContent = `CARREGANDO ${Math.round(this.chargePct)}%`;
          chgChip.className = 'vg-status-chip charging mono';
        } else {
          chgChip.textContent = this.syncEnabled ? 'SINC ATIVO' : 'DESCARREGADO';
          chgChip.className = `vg-status-chip ${this.syncEnabled ? 'sync' : 'idle'} mono`;
        }
      }

      // Barra de carga
      const chgFill = document.getElementById('vgChargeBarFill');
      if (chgFill) {
        chgFill.style.width = `${Math.round(this.chargePct)}%`;
      }

      // Informações do paciente na tela Touchscreen 7"
      const weight = Math.round(p.weightKg || 70);
      const rhythmNames = {
        sinus: 'Sinusal Normal',
        sinus_tach: 'Taquicardia Sinusal',
        sinus_brady: 'Bradicardia Sinusal',
        afib: 'Fibrilação Atrial',
        afib_rvr: 'FA Alta Resposta',
        aflutter: 'Flutter Atrial',
        svt: 'TPSV',
        vtach: 'TV Monomórfica',
        torsades: 'Torsades de Pointes',
        vf: 'Fibrilação Ventricular',
        pea: 'AESP',
        asystole: 'Assistolia',
        stemi: 'Supra de ST (IAMCSST)',
        hyperkalemia: 'Hipercalemia',
        paced: 'Marcapasso',
        rbbb: 'BRD',
        lbbb: 'BRE',
        av_block_1: 'BAV 1º Grau',
        av_block_2_m1: 'BAV 2ºG Mobitz I',
        av_block_2_m2: 'BAV 2ºG Mobitz II',
        av_block_3: 'BAV Total 3ºG',
        wpw: 'WPW',
        de_winter: 'De Winter'
      };
      const rhythmTxt = rhythmNames[v.rhythm] || v.rhythm || 'Sinusal';
      const airwayTxt = aw.connectedToVent ? 'VM Invasiva (TOT)' : 'Espontânea';
      setText('vgPatientLine', `PACIENTE: UTI Leito 04 • Adulto ${weight} kg • ${rhythmTxt} • ${airwayTxt}`);
      setText('vgPatDrawerWeight', `${weight} kg (172 cm)`);
      setText('vgPatDrawerRhythm', rhythmTxt);
      setText('vgPatDrawerAirway', airwayTxt);
      setText('vgPatDrawerShocks', `${this.shockCount} choque(s)`);
      setText('vgPatDrawerImpedance', '52 Ω (Contato OK)');
      setText('vgPatDrawerMode', `${this.mode} • ${this.energyJ} J Bifásico`);

      // Telemetria lateral da tela 7"
      const rId = v.rhythm || 'sinus';
      const isChaosOrFlat = rId === 'vf' || rId === 'asystole' || rId === 'torsades';
      const isPulseless = isChaosOrFlat || rId === 'pea';
      const cprOn = Boolean(this.engine.interventions && this.engine.interventions.cprActive);
      setText('vgHrVal', isChaosOrFlat ? '---' : Math.round(v.hr || 0));
      setText('vgSpo2Val', isPulseless && !cprOn ? '--' : Math.round(v.spo2 || 0));
      setText('vgCo2Val', Math.round(v.etco2 || 0));
      setText('vgNibpVal', isPulseless && !cprOn ? '---/---' : `${Math.round(v.sbp || 0)}/${Math.round(v.dbp || 0)}`);
      setText('vgMapVal', isPulseless && !cprOn ? '(--)' : `(${Math.round(v.map || 0)})`);

      const now = new Date();
      const pad2 = (n) => String(n).padStart(2, '0');
      setText('vgClock', `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`);

      // Estados ativos dos botões físicos e touch
      const syncBtnHw = document.getElementById('vgHwSyncBtn');
      const syncBtnTouch = document.getElementById('vgTouchSyncBtn');
      if (syncBtnHw) syncBtnHw.classList.toggle('active', this.syncEnabled);
      if (syncBtnTouch) syncBtnTouch.classList.toggle('active', this.syncEnabled);

      const deaBtnHw = document.getElementById('vgHwDeaBtn');
      if (deaBtnHw) deaBtnHw.classList.toggle('active', this.mode === 'DEA');

      const pacerBtn = this.chassisEl.querySelector('[data-vg-action="togglePacer"]');
      if (pacerBtn) pacerBtn.classList.toggle('active', this.mode === 'MP');

      const patBtnTouch = document.getElementById('vgTouchPatientBtn');
      if (patBtnTouch) patBtnTouch.classList.toggle('active', this.patientDrawerOpen && !this.standby);

      const muteBtn = document.getElementById('vgHwMuteBtn');
      if (muteBtn) muteBtn.classList.toggle('active', this.alarmsMuted);
    }
  }

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.VivoGoldCardioverter = VivoGoldCardioverter;
})(window);
