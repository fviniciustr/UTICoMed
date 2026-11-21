/**
 * Renderizador do Monitor Multiparamétrico (Varredura Fosforescente 60fps)
 * Canais: ECG (DII/V5/DI), Pletismografia SpO2, PAI (Artéria Radial), Capnografia EtCO2
 */
(function (global) {
  'use strict';

  function gauss(x, mu, sigma) {
    const z = (x - mu) / sigma;
    return Math.exp(-0.5 * z * z);
  }

  class MultiparameterMonitor {
    constructor(engine, audio) {
      this.engine = engine;
      this.audio = audio;
      this.lead = 'II';
      this.frozen = false;
      this.standby = false;

      this.canvases = {
        ecg: document.getElementById('canvasECG'),
        spo2: document.getElementById('canvasSpO2'),
        ibp: document.getElementById('canvasIBP'),
        co2: document.getElementById('canvasEtCO2')
      };

      this.colors = {
        ecg: '#00ff66',
        spo2: '#00e5ff',
        ibp: '#ff3b5c',
        co2: '#ffd60a'
      };

      // Buffers circulares por canal (6 segundos de janela a 200 amostras/s -> 1200 pontos)
      this.bufferLen = 1200;
      this.writeIdx = 0;
      this.buffers = {
        ecg: new Float32Array(this.bufferLen),
        spo2: new Float32Array(this.bufferLen),
        ibp: new Float32Array(this.bufferLen),
        co2: new Float32Array(this.bufferLen)
      };

      // Estado do gerador cardíaco (domínio temporal em segundos para precisão eletrofisiológica)
      this.tInBeat = 0;
      this.currentRrSec = 0.77;
      this.isPvcBeat = false;
      this.beatQrsTriggered = false;

      // Oscilador atrial separado (para BAV 2º Grau Mobitz I/II e BAV Total 3º Grau)
      this.atrialT = 0;
      this.mobitzIdx = 0;
      this.mobitzPr = 0.16; // null quando onda P bloqueada
      this.mobitzQrsTriggered = false;
      this.lastRhythm = null;

      // Acoplamento mecânico contínuo (PAI & SpO2 após cada QRS real)
      this.lastQrsAge = 0.4;
      this.lastBeatWasPvc = false;
      this.artShape = 0.25;
      this.artPreEject = 0.25;
      this.plethShape = 0.15;
      this.plethPreEject = 0.15;

      // Acumulador de amostragem fixa a 200 Hz
      this.sampleAccum = 0;
      this.sampleDt = 0.005; // 200 Hz -> 1200 pontos = 6.0 segundos de janela

      // Estado de capnografia suavizado
      this.co2Val = 0;
      this.expTime = 0;

      this.heartIcon = document.getElementById('heartIcon');
      this.hrPulseDot = document.getElementById('mrHrPulseDot');
      this.cardHR = document.getElementById('cardHR');
      this.vgHrHeart = document.getElementById('vgHrHeart');
      this.vgParamEcg = document.getElementById('vgParamEcg');
      this.ibpScaleEl = document.getElementById('ibpScaleTag');
      this.spo2BarSpans = Array.from(document.querySelectorAll('#mrSpo2Bar span'));
      this._dirty = true;
      this._lastMaxIbp = -1;
      this._lastSpo2Lvl = -1;
    }

    setLead(lead) {
      this.lead = lead;
      this._dirty = true;
    }

    setFrozen(frozen) {
      this.frozen = frozen;
      this._dirty = true;
    }

    resizeAll() {
      const Sweep = global.ICUSim && global.ICUSim.Sweep;
      Object.values(this.canvases).forEach((canvas) => {
        if (Sweep ? Sweep.resizeCanvas(canvas) : false) this._dirty = true;
      });
      this._dirty = true;
    }

    setStandby(standby) {
      this.standby = Boolean(standby);
      this._dirty = true;
    }

    clearBuffers() {
      Object.values(this.buffers).forEach((buf) => buf.fill(0));
      this.writeIdx = 0;
      this.tInBeat = 0;
      this._dirty = true;
    }

    step(dt) {
      if (this.frozen || this.standby) return;
      this.sampleAccum += dt;
      while (this.sampleAccum >= this.sampleDt) {
        this.sampleAccum -= this.sampleDt;
        this._generateSample(this.sampleDt);
        this._dirty = true;
      }
    }

    _triggerQrsBeat(vit, isPvc = false) {
      this.lastQrsAge = 0;
      this.lastBeatWasPvc = isPvc;
      this.artPreEject = this.artShape;
      this.plethPreEject = this.plethShape;
      if (!this.standby) {
        this.audio.playQrsBeep(vit.spo2);
      }
      if (this.heartIcon) {
        this.heartIcon.classList.add('beat');
        setTimeout(() => this.heartIcon && this.heartIcon.classList.remove('beat'), 115);
      }
      if (this.hrPulseDot) {
        this.hrPulseDot.classList.add('beat');
        setTimeout(() => this.hrPulseDot && this.hrPulseDot.classList.remove('beat'), 130);
      }
      if (this.cardHR) {
        this.cardHR.classList.add('beat');
        setTimeout(() => this.cardHR && this.cardHR.classList.remove('beat'), 140);
      }
      if (this.vgHrHeart) {
        this.vgHrHeart.classList.add('beat');
        setTimeout(() => this.vgHrHeart && this.vgHrHeart.classList.remove('beat'), 140);
      }
      if (this.vgParamEcg) {
        this.vgParamEcg.classList.add('beat');
        setTimeout(() => this.vgParamEcg && this.vgParamEcg.classList.remove('beat'), 140);
      }
    }

    _evalQrsStT(tau, rhythm, stDeviation, isPvc) {
      if (isPvc || rhythm === 'vtach') {
        return (
          -0.25 * gauss(tau, -0.042, 0.016) +
          1.12 * gauss(tau, 0.0, 0.022) -
          0.65 * gauss(tau, 0.045, 0.022) -
          0.34 * gauss(tau, 0.165, 0.042)
        );
      }

      if (rhythm === 'rbbb') {
        if (this.lead === 'I' || this.lead === 'V5') {
          return (
            -0.08 * gauss(tau, -0.024, 0.006) +
            1.05 * gauss(tau, -0.010, 0.010) -
            0.48 * gauss(tau, 0.042, 0.022) +
            0.20 * gauss(tau, 0.220, 0.040)
          );
        }
        // Padrão clássico rsR' ("orelha de coelho") em DII
        return (
          -0.08 * gauss(tau, -0.025, 0.006) +
          0.80 * gauss(tau, -0.010, 0.009) -
          0.22 * gauss(tau, 0.014, 0.009) +
          0.98 * gauss(tau, 0.044, 0.013) -
          0.22 * gauss(tau, 0.220, 0.040)
        );
      }

      if (rhythm === 'lbbb') {
        if (this.lead === 'I' || this.lead === 'V5') {
          // Onda R larga entalhada em torre + discordância ST-T negativa
          return (
            0.94 * gauss(tau, -0.018, 0.018) +
            0.88 * gauss(tau, 0.026, 0.019) -
            0.16 * gauss(tau, 0.115, 0.044) -
            0.34 * gauss(tau, 0.225, 0.044)
          );
        }
        // Em DII: r pequeno + S larga profunda + discordância ST-T positiva
        return (
          0.20 * gauss(tau, -0.026, 0.008) -
          1.05 * gauss(tau, 0.016, 0.024) +
          0.16 * gauss(tau, 0.115, 0.044) +
          0.32 * gauss(tau, 0.225, 0.044)
        );
      }

      if (rhythm === 'paced') {
        // Espícula vertical de marcapasso + QRS largo estimulado + T discordante
        const spike = 1.24 * gauss(tau, -0.052, 0.0045) - 0.28 * gauss(tau, -0.045, 0.0045);
        const qrs =
          0.18 * gauss(tau, -0.018, 0.010) -
          0.96 * gauss(tau, 0.016, 0.022) +
          0.30 * gauss(tau, 0.195, 0.042);
        return spike + qrs;
      }

      if (rhythm === 'hyperkalemia') {
        // QRS alargado + Onda T apiculada simétrica ("em tenda")
        return (
          -0.15 * gauss(tau, -0.032, 0.012) +
          0.92 * gauss(tau, 0.0, 0.018) -
          0.42 * gauss(tau, 0.038, 0.016) +
          0.78 * gauss(tau, 0.175, 0.021)
        );
      }

      if (rhythm === 'stemi') {
        // Supra convexo de J-ST + onda T hiperaguda
        return (
          -0.10 * gauss(tau, -0.020, 0.006) +
          1.08 * gauss(tau, 0.0, 0.008) -
          0.12 * gauss(tau, 0.020, 0.007) +
          0.46 * gauss(tau, 0.072, 0.042) +
          0.54 * gauss(tau, 0.175, 0.044)
        );
      }

      if (rhythm === 'de_winter') {
        // Padrão de De Winter: infradesnivelamento ascendente do ponto J/ST + onda T alta simétrica hiperaguda
        return (
          -0.08 * gauss(tau, -0.018, 0.006) +
          0.78 * gauss(tau, 0.0, 0.008) -
          0.32 * gauss(tau, 0.032, 0.016) +
          0.90 * gauss(tau, 0.155, 0.034)
        );
      }

      if (rhythm === 'wpw') {
        // Síndrome de WPW: onda Delta (subida inicial empastada pré-QRS) + QRS alargado + discordância ST-T discreta
        return (
          0.36 * gauss(tau, -0.048, 0.022) +
          0.62 * gauss(tau, -0.022, 0.014) +
          1.06 * gauss(tau, 0.006, 0.014) -
          0.20 * gauss(tau, 0.034, 0.012) -
          0.08 * gauss(tau, 0.105, 0.038) -
          0.14 * gauss(tau, 0.205, 0.040)
        );
      }

      if (rhythm === 'av_block_3' || rhythm === 'pea') {
        // Complexo de escape juncional/ventricular discretamente alargado
        return (
          -0.14 * gauss(tau, -0.024, 0.010) +
          0.98 * gauss(tau, 0.0, 0.016) -
          0.42 * gauss(tau, 0.034, 0.016) +
          0.26 * gauss(tau, 0.215, 0.044)
        );
      }

      if (rhythm === 'svt') {
        // QRS estreito rápido + pseudo-S retrógrada discreta
        return (
          -0.10 * gauss(tau, -0.016, 0.006) +
          1.12 * gauss(tau, 0.0, 0.008) -
          0.26 * gauss(tau, 0.022, 0.008) +
          0.20 * gauss(tau, 0.115, 0.024)
        );
      }

      // QRS estreito fisiológico padrão + desvio ST real + onda T
      const qWave = -0.11 * gauss(tau, -0.020, 0.006);
      const rWave = 1.12 * gauss(tau, 0.0, 0.008);
      const sWave = -0.24 * gauss(tau, 0.022, 0.008);
      const stShift = (stDeviation || 0) * 0.11 * gauss(tau, 0.095, 0.042);
      const tWave = 0.28 * gauss(tau, 0.205, 0.038);
      return qWave + rWave + sWave + stShift + tWave;
    }

    _generateSample(dt) {
      const vit = this.engine.vitals;
      const pat = this.engine.patient;
      const iv = this.engine.interventions;
      const b = this.engine.breath;
      const rhythm = vit.rhythm || 'sinus';

      if (this.lastRhythm !== rhythm) {
        this.lastRhythm = rhythm;
        this.tInBeat = 0;
        this.atrialT = 0;
        this.mobitzIdx = 0;
        this.mobitzPr = 0.16;
        this.mobitzQrsTriggered = false;
        this.beatQrsTriggered = false;
      }

      this.lastQrsAge += dt;

      let ecgY = 0;
      let ibpMmHg = vit.dbp;
      let spo2Y = 0.05;
      const leadScale = this.lead === 'V5' ? 1.15 : this.lead === 'I' ? 0.82 : 1.0;

      // 1. ECG & Pulso Mecânico
      if (rhythm === 'vf' || rhythm === 'asystole' || rhythm === 'torsades') {
        const t = this.engine.simTime;
        if (rhythm === 'vf') {
          ecgY =
            0.35 * Math.sin(t * 27) +
            0.24 * Math.sin(t * 43 + 1.1) +
            0.16 * Math.cos(t * 61 + 2.3) +
            (Math.random() - 0.5) * 0.08;
        } else if (rhythm === 'torsades') {
          // Torção helicoidal das pontas ao redor da linha isoelétrica (~205 bpm)
          const twistEnv = 0.25 + 0.78 * Math.sin(t * 1.85);
          ecgY =
            twistEnv * (0.85 * Math.sin(t * 21.5) + 0.24 * Math.sin(t * 43 + 0.7)) +
            (Math.random() - 0.5) * 0.04;
        } else {
          // Assistolia: linha isoelétrica quase plana com mínima deriva
          ecgY = 0.012 * Math.sin(t * 1.7) + (Math.random() - 0.5) * 0.008;
        }

        if (iv.cprActive) {
          const cp = (iv.cprPhase % 1 + 1) % 1;
          ibpMmHg = 18 + 50 * Math.pow(Math.sin(cp * Math.PI), 1.6);
          spo2Y = 0.08 + 0.25 * Math.pow(Math.sin(cp * Math.PI), 2);
        } else {
          ibpMmHg = 12 + Math.sin(t * 5) * 0.8;
          spo2Y = 0.03 + (Math.random() - 0.5) * 0.015;
        }
      } else if (rhythm === 'av_block_2_m1' || rhythm === 'av_block_2_m2') {
        // Bloqueios AV de 2º Grau: relógio atrial fixo com condução variável / bloqueio de onda P
        const atrialPeriod = rhythm === 'av_block_2_m1' ? 0.75 : 0.78;
        const tP = 0.08;
        this.atrialT += dt;
        if (this.atrialT >= atrialPeriod) {
          this.atrialT -= atrialPeriod;
          this.mobitzQrsTriggered = false;
          if (rhythm === 'av_block_2_m1') {
            const seq = [0.15, 0.24, 0.34, null]; // Wenckebach 4:3
            this.mobitzIdx = (this.mobitzIdx + 1) % seq.length;
            this.mobitzPr = seq[this.mobitzIdx];
          } else {
            const seq = [0.16, 0.16, null]; // Mobitz II 3:2
            this.mobitzIdx = (this.mobitzIdx + 1) % seq.length;
            this.mobitzPr = seq[this.mobitzIdx];
          }
        }

        const pWave = 0.15 * gauss(this.atrialT, tP, 0.018);
        let qrsPart = 0;
        if (this.mobitzPr !== null) {
          const tQrs = tP + this.mobitzPr;
          const tau = this.atrialT - tQrs;
          qrsPart = this._evalQrsStT(tau, rhythm, vit.stDeviation, false);
          if (tau >= 0 && !this.mobitzQrsTriggered) {
            this.mobitzQrsTriggered = true;
            this._triggerQrsBeat(vit, false);
          }
        }
        ecgY = (pWave + qrsPart) * leadScale + (Math.random() - 0.5) * 0.011;
      } else if (rhythm === 'av_block_3') {
        // BAV Total (3º Grau): dissociação AV completa (P a ~75 bpm independente do escape ~36 bpm)
        const atrialPeriod = 0.80;
        this.atrialT = (this.atrialT + dt) % atrialPeriod;
        const pWave = 0.15 * gauss(this.atrialT, 0.12, 0.018);

        const hr = clamp(vit.hr || 36, 28, 48);
        const rr = 60 / hr;
        this.tInBeat += dt;
        if (this.tInBeat >= rr) {
          this.tInBeat -= rr;
          this.beatQrsTriggered = false;
        }
        const tau = this.tInBeat - 0.35;
        const qrsPart = this._evalQrsStT(tau, rhythm, vit.stDeviation, false);
        if (tau >= 0 && !this.beatQrsTriggered) {
          this.beatQrsTriggered = true;
          this._triggerQrsBeat(vit, false);
        }
        ecgY = (pWave + qrsPart) * leadScale + (Math.random() - 0.5) * 0.011;
      } else {
        // Demais ritmos (Sinusais, FA, FA RVR, Flutter, TPSV, BAV 1ºG, BRD, BRE, TV, AESP, Supra ST, HiperK, MP)
        const hr = Math.max(30, vit.hr || 75);
        const baseRr = 60 / hr;
        this.tInBeat += dt;

        if (this.tInBeat >= this.currentRrSec) {
          this.tInBeat -= this.currentRrSec;
          this.beatQrsTriggered = false;
          if (rhythm === 'afib' || rhythm === 'afib_rvr') {
            this.currentRrSec = clamp(baseRr * (0.58 + Math.random() * 0.84), 0.32, 1.45);
          } else if (rhythm === 'svt' || rhythm === 'vtach' || rhythm === 'paced' || rhythm === 'aflutter') {
            this.currentRrSec = baseRr;
          } else {
            this.currentRrSec = baseRr * (0.97 + Math.random() * 0.06);
          }
          const noEctopy = rhythm === 'vtach' || rhythm === 'svt' || rhythm === 'paced' || rhythm === 'pea';
          this.isPvcBeat = !noEctopy && Math.random() < (this.engine.cardiac.ectopyProb || 0);
        }

        const qrsRatio = rhythm === 'av_block_1' ? 0.42 : rhythm === 'svt' || rhythm === 'vtach' ? 0.35 : 0.28;
        const tQrs = Math.min(0.36, Math.max(0.11, this.currentRrSec * qrsRatio));
        const tau = this.tInBeat - tQrs;

        let pWave = 0;
        if (!this.isPvcBeat) {
          if (rhythm === 'afib' || rhythm === 'afib_rvr') {
            const t = this.engine.simTime;
            pWave = 0.042 * Math.sin(t * 38) + 0.030 * Math.cos(t * 53);
          } else if (rhythm === 'aflutter') {
            // Ondas F em "dente de serra" a 300 bpm (5.0 Hz) negativas em DII
            const fp = (this.engine.simTime * 5.0) % 1;
            const saw = fp < 0.72 ? fp / 0.72 : 1 - (fp - 0.72) / 0.28;
            pWave = 0.07 - 0.23 * saw;
          } else if (rhythm === 'av_block_1') {
            // Intervalo PR alargado (~280 ms) antes do QRS
            pWave = 0.15 * gauss(tau, -0.28, 0.018);
          } else if (rhythm === 'wpw') {
            // Intervalo PR curto (< 120 ms) colado na onda Delta
            pWave = 0.14 * gauss(tau, -0.102, 0.016);
          } else if (rhythm === 'svt' || rhythm === 'vtach' || rhythm === 'paced') {
            pWave = 0;
          } else if (rhythm === 'hyperkalemia') {
            // Onda P achatada/discreta na hipercalemia
            pWave = 0.04 * gauss(tau, -0.155, 0.022);
          } else {
            // Onda P sinusal normal (~155 ms pré-QRS)
            pWave = 0.14 * gauss(tau, -0.155, 0.018);
          }
        }

        const qrsPart = this._evalQrsStT(tau, rhythm, vit.stDeviation, this.isPvcBeat);
        ecgY = (pWave + qrsPart) * leadScale + (Math.random() - 0.5) * 0.012;

        if (tau >= 0 && !this.beatQrsTriggered) {
          this.beatQrsTriggered = true;
          this._triggerQrsBeat(vit, this.isPvcBeat);
        }
      }

      // 1b. Acoplamento Mecânico Contínuo (PAI e SpO2 após o último QRS real)
      if (rhythm !== 'vf' && rhythm !== 'asystole' && rhythm !== 'torsades') {
        if (rhythm === 'pea') {
          // AESP: QRS organizado no ECG, porém SEM pulso mecânico arterial/pleth (exceto sob RCP)
          if (iv.cprActive) {
            const cp = (iv.cprPhase % 1 + 1) % 1;
            ibpMmHg = 18 + 50 * Math.pow(Math.sin(cp * Math.PI), 1.6);
            spo2Y = 0.08 + 0.25 * Math.pow(Math.sin(cp * Math.PI), 2);
          } else {
            ibpMmHg = 12 + Math.sin(this.engine.simTime * 4) * 0.6;
            spo2Y = 0.03 + (Math.random() - 0.5) * 0.015;
          }
        } else {
          // Onda arterial contínua baseada no tempo desde o último QRS (mantém decaimento diastólico em pausas/bloqueios!)
          const tMech = this.lastQrsAge - 0.055;
          if (tMech < 0) {
            this.artShape = this.artShape * Math.exp(-dt * 2.7);
          } else if (tMech < 0.09) {
            const frac = Math.sin((tMech / 0.09) * (Math.PI / 2));
            this.artShape = this.artPreEject + (1.0 - this.artPreEject) * frac;
          } else if (tMech < 0.21) {
            this.artShape = 1.0 - 0.46 * ((tMech - 0.09) / 0.12);
          } else if (tMech < 0.26) {
            this.artShape = 0.54 + 0.09 * Math.sin(((tMech - 0.21) / 0.05) * Math.PI);
          } else {
            this.artShape = 0.54 * Math.exp(-2.7 * (tMech - 0.26));
          }

          const pulseP = Math.max(10, vit.sbp - vit.dbp);
          const beatFactor = this.lastBeatWasPvc ? 0.55 : rhythm === 'vtach' ? 0.65 : 1.0;
          ibpMmHg = vit.dbp + pulseP * beatFactor * this.artShape;

          // Pletismografia SpO2 contínua (atraso vascular periférico ~0.12 s pós-QRS)
          const tPleth = this.lastQrsAge - 0.12;
          if (tPleth < 0) {
            this.plethShape = this.plethShape * Math.exp(-dt * 3.2);
          } else if (tPleth < 0.12) {
            const frac = Math.sin((tPleth / 0.12) * (Math.PI / 2));
            this.plethShape = this.plethPreEject + (1.0 - this.plethPreEject) * frac;
          } else if (tPleth < 0.28) {
            this.plethShape = 1.0 - 0.42 * ((tPleth - 0.12) / 0.16);
          } else if (tPleth < 0.35) {
            this.plethShape = 0.58 + 0.08 * Math.sin(((tPleth - 0.28) / 0.07) * Math.PI);
          } else {
            this.plethShape = 0.58 * Math.exp(-3.1 * (tPleth - 0.35));
          }

          const ampScale = Math.max(0.15, Math.min(1.0, vit.perfusionIndex / 3.0));
          spo2Y = 0.08 + 0.85 * ampScale * this.plethShape;
        }
      }

      // 2. Capnografia EtCO2 sincronizada com o ciclo do ventilador
      if (b.phase === 'EXP') {
        this.expTime += dt;
        const targetEtco2 = vit.etco2;
        if (this.expTime < 0.16) {
          // Fase I -> II (subida rápida do espaço morto)
          const frac = this.expTime / 0.16;
          const plateauStart = pat.resistance > 16 ? targetEtco2 * 0.62 : targetEtco2 * 0.92;
          this.co2Val = plateauStart * (frac * frac * (3 - 2 * frac));
        } else {
          // Fase III (platô alveolar — inclinado em "barbatana de tubarão" se Rva alta)
          const plateauProgress = Math.min(1, (this.expTime - 0.16) / 2.2);
          if (pat.resistance > 16) {
            this.co2Val = targetEtco2 * (0.62 + 0.38 * Math.pow(plateauProgress, 0.7));
          } else {
            this.co2Val = targetEtco2 * (0.92 + 0.08 * plateauProgress);
          }
        }
      } else {
        // Inspiração lava rapidamente o sensor para 0 mmHg
        this.expTime = 0;
        this.co2Val = this.co2Val * Math.exp(-dt * 28);
      }

      // Escrever nos buffers circulares
      const idx = this.writeIdx;
      this.buffers.ecg[idx] = ecgY;
      this.buffers.spo2[idx] = spo2Y;
      this.buffers.ibp[idx] = ibpMmHg;
      this.buffers.co2[idx] = this.co2Val;
      this.writeIdx = (idx + 1) % this.bufferLen;
    }

    render() {
      if (!this._dirty) return;
      this._dirty = false;

      this._renderChannel(this.canvases.ecg, this.buffers.ecg, this.colors.ecg, -1.22, 1.48);
      this._renderChannel(this.canvases.spo2, this.buffers.spo2, this.colors.spo2, -0.05, 1.05);

      const maxIbp = Math.max(160, Math.ceil((this.engine.vitals.sbp + 20) / 20) * 20);
      this._renderChannel(this.canvases.ibp, this.buffers.ibp, this.colors.ibp, 0, maxIbp, [60, 120]);
      this._renderChannel(this.canvases.co2, this.buffers.co2, this.colors.co2, -2, 62, [20, 40]);

      if (this.ibpScaleEl && this._lastMaxIbp !== maxIbp) {
        this._lastMaxIbp = maxIbp;
        this.ibpScaleEl.textContent = `0–${maxIbp} mmHg`;
      }

      if (this.spo2BarSpans && this.spo2BarSpans.length) {
        const vit = this.engine.vitals;
        const pat = this.engine.patient;
        const arrested = pat && pat.arrested;
        const perfRatio = arrested ? 0 : Math.min(1.15, Math.max(0.25, (vit.perfusionIndex || 2.5) / 4.2));
        const lvl = arrested ? 0 : Math.round(Math.max(0, Math.min(1, this.plethShape * perfRatio)) * this.spo2BarSpans.length);
        if (lvl !== this._lastSpo2Lvl) {
          this._lastSpo2Lvl = lvl;
          for (let i = 0; i < this.spo2BarSpans.length; i++) {
            this.spo2BarSpans[i].classList.toggle('lit', i < lvl);
          }
        }
      }
    }

    _renderChannel(canvas, buf, color, minVal, maxVal, refLines = []) {
      if (!canvas || !canvas.width || !canvas.height) return;
      const Sweep = global.ICUSim.Sweep;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const dpr = Sweep.getDpr();

      ctx.clearRect(0, 0, w, h);
      Sweep.drawGrid(ctx, w, h, dpr, 6, 4);

      if (refLines.length > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath();
        for (let k = 0; k < refLines.length; k++) {
          const y = h - ((refLines[k] - minVal) / (maxVal - minVal)) * (h - 14 * dpr) - 7 * dpr;
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      const len = this.bufferLen;
      const span = maxVal - minVal;
      const invSpan = 1 / span;
      const plotH = h - 12 * dpr;
      const padY = 6 * dpr;

      Sweep.drawSweepTrace(ctx, {
        buf,
        len,
        cursor: this.writeIdx,
        gapSamples: 34,
        fadeLen: 55,
        tailHighlight: 28,
        color,
        lineWidth: 2.0,
        dpr,
        toX: (i) => (i / (len - 1)) * w,
        toY: (v) => h - Math.max(0.03, Math.min(0.97, (v - minVal) * invSpan)) * plotH - padY,
        topY: 2 * dpr,
        botY: h - 2 * dpr,
        glow: true
      });
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.MultiparameterMonitor = MultiparameterMonitor;
})(window);
