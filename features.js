/**
 * UTICoMed Superpowers (Zero-Dependency Clinical Engineering Suite)
 * 1. Caixa-Preta da UTI (Gravação contínua + Replay/Time-Travel + Gráfico de Debriefing)
 * 2. Avaliador OSCE em Tempo Real + Exportação de Boletim Clínico em PDF (%PDF-1.4 puro)
 * 3. Compartilhamento de Caso via URL Compacta (#caso=...) + Import/Export JSON + QR Matrix
 * 4. Sala de Simulação Multi-Tela (Modo Instrutor <-> Tela Limpa do Aluno via BroadcastChannel)
 * 5. Controle de Velocidade Temporal (1x / 2x / 5x / 10x)
 */
(function (global) {
  'use strict';

  const MAX_HISTORY = 600; // 10 minutos a 1 Hz
  const CHANNEL_NAME = 'uticomed-sim-sync-v1';

  // ================= COMPRESSÃO URL-SAFE (CompressionStream + fallback) =================
  function bytesToB64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64UrlToBytes(str) {
    const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function encodeSnapshotUrl(snap) {
    const raw = new TextEncoder().encode(JSON.stringify(snap));
    if (typeof CompressionStream === 'function') {
      try {
        const cs = new CompressionStream('deflate-raw');
        const w = cs.writable.getWriter();
        w.write(raw);
        w.close();
        const buf = await new Response(cs.readable).arrayBuffer();
        return 'z.' + bytesToB64Url(new Uint8Array(buf));
      } catch (_) {}
    }
    return 'r.' + bytesToB64Url(raw);
  }

  async function decodeSnapshotUrl(token) {
    if (!token || token.length < 4) return null;
    const mode = token.slice(0, 2);
    const bytes = b64UrlToBytes(token.slice(2));
    if (mode === 'z.' && typeof DecompressionStream === 'function') {
      const ds = new DecompressionStream('deflate-raw');
      const w = ds.writable.getWriter();
      w.write(bytes);
      w.close();
      const txt = await new Response(ds.readable).text();
      return JSON.parse(txt);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // ================= GERADOR DE PDF (%PDF-1.4 PURO PARA BOLETIM OSCE) =================
  function pdfEsc(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7e]/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  function buildOscePdf(report) {
    const ops = [];
    const text = (x, y, size, font, str, rgb = '0.08 0.12 0.18') => {
      ops.push(`${rgb} rg BT /${font} ${size} Tf ${x} ${y} Td (${pdfEsc(str)}) Tj ET`);
    };
    const rect = (x, y, w, h, rgb) => {
      ops.push(`${rgb} rg ${x} ${y} ${w} ${h} re f`);
    };

    // Cabeçalho azul-marinho clínico
    rect(0, 762, 595, 80, '0.06 0.11 0.18');
    rect(0, 758, 595, 4, '0.13 0.77 0.37');
    text(36, 810, 18, 'F2', 'UTICoMed - Boletim de Desempenho Clinico (OSCE)', '1 1 1');
    text(36, 788, 10, 'F1', `Cenario: ${report.scenarioName}   |   Data: ${report.timestamp}`, '0.78 0.86 0.94');
    text(36, 773, 9, 'F1', `Duracao monitorizada: ${report.durationStr}   |   Intervencoes registradas: ${report.events.length}`, '0.62 0.75 0.88');

    // Cartão de Nota Final
    const gradeRgb = report.score >= 85 ? '0.08 0.50 0.24' : report.score >= 65 ? '0.72 0.44 0.04' : '0.72 0.11 0.11';
    rect(36, 686, 523, 56, '0.95 0.97 0.99');
    rect(36, 686, 8, 56, gradeRgb);
    text(56, 718, 20, 'F2', `SCORE GLOBAL: ${report.score}/100  (Conceito ${report.grade})`, gradeRgb);
    text(56, 698, 10, 'F1', report.verdict, '0.15 0.22 0.32');

    // Tabela de Indicadores de Qualidade
    let y = 656;
    text(36, y, 12, 'F2', 'Indicadores Objetivos de Seguranca do Paciente', '0.06 0.11 0.18');
    y -= 10;
    rect(36, y - 2, 523, 1.5, '0.80 0.85 0.90');
    y -= 20;

    report.metrics.forEach((m) => {
      rect(36, y - 6, 523, 24, '0.97 0.98 0.99');
      text(44, y + 3, 10, 'F2', m.label, '0.10 0.16 0.24');
      text(335, y + 3, 10, 'F2', m.value, m.ok ? '0.08 0.50 0.24' : '0.72 0.15 0.15');
      text(435, y + 3, 9, 'F1', m.target, '0.35 0.42 0.50');
      y -= 28;
    });

    // Recomendações Pedagógicas
    y -= 10;
    text(36, y, 12, 'F2', 'Pontos de Melhoria & Debriefing', '0.06 0.11 0.18');
    y -= 18;
    report.feedback.slice(0, 6).forEach((line) => {
      text(44, y, 9.5, 'F1', `- ${line.slice(0, 96)}`, '0.15 0.22 0.30');
      y -= 15;
    });

    // Linha do Tempo de Intervenções
    y -= 12;
    text(36, y, 12, 'F2', 'Linha do Tempo de Condutas (Caixa-Preta)', '0.06 0.11 0.18');
    y -= 18;
    const evList = report.events.slice(-14);
    if (!evList.length) {
      text(44, y, 9.5, 'F1', 'Nenhuma intervencao registrada neste ciclo.', '0.40 0.46 0.54');
    } else {
      evList.forEach((ev) => {
        if (y < 60) return;
        text(44, y, 9, 'F1', `[${ev.tStr}] ${ev.msg.slice(0, 88)}`, '0.18 0.24 0.32');
        y -= 14;
      });
    }

    text(36, 30, 8, 'F1', 'Gerado localmente (100% offline) pelo UTICoMed Simulador Clinico de UTI', '0.45 0.52 0.60');

    const stream = ops.join('\n');
    const objs = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
      '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
      `6 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [];
    objs.forEach((o) => {
      offsets.push(pdf.length);
      pdf += o;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((off) => {
      pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return pdf;
  }

  function fmtMinSec(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  class Superpowers {
    constructor({ engine, onLog, onStateRestored, setFrozen }) {
      this.engine = engine;
      this.onLog = onLog || (() => {});
      this.onStateRestored = onStateRestored || (() => {});
      this.setFrozen = setFrozen || (() => {});

      // 1. Caixa-Preta (snapshots 1Hz + eventos)
      this.history = [];
      this.events = [];
      this.sampleAccum = 0;

      // 2. Avaliador OSCE
      this.osce = this._newOsceStats();

      // 3. Multi-Tela BroadcastChannel (com proteção para file:// ou origens restritas)
      this.role = 'standalone'; // 'standalone' | 'instructor' | 'display'
      this.bc = null;
      try {
        if (typeof BroadcastChannel === 'function') this.bc = new BroadcastChannel(CHANNEL_NAME);
      } catch (_) {
        this.bc = null;
      }
      this.bcAccum = 0;

      // 4. Escala temporal
      this.scales = [1, 2, 5, 10];
      this.scaleIdx = 0;
      this._lastScenarioId = engine.scenarioId || null;

      this._injectUI();
      this._bindBroadcast();
      this._checkUrlBoot();
    }

    _newOsceStats() {
      return {
        totalSec: 0,
        ventSec: 0,
        protVtSec: 0,
        protDpSec: 0,
        protPplatSec: 0,
        hemoOkSec: 0,
        spo2OkSec: 0,
        arrestSec: 0,
        cprDuringArrestSec: 0,
        shocksDelivered: 0,
        firstArrestAt: null,
        firstActionAfterArrestSec: null
      };
    }

    resetSession(reason) {
      this.history = [];
      this.events = [];
      this.osce = this._newOsceStats();
      this.sampleAccum = 0;
      if (reason) this.recordEvent(reason);
      this._recordSample();
    }

    recordEvent(msg) {
      if (!msg) return;
      const t = this.engine.simTime || 0;
      this.events.push({ t, tStr: fmtMinSec(t), msg: String(msg) });
      if (this.events.length > 200) this.events.shift();
      // Detectar tempo de reação após PCR
      if (this.osce.firstArrestAt !== null && this.osce.firstActionAfterArrestSec === null) {
        if (/choque|desfibril|rcp|adrenalina|cardiovers/i.test(msg)) {
          this.osce.firstActionAfterArrestSec = Math.max(0, t - this.osce.firstArrestAt);
        }
      }
      if (/choque|desfibril/i.test(msg)) this.osce.shocksDelivered += 1;
    }

    step(dt, isFrozen) {
      // Multi-tela: Instrutor transmite snapshot a 5 Hz
      if (this.role === 'instructor' && this.bc) {
        this.bcAccum += dt;
        if (this.bcAccum >= 0.2) {
          this.bcAccum = 0;
          this.bc.postMessage({ type: 'state', snap: this.engine.exportSnapshot(), ts: Date.now() });
        }
      }

      if (isFrozen || this.role === 'display') return;

      if (this.engine.scenarioId && this.engine.scenarioId !== this._lastScenarioId) {
        this._lastScenarioId = this.engine.scenarioId;
        this.resetSession(`Cenário iniciado: ${(this.engine.scenario && this.engine.scenario.name) || this.engine.scenarioId}`);
      }

      const effDt = dt * (this.engine.timeScale || 1);
      this._tickOsce(effDt);

      this.sampleAccum += effDt;
      if (this.sampleAccum >= 1.0) {
        this.sampleAccum -= 1.0;
        this._recordSample();
      }
    }

    _tickOsce(dt) {
      const o = this.osce;
      const v = this.engine.vitals;
      const p = this.engine.patient;
      const b = this.engine.breath;
      const vt = this.engine.vent;
      const conn = Boolean(this.engine.airway && this.engine.airway.connectedToVent);

      o.totalSec += dt;
      if (v.map >= 65) o.hemoOkSec += dt;
      if (v.spo2 >= 92) o.spo2OkSec += dt;

      if (conn) {
        o.ventSec += dt;
        const vtKg = (b.lastVteMl || 0) / Math.max(30, p.weightKg || 70);
        const dp = Math.max(0, (b.lastPlatPaw || 0) - ((vt.peepSet || 5) + (b.lastAutoPeep || 0)));
        if (vtKg >= 4.0 && vtKg <= 8.2) o.protVtSec += dt;
        if (dp <= 15.5) o.protDpSec += dt;
        if ((b.lastPlatPaw || 0) <= 30.5) o.protPplatSec += dt;
      }

      if (p.arrested) {
        if (o.firstArrestAt === null) o.firstArrestAt = this.engine.simTime || 0;
        o.arrestSec += dt;
        if (this.engine.interventions && this.engine.interventions.cprActive) {
          o.cprDuringArrestSec += dt;
        }
      }
    }

    _recordSample() {
      const v = this.engine.vitals;
      const b = this.engine.breath;
      const vt = this.engine.vent;
      const dp = Math.max(0, (b.lastPlatPaw || 0) - ((vt.peepSet || 5) + (b.lastAutoPeep || 0)));
      this.history.push({
        t: this.engine.simTime || 0,
        spo2: Math.round(v.spo2 || 0),
        map: Math.round(v.map || 0),
        hr: Math.round(v.hr || 0),
        dp: Math.round(dp),
        ph: Number((v.ph || 7.4).toFixed(2)),
        snap: this.engine.exportSnapshot()
      });
      if (this.history.length > MAX_HISTORY) this.history.shift();
    }

    evaluateOsce() {
      const o = this.osce;
      const tot = Math.max(1, o.totalSec);
      const vTot = Math.max(1, o.ventSec);
      const pct = (a, b) => Math.round((a / Math.max(1, b)) * 100);

      const hemoPct = pct(o.hemoOkSec, tot);
      const spo2Pct = pct(o.spo2OkSec, tot);
      const vtPct = o.ventSec > 2 ? pct(o.protVtSec, vTot) : 100;
      const dpPct = o.ventSec > 2 ? pct(o.protDpSec, vTot) : 100;
      const ppPct = o.ventSec > 2 ? pct(o.protPplatSec, vTot) : 100;

      let score = Math.round(hemoPct * 0.25 + spo2Pct * 0.25 + vtPct * 0.18 + dpPct * 0.17 + ppPct * 0.15);
      const feedback = [];

      if (hemoPct < 75) feedback.push(`PAM ficou abaixo de 65 mmHg em ${100 - hemoPct}% do tempo — otimize volume/vasopressor mais cedo.`);
      if (spo2Pct < 80) feedback.push(`Hipoxemia (SpO2 < 92%) em ${100 - spo2Pct}% do tempo — reavalie FiO2, PEEP ou via aerea.`);
      if (o.ventSec > 2 && dpPct < 75) feedback.push(`Driving Pressure > 15 cmH2O em ${100 - dpPct}% do tempo em VM — reduza Vt ou titule PEEP.`);
      if (o.ventSec > 2 && vtPct < 75) feedback.push(`Volume corrente fora da faixa protetora (4-8 mL/kg PBW) em ${100 - vtPct}% do tempo.`);
      if (o.arrestSec > 5) {
        const cprRatio = pct(o.cprDuringArrestSec, o.arrestSec);
        if (cprRatio < 60) {
          score = Math.max(0, score - 15);
          feedback.push(`Paciente ficou em PCR com baixa fracao de RCP (${cprRatio}%). Priorize compressoes continuas e choque precoce.`);
        }
      }
      if (!feedback.length) {
        feedback.push('Excelente conducao clinica! Parametros protetores e perfusao mantidos dentro das metas de seguranca.');
      }

      const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';
      const verdict =
        score >= 90 ? 'Excelencia Clinica - Conduta Segura e Protetora'
        : score >= 75 ? 'Bom Desempenho - Pequenos Ajustes Recomendados'
        : score >= 60 ? 'Desempenho Regular - Revisar Metas Protetoras/Hemodinamicas'
        : 'Risco Clinico Elevado - Priorizar Estabilizacao Imediata';

      const sc = this.engine.scenario || {};
      return {
        scenarioName: sc.name || this.engine.scenarioId || 'Simulacao UTI',
        timestamp: new Date().toLocaleString('pt-BR'),
        durationStr: fmtMinSec(o.totalSec),
        score,
        grade,
        verdict,
        events: this.events.slice(),
        feedback,
        metrics: [
          { label: 'Perfusao (PAM >= 65 mmHg)', value: `${hemoPct}%`, target: 'Meta >= 80%', ok: hemoPct >= 80 },
          { label: 'Oxigenacao (SpO2 >= 92%)', value: `${spo2Pct}%`, target: 'Meta >= 85%', ok: spo2Pct >= 85 },
          { label: 'Vt Protetor (4-8 mL/kg PBW)', value: o.ventSec > 2 ? `${vtPct}%` : 'Sem VM', target: 'Meta >= 80%', ok: vtPct >= 80 },
          { label: 'Driving Pressure <= 15 cmH2O', value: o.ventSec > 2 ? `${dpPct}%` : 'Sem VM', target: 'Meta >= 80%', ok: dpPct >= 80 },
          { label: 'Pressao de Plato <= 30 cmH2O', value: o.ventSec > 2 ? `${ppPct}%` : 'Sem VM', target: 'Meta >= 90%', ok: ppPct >= 90 }
        ]
      };
    }

    downloadOscePdf() {
      const report = this.evaluateOsce();
      const pdfStr = buildOscePdf(report);
      const bytes = new Uint8Array(pdfStr.length);
      for (let i = 0; i < pdfStr.length; i++) bytes[i] = pdfStr.charCodeAt(i) & 0xff;
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `UTICoMed-Boletim-OSCE-${report.score}pts.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.onLog(`Boletim OSCE gerado em PDF (${report.score}/100 — Conceito ${report.grade}).`);
    }

    // ================= MULTI-TELA BROADCASTCHANNEL =================
    _bindBroadcast() {
      if (!this.bc) return;
      this.bc.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg) return;
        if (this.role === 'display' && msg.type === 'state' && msg.snap) {
          this.engine.importSnapshot(msg.snap, true);
          this.onStateRestored();
        }
      };
    }

    setRole(newRole) {
      this.role = newRole;
      document.body.classList.toggle('uticomed-display-only', newRole === 'display');
      if (this.btnMultiEl) {
        this.btnMultiEl.classList.toggle('active', newRole !== 'standalone');
        this.btnMultiEl.textContent = newRole === 'instructor' ? '📡 Instrutor' : newRole === 'display' ? '🖥️ Sala' : '📡';
      }
      if (newRole === 'instructor') {
        this.onLog('Modo Instrutor ATIVO — transmitindo estado ao vivo para janelas da Sala de Simulação.');
      } else if (newRole === 'display') {
        this.onLog('Modo Sala/Projetor ATIVO — recebendo paciente ao vivo do Instrutor.');
      }
    }

    openStudentDisplayWindow() {
      this.setRole('instructor');
      const u = new URL(window.location.href);
      u.searchParams.set('modo', 'simulador');
      u.searchParams.set('tela', 'sala');
      u.hash = '';
      window.open(u.toString(), 'UTICoMedSalaAluno', 'width=1280,height=820');
    }

    // ================= BOOT POR URL (#caso=... & ?tela=sala) =================
    async _checkUrlBoot() {
      const qs = new URLSearchParams(window.location.search);
      if (qs.get('tela') === 'sala') {
        this.setRole('display');
      }
      const m = window.location.hash.match(/caso=([A-Za-z0-9._-]+)/);
      if (m && m[1]) {
        try {
          const snap = await decodeSnapshotUrl(m[1]);
          if (snap) {
            this.engine.importSnapshot(snap, false);
            this.resetSession('Caso clínico importado via link compartilhado!');
            this.onStateRestored();
          }
        } catch (err) {
          this.onLog('Aviso: não foi possível decodificar o caso clínico da URL.');
        }
      }
    }

    // ================= UI COMPACTA (BOTÕES NA TOPBAR + MODAL DE SUPERPODERES) =================
    _injectUI() {
      const actions = document.querySelector('.topbar-controls') || document.querySelector('.topbar-actions');
      if (actions) {
        const mkBtn = (id, html, title, cls = 'ctrl-btn') => {
          const b = document.createElement('button');
          b.type = 'button';
          b.id = id;
          b.className = cls;
          b.innerHTML = html;
          b.title = title;
          return b;
        };

        this.btnSpeedEl = mkBtn('btnTimeScale', '1×', 'Acelerar tempo fisiológico (1× / 2× / 5× / 10×)', 'ctrl-btn mono sp-speed-btn');
        this.btnBlackBoxEl = mkBtn('btnBlackBox', '📼', 'Caixa-Preta (Replay Time-Travel) & Boletim OSCE em PDF', 'ctrl-btn accent');
        this.btnShareEl = mkBtn('btnShareCase', '🔗', 'Compartilhar caso clínico por URL / JSON / Multi-Tela', 'ctrl-btn accent');
        this.btnMultiEl = mkBtn('btnMultiScreen', '📡', 'Sala Multi-Tela: controlar paciente em uma janela e projetar na outra', 'ctrl-btn');

        const insertBeforeEl = document.getElementById('btnAbgModal') || actions.firstChild;
        actions.insertBefore(this.btnSpeedEl, insertBeforeEl);
        actions.insertBefore(this.btnBlackBoxEl, insertBeforeEl);
        actions.insertBefore(this.btnShareEl, insertBeforeEl);
        actions.insertBefore(this.btnMultiEl, insertBeforeEl);

        this.btnSpeedEl.addEventListener('click', () => {
          this.scaleIdx = (this.scaleIdx + 1) % this.scales.length;
          const sc = this.scales[this.scaleIdx];
          this.engine.timeScale = sc;
          this.btnSpeedEl.textContent = `${sc}×`;
          this.btnSpeedEl.classList.toggle('active', sc > 1);
          this.onLog(`Velocidade fisiológica ajustada para ${sc}×.`);
        });

        this.btnBlackBoxEl.addEventListener('click', () => this.openDebriefModal());
        this.btnShareEl.addEventListener('click', () => this.openShareModal());
        this.btnMultiEl.addEventListener('click', () => {
          if (this.role === 'standalone') this.openStudentDisplayWindow();
          else this.setRole('standalone');
        });
      }

      // Modal único reutilizável para Debriefing/OSCE e Compartilhamento
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop hidden';
      modal.id = 'modalSuperpowers';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML = `
        <div class="modal-card sp-modal-card">
          <div class="modal-header">
            <h3 id="spModalTitle">UTICoMed</h3>
            <button type="button" class="modal-close" id="btnCloseSpModal" aria-label="Fechar">✕</button>
          </div>
          <div class="sp-modal-body" id="spModalBody"></div>
        </div>
      `;
      document.body.appendChild(modal);
      this.modalEl = modal;
      this.modalTitleEl = modal.querySelector('#spModalTitle');
      this.modalBodyEl = modal.querySelector('#spModalBody');
      modal.querySelector('#btnCloseSpModal').addEventListener('click', () => this.closeModal());
      modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModal(); });
    }

    closeModal() {
      if (this.modalEl) this.modalEl.classList.add('hidden');
    }

    // ================= MODAL 1: CAIXA-PRETA (TIME-TRAVEL) + OSCE =================
    openDebriefModal() {
      if (!this.history.length) this._recordSample();
      const rep = this.evaluateOsce();
      const maxIdx = Math.max(0, this.history.length - 1);

      this.modalTitleEl.textContent = `📼 Caixa-Preta da UTI & Avaliação OSCE (${rep.score}/100 • ${rep.grade})`;
      this.modalBodyEl.innerHTML = `
        <div class="sp-osce-banner sp-grade-${rep.grade.toLowerCase()}">
          <div>
            <div class="sp-score-big mono">${rep.score}<small>/100</small> <span class="sp-grade-pill">${rep.grade}</span></div>
            <div class="sp-verdict">${rep.verdict} • Duração: ${rep.durationStr}</div>
          </div>
          <button type="button" class="ctrl-btn accent" id="spBtnExportPdf">📄 Exportar Boletim PDF</button>
        </div>

        <div class="sp-metrics-grid">
          ${rep.metrics.map((m) => `
            <div class="sp-metric-card ${m.ok ? 'ok' : 'warn'}">
              <span>${m.label}</span>
              <strong class="mono">${m.value}</strong>
              <small>${m.target}</small>
            </div>
          `).join('')}
        </div>

        <div class="sp-chart-wrap">
          <div class="sp-chart-legend mono">
            <span style="color:#00e5ff">■ SpO₂ (%)</span>
            <span style="color:#ff3b5c">■ PAM (mmHg)</span>
            <span style="color:#facc15">■ ΔP (cmH₂O)</span>
            <span style="color:#22c55e">● Eventos Clínicos (${this.events.length})</span>
          </div>
          <canvas id="spTrendCanvas" height="160"></canvas>
          <div class="sp-scrub-row">
            <label class="mono" for="spScrubRange">⏱ Time-Travel: <strong id="spScrubLabel">${fmtMinSec(this.history[maxIdx].t)}</strong></label>
            <input type="range" id="spScrubRange" min="0" max="${maxIdx}" value="${maxIdx}" />
            <button type="button" class="ctrl-btn accent" id="spBtnRestoreSnap">⏪ Restaurar Este Instante</button>
          </div>
        </div>

        <div class="sp-feedback-box">
          <strong>Pontos de Debriefing:</strong>
          <ul>${rep.feedback.map((f) => `<li>${f}</li>`).join('')}</ul>
        </div>
      `;

      this.modalEl.classList.remove('hidden');
      this._drawTrendChart(maxIdx);

      const range = document.getElementById('spScrubRange');
      const label = document.getElementById('spScrubLabel');
      range.addEventListener('input', () => {
        const idx = Number(range.value);
        const pt = this.history[idx];
        if (pt) {
          label.textContent = `${fmtMinSec(pt.t)} (SpO₂ ${pt.spo2}% • PAM ${pt.map} • ΔP ${pt.dp})`;
          this._drawTrendChart(idx);
        }
      });

      document.getElementById('spBtnRestoreSnap').addEventListener('click', () => {
        const pt = this.history[Number(range.value)];
        if (pt && pt.snap) {
          this.engine.importSnapshot(pt.snap, false);
          this.onStateRestored();
          this.onLog(`Time-Travel: paciente restaurado para o instante ${fmtMinSec(pt.t)}.`);
          this.closeModal();
        }
      });

      document.getElementById('spBtnExportPdf').addEventListener('click', () => this.downloadOscePdf());
    }

    _drawTrendChart(cursorIdx) {
      const canvas = document.getElementById('spTrendCanvas');
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(320, Math.round((rect.width || 560) * dpr));
      const h = Math.round(160 * dpr);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#09111c';
      ctx.fillRect(0, 0, w, h);

      const hist = this.history;
      if (hist.length < 2) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${12 * dpr}px monospace`;
        ctx.fillText('Aguarde alguns segundos de simulação para gerar a curva de tendências...', 16 * dpr, h / 2);
        return;
      }

      const pad = 16 * dpr;
      const plotW = w - pad * 2;
      const plotH = h - pad * 2;
      const toX = (i) => pad + (i / (hist.length - 1)) * plotW;

      // Grade horizontal
      ctx.strokeStyle = 'rgba(148,163,184,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let g = 0; g <= 4; g++) {
        const y = pad + (g / 4) * plotH;
        ctx.moveTo(pad, y); ctx.lineTo(w - pad, y);
      }
      ctx.stroke();

      const drawSeries = (key, minV, maxV, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        for (let i = 0; i < hist.length; i++) {
          const norm = Math.max(0, Math.min(1, (hist[i][key] - minV) / (maxV - minV)));
          const x = toX(i);
          const y = pad + (1 - norm) * plotH;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      drawSeries('spo2', 50, 100, '#00e5ff');
      drawSeries('map', 20, 140, '#ff3b5c');
      drawSeries('dp', 0, 35, '#facc15');

      // Marcadores de eventos clínicos
      const t0 = hist[0].t;
      const tSpan = Math.max(1, hist[hist.length - 1].t - t0);
      ctx.fillStyle = '#22c55e';
      this.events.forEach((ev) => {
        if (ev.t < t0) return;
        const ex = pad + Math.min(1, (ev.t - t0) / tSpan) * plotW;
        ctx.beginPath();
        ctx.arc(ex, pad + 5 * dpr, 3.2 * dpr, 0, Math.PI * 2);
        ctx.fill();
      });

      // Cursor de Time-Travel
      const cx = toX(Math.max(0, Math.min(hist.length - 1, cursorIdx)));
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx, pad); ctx.lineTo(cx, h - pad);
      ctx.stroke();
    }

    // ================= MODAL 2: COMPARTILHAR CASO NA URL & MULTI-TELA =================
    async openShareModal() {
      const snap = this.engine.exportSnapshot();
      const token = await encodeSnapshotUrl(snap);
      const u = new URL(window.location.href);
      u.searchParams.set('modo', 'simulador');
      u.hash = `caso=${token}`;
      const shareUrl = u.toString();

      this.modalTitleEl.textContent = '🔗 Compartilhar Caso Clínico & Sala Multi-Tela';
      this.modalBodyEl.innerHTML = `
        <div class="sp-share-section">
          <label class="sp-label">Link Direto do Paciente Atual (100% sem servidor — estado comprimido na URL):</label>
          <div class="sp-copy-row">
            <input type="text" id="spShareUrlInput" class="mono" readonly value="${shareUrl}" />
            <button type="button" class="ctrl-btn accent" id="spBtnCopyUrl">📋 Copiar Link</button>
          </div>
          <small class="sp-hint">Tamanho do estado codificado: ${token.length} caracteres. Quem abrir este link carrega exatamente este paciente, ventilador e bombas.</small>
        </div>

        <div class="sp-share-section">
          <label class="sp-label">📡 Sala de Simulação Multi-Tela (BroadcastChannel):</label>
          <div class="sp-btn-row">
            <button type="button" class="ctrl-btn accent" id="spBtnOpenStudent">🖥️ Abrir Tela do Aluno (Projetor Limpo)</button>
            <button type="button" class="ctrl-btn" id="spBtnToggleInstructor">${this.role === 'instructor' ? '⏹ Encerrar Transmissão' : '📡 Ativar Modo Instrutor'}</button>
          </div>
          <small class="sp-hint">Controle o paciente e dispare intercorrências (FV, pneumotórax, oclusão) nesta janela enquanto o projetor exibe apenas os monitores ao vivo.</small>
        </div>

        <div class="sp-share-section">
          <label class="sp-label">💾 Exportar / Importar Snapshot JSON do Caso:</label>
          <textarea id="spJsonArea" class="mono" rows="4">${JSON.stringify(snap)}</textarea>
          <div class="sp-btn-row">
            <button type="button" class="ctrl-btn" id="spBtnImportJson">📥 Carregar JSON</button>
          </div>
        </div>
      `;

      this.modalEl.classList.remove('hidden');

      document.getElementById('spBtnCopyUrl').addEventListener('click', () => {
        const inp = document.getElementById('spShareUrlInput');
        inp.select();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareUrl).catch(() => document.execCommand('copy'));
        } else {
          document.execCommand('copy');
        }
        const btn = document.getElementById('spBtnCopyUrl');
        btn.textContent = '✅ Copiado!';
        setTimeout(() => { btn.textContent = '📋 Copiar Link'; }, 1800);
      });

      document.getElementById('spBtnOpenStudent').addEventListener('click', () => {
        this.openStudentDisplayWindow();
        this.closeModal();
      });

      document.getElementById('spBtnToggleInstructor').addEventListener('click', () => {
        this.setRole(this.role === 'instructor' ? 'standalone' : 'instructor');
        this.closeModal();
      });

      document.getElementById('spBtnImportJson').addEventListener('click', () => {
        try {
          const parsed = JSON.parse(document.getElementById('spJsonArea').value);
          this.engine.importSnapshot(parsed, false);
          this.resetSession('Caso clínico importado via JSON.');
          this.onStateRestored();
          this.closeModal();
        } catch (err) {
          alert('JSON inválido. Verifique o conteúdo colado.');
        }
      });
    }
  }

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.Superpowers = Superpowers;
})(window);
