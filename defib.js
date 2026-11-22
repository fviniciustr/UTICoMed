/**
 * Cardioversor Bifásico Vivo Gold (CMOS DRAKE)
 * 3 canais ECG simultâneos sincronizados em fase com o Monitor Mindray e Ventilador HAMILTON-C1:
 * - Cardioversão Sincronizada (SINC) real com disparo travado na próxima onda R
 * - DEA em malha fechada (reanálise contínua + carga/desarme automático)
 * - Marcapasso Transcutâneo (MP) bidirecional em fase com o Monitor
 * - Impedância transtorácica dinâmica acoplada ao volume pulmonar / PEEP / pneumotórax
 * - Renderização GPU otimizada (contexto opaco, cache de grade, traçado afim sem closures)
 */
(function (global) {
  'use strict';

  const ENERGY_STEPS = [2, 5, 10, 20, 30, 50, 70, 100, 150, 200, 300, 360];
  const RHYTHM_NAMES = {
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
      this.patientDrawerOpen = false;
      this.deaStatusText = '';
      this._deaLastRhythm = null;
      this.pendingSyncShock = false;
      this.pendingSyncTimer = 0;
      this._pendingPacerSpike = false;

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
      this._dirty = true;

      // Cache de DOM + diffing de texto (zero getElementById por tick)
      this._dom = new Map();
      this._txt = new Map();
      this.chassisEl = document.getElementById('vgChassis');
      this.canvas = document.getElementById('canvasVgEcg');
      this.ctx = this.canvas ? (this.canvas.getContext('2d', { alpha: false, desynchronized: true }) || this.canvas.getContext('2d')) : null;
      this.standbyEl = document.getElementById('vgStandbyOverlay');
      this.patientDrawerEl = document.getElementById('vgPatientDrawer');
      this._pacerBtn = this.chassisEl ? this.chassisEl.querySelector('[data-vg-action="togglePacer"]') : null;

      // Objetos reutilizáveis para render() com zero alocações por frame
      this._traceOpts = {
        buf: null,
        len: this.bufferLen,
        cursor: 0,
        gapSamples: 24,
        fadeLen: 42,
        tailHighlight: 26,
        color: '#22ff66',
        lineWidth: 1.8,
        dpr: 1,
        w: 0,
        h: 0,
        minVal: -1,
        invSpan: 0.5,
        plotH: 0,
        padY: 0,
        topY: 0,
        botY: 0,
        glow: true
      };
      this._divRefYs = [0, 0];
      this._chBuffers = [this.ch1Buf, this.ch2Buf, this.ch3Buf];
      this._chColors = ['#22ff66', '#22ff66', '#4ade80'];

      this._bindEvents();
      this.syncUI();
    }

    $(id) {
      let el = this._dom.get(id);
      if (el === undefined) {
        el = document.getElementById(id);
        this._dom.set(id, el);
      }
      return el;
    }

    _setText(id, val) {
      const s = String(val);
      if (this._txt.get(id) === s) return;
      const el = this.$(id);
      if (el) {
        el.textContent = s;
        this._txt.set(id, s);
      }
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
      this._deaLastRhythm = null;
      this.pendingSyncShock = false;
      this.pendingSyncTimer = 0;
      this._pendingPacerSpike = false;
      this.ch1Buf.fill(0);
      this.ch2Buf.fill(0);
      this.ch3Buf.fill(0);
      this.syncMarks.fill(0);
      this.shockMarks.fill(0);
      this.pacerMarks.fill(0);
      this.writeIdx = 0;
      this.lastMonIdx = -1;
      this._dirty = true;
      if (this.engine && this.engine.setExternalPacer) {
        this.engine.setExternalPacer(false, 70);
      }
      this._updateRotaryKnob();
      this.syncUI();
    }

    /**
     * Sincronia bidirecional quando o Marcapasso Transcutâneo é alternado pelo Menu Clínico.
     */
    syncPacerFromEngine() {
      const pacerOn = Boolean(this.engine && this.engine.externalPacer && this.engine.externalPacer.active);
      if (pacerOn && this.mode !== 'MP') {
        this.standby = false;
        this.mode = 'MP';
        this.syncEnabled = false;
        this.pendingSyncShock = false;
        this.deaStatusText = '';
        this._disarm();
        this._dirty = true;
        this.syncUI();
      } else if (!pacerOn && this.mode === 'MP') {
        this.mode = 'MANUAL';
        this._dirty = true;
        this.syncUI();
      }
    }

    /**
     * Chamado pelo Monitor no instante exato da onda R (QRS):
     * 1) Dispara Cardioversão Sincronizada (SINC) pendente sobre a onda R real
     * 2) Marca espícula de Marcapasso (MP) perfeitamente em fase com o QRS do Monitor
     */
    onMonitorBeat(vit, isPvc) {
      if (this.standby) return;
      const r = (vit && vit.rhythm) || 'sinus';
      if (this.mode === 'MP' && r === 'paced') {
        this._pendingPacerSpike = true;
      }
      if (this.pendingSyncShock && this.syncEnabled && this.chargeState === 'ready') {
        if (!isPvc && r !== 'vf' && r !== 'asystole' && r !== 'torsades') {
          this.pendingSyncShock = false;
          this.pendingSyncTimer = 0;
          this._executeShockNow();
        }
      }
    }

    _updateRotaryKnob() {
      const knob = this.$('vgRotaryKnob');
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

      const knob = this.$('vgRotaryKnob');
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
        this._dirty = true;
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
        this._dirty = true;
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
        case 'toggleSync':
          this._setMode(this.syncEnabled ? 'MANUAL' : 'SINC');
          break;
        case 'toggleDea':
          this._setMode(this.mode === 'DEA' ? 'MANUAL' : 'DEA');
          break;
        case 'togglePacer':
          this._setMode(this.mode === 'MP' ? 'MANUAL' : 'MP');
          break;
        case 'toggleLeads':
          this.leadSet = this.leadSet === 'I-II-III' ? 'II-V1-V5' : 'I-II-III';
          this._dirty = true;
          if (this.engine && this.engine.onLog) {
            this.engine.onLog(`Vivo Gold: Derivações alteradas para ${this.leadSet === 'II-V1-V5' ? 'DII • V1 • V5' : 'DI • DII • DIII'}`);
          }
          break;
        case 'cycleGain':
          this.gain = this.gain === 1.0 ? 2.0 : this.gain === 2.0 ? 0.5 : 1.0;
          this._dirty = true;
          if (this.engine && this.engine.onLog) {
            this.engine.onLog(`Vivo Gold: Ganho ECG ajustado para x${this.gain}`);
          }
          break;
        case 'togglePatient':
          this.patientDrawerOpen = !this.patientDrawerOpen;
          break;
        case 'mute': {
          // Silêncio unificado com o Monitor Mindray e Ventilador HAMILTON-C1
          const silBtn = document.getElementById('btnSilenceAlarm');
          if (silBtn) {
            silBtn.click();
          } else if (this.audio) {
            this.audio.setAlarmSilenced(!this.audio.isSilenced());
          }
          break;
        }
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

    _evaluateDeaRhythm(forceLog) {
      const r = (this.engine.vitals && this.engine.vitals.rhythm) || 'sinus';
      if (!forceLog && r === this._deaLastRhythm) return;
      const prev = this._deaLastRhythm;
      this._deaLastRhythm = r;
      const shockable = r === 'vf' || r === 'vtach' || r === 'torsades';
      if (shockable) {
        this.deaStatusText = 'DEA • CHOQUE IND.';
        this.energyIdx = ENERGY_STEPS.indexOf(200);
        this._updateRotaryKnob();
        this._startCharge();
        if (this.engine.onLog) this.engine.onLog('DEA Vivo Gold: Ritmo chocável detectado (FV/TV) — Carregando 200J!');
      } else {
        this.deaStatusText = prev && (prev === 'vf' || prev === 'vtach' || prev === 'torsades')
          ? 'DEA • CONVERTIDO ✓'
          : 'DEA • NÃO CHOCÁVEL';
        this._disarm();
        if (forceLog && this.engine.onLog) this.engine.onLog('DEA Vivo Gold: Ritmo não chocável — Choque não indicado');
      }
    }

    _setMode(mode) {
      this.mode = mode;
      this.syncEnabled = mode === 'SINC';
      this.pendingSyncShock = false;
      this.pendingSyncTimer = 0;
      this.deaStatusText = '';
      this._deaLastRhythm = null;
      if (this.engine && this.engine.setExternalPacer) {
        this.engine.setExternalPacer(mode === 'MP' && !this.standby, 70);
      }
      if (mode === 'DEA') {
        this._evaluateDeaRhythm(true);
      }
      this._dirty = true;
    }

    _stepEnergy(dir) {
      this.energyIdx = Math.max(0, Math.min(ENERGY_STEPS.length - 1, this.energyIdx + dir));
      if (this.chargeState !== 'idle') this._disarm();
      this._updateRotaryKnob();
    }

    _startCharge() {
      if (this.chargeState === 'ready') return;
      this.chargeState = 'charging';
      this.pendingSyncShock = false;
      this.pendingSyncTimer = 0;
      if (this.chargePct < 5) this.chargePct = 8;
    }

    _disarm() {
      this.chargeState = 'idle';
      this.chargePct = 0;
      this.pendingSyncShock = false;
      this.pendingSyncTimer = 0;
    }

    _deliverShock() {
      if (this.chargeState !== 'ready') {
        this._startCharge();
        return;
      }
      const r = (this.engine.vitals && this.engine.vitals.rhythm) || 'sinus';
      // Em modo SINC com ritmo organizado, arma o disparo travado na próxima onda R real do Monitor
      if (this.syncEnabled && r !== 'vf' && r !== 'torsades' && r !== 'asystole') {
        if (!this.pendingSyncShock) {
          this.pendingSyncShock = true;
          this.pendingSyncTimer = 1.6;
          if (this.engine.onLog) {
            this.engine.onLog(`Vivo Gold SINC: Aguardando onda R para cardioversão sincronizada (${this.energyJ}J)…`);
          }
          this.syncUI();
        }
        return;
      }
      this._executeShockNow();
    }

    _executeShockNow() {
      const energy = this.energyJ;
      const res = this.engine.defibrillate({ energyJ: energy, sync: this.syncEnabled });
      if (res && res.delivered) {
        if (this.audio) this.audio.playDefibChargeAndShock();
        this.shockFlashTimer = 0.34;
        this.shockCount += 1;
        const markIdx = (this.writeIdx - 1 + this.bufferLen) % this.bufferLen;
        this.shockMarks[markIdx] = 1;
        this._disarm();
      } else {
        // Ex.: SINC ativo sobre FV (sem onda R) -> mantém carga pronta para o clínico desativar SINC e chocar!
        this.pendingSyncShock = false;
        this.pendingSyncTimer = 0;
      }
      this._dirty = true;
      if (typeof this.onShock === 'function') {
        this.onShock(res, energy);
      }
      this.syncUI();
    }

    resize() {
      if (!this.canvas) return;
      const Sweep = global.ICUSim && global.ICUSim.Sweep;
      if (Sweep) {
        Sweep.resizeCanvas(this.canvas);
      } else {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          this.canvas.width = Math.round(rect.width * dpr);
          this.canvas.height = Math.round(rect.height * dpr);
        }
      }
      this._dirty = true;
    }

    step(dt) {
      if (this.standby) return;
      this.animTime += dt;

      // Sincronia automática caso o Marcapasso seja alternado fora do Vivo Gold
      const extPacer = Boolean(this.engine && this.engine.externalPacer && this.engine.externalPacer.active);
      if (extPacer !== (this.mode === 'MP')) {
        this.syncPacerFromEngine();
      }

      // Atualizar progresso de carga dos capacitores bifásicos
      if (this.chargeState === 'charging') {
        this.chargePct = Math.min(100, this.chargePct + dt * 82);
        if (this.chargePct >= 100) {
          this.chargePct = 100;
          this.chargeState = 'ready';
        }
      }

      // Reanálise contínua do DEA em malha fechada
      if (this.mode === 'DEA') {
        this._evaluateDeaRhythm(false);
        this._dirty = true;
      }

      // Timeout de segurança para SINC (ex.: bradicardia extrema ou mudança para ritmo sem R)
      if (this.pendingSyncShock) {
        this.pendingSyncTimer -= dt;
        if (this.pendingSyncTimer <= 0) {
          this.pendingSyncShock = false;
          this._executeShockNow();
        }
      }

      if (this.shockFlashTimer > 0) {
        this.shockFlashTimer = Math.max(0, this.shockFlashTimer - dt);
        this._dirty = true;
        if (this.shockFlashTimer === 0 && this.chassisEl) {
          this.chassisEl.classList.remove('vg-shocking');
        }
      }

      // Consumir amostras novas do buffer do Monitor (200 Hz) para 3 canais em fase exata
      if (!this.monitor || !this.monitor.buffers) return;
      const monBuf = this.monitor.buffers.ecg;
      const monLen = this.monitor.bufferLen;
      const monWrite = this.monitor.writeIdx;
      if (this.lastMonIdx < 0) {
        this.lastMonIdx = (monWrite - 1 + monLen) % monLen;
      }

      let steps = (monWrite - this.lastMonIdx + monLen) % monLen;
      if (steps === 0) return;
      if (steps > 80) {
        this.lastMonIdx = (monWrite - 2 + monLen) % monLen;
        steps = 2;
      }

      const rhythm = (this.engine.vitals && this.engine.vitals.rhythm) || 'sinus';
      const organized = rhythm !== 'vf' && rhythm !== 'asystole' && rhythm !== 'torsades';
      const isVLeads = this.leadSet === 'II-V1-V5';

      for (let s = 0; s < steps; s++) {
        this.lastMonIdx = (this.lastMonIdx + 1) % monLen;
        const d2 = monBuf[this.lastMonIdx];
        const prevD2 = monBuf[(this.lastMonIdx - 1 + monLen) % monLen];

        let ch1, ch2, ch3;
        if (isVLeads) {
          ch1 = d2;
          ch2 = -0.68 * d2 + 0.14 * (d2 - prevD2);
          ch3 = rhythm === 'asystole' ? 0 : 1.14 * d2 + 0.08 * Math.sin(this.writeIdx * 0.04);
        } else {
          ch1 = 0.66 * d2 + 0.10 * (d2 - prevD2);
          ch2 = d2;
          ch3 = d2 - ch1 * 0.85;
        }

        const idx = this.writeIdx;
        this.ch1Buf[idx] = ch1;
        this.ch2Buf[idx] = ch2;
        this.ch3Buf[idx] = ch3;
        this.shockMarks[idx] = 0;

        // Espícula de Marcapasso travada em fase exata com o batimento do Monitor
        if (this.mode === 'MP' && this._pendingPacerSpike) {
          this.pacerMarks[idx] = 1;
          this._pendingPacerSpike = false;
        } else {
          this.pacerMarks[idx] = 0;
        }

        // Marcador R-wave para cardioversão sincronizada (SINC)
        if (this.syncCooldown > 0) this.syncCooldown -= 1;
        const isPeak = organized && d2 > 0.62 && d2 >= prevD2 && this.syncCooldown === 0;
        this.syncMarks[idx] = isPeak ? 1 : 0;
        if (isPeak) this.syncCooldown = 38;

        this.writeIdx = (idx + 1) % this.bufferLen;
      }
      this._dirty = true;
    }

    render() {
      if (this.standby || !this._dirty || !this.canvas || !this.ctx || !this.canvas.width || !this.canvas.height) return;
      if (this.chassisEl && this.chassisEl.classList.contains('hidden')) return;
      this._dirty = false;

      const Sweep = global.ICUSim.Sweep;
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const dpr = Sweep.getDpr();
      const chH = h / 3;

      // Fundo opaco + grade 18x9 + divisórias de 3 canais em cache offscreen (1 drawImage GPU!)
      this._divRefYs[0] = chH;
      this._divRefYs[1] = 2 * chH;
      const gridBg = Sweep.getCachedGridCanvas(this.canvas, w, h, dpr, 18, 9, 'rgba(34, 197, 94, 0.08)', '#05090d', this._divRefYs);
      ctx.drawImage(gridBg, 0, 0);

      const labels = this.leadSet === 'II-V1-V5' ? ['DII', 'V1', 'V5'] : ['DI', 'DII', 'DIII'];
      const len = this.bufferLen;
      const cursor = this.writeIdx;
      const gapSamples = 24;
      const resumeIdx = cursor + gapSamples;
      const invLen = w / (len - 1);
      const gainStr = this.gain === 1 ? 'x1' : 'x' + this.gain;
      const o = this._traceOpts;
      o.len = len;
      o.cursor = cursor;
      o.dpr = dpr;
      o.w = w;
      o.h = h;

      ctx.font = `700 ${10 * dpr}px monospace`;
      for (let ch = 0; ch < 3; ch++) {
        const buf = this._chBuffers[ch];
        const topY = ch * chH;
        const midY = topY + chH * 0.56;
        const ampPx = chH * 0.36 * this.gain;
        const minVal = (midY - (topY + chH - 4 * dpr)) / ampPx;
        const maxVal = (midY - (topY + 4 * dpr)) / ampPx;
        const span = maxVal - minVal;

        ctx.fillStyle = '#86efac';
        ctx.fillText(`${labels[ch]}  ${gainStr}`, 6 * dpr, topY + 13 * dpr);

        // Mapeamento afim sem closures + decimação com preservação de pico QRS
        o.buf = buf;
        o.color = this._chColors[ch];
        o.minVal = minVal;
        o.invSpan = span > 0 ? 1 / span : 1;
        o.plotH = chH - 8 * dpr;
        o.padY = h - (topY + chH - 4 * dpr);
        o.topY = topY + 2 * dpr;
        o.botY = topY + chH - 2 * dpr;
        Sweep.drawSweepTrace(ctx, o);
      }

      // 1 única varredura batched para espículas MP, linhas de choque e marcadores R-wave (SINC)
      const isMp = this.mode === 'MP';
      const isSync = this.syncEnabled;
      const pulse = isSync ? 0.5 + 0.5 * Math.sin(this.animTime * 8.5) : 0;
      const syncTopY = chH;
      const syncMidY = syncTopY + chH * 0.56;
      const syncAmpPx = chH * 0.36 * this.gain;

      ctx.save();
      let hasPacer = false;
      let hasShock = false;
      for (let i = 0; i < len; i++) {
        if (i >= cursor && i < resumeIdx) continue;
        if (isMp && this.pacerMarks[i]) hasPacer = true;
        if (this.shockMarks[i]) hasShock = true;
        if (hasPacer && hasShock) break;
      }

      if (hasPacer) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          if ((i >= cursor && i < resumeIdx) || !this.pacerMarks[i]) continue;
          const px = i * invLen;
          ctx.moveTo(px, 6 * dpr);
          ctx.lineTo(px, chH - 6 * dpr);
          ctx.moveTo(px, chH + 6 * dpr);
          ctx.lineTo(px, 2 * chH - 6 * dpr);
          ctx.moveTo(px, 2 * chH + 6 * dpr);
          ctx.lineTo(px, h - 6 * dpr);
        }
        ctx.stroke();
      }

      if (hasShock) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2.0 * dpr;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          if ((i >= cursor && i < resumeIdx) || !this.shockMarks[i]) continue;
          const sx = i * invLen;
          ctx.moveTo(sx, 3 * dpr);
          ctx.lineTo(sx, h - 3 * dpr);
        }
        ctx.stroke();
      }

      if (isSync) {
        const ringR = (4.2 + pulse * 2.2) * dpr;
        ctx.strokeStyle = this.pendingSyncShock ? '#f97316' : 'rgba(250, 204, 21, 0.55)';
        ctx.fillStyle = this.pendingSyncShock ? '#fb923c' : '#facc15';
        ctx.lineWidth = 1.2 * dpr;
        for (let i = 0; i < len; i++) {
          if ((i >= cursor && i < resumeIdx) || !this.syncMarks[i]) continue;
          const mx = i * invLen;
          const ry = Math.max(syncTopY + 4 * dpr, Math.min(syncTopY + chH - 4 * dpr, syncMidY - this.ch2Buf[i] * syncAmpPx));
          const my = Math.max(syncTopY + 11 * dpr, ry - 6 * dpr);
          ctx.beginPath();
          ctx.arc(mx, my, ringR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(mx, my + 4.5 * dpr);
          ctx.lineTo(mx - 3.3 * dpr, my - 2 * dpr);
          ctx.lineTo(mx + 3.3 * dpr, my - 2 * dpr);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();

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
        ctx.fillText(this.deaStatusText || 'ANALISANDO RITMO DEA...', Math.max(8 * dpr, Math.min(w - 148 * dpr, scanX + 6 * dpr)), 13 * dpr);
        ctx.restore();
      }

      // Flash de descarga + curva esquemática bifásica exponencial truncada no disparo
      if (this.shockFlashTimer > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.68, this.shockFlashTimer * 2.2).toFixed(2)})`;
        ctx.fillRect(0, 0, w, h);

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

    _computeThoracicImpedance() {
      const b = this.engine.breath || {};
      const vent = this.engine.vent || {};
      const p = this.engine.patient || {};
      const aw = this.engine.airway || {};
      // Impedância transtorácica real varia com volume pulmonar, PEEP e pneumotórax (48–84 Ω)
      const volOhm = Math.min(14, (b.volumeL || 0) * 20);
      const peepOhm = aw.connectedToVent && !vent.standby ? Math.max(0, (vent.peepSet || 0) - 5) * 0.75 : 0;
      const pneumoOhm = p.pneumothoraxActive ? 18 : 0;
      const ohm = Math.round(48 + volOhm + peepOhm + pneumoOhm);
      const tag = p.pneumothoraxActive ? 'Pneumotórax ↑' : ohm >= 66 ? '↑ PEEP/Insufl.' : 'Contato OK';
      return { ohm, tag };
    }

    syncUI() {
      if (!this.chassisEl) return;
      const v = this.engine.vitals || {};
      const p = this.engine.patient || {};
      const aw = this.engine.airway || {};
      const vent = this.engine.vent || {};

      if (this.standbyEl) {
        this.standbyEl.classList.toggle('hidden', !this.standby);
      }
      this.chassisEl.classList.toggle('vg-charging', this.chargeState === 'charging');
      this.chassisEl.classList.toggle('vg-ready', this.chargeState === 'ready');
      this.chassisEl.classList.toggle('vg-sync', this.syncEnabled);
      this.chassisEl.classList.toggle('vg-standby', this.standby);
      this.chassisEl.classList.toggle('vg-shocking', this.shockFlashTimer > 0);

      if (this.patientDrawerEl) {
        this.patientDrawerEl.classList.toggle('hidden', !this.patientDrawerOpen || this.standby);
      }

      const modeLabels = {
        MANUAL: 'MANUAL',
        SINC: this.pendingSyncShock ? 'SINC • AGUARD. R' : 'CARDIOVERSÃO SINC',
        DEA: this.deaStatusText || 'DEA • ANÁLISE',
        MP: 'MARCAPASSO 70bpm'
      };
      this._setText('vgModeChip', modeLabels[this.mode] || this.mode);
      this._setText('vgEnergyVal', this.energyJ);
      this._setText('vgGainTag', `x${this.gain}`);
      this._setText('vgLeadSetTag', this.leadSet === 'II-V1-V5' ? 'DII • V1 • V5' : 'DI • DII • DIII');

      // Status da carga
      const chgChip = this.$('vgChargeChip');
      if (chgChip) {
        let txt, cls;
        if (this.pendingSyncShock) {
          txt = `SINC • AGUARD. R ⚡`;
          cls = 'vg-status-chip ready sync-wait mono';
        } else if (this.chargeState === 'ready') {
          txt = `PRONTO ${this.energyJ}J ⚡`;
          cls = 'vg-status-chip ready mono';
        } else if (this.chargeState === 'charging') {
          txt = `CARREGANDO ${Math.round(this.chargePct)}%`;
          cls = 'vg-status-chip charging mono';
        } else {
          txt = this.syncEnabled ? 'SINC ATIVO' : 'DESCARREGADO';
          cls = `vg-status-chip ${this.syncEnabled ? 'sync' : 'idle'} mono`;
        }
        if (chgChip.textContent !== txt) chgChip.textContent = txt;
        if (chgChip.className !== cls) chgChip.className = cls;
      }

      const chgFill = this.$('vgChargeBarFill');
      if (chgFill) {
        const pctStr = `${Math.round(this.chargePct)}%`;
        if (chgFill.style.width !== pctStr) chgFill.style.width = pctStr;
      }

      // Telemetria integrada do Paciente + HAMILTON-C1 + Impedância Transtorácica
      const weight = Math.round(p.weightKg || 70);
      const rhythmTxt = RHYTHM_NAMES[v.rhythm] || v.rhythm || 'Sinusal';
      const o2Info = this.engine.getEffectiveO2Info ? this.engine.getEffectiveO2Info() : { fio2: 21, deviceName: 'Ar' };
      const airwayTxt = aw.connectedToVent
        ? (vent.standby ? 'C1 STANDBY (APNEIA!)' : `C1 ${vent.mode || 'VCV'} • FiO₂ ${Math.round(vent.o2FlushTimer > 0 ? 100 : (vent.fio2Set || 40))}%`)
        : `Espont. • FiO₂ ${Math.round(o2Info.fio2 || 21)}%`;
      const imp = this._computeThoracicImpedance();

      this._setText('vgPaddleStatus', `PÁS ${imp.ohm}Ω`);
      this._setText('vgPatientLine', `PACIENTE: Leito 04 • ${weight} kg • ${rhythmTxt} • ${airwayTxt}`);
      this._setText('vgPatDrawerWeight', `${weight} kg (172 cm)`);
      this._setText('vgPatDrawerRhythm', rhythmTxt);
      this._setText('vgPatDrawerAirway', airwayTxt);
      this._setText('vgPatDrawerShocks', `${this.shockCount} choque(s)`);
      this._setText('vgPatDrawerImpedance', `${imp.ohm} Ω (${imp.tag})`);
      this._setText('vgPatDrawerMode', `${this.mode} • ${this.energyJ} J Bifásico`);

      // Telemetria lateral da tela 7"
      const rId = v.rhythm || 'sinus';
      const isChaosOrFlat = rId === 'vf' || rId === 'asystole' || rId === 'torsades';
      const isPulseless = isChaosOrFlat || rId === 'pea';
      const cprOn = Boolean(this.engine.interventions && this.engine.interventions.cprActive);
      this._setText('vgHrVal', isChaosOrFlat ? '---' : Math.round(v.hr || 0));
      this._setText('vgSpo2Val', isPulseless && !cprOn ? '--' : Math.round(v.spo2 || 0));
      this._setText('vgCo2Val', Math.round(v.etco2 || 0));
      this._setText('vgNibpVal', isPulseless && !cprOn ? '---/---' : `${Math.round(v.sbp || 0)}/${Math.round(v.dbp || 0)}`);
      this._setText('vgMapVal', isPulseless && !cprOn ? '(--)' : `(${Math.round(v.map || 0)})`);

      const now = new Date();
      const pad2 = (n) => (n < 10 ? '0' + n : String(n));
      this._setText('vgClock', `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`);

      const syncBtnHw = this.$('vgHwSyncBtn');
      const syncBtnTouch = this.$('vgTouchSyncBtn');
      if (syncBtnHw) syncBtnHw.classList.toggle('active', this.syncEnabled);
      if (syncBtnTouch) syncBtnTouch.classList.toggle('active', this.syncEnabled);

      const deaBtnHw = this.$('vgHwDeaBtn');
      if (deaBtnHw) deaBtnHw.classList.toggle('active', this.mode === 'DEA');

      if (this._pacerBtn) this._pacerBtn.classList.toggle('active', this.mode === 'MP');

      const patBtnTouch = this.$('vgTouchPatientBtn');
      if (patBtnTouch) patBtnTouch.classList.toggle('active', this.patientDrawerOpen && !this.standby);

      const muteBtn = this.$('vgHwMuteBtn');
      if (muteBtn) muteBtn.classList.toggle('active', Boolean(this.audio && this.audio.isSilenced()));
    }
  }

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.VivoGoldCardioverter = VivoGoldCardioverter;
})(window);
