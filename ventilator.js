/**
 * Renderizador do Ventilador Mecânico (Curvas P / F / V + Loops P-V / F-V + Pulmão Animado)
 */
(function (global) {
  'use strict';

  class VentilatorDisplay {
    constructor(engine) {
      this.engine = engine;
      this.frozen = false;
      this.activeView = 'waves'; // 'waves' | 'loops'

      this.canvases = {
        paw: document.getElementById('canvasPaw'),
        flow: document.getElementById('canvasFlow'),
        vol: document.getElementById('canvasVol'),
        loopPV: document.getElementById('canvasLoopPV'),
        loopFV: document.getElementById('canvasLoopFV')
      };

      // Janela de 10 segundos a 50 Hz -> 500 amostras
      this.bufferLen = 500;
      this.writeIdx = 0;
      this.buffers = {
        paw: new Float32Array(this.bufferLen),
        flow: new Float32Array(this.bufferLen),
        vol: new Float32Array(this.bufferLen)
      };

      this.sampleAccum = 0;
      this.sampleDt = 0.02; // 50 Hz

      this.rightLungGroup = document.getElementById('rightLungGroup');
      this.leftLungGroup = document.getElementById('leftLungGroup');
      this.rightLungPath = document.getElementById('rightLungPath');
      this.leftLungPath = document.getElementById('leftLungPath');
      this.lungDiaphragm = document.getElementById('lungDiaphragm');
      this.lungBronchi = document.getElementById('lungBronchi');
      this.lungComplianceCage = document.getElementById('lungComplianceCage');
      this.lungHeart = document.getElementById('lungHeart');
      this.lungFlowDots = document.getElementById('lungFlowDots');
      this.lungTriggerHalo = document.getElementById('lungTriggerHalo');
      this.pneumoPocket = document.getElementById('pneumoPocket');
      this.rightAlveoli = document.getElementById('rightAlveoli');
      this.leftAlveoli = document.getElementById('leftAlveoli');
      this.lungPhaseChip = document.getElementById('lungPhaseChip');
      this.pawRangeTag = document.getElementById('pawRangeTag');
      this.flowAnimPhase = 0;
      this.heartAnimPhase = 0;
      this._dirty = true;
    }

    setFrozen(frozen) {
      this.frozen = frozen;
      this._dirty = true;
    }

    clearBuffers() {
      Object.values(this.buffers).forEach((buf) => buf.fill(0));
      this.writeIdx = 0;
      this.sampleAccum = 0;
      this._dirty = true;
    }

    setView(view) {
      this.activeView = view;
      this._dirty = true;
      setTimeout(() => this.resizeAll(), 20);
    }

    resizeAll() {
      const Sweep = global.ICUSim && global.ICUSim.Sweep;
      Object.values(this.canvases).forEach((canvas) => {
        if (Sweep) Sweep.resizeCanvas(canvas);
      });
      this._dirty = true;
    }

    step(dt) {
      if (this.frozen) return;
      const connected = !this.engine.airway || this.engine.airway.connectedToVent;
      const b = this.engine.breath;
      if (connected && Math.abs(b.flowLs) > 0.02) {
        const speed = Math.min(2.6, Math.max(-2.6, b.flowLs * 1.9));
        this.flowAnimPhase = ((this.flowAnimPhase + dt * speed) % 1 + 1) % 1;
      }
      const hr = Math.max(30, this.engine.vitals ? this.engine.vitals.hr || 75 : 75);
      this.heartAnimPhase = (this.heartAnimPhase + dt * (hr / 60)) % 1;
      this.sampleAccum += dt;
      while (this.sampleAccum >= this.sampleDt) {
        this.sampleAccum -= this.sampleDt;
        const idx = this.writeIdx;
        this.buffers.paw[idx] = connected ? b.paw : 0;
        this.buffers.flow[idx] = connected ? b.flowLs * 60 : 0;
        this.buffers.vol[idx] = connected ? b.volumeL * 1000 : 0;
        this.writeIdx = (idx + 1) % this.bufferLen;
        this._dirty = true;
      }
      if (this.activeView !== 'waves') this._dirty = true;
    }

    render() {
      if (!this._dirty) return;
      this._dirty = false;
      if (this.activeView === 'waves') {
        const pHighLim = this.engine.alarms.ppeakHigh || 35;
        const maxPaw = Math.max(40, Math.ceil(Math.max(this.engine.breath.lastPeakPaw, pHighLim) / 10) * 10 + 5);
        if (this.pawRangeTag && this.pawRangeTag.textContent !== 'cmH2O') this.pawRangeTag.textContent = 'cmH2O';

        const pPlat = this.engine.breath.lastPlatPaw;
        this._renderWave(this.canvases.paw, this.buffers.paw, '#facc15', 'rgba(250, 204, 21, 0.08)', 0, maxPaw, [0, 10, 20, 30, 40], false, [
          { val: pHighLim, color: '#ef4444' },
          { val: pPlat, color: '#38bdf8' }
        ]);
        this._renderWave(this.canvases.flow, this.buffers.flow, '#a855f7', 'rgba(168, 85, 247, 0.10)', -80, 80, [-40, 0, 40], true);
        this._renderWave(this.canvases.vol, this.buffers.vol, '#22c55e', 'rgba(34, 197, 94, 0.09)', 0, 800, [0, 200, 400, 600], false);
      } else {
        this._renderLoopPV();
        this._renderLoopFV();
        this._updateLungAnimation();
      }
    }

    _renderWave(canvas, buf, color, fillColor, minVal, maxVal, yTicks = [], highlightZero = false, extraLines = []) {
      if (!canvas || !canvas.width || !canvas.height) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      ctx.clearRect(0, 0, w, h);

      const padL = 26 * dpr;
      const padB = 14 * dpr;
      const padT = 8 * dpr;
      const plotW = w - padL - 6 * dpr;
      const plotH = h - padB - padT;

      const toX = (i) => padL + (i / (this.bufferLen - 1)) * plotW;
      const toY = (v) => {
        const norm = (v - minVal) / (maxVal - minVal);
        return padT + (1 - Math.max(0, Math.min(1, norm))) * plotH;
      };

      // Eixos brancos estilo Hamilton-T1 (Y esquerdo + X inferior)
      ctx.save();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = 1.1 * dpr;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, h - padB);
      ctx.lineTo(w - 4 * dpr, h - padB);
      ctx.stroke();

      // Marcações eixo Y
      ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
      ctx.font = `${9 * dpr}px monospace`;
      ctx.textAlign = 'right';
      yTicks.forEach((val) => {
        if (val < minVal || val > maxVal) return;
        const y = toY(val);
        ctx.strokeStyle = highlightZero && val === 0 ? 'rgba(226, 232, 240, 0.45)' : 'rgba(148, 163, 184, 0.14)';
        ctx.beginPath();
        ctx.moveTo(padL - 3 * dpr, y);
        ctx.lineTo(w - 4 * dpr, y);
        ctx.stroke();
        ctx.fillText(String(val), padL - 5 * dpr, y + 3 * dpr);
      });

      // Marcações de tempo no eixo X (2, 4, 6, 8, 10 s)
      ctx.textAlign = 'center';
      for (let s = 2; s <= 10; s += 2) {
        const x = padL + (s / 10) * plotW;
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
        ctx.beginPath();
        ctx.moveTo(x, h - padB);
        ctx.lineTo(x, h - padB + 3 * dpr);
        ctx.stroke();
        ctx.fillText(String(s), x, h - 3 * dpr);
      }

      // Linhas extras Hamilton-T1 (ex: limite vermelho Ppeak e azul Pplatô)
      extraLines.forEach((ln) => {
        if (ln.val < minVal || ln.val > maxVal) return;
        const y = toY(ln.val);
        ctx.strokeStyle = ln.color;
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - 4 * dpr, y);
        ctx.stroke();
      });
      ctx.restore();

      const baselineVal = minVal < 0 && maxVal > 0 ? 0 : minVal;
      const baseY = toY(baselineVal);
      global.ICUSim.Sweep.drawSweepTrace(ctx, {
        buf,
        len: this.bufferLen,
        cursor: this.writeIdx,
        gapSamples: 12,
        fadeLen: 20,
        tailHighlight: 0,
        color,
        fillColor,
        baseY,
        lineWidth: 1.9,
        dpr,
        toX,
        toY,
        topY: padT,
        botY: h - padB,
        glow: false
      });
    }

    _renderLoopPV() {
      const canvas = this.canvases.loopPV;
      if (!canvas || !canvas.width || !canvas.height) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.clearRect(0, 0, w, h);

      const pad = 26 * dpr;
      const maxP = 45;
      const maxV = 750;
      const px = (p) => pad + (Math.max(0, Math.min(maxP, p)) / maxP) * (w - pad * 1.5);
      const py = (v) => h - pad - (Math.max(0, Math.min(maxV, v)) / maxV) * (h - pad * 1.6);

      // Grade sutil + Eixos
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 1;
      [15, 30, 45].forEach((pVal) => {
        const gx = px(pVal);
        ctx.beginPath();
        ctx.moveTo(gx, pad * 0.6);
        ctx.lineTo(gx, h - pad);
        ctx.stroke();
      });
      [250, 500, 750].forEach((vVal) => {
        const gy = py(vVal);
        ctx.beginPath();
        ctx.moveTo(pad, gy);
        ctx.lineTo(w - pad * 0.5, gy);
        ctx.stroke();
      });
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.40)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(pad, pad * 0.6);
      ctx.lineTo(pad, h - pad);
      ctx.lineTo(w - pad * 0.5, h - pad);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#94a3b8';
      ctx.font = `${10 * dpr}px monospace`;
      ctx.fillText('V (mL)', 4 * dpr, 14 * dpr);
      ctx.fillText('Paw (cmH₂O)', w - 76 * dpr, h - 6 * dpr);

      const cur = this.engine.breath.currentLoop;
      const prev = this.engine.breath.lastLoop;

      // Ciclo anterior como referência fantasma tracejada
      if (cur.length > 6 && prev.length > 6) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 170, 0, 0.28)';
        ctx.lineWidth = 1.4 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath();
        prev.forEach((pt, idx) => {
          const x = px(pt.paw);
          const y = py(pt.volMl);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
      }

      const pts = cur.length > 2 ? cur : prev;
      if (pts.length > 2) {
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const bPt = pts[i];
          ctx.strokeStyle = bPt.flowLmin >= 0 ? '#4ade80' : '#ffaa00';
          ctx.lineWidth = 2.2 * dpr;
          ctx.beginPath();
          ctx.moveTo(px(a.paw), py(a.volMl));
          ctx.lineTo(px(bPt.paw), py(bPt.volMl));
          ctx.stroke();
        }
        const tip = pts[pts.length - 1];
        const tx = px(tip.paw);
        const ty = py(tip.volMl);
        const tipColor = tip.flowLmin >= 0 ? '#4ade80' : '#ffaa00';
        ctx.fillStyle = tipColor;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(tx, ty, 5.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tx, ty, 2.3 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    _renderLoopFV() {
      const canvas = this.canvases.loopFV;
      if (!canvas || !canvas.width || !canvas.height) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.clearRect(0, 0, w, h);

      const pad = 26 * dpr;
      const midY = h / 2;
      const maxV = 750;
      const maxF = 85;
      const fx = (v) => pad + (Math.max(0, Math.min(maxV, v)) / maxV) * (w - pad * 1.5);
      const fy = (f) => midY - (Math.max(-maxF, Math.min(maxF, f)) / maxF) * (h * 0.40);

      // Grade sutil + Eixos (Fluxo=0 no meio)
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 1;
      [250, 500, 750].forEach((vVal) => {
        const gx = fx(vVal);
        ctx.beginPath();
        ctx.moveTo(gx, pad * 0.5);
        ctx.lineTo(gx, h - pad * 0.5);
        ctx.stroke();
      });
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.40)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(pad, pad * 0.5);
      ctx.lineTo(pad, h - pad * 0.5);
      ctx.moveTo(pad, midY);
      ctx.lineTo(w - pad * 0.5, midY);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#94a3b8';
      ctx.font = `${10 * dpr}px monospace`;
      ctx.fillText('Fluxo (L/m)', 4 * dpr, 14 * dpr);
      ctx.fillText('Vol (mL)', w - 58 * dpr, midY - 5 * dpr);

      const cur = this.engine.breath.currentLoop;
      const prev = this.engine.breath.lastLoop;

      if (cur.length > 6 && prev.length > 6) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
        ctx.lineWidth = 1.4 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath();
        prev.forEach((pt, idx) => {
          const x = fx(pt.volMl);
          const y = fy(pt.flowLmin);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
      }

      const pts = cur.length > 2 ? cur : prev;
      if (pts.length > 2) {
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const bPt = pts[i];
          ctx.strokeStyle = bPt.flowLmin >= 0 ? '#38bdf8' : '#c084fc';
          ctx.lineWidth = 2.2 * dpr;
          ctx.beginPath();
          ctx.moveTo(fx(a.volMl), fy(a.flowLmin));
          ctx.lineTo(fx(bPt.volMl), fy(bPt.flowLmin));
          ctx.stroke();
        }
        const tip = pts[pts.length - 1];
        const tx = fx(tip.volMl);
        const ty = fy(tip.flowLmin);
        const tipColor = tip.flowLmin >= 0 ? '#38bdf8' : '#c084fc';
        ctx.fillStyle = tipColor;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(tx, ty, 5.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tx, ty, 2.3 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    _updateLungAnimation() {
      const b = this.engine.breath;
      const p = this.engine.patient;
      const v = this.engine.vent;
      const connected = !this.engine.airway || this.engine.airway.connectedToVent;
      const volMl = b.volumeL * 1000;
      const tidalFrac = Math.min(1.25, Math.max(0, volMl / 550));
      const peepBoost = Math.min(0.08, Math.max(0, (v.peepSet || 0) * 0.004));
      const baseScale = 0.94 + peepBoost;
      const scale = baseScale + tidalFrac * 0.25;

      // Se pneumotórax hipertensivo ativo, pulmão direito colapsa e exibe bolso pleural
      const rightScale = p.pneumothoraxActive ? 0.60 : scale;
      if (this.rightLungGroup) {
        this.rightLungGroup.setAttribute(
          'transform',
          `translate(${70 * (1 - rightScale)}, ${92 * (1 - rightScale)}) scale(${rightScale.toFixed(3)})`
        );
      }
      if (this.leftLungGroup) {
        this.leftLungGroup.setAttribute(
          'transform',
          `translate(${130 * (1 - scale)}, ${92 * (1 - scale)}) scale(${scale.toFixed(3)})`
        );
      }
      if (this.pneumoPocket) {
        this.pneumoPocket.classList.toggle('hidden', !p.pneumothoraxActive);
      }

      // Alvéolos iluminam e expandem proporcionalmente ao volume corrente
      const alvOpacity = (0.35 + tidalFrac * 0.65).toFixed(2);
      const baseAlvRadii = [5, 4, 6, 5.5, 4.5];
      if (this.rightAlveoli) {
        this.rightAlveoli.setAttribute('opacity', p.pneumothoraxActive ? '0.2' : alvOpacity);
        const rMul = p.pneumothoraxActive ? 0.65 : (0.85 + tidalFrac * 0.35);
        Array.from(this.rightAlveoli.children).forEach((c, i) => {
          c.setAttribute('r', ((baseAlvRadii[i] || 5) * rMul).toFixed(2));
        });
      }
      if (this.leftAlveoli) {
        this.leftAlveoli.setAttribute('opacity', alvOpacity);
        const lMul = 0.85 + tidalFrac * 0.35;
        Array.from(this.leftAlveoli.children).forEach((c, i) => {
          c.setAttribute('r', ((baseAlvRadii[i] || 5) * lMul).toFixed(2));
        });
      }
      if (this.pneumoPocket && p.pneumothoraxActive) {
        const ppPulse = 0.72 + 0.28 * Math.sin((this.engine.simTime || 0) * 5.2);
        this.pneumoPocket.setAttribute('opacity', ppPulse.toFixed(2));
      }

      // Cor conforme oxigenação (SpO2)
      const spo2 = this.engine.vitals.spo2;
      const alphaFill = (0.20 + tidalFrac * 0.24).toFixed(2);
      const fill = spo2 >= 92
        ? `rgba(56, 189, 248, ${alphaFill})`
        : spo2 >= 82
          ? `rgba(245, 158, 11, ${alphaFill})`
          : `rgba(255, 46, 85, ${alphaFill})`;
      const stroke = spo2 >= 92 ? '#38bdf8' : spo2 >= 82 ? '#fbbf24' : '#ff4d6d';

      if (this.rightLungPath) {
        this.rightLungPath.setAttribute('fill', p.pneumothoraxActive ? 'rgba(255, 46, 85, 0.22)' : fill);
        this.rightLungPath.setAttribute('stroke', p.pneumothoraxActive ? '#ff4d6d' : stroke);
      }
      if (this.leftLungPath) {
        this.leftLungPath.setAttribute('fill', fill);
        this.leftLungPath.setAttribute('stroke', stroke);
      }

      // Árvore brônquica representa resistência das vias aéreas (estreita + âmbar se Rva elevada)
      if (this.lungBronchi) {
        const res = p.resistance || 6;
        const lumenWidth = Math.max(1.4, Math.min(4.0, 4.2 - (res - 6) * 0.11));
        this.lungBronchi.setAttribute('stroke-width', lumenWidth.toFixed(2));
        this.lungBronchi.setAttribute('stroke', res >= 18 ? '#f59e0b' : res >= 12 ? '#cbd5e1' : '#94a3b8');
      }

      // Diafragma móvel: desce e retifica na inspiração, sobe em cúpula na expiração
      if (this.lungDiaphragm) {
        const inspShift = tidalFrac * 11;
        const edgeY = (142 + inspShift * 0.7).toFixed(1);
        const midY = (128 + inspShift * 1.45).toFixed(1);
        this.lungDiaphragm.setAttribute('d', `M 28 ${edgeY} Q 100 ${midY} 172 ${edgeY}`);
        const isSpont = b.phase === 'TRIGGER' || b.lastBreathWasSpont;
        this.lungDiaphragm.setAttribute('stroke', isSpont ? '#4ade80' : '#38bdf8');
      }

      // Disparo do paciente (halo pulsante verde na carina com onda expansiva)
      if (this.lungTriggerHalo) {
        const trigActive = connected && (b.phase === 'TRIGGER' || (b.lastBreathWasSpont && b.phase === 'INSP'));
        const ripple = trigActive ? (0.45 + 0.55 * Math.abs(Math.sin((this.engine.simTime || 0) * 10))) : 0;
        this.lungTriggerHalo.setAttribute('opacity', trigActive ? ripple.toFixed(2) : '0');
        this.lungTriggerHalo.setAttribute('r', trigActive ? (9 + tidalFrac * 7).toFixed(1) : '10');
      }

      // Partículas de fluxo traqueobrônquico animadas na Inspiração vs Expiração
      if (this.lungFlowDots) {
        const flowAbs = Math.abs(b.flowLs || 0);
        const showFlow = connected && flowAbs > 0.04;
        const dotRadius = (1.5 + Math.min(1.3, flowAbs * 1.1)).toFixed(2);
        this.lungFlowDots.setAttribute('opacity', showFlow ? Math.min(1, 0.45 + flowAbs * 0.7).toFixed(2) : '0.15');
        this.lungFlowDots.setAttribute('fill', b.flowLs >= 0 ? '#4ade80' : '#a855f7');
        const pts = this.lungFlowDots.children;
        const ph = this.flowAnimPhase || 0;
        if (pts.length >= 6) {
          const p1 = ph;
          const p2 = (ph + 0.5) % 1;
          pts[0].setAttribute('cy', (10 + p1 * 32).toFixed(1));
          pts[1].setAttribute('cy', (10 + p2 * 32).toFixed(1));
          pts[2].setAttribute('cx', (100 - p1 * 36).toFixed(1));
          pts[2].setAttribute('cy', (42 + p1 * 30).toFixed(1));
          pts[3].setAttribute('cx', (100 - p2 * 36).toFixed(1));
          pts[3].setAttribute('cy', (42 + p2 * 30).toFixed(1));
          pts[4].setAttribute('cx', (100 + p1 * 36).toFixed(1));
          pts[4].setAttribute('cy', (42 + p1 * 30).toFixed(1));
          pts[5].setAttribute('cx', (100 + p2 * 36).toFixed(1));
          pts[5].setAttribute('cy', (42 + p2 * 30).toFixed(1));
          for (let i = 0; i < 6; i++) {
            pts[i].setAttribute('r', dotRadius);
          }
        }
      }

      // Batimento cardíaco proporcional à FC
      if (this.lungHeart) {
        const beat = Math.exp(-Math.pow((this.heartAnimPhase - 0.12) / 0.08, 2));
        const hScale = (1 + beat * 0.16).toFixed(3);
        this.lungHeart.setAttribute('transform', `translate(${100 * (1 - hScale)}, ${106 * (1 - hScale)}) scale(${hScale})`);
      }

      const dp = Math.max(0, Math.round(b.lastPlatPaw - (v.peepSet + b.lastAutoPeep)));
      if (this.lungComplianceCage) {
        this.lungComplianceCage.setAttribute('stroke', dp > 15 ? '#ef4444' : p.compliance < 35 ? '#f59e0b' : '#334155');
      }

      if (this.lungPhaseChip) {
        if (p.pneumothoraxActive) {
          this.lungPhaseChip.textContent = 'PNEUMO';
          this.lungPhaseChip.className = 'lung-phase-chip crit mono';
        } else if (!connected) {
          this.lungPhaseChip.textContent = 'SEM VM';
          this.lungPhaseChip.className = 'lung-phase-chip mono';
        } else if (b.phase === 'INSP' || b.phase === 'PAUSE' || b.phase === 'TRIGGER') {
          this.lungPhaseChip.textContent = `INSP ${Math.round(volMl)}mL`;
          this.lungPhaseChip.className = 'lung-phase-chip insp mono';
        } else {
          this.lungPhaseChip.textContent = `EXP PEEP ${v.peepSet}`;
          this.lungPhaseChip.className = 'lung-phase-chip exp mono';
        }
      }

      const cEl = document.getElementById('lungCompVal');
      const rEl = document.getElementById('lungResVal');
      const dEl = document.getElementById('lungDpVal');
      if (cEl) cEl.textContent = Math.round(p.compliance);
      if (rEl) rEl.textContent = Math.round(p.resistance);
      if (dEl) dEl.textContent = dp;
    }
  }

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.VentilatorDisplay = VentilatorDisplay;
})(window);
