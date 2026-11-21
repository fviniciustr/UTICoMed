/**
 * Áudio Hospitalar via Web Audio API
 * - Bip de QRS com frequência modulada pela SpO₂ (padrão oxímetro de UTI)
 * - Alarmes graduados (Média e Alta Prioridade) com silenciador de 2 min
 */
(function (global) {
  'use strict';

  class MedicalAudio {
    constructor() {
      this.ctx = null;
      this.qrsEnabled = false;
      this.alarmEnabled = true;
      this.silencedUntil = 0;
      this.lastAlarmAt = 0;
      this.uiClickCount = 0;
      this.lastUiClickKind = null;
      this._lastUiClickAt = 0;

      // Estado da Ausculta Pulmonar
      this.auscultationEnabled = false;
      this.auscultationSite = 'bilateral'; // 'bilateral' | 'R_apex' | 'R_base' | 'L_apex' | 'L_base'
      this._auscNodes = null;
      this._lastCrackleAt = 0;
      this.auscLevel = 0;
    }

    _ensureContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    setQrsEnabled(enabled) {
      this.qrsEnabled = enabled;
      if (enabled) this._ensureContext();
    }

    setAlarmSilenced(silenced) {
      if (silenced) {
        this.silencedUntil = performance.now() + 120000;
      } else {
        this.silencedUntil = 0;
        this._ensureContext();
      }
    }

    isSilenced() {
      return performance.now() < this.silencedUntil;
    }

    playQrsBeep(spo2) {
      if (!this.qrsEnabled) return;
      this._ensureContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Quanto menor a SpO2, mais grave o som (350 Hz a 880 Hz)
      const sat = Math.max(50, Math.min(100, spo2 || 98));
      const freq = 350 + ((sat - 50) / 50) * 530;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    }

    tickAlarms(highestLevel) {
      if (!this.alarmEnabled || this.isSilenced() || !highestLevel) return;
      if (!this.ctx || this.ctx.state !== 'running') return;

      const nowMs = performance.now();
      const interval = highestLevel === 'critical' ? 2200 : 4500;
      if (nowMs - this.lastAlarmAt < interval) return;
      this.lastAlarmAt = nowMs;

      if (highestLevel === 'critical') {
        this._playPattern([880, 987, 880], 0.09, 0.14, 0.055);
      } else if (highestLevel === 'warning') {
        this._playPattern([660, 554], 0.11, 0.18, 0.035);
      }
    }

    _playPattern(freqs, dur, gap, vol) {
      if (!this.ctx) return;
      const base = this.ctx.currentTime;
      freqs.forEach((f, idx) => {
        const start = base + idx * gap;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.01);
      });
    }

    playDefibChargeAndShock() {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.25);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    }

    /** Sons táteis 3D para botões físicos, touchscreen, rotary knobs, PNI, cardioversor e liga/desliga */
    playUiClick(kind = 'hw') {
      const nowMs = performance.now();
      if (kind === '_auto') {
        if (nowMs - this._lastUiClickAt < 45) return;
        kind = 'hw';
      }
      this._lastUiClickAt = nowMs;
      this.uiClickCount += 1;
      this.lastUiClickKind = kind;

      this._ensureContext();
      if (!this.ctx) return;

      const emit = () => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        if (kind === 'knob') {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1550, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.028);
          gain.gain.setValueAtTime(0.11, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.036);
          return;
        }

        if (kind === 'soft') {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(920, now);
          osc.frequency.exponentialRampToValueAtTime(640, now + 0.038);
          gain.gain.setValueAtTime(0.095, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.042);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.046);
          return;
        }

        if (kind === 'vgKey') {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1180, now);
          osc.frequency.exponentialRampToValueAtTime(840, now + 0.045);
          gain.gain.setValueAtTime(0.11, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.055);
          return;
        }

        if (kind === 'vgSync') {
          this._playPattern([988, 1318], 0.045, 0.055, 0.095);
          return;
        }

        if (kind === 'vgCharge') {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(1480, now + 0.22);
          gain.gain.setValueAtTime(0.075, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.25);
          return;
        }

        if (kind === 'powerOn') {
          this._playPattern([440, 554, 659], 0.08, 0.09, 0.11);
          return;
        }

        if (kind === 'powerOff') {
          this._playPattern([523, 392, 293], 0.09, 0.09, 0.10);
          return;
        }

        if (kind === 'lock') {
          this._playPattern([920, 690], 0.05, 0.07, 0.10);
          return;
        }

        if (kind === 'silence') {
          this._playPattern([740, 587], 0.055, 0.075, 0.10);
          return;
        }

        if (kind === 'nibp') {
          this._playPattern([240, 290], 0.07, 0.08, 0.11);
          return;
        }

        if (kind === 'maneuver') {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(940, now + 0.08);
          gain.gain.setValueAtTime(0.11, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.12);
          return;
        }

        // 'hw': clique físico com corpo mecânico (thock + click)
        const bodyOsc = this.ctx.createOscillator();
        const bodyGain = this.ctx.createGain();
        bodyOsc.type = 'sine';
        bodyOsc.frequency.setValueAtTime(260, now);
        bodyOsc.frequency.exponentialRampToValueAtTime(88, now + 0.04);
        bodyGain.gain.setValueAtTime(0.14, now);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
        bodyOsc.connect(bodyGain);
        bodyGain.connect(this.ctx.destination);
        bodyOsc.start(now);
        bodyOsc.stop(now + 0.048);

        const clickOsc = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(1320, now);
        clickOsc.frequency.exponentialRampToValueAtTime(760, now + 0.022);
        clickGain.gain.setValueAtTime(0.085, now);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.026);
        clickOsc.connect(clickGain);
        clickGain.connect(this.ctx.destination);
        clickOsc.start(now);
        clickOsc.stop(now + 0.03);
      };

      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(emit).catch(() => {});
      } else {
        emit();
      }
    }

    // ================= AUSCULTA PULMONAR EM TEMPO REAL =================
    setAuscultationEnabled(enabled) {
      this.auscultationEnabled = Boolean(enabled);
      if (this.auscultationEnabled) {
        this._ensureContext();
        this._ensureAuscultationGraph();
      } else {
        this.silenceAuscultation();
      }
    }

    setAuscultationSite(site) {
      this.auscultationSite = site || 'bilateral';
      this._updateAuscultationPan();
    }

    _updateAuscultationPan() {
      if (!this._auscNodes || !this._auscNodes.panner || !this.ctx) return;
      const s = this.auscultationSite;
      const pan = s === 'R_apex' || s === 'R_base' ? 0.72 : s === 'L_apex' || s === 'L_base' ? -0.72 : 0;
      this._auscNodes.panner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.04);
    }

    setTabHidden(hidden) {
      if (!this.ctx) return;
      if (hidden) {
        this.silenceAuscultation();
        if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
      } else if (this.ctx.state === 'suspended' && (this.qrsEnabled || this.auscultationEnabled)) {
        this.ctx.resume().catch(() => {});
      }
    }

    silenceAuscultation() {
      this.auscLevel = 0;
      if (!this._auscNodes || !this.ctx) return;
      const now = this.ctx.currentTime;
      this._auscNodes.mvGain.gain.setTargetAtTime(0, now, 0.04);
      this._auscNodes.wheezeGain.gain.setTargetAtTime(0, now, 0.04);
      this._auscNodes.rhonchiGain.gain.setTargetAtTime(0, now, 0.04);
    }

    _ensureAuscultationGraph() {
      if (this._auscNodes || !this.ctx) return;
      const ctx = this.ctx;

      // Buffer de ruído rosa/marrom suave (2s em loop)
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.950 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.04) * 1.8;
      }
      this._noiseBuffer = buf;

      // Panner estéreo espacial (HTD -> ouvido direito, HTE -> esquerdo, bilateral -> centro)
      const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
      const outDest = panner || ctx.destination;
      if (panner) panner.connect(ctx.destination);

      // 1. Murmúrio Vesicular (bandpass 260 Hz)
      const mvSrc = ctx.createBufferSource();
      mvSrc.buffer = buf;
      mvSrc.loop = true;
      const mvFilter = ctx.createBiquadFilter();
      mvFilter.type = 'bandpass';
      mvFilter.frequency.value = 280;
      mvFilter.Q.value = 0.75;
      const mvGain = ctx.createGain();
      mvGain.gain.value = 0;
      mvSrc.connect(mvFilter);
      mvFilter.connect(mvGain);
      mvGain.connect(outDest);
      mvSrc.start();

      // 2. Roncos (baixa frequência 145 Hz)
      const rhSrc = ctx.createBufferSource();
      rhSrc.buffer = buf;
      rhSrc.loop = true;
      const rhFilter = ctx.createBiquadFilter();
      rhFilter.type = 'bandpass';
      rhFilter.frequency.value = 145;
      rhFilter.Q.value = 3.2;
      const rhonchiGain = ctx.createGain();
      rhonchiGain.gain.value = 0;
      rhSrc.connect(rhFilter);
      rhFilter.connect(rhonchiGain);
      rhonchiGain.connect(outDest);
      rhSrc.start();

      // 3. Sibilos polifônicos (osciladores suaves com LFO)
      const wOsc1 = ctx.createOscillator();
      const wOsc2 = ctx.createOscillator();
      wOsc1.type = 'sine';
      wOsc2.type = 'triangle';
      wOsc1.frequency.value = 410;
      wOsc2.frequency.value = 575;

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 4.5;
      lfoGain.gain.value = 18;
      lfo.connect(lfoGain);
      lfoGain.connect(wOsc1.frequency);
      lfoGain.connect(wOsc2.frequency);

      const wheezeFilter = ctx.createBiquadFilter();
      wheezeFilter.type = 'bandpass';
      wheezeFilter.frequency.value = 520;
      wheezeFilter.Q.value = 1.6;
      const wheezeGain = ctx.createGain();
      wheezeGain.gain.value = 0;

      wOsc1.connect(wheezeFilter);
      wOsc2.connect(wheezeFilter);
      wheezeFilter.connect(wheezeGain);
      wheezeGain.connect(outDest);

      wOsc1.start();
      wOsc2.start();
      lfo.start();

      this._auscNodes = { mvFilter, mvGain, rhonchiGain, wheezeGain, wOsc1, wOsc2, panner, outDest };
      this._updateAuscultationPan();
    }

    _triggerCrackle(intensity, style = 'fine') {
      if (!this.ctx || !this._noiseBuffer) return;
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      const isCoarse = style === 'coarse';
      filter.frequency.value = isCoarse ? 650 + Math.random() * 580 : 1350 + Math.random() * 1050;
      filter.Q.value = isCoarse ? 3.2 : 5.5;
      const gain = this.ctx.createGain();
      const peak = Math.min(0.13, 0.032 + intensity * (isCoarse ? 0.088 : 0.072));
      const dur = isCoarse ? 0.024 : 0.013;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect((this._auscNodes && this._auscNodes.outDest) || this.ctx.destination);
      const offset = Math.random() * 1.5;
      src.start(now, offset, dur + 0.005);
    }

    getAuscultationProfile(engine) {
      const p = engine.patient;
      const b = engine.breath;
      const scId = engine.scenarioId || 'stable';
      const site = this.auscultationSite;
      const isRight = site === 'R_apex' || site === 'R_base';
      const isLeft = site === 'L_apex' || site === 'L_base';
      const isBase = site === 'R_base' || site === 'L_base' || site === 'bilateral';

      if (b.lastRrTotal <= 0) {
        const apneaTxt =
          scId === 'opioid_apnea'
            ? 'Apneia (TCE/Opioide): Silêncio respiratório — sem fluxo!'
            : 'Apneia — Ausência de fluxo / MV inaudível';
        return { abolished: true, mvScale: 0, wheeze: 0, crackles: 0, crackleStyle: 'fine', rhonchi: 0, wheezePitch: 420, text: apneaTxt };
      }

      if (p.pneumothoraxActive) {
        if (isRight) {
          return {
            abolished: true,
            mvScale: 0,
            wheeze: 0,
            crackles: 0,
            crackleStyle: 'fine',
            rhonchi: 0,
            wheezePitch: 420,
            text: 'MV ABOLIDO em HTD (Pneumotórax Hipertensivo!)'
          };
        }
        if (isLeft) {
          return {
            abolished: false,
            mvScale: 1.25,
            wheeze: 0.12,
            crackles: 0,
            crackleStyle: 'fine',
            rhonchi: 0,
            wheezePitch: 440,
            text: 'Pneumotórax (HTE): MV aumentado vicariante à esquerda'
          };
        }
        return {
          abolished: false,
          mvScale: 0.58,
          wheeze: 0.08,
          crackles: 0,
          crackleStyle: 'fine',
          rhonchi: 0,
          wheezePitch: 440,
          text: 'Pneumotórax Hipertensivo: Assimetria — MV abolido em HTD / vicariante HTE'
        };
      }

      const effPeep = engine.airway && engine.airway.connectedToVent
        ? engine.vent.peepSet
        : (engine.getEffectiveO2Info ? engine.getEffectiveO2Info().peep : 0);
      const recruitRelief = Math.max(0, (effPeep - 5) * 0.015);
      const effShunt = Math.max(0.02, p.shunt - recruitRelief);

      // Perfis específicos por caso clínico do simulador
      if (scId === 'asthma') {
        const wheeze = Math.max(0.12, Math.min(1, (p.resistance - 8) / 16));
        const rhonchi = p.resistance > 16 ? 0.35 : 0.15;
        const mvScale = p.resistance > 20 ? 0.78 : 0.96;
        const text =
          wheeze > 0.6
            ? 'Asma Grave: MV reduzido + Sibilos polifônicos intensos (exp/insp)'
            : wheeze > 0.25
            ? 'Asma: MV presente + Sibilos expiratórios musicais'
            : 'Asma pós-Broncodilatador: MV amplo + Sibilos leves residuais';
        return { abolished: false, mvScale, wheeze, crackles: 0, crackleStyle: 'fine', rhonchi, wheezePitch: 490, text };
      }

      if (scId === 'ards') {
        const baseCrackle = Math.max(0.18, Math.min(1, (effShunt - 0.12) / 0.24));
        const crackles = isBase ? baseCrackle : baseCrackle * 0.55;
        const mvScale = p.compliance < 28 ? 0.78 : 0.92;
        const text =
          crackles > 0.55
            ? 'SDRA Grave: MV reduzido + Estertores crepitantes finos em "velcro"'
            : 'SDRA (Recrutado): MV presente + Estertores finos esparsos';
        return { abolished: false, mvScale, wheeze: 0, crackles, crackleStyle: 'fine', rhonchi: 0.12, wheezePitch: 420, text };
      }

      if (scId === 'septic_shock') {
        const focalRightBase = site === 'R_base' || site === 'bilateral';
        const crackles = focalRightBase ? Math.max(0.32, Math.min(0.88, effShunt * 4.2)) : 0.16;
        const rhonchi = Math.max(0.35, Math.min(0.85, (p.resistance - 4) * 0.12));
        const mvScale = site === 'R_base' ? 0.84 : 1.0;
        const text =
          site === 'R_base'
            ? 'Choque Séptico (Foco Base D): MV rude + Roncos + Estertores grossos focais'
            : focalRightBase
            ? 'Choque Séptico: Roncos difusos de secreção + Estertores em Base D'
            : 'Choque Séptico: MV presente + Roncos de secreção esparsos';
        return { abolished: false, mvScale, wheeze: 0.12, crackles, crackleStyle: 'coarse', rhonchi, wheezePitch: 360, text };
      }

      if (scId === 'pulmonary_edema') {
        const baseCrackle = Math.max(0.25, Math.min(1, (effShunt - 0.08) / 0.22));
        const crackles = isBase ? baseCrackle : baseCrackle * 0.42;
        const wheeze = Math.max(0.22, Math.min(0.62, (p.resistance - 8) / 14));
        const mvScale = isBase ? 0.85 : 0.98;
        const text = isBase
          ? 'Edema Agudo (EAP): Estertores bolhosos bibasais + Sibilos cardíacos'
          : 'Edema Agudo (Ápices): MV presente + Estertores finos + Sibilos discretos';
        return { abolished: false, mvScale, wheeze, crackles, crackleStyle: 'coarse', rhonchi: 0.30, wheezePitch: 390, text };
      }

      if (scId === 'cardiac_arrest') {
        if (engine.patient.arrested && !engine.interventions.roscAchieved) {
          const crackles = isBase ? 0.55 : 0.25;
          return {
            abolished: false,
            mvScale: 0.72,
            wheeze: 0,
            crackles,
            crackleStyle: 'coarse',
            rhonchi: 0.32,
            wheezePitch: 400,
            text: 'PCR (Ventilação 10 irpm): MV reduzido + Estertores úmidos basais'
          };
        }
        return {
          abolished: false,
          mvScale: 0.92,
          wheeze: 0,
          crackles: isBase ? 0.28 : 0.1,
          crackleStyle: 'coarse',
          rhonchi: 0.18,
          wheezePitch: 400,
          text: 'Pós-RCE: MV presente bilateral + Estertores discretos residuais'
        };
      }

      if (scId === 'opioid_apnea') {
        return {
          abolished: false,
          mvScale: 0.96,
          wheeze: 0,
          crackles: 0,
          crackleStyle: 'fine',
          rhonchi: 0,
          wheezePitch: 420,
          text: engine.vent.backupActive
            ? 'TCE/Opioide (Backup VCV): MV limpo e simétrico'
            : 'TCE/Opioide (VM Controlada): MV preservado sem ruídos adventícios'
        };
      }

      if (scId === 'pneumothorax') {
        return {
          abolished: false,
          mvScale: 1.0,
          wheeze: 0,
          crackles: 0,
          crackleStyle: 'fine',
          rhonchi: 0,
          wheezePitch: 420,
          text: 'Pós-Drenagem Torácica: MV restaurado bilateralmente (HTD e HTE)'
        };
      }

      // Perfil dinâmico genérico (inclui cenário 'stable' e ajustes manuais dos sliders)
      const mvScale = 1.0;
      const wheeze = Math.max(0, Math.min(1, (p.resistance - 12) / 16));
      const crackleBase = Math.max(0, Math.min(1, (effShunt - 0.16) / 0.25));
      const crackles = isBase ? crackleBase : crackleBase * 0.45;
      const rhonchi = p.resistance > 10 && p.resistance <= 20 && effShunt > 0.12 ? 0.45 : p.resistance > 20 ? 0.35 : 0;

      const findings = ['MV fisiológico bilateral'];
      if (wheeze > 0.25) findings.push(wheeze > 0.65 ? 'Sibilos intensos (exp/insp)' : 'Sibilos expiratórios');
      if (crackles > 0.25) findings.push(crackles > 0.6 ? 'Estertores crepitantes difusos' : 'Estertores finos em bases');
      if (rhonchi > 0.25 && wheeze <= 0.25) findings.push('Roncos esparsos');
      if (findings.length === 1) findings.push('sem ruídos adventícios');

      return { abolished: false, mvScale, wheeze, crackles, crackleStyle: 'fine', rhonchi, wheezePitch: 420, text: findings.join(' + ') };
    }

    stepAuscultation(engine, isFrozen) {
      if (!this.auscultationEnabled || !this.ctx || this.ctx.state !== 'running') {
        this.auscLevel = 0;
        return;
      }
      this._ensureAuscultationGraph();
      if (!this._auscNodes) return;

      const now = this.ctx.currentTime;
      if (isFrozen) {
        this.silenceAuscultation();
        return;
      }

      const b = engine.breath;
      const prof = this.getAuscultationProfile(engine);
      if (prof.abolished) {
        this.silenceAuscultation();
        return;
      }

      const absFlow = Math.abs(b.flowLs);
      const flowNorm = Math.min(1, absFlow / 0.85);
      const isInsp = b.flowLs > 0.03;
      const isExp = b.flowLs < -0.03;

      // Murmúrio vesicular (mais audível na inspiração, suave na expiração)
      const phaseBoost = isInsp ? 1.0 : isExp ? 0.58 : 0.04;
      const mvTarget = flowNorm * phaseBoost * prof.mvScale * 0.26;
      this._auscNodes.mvFilter.frequency.setTargetAtTime(isInsp ? 310 : 220, now, 0.05);
      this._auscNodes.mvGain.gain.setTargetAtTime(mvTarget, now, 0.035);

      // Roncos
      const rhTarget = flowNorm * prof.rhonchi * prof.mvScale * 0.075;
      this._auscNodes.rhonchiGain.gain.setTargetAtTime(rhTarget, now, 0.04);

      // Sibilos (altura ajustada por patologia: asma aguda vs sibilo cardíaco EAP)
      const baseW = prof.wheezePitch || 410;
      this._auscNodes.wOsc1.frequency.setTargetAtTime(baseW, now, 0.08);
      this._auscNodes.wOsc2.frequency.setTargetAtTime(baseW * 1.38, now, 0.08);
      const wheezePhase = isExp ? 1.0 : isInsp && prof.wheeze > 0.55 ? 0.55 : 0;
      const wTarget = flowNorm * prof.wheeze * wheezePhase * prof.mvScale * 0.034;
      this._auscNodes.wheezeGain.gain.setTargetAtTime(wTarget, now, 0.045);

      // Estertores crepitantes (finos "velcro" vs bolhosos/grossos)
      const nowMs = performance.now();
      if (prof.crackles > 0.18 && ((isInsp && b.volumeL > 0.10) || (isExp && prof.crackles > 0.55 && absFlow > 0.20))) {
        const minGap = 115 - prof.crackles * 72;
        if (nowMs - this._lastCrackleAt >= minGap && Math.random() < 0.45 + prof.crackles * 0.42) {
          this._lastCrackleAt = nowMs;
          this._triggerCrackle(prof.crackles * prof.mvScale, prof.crackleStyle || 'fine');
        }
      }

      this.auscLevel = Math.min(1, flowNorm * prof.mvScale * (0.65 + prof.wheeze * 0.25 + prof.crackles * 0.25));
    }
  }

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.MedicalAudio = MedicalAudio;
})(window);
