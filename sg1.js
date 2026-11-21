/**
 * Analisador de Gases Sanguíneos Portátil Seamaty SG1
 * Fluxo: Início -> Inserir cartucho -> Análise (aquecimento/calibração/medição) -> Resultados -> Impressão térmica.
 * Gases, eletrólitos e bioquímica crítica derivados do estado fisiológico do PhysiologyEngine.
 */
(function (global) {
  'use strict';

  const ANALYSIS_SEC = 14; // tempo simulado da análise (real: poucos minutos)
  const PRINT_SEC = 3.6;

  // key, rótulo, unidade, mínimo, máximo, casas decimais, crítico baixo, crítico alto
  const PARAMS = [
    ['ph', 'pH', '', 7.35, 7.45, 2, 7.2, 7.6],
    ['pco2', 'PCO₂', 'mmHg', 35, 45, 0, 20, 70],
    ['po2', 'PO₂', 'mmHg', 80, 100, 0, 40, null],
    ['hco3', 'HCO₃⁻', 'mmol/L', 22, 26, 1, 12, 40],
    ['be', 'BE', 'mmol/L', -2, 2, 1, -12, 12],
    ['so2', 'sO₂', '%', 95, 100, 0, 85, null],
    ['na', 'Na⁺', 'mmol/L', 135, 145, 0, 120, 160],
    ['k', 'K⁺', 'mmol/L', 3.5, 5.0, 1, 2.8, 6.2],
    ['cl', 'Cl⁻', 'mmol/L', 98, 107, 0, 80, 120],
    ['ica', 'iCa²⁺', 'mmol/L', 1.12, 1.32, 2, 0.9, 1.6],
    ['hct', 'Hct', '%', 38, 50, 0, 20, 60],
    ['glu', 'Glu', 'mg/dL', 70, 140, 0, 40, 400],
    ['lac', 'Lac', 'mmol/L', 0.5, 2.0, 1, null, 4.0]
  ];

  const pad2 = (n) => String(n).padStart(2, '0');

  const ACID_BASE_DIAGNOSES = [
    {
      id: 'resp_alk',
      label: 'Alcalose respiratória',
      shortLabel: 'Alcalose resp.',
      kind: 'alk',
      conduct: 'Reduzir ventilação minuto (↓ FR ou ↓ Vt na VM); avaliar dor, ansiedade, febre ou hipoxemia.'
    },
    {
      id: 'resp_acid',
      label: 'Acidose respiratória',
      shortLabel: 'Acidose resp.',
      kind: 'acid',
      conduct: 'Aumentar ventilação alveolar (↑ FR ou ↑ Vt/ΔP com Pplat ≤ 30 cmH₂O; VM/VNI se hipoventilação) e tratar broncoespasmo.'
    },
    {
      id: 'met_alk',
      label: 'Alcalose metabólica',
      shortLabel: 'Alcalose metab.',
      kind: 'alk',
      conduct: 'Repor SF 0,9% e corrigir hipocalemia (K⁺); revisar diuréticos de alça ou perda gástrica.'
    },
    {
      id: 'met_acid',
      label: 'Acidose metabólica',
      shortLabel: 'Acidose metab.',
      kind: 'acid',
      conduct: 'Restaurar perfusão/volemia (cristaloide/vasopressor se choque/lactato alto) e tratar causa base; considerar NaHCO₃ se pH < 7,15.'
    }
  ];

  const ACID_BASE_DIAG_MAP = Object.fromEntries(ACID_BASE_DIAGNOSES.map((d) => [d.id, d]));

  function analyzeAcidBase(s) {
    const ph = Number(s.ph);
    const pco2 = Number(s.pco2);
    const hco3 = Number(s.hco3);
    const be = Number(s.be || 0);
    const po2 = Number(s.po2 == null ? 90 : s.po2);
    const so2 = Number(s.so2 == null ? 98 : s.so2);
    const k = Number(s.k == null ? 4.1 : s.k);
    const lac = Number(s.lac == null ? 1.0 : s.lac);

    const activeIds = [];
    let interp = 'Equilíbrio Acido-base';

    if (ph < 7.35) {
      if (pco2 > 45) activeIds.push('resp_acid');
      if (hco3 < 22 || be < -2) activeIds.push('met_acid');
      if (activeIds.length === 0) activeIds.push(pco2 >= 40 ? 'resp_acid' : 'met_acid');
      interp = activeIds.map((id) => ACID_BASE_DIAG_MAP[id].label).join(' + ');
    } else if (ph > 7.45) {
      if (pco2 < 35) activeIds.push('resp_alk');
      if (hco3 > 26 || be > 2) activeIds.push('met_alk');
      if (activeIds.length === 0) activeIds.push(pco2 <= 40 ? 'resp_alk' : 'met_alk');
      interp = activeIds.map((id) => ACID_BASE_DIAG_MAP[id].label).join(' + ');
    } else {
      if (pco2 > 45) activeIds.push('resp_acid');
      else if (pco2 < 35) activeIds.push('resp_alk');
      if (hco3 < 22 || be < -2) activeIds.push('met_acid');
      else if (hco3 > 26 || be > 2) activeIds.push('met_alk');
      if (activeIds.length > 0) {
        interp = `${activeIds.map((id) => ACID_BASE_DIAG_MAP[id].label).join(' + ')} (pH compensado)`;
      }
    }

    const conductParts = activeIds.length
      ? activeIds.map((id) => ACID_BASE_DIAG_MAP[id].conduct)
      : ['Manter ventilação protetora (Vt 6 mL/kg, Pplat ≤ 30 cmH₂O) e monitorização clínica seriada.'];

    if (po2 < 60 || so2 < 90) {
      conductParts.push('Otimizar FiO₂/PEEP para alvo SpO₂ 92–96%.');
    }
    if (k >= 6.0) {
      conductParts.push('Hipercalemia crítica: Gluconato de Cálcio 10% + medidas hipocalemiantes.');
    }
    if (lac >= 4.0 && !activeIds.includes('met_acid')) {
      conductParts.push('Lactato elevado: investigar hipoperfusão/sepse e guiar ressuscitação.');
    }

    return {
      activeIds,
      interp,
      conduct: conductParts.join(' ')
    };
  }

  function stamp(d) {
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}  ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  class SeamatySG1 {
    constructor(engine, audio, onLog) {
      this.engine = engine;
      this.audio = audio;
      this.onLog = onLog;

      this.state = 'home'; // 'home' | 'insert' | 'running' | 'result'
      this.progress = 0;
      this.result = null;
      this.selectedDiagId = null;
      this.printTimer = 0;
      this.testCount = 0;
      this.resultSig = '';
      this.diagSig = '';

      this.chassisEl = document.getElementById('sg1Chassis');
      this._bind();
      this.syncUI();
    }

    _log(msg) {
      if (typeof this.onLog === 'function') this.onLog(msg);
    }

    _click(kind) {
      if (this.audio) this.audio.playUiClick(kind);
    }

    _bind() {
      if (!this.chassisEl) return;
      this.chassisEl.addEventListener('click', (e) => {
        const diagBtn = e.target.closest('[data-sg1-diag]');
        if (diagBtn && this.state === 'result' && this.result) {
          this._click('soft');
          const clickedId = diagBtn.dataset.sg1Diag;
          this.selectedDiagId = this.selectedDiagId === clickedId ? null : clickedId;
          this.diagSig = '';
          this.syncUI();
          return;
        }
        const btn = e.target.closest('[data-sg1-action]');
        if (!btn) return;
        this._handleAction(btn.dataset.sg1Action);
      });
    }

    _handleAction(action) {
      switch (action) {
        case 'start':
          if (this.state === 'home') {
            this._click('soft');
            this.state = 'insert';
            this._log('SG1: Teste iniciado — aguardando cartucho');
          }
          break;
        case 'insert':
          if (this.state === 'insert') {
            this._click('hw');
            this.state = 'running';
            this.progress = 0;
            this.sample = this._collectSample();
            this._log('SG1: Cartucho inserido — amostra de sangue arterial em análise');
          }
          break;
        case 'print':
          if (this.state === 'result' && this.result) {
            this._click('hw');
            this.printTimer = PRINT_SEC;
            this._fillPaper();
            this._downloadPdf();
            this._log(`SG1: Impressão térmica + PDF gerado — Teste #${this.result.id} (${this.result.summary})`);
          }
          break;
        case 'newTest':
          this._click('soft');
          this.state = 'home';
          this.result = null;
          this.selectedDiagId = null;
          this.progress = 0;
          this.resultSig = '';
          this.diagSig = '';
          break;
        case 'home':
          this._click('hw');
          if (this.state !== 'home') {
            if (this.state === 'running') this._log('SG1: Análise cancelada pelo operador');
            this.state = 'home';
            this.progress = 0;
            this.resultSig = '';
            this.diagSig = '';
            this.result = null;
            this.selectedDiagId = null;
          }
          break;
        default:
          break;
      }
      this.syncUI();
    }

    resetUI() {
      this.reset();
    }

    resize() {
      this.syncUI();
    }

    render() {}

    reset() {
      this.state = 'home';
      this.progress = 0;
      this.result = null;
      this.selectedDiagId = null;
      this.printTimer = 0;
      this.resultSig = '';
      this.syncUI();
    }

    // Instantâneo fisiológico no momento da coleta
    _collectSample() {
      const e = this.engine;
      const abg = e.getABG();
      const v = e.vitals || {};
      const p = e.patient || {};
      const rhythm = (v.rhythm || e.cardiac.rhythm || 'sinus');
      const phNum = Number(abg.ph);
      const sc = e.scenarioId;

      let na = 140;
      if (sc === 'septic_shock') na = 137;
      else if (sc === 'pulmonary_edema') na = 135;
      else if (sc === 'opioid_apnea') na = 142;

      let k = 4.1 + Math.max(0, 7.4 - phNum) * 5.5 - Math.max(0, phNum - 7.45) * 3;
      if (rhythm === 'hyperkalemia') k = Math.max(k, 6.9);
      let ica = 1.17 - Math.max(0, 7.4 - phNum) * -0.9; // acidose eleva Ca ionizado
      if (phNum > 7.45) ica = 1.17 - (phNum - 7.45) * 1.6;
      let glu = sc === 'septic_shock' ? 168 : sc === 'cardiac_arrest' ? 210 : 104;
      const lacNum = Number(abg.lactate);
      const hco3 = Number(abg.hco3);
      const cl = Math.round(na - hco3 - 12 - Math.max(0, lacNum - 2) * 0.8);
      const hct = sc === 'septic_shock' ? 36 : 42;

      return {
        ph: phNum,
        pco2: Number(abg.paco2),
        po2: Number(abg.pao2),
        hco3,
        be: Number(abg.be),
        so2: Number(abg.sao2),
        na,
        k,
        cl,
        ica,
        hct,
        glu,
        lac: lacNum,
        fio2: abg.fio2Pct,
        temp: Number(p.temp || 36.7)
      };
    }

    _analyzeAcidBase(s) {
      return analyzeAcidBase(s);
    }

    _interpret(s) {
      return analyzeAcidBase(s).interp;
    }

    _buildResult(s) {
      this.testCount += 1;
      const rows = PARAMS.map(([key, label, unit, lo, hi, dec, cLo, cHi]) => {
        const val = s[key];
        let flag = '';
        if (val < lo) flag = 'L';
        else if (val > hi) flag = 'H';
        let crit = false;
        if ((cLo !== null && val < cLo) || (cHi !== null && val > cHi)) crit = true;
        return { key, label, unit, lo, hi, dec, val, flag, crit, text: Number(val).toFixed(dec) };
      });
      const abnormal = rows.filter((r) => r.flag).map((r) => `${r.label} ${r.text}${r.flag}`);
      const analysis = analyzeAcidBase(s);
      return {
        id: this.testCount,
        time: new Date(),
        rows,
        fio2: s.fio2,
        temp: s.temp,
        activeIds: analysis.activeIds,
        interp: analysis.interp,
        conduct: analysis.conduct,
        summary: abnormal.length ? abnormal.slice(0, 4).join(' • ') : 'todos os parâmetros normais'
      };
    }

    _fillPaper() {
      const body = document.getElementById('sg1PaperBody');
      const r = this.result;
      if (!body || !r) return;
      const lines = [
        `<b>SEAMATY SG1</b>`,
        `${stamp(r.time)}`,
        `Teste #${r.id} • FiO₂ ${r.fio2}%`,
        `--------------------`
      ];
      r.rows.slice(0, 6).forEach((row) => {
        lines.push(`${row.label} ${row.text}${row.flag ? ' ' + row.flag : ''}`);
      });
      lines.push(`--------------------`);
      lines.push(`<b>${r.interp}</b>`);
      lines.push(`${r.conduct}`);
      body.innerHTML = lines.map((l, i) => `<div style="--i:${i}">${l}</div>`).join('');
    }

    _pdfEsc(str) {
      const norm = String(str == null ? '' : str)
        .replace(/₂/g, '2')
        .replace(/₃/g, '3')
        .replace(/⁻/g, '-')
        .replace(/⁺/g, '+')
        .replace(/²/g, '2')
        .replace(/[•·]/g, '\x95')
        .replace(/[—–]/g, '-');
      let out = '';
      for (let i = 0; i < norm.length; i++) {
        const c = norm.charCodeAt(i);
        if (c === 40 || c === 41 || c === 92) {
          out += '\\' + norm[i];
        } else if (c >= 32 && c <= 126) {
          out += norm[i];
        } else if (c <= 255) {
          out += '\\' + c.toString(8).padStart(3, '0');
        } else {
          out += '?';
        }
      }
      return out;
    }

    buildPdfString(resObj) {
      const r = resObj || this.result || this._buildResult(this._collectSample());
      const e = this.engine || {};
      const p = e.patient || {};
      const sc = e.scenario || {};
      const patLabel = p.label || `Adulto • ${Math.round(p.weightKg || 70)} kg`;
      const scName = sc.name || 'UTI • Cuidados Intensivos';
      const ts = stamp(r.time || new Date());

      const ops = [];
      const text = (x, y, size, font, str, rgb) => {
        if (rgb) ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg`);
        ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${this._pdfEsc(str)}) Tj ET`);
      };
      const rectFill = (x, y, w, h, rgb) => {
        ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x} ${y} ${w} ${h} re f`);
      };
      const rectStroke = (x, y, w, h, rgb, lw = 1) => {
        ops.push(`${lw} w ${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${x} ${y} ${w} ${h} re S`);
      };

      // Fundo da página A4 (595 x 842 pt)
      rectFill(0, 0, 595, 842, [0.97, 0.98, 0.99]);

      // Cabeçalho Seamaty SG1
      rectFill(36, 754, 523, 56, [0.09, 0.38, 0.71]);
      text(48, 787, 13, 'F2', 'SEAMATY SG1  •  ANALISADOR DE GASES SANGUÍNEOS', [1, 1, 1]);
      text(48, 767, 8.6, 'F1', 'Point-of-Care Blood Gas, Electrolyte & Critical Care Biochemistry Report  |  V1.00.01.08', [0.86, 0.93, 1]);
      text(458, 787, 11, 'F2', `TESTE #${r.id}`, [1, 1, 1]);
      text(458, 767, 8.2, 'F3', ts, [0.9, 0.96, 1]);

      // Quadro de Identificação do Paciente e Amostra
      rectFill(36, 686, 523, 56, [1, 1, 1]);
      rectStroke(36, 686, 523, 56, [0.80, 0.85, 0.91], 1);
      text(48, 724, 9, 'F2', 'PACIENTE / LEITO:', [0.28, 0.34, 0.42]);
      text(142, 724, 9.5, 'F1', `UTI Leito 04  •  ${patLabel}`, [0.06, 0.09, 0.16]);
      text(48, 708, 9, 'F2', 'CENÁRIO CLÍNICO:', [0.28, 0.34, 0.42]);
      text(142, 708, 9.5, 'F1', scName, [0.06, 0.09, 0.16]);
      text(48, 693, 9, 'F2', 'AMOSTRA:', [0.28, 0.34, 0.42]);
      text(142, 693, 9, 'F1', 'Sangue Arterial Total (Cartucho SG1 Multiparamétrico)', [0.20, 0.25, 0.33]);

      text(370, 724, 9, 'F2', `FiO2: ${r.fio2}%`, [0.09, 0.38, 0.71]);
      text(455, 724, 9, 'F2', `Temp: ${r.temp.toFixed(1)} °C`, [0.09, 0.38, 0.71]);
      text(370, 708, 9, 'F2', 'INTERPRETAÇÃO:', [0.28, 0.34, 0.42]);
      text(370, 693, 9.5, 'F2', r.interp, [0.05, 0.46, 0.43]);

      // Tabela Principal dos 13 Parâmetros (Esquerda: 36..384)
      rectFill(36, 654, 346, 22, [0.12, 0.20, 0.32]);
      text(46, 661, 8.5, 'F2', 'PARÂMETRO', [1, 1, 1]);
      text(132, 661, 8.5, 'F2', 'VALOR', [1, 1, 1]);
      text(188, 661, 8.5, 'F2', 'UNID.', [1, 1, 1]);
      text(242, 661, 8.5, 'F2', 'REFERÊNCIA', [1, 1, 1]);
      text(318, 661, 8.5, 'F2', 'STATUS', [1, 1, 1]);

      let y = 632;
      r.rows.forEach((row, idx) => {
        const bg = row.crit
          ? [1.0, 0.91, 0.91]
          : row.flag
          ? [1.0, 0.97, 0.89]
          : idx % 2 === 0
          ? [1, 1, 1]
          : [0.95, 0.97, 0.99];
        rectFill(36, y - 5, 346, 22, bg);
        rectStroke(36, y - 5, 346, 22, [0.87, 0.90, 0.94], 0.6);

        const valColor = row.crit
          ? [0.82, 0.12, 0.15]
          : row.flag
          ? [0.78, 0.42, 0.04]
          : [0.06, 0.09, 0.16];
        const statusTxt = row.crit
          ? `CRIT (${row.flag})`
          : row.flag === 'H'
          ? 'ALTO (H)'
          : row.flag === 'L'
          ? 'BAIXO (L)'
          : 'NORMAL';

        text(46, y, 9, 'F2', row.label, [0.15, 0.20, 0.28]);
        text(132, y, 9.5, 'F3', row.text, valColor);
        text(188, y, 8, 'F1', row.unit || '-', [0.40, 0.46, 0.55]);
        text(242, y, 8, 'F3', `${Number(row.lo).toFixed(row.dec)} - ${Number(row.hi).toFixed(row.dec)}`, [0.30, 0.36, 0.45]);
        text(318, y, 8, 'F2', statusTxt, row.flag ? valColor : [0.09, 0.52, 0.26]);
        y -= 22;
      });

      // Réplica da Bobina Térmica Impressa (Direita: 394..559)
      rectFill(394, 363, 165, 313, [1, 1, 1]);
      rectStroke(394, 363, 165, 313, [0.78, 0.83, 0.89], 1);
      rectFill(394, 654, 165, 22, [0.12, 0.60, 0.63]);
      text(406, 661, 8.5, 'F2', 'BOBINA TÉRMICA SG1', [1, 1, 1]);

      const ticketLines = [
        'SEAMATY SG1 POCT',
        ts,
        `Teste #${r.id} • FiO2 ${r.fio2}%`,
        `Temp: ${r.temp.toFixed(1)} °C`,
        '----------------------',
        ...r.rows.map((row) => `${row.label.padEnd(7, ' ')} ${row.text.padStart(6, ' ')} ${row.unit.padEnd(6, ' ')}${row.flag || ' '}`),
        '----------------------',
        r.interp
      ];
      let ty = 636;
      ticketLines.forEach((tl) => {
        text(404, ty, 7.6, 'F3', tl, [0.18, 0.23, 0.30]);
        ty -= 12.5;
      });

      // Quadro de Síntese Diagnóstica & Conduta Sugerida
      const wrapPdf = (str, maxLen) => {
        const words = String(str || '').split(/\s+/);
        const lines = [];
        let cur = '';
        words.forEach((w) => {
          if (!cur) cur = w;
          else if ((cur + ' ' + w).length <= maxLen) cur += ' ' + w;
          else {
            lines.push(cur);
            cur = w;
          }
        });
        if (cur) lines.push(cur);
        return lines;
      };
      const condLines = wrapPdf(`CONDUTA SUGERIDA: ${r.conduct || ''}`, 94).slice(0, 3);
      rectFill(36, 240, 523, 108, [0.91, 0.96, 1.0]);
      rectStroke(36, 240, 523, 108, [0.58, 0.77, 0.95], 1);
      text(48, 332, 10, 'F2', `DIAGNÓSTICO ÁCIDO-BASE: ${r.interp.toUpperCase()}`, [0.05, 0.30, 0.58]);
      let cy = 313;
      condLines.forEach((cl) => {
        text(48, cy, 8.6, 'F2', cl, [0.04, 0.35, 0.42]);
        cy -= 13;
      });
      text(48, 266, 8.4, 'F1', `Alterações detectadas: ${r.summary}`, [0.12, 0.22, 0.34]);
      text(48, 250, 7.8, 'F1', 'Análise realizada por microfluídica e biossensores ópticos Seamaty SG1 • Uso educacional UTICoMed.', [0.32, 0.42, 0.52]);

      const stream = ops.join('\n');
      const objs = [
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
        '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj\n',
        '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
        '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
        '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n',
        `7 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
      ];

      let pdf = '%PDF-1.4\n';
      const offsets = [0];
      objs.forEach((o) => {
        offsets.push(pdf.length);
        pdf += o;
      });
      const xrefPos = pdf.length;
      pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
      for (let i = 1; i <= objs.length; i++) {
        pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
      }
      pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
      return pdf;
    }

    _downloadPdf() {
      if (!this.result || typeof Blob === 'undefined' || typeof URL === 'undefined') return;
      try {
        const pdfStr = this.buildPdfString(this.result);
        const bytes = new Uint8Array(pdfStr.length);
        for (let i = 0; i < pdfStr.length; i++) bytes[i] = pdfStr.charCodeAt(i) & 0xff;
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Seamaty-SG1-Laudo-Teste-${this.result.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (_) {}
    }

    step(dt) {
      if (this.state === 'running') {
        this.progress = Math.min(1, this.progress + dt / ANALYSIS_SEC);
        if (this.progress >= 1) {
          this.result = this._buildResult(this.sample || this._collectSample());
          this.selectedDiagId = null;
          this.state = 'result';
          this.resultSig = '';
          this.diagSig = '';
          this._click('powerOn');
          this._log(`SG1: Teste #${this.result.id} concluído — ${this.result.interp} | Conduta: ${this.result.conduct}`);
        }
        this.syncUI();
      } else if (this.printTimer > 0) {
        this.printTimer = Math.max(0, this.printTimer - dt);
        this.syncUI();
      }
    }

    syncUI() {
      if (!this.chassisEl) return;
      const el = this.chassisEl;
      const q = (id) => document.getElementById(id);

      el.querySelectorAll('[data-sg1-view]').forEach((v) => {
        v.classList.toggle('hidden', v.dataset.sg1View !== this.state);
      });
      el.classList.toggle('sg1-analyzing', this.state === 'running');
      el.classList.toggle('sg1-result-ready', this.state === 'result');
      el.classList.toggle('sg1-printing', this.printTimer > 0);

      const clock = q('sg1Clock');
      if (clock) {
        const now = new Date();
        const t = stamp(now);
        if (clock.textContent !== t) clock.textContent = t;
      }

      if (this.state === 'running') {
        const pct = Math.round(this.progress * 100);
        const fill = q('sg1ProgressFill');
        if (fill) fill.style.width = `${pct}%`;
        const pctEl = q('sg1ProgressPct');
        if (pctEl) pctEl.textContent = `${pct}%`;
        const phaseKey = this.progress < 0.25 ? 'heat' : this.progress < 0.55 ? 'cal' : this.progress < 0.9 ? 'measure' : 'calc';
        el.dataset.sg1Phase = phaseKey;
        const phase = phaseKey === 'heat' ? 'Aquecendo cartucho (37.0°C)…' : phaseKey === 'cal' ? 'Calibrando sensores ópticos…' : phaseKey === 'measure' ? 'Medindo gases & eletrólitos…' : 'Processando resultados…';
        const ph = q('sg1Phase');
        if (ph && ph.textContent !== phase) ph.textContent = phase;
      } else if (el.dataset.sg1Phase) {
        delete el.dataset.sg1Phase;
      }

      if (this.state === 'result' && this.result) {
        const r = this.result;
        const sig = String(r.id);
        if (this.resultSig !== sig) {
          this.resultSig = sig;
          const rowsHtml = r.rows
            .map(
              (row, idx) =>
                `<div class="sg1-row${row.flag ? ' abn' : ''}${row.crit ? ' crit' : ''}" style="--i:${idx}"><span class="sg1-r-name">${row.label}</span><span class="sg1-r-val mono">${row.text}</span><span class="sg1-r-unit">${row.unit}</span><span class="sg1-r-flag">${row.flag === 'H' ? '↑' : row.flag === 'L' ? '↓' : ''}</span></div>`
            )
            .join('');
          const list = q('sg1ResultList');
          if (list) list.innerHTML = rowsHtml;
          const meta = q('sg1ResultMeta');
          if (meta) meta.textContent = `#${r.id} • FiO₂ ${r.fio2}% • ${r.temp.toFixed(1)}°C`;
        }

        const diagSig = String(r.id);
        if (this.diagSig !== diagSig) {
          this.diagSig = diagSig;
          const interp = q('sg1Interp');
          if (interp) {
            const toneClass =
              Array.isArray(r.activeIds) && r.activeIds.length
                ? r.activeIds.some((id) => id.endsWith('acid'))
                  ? 'acid'
                  : 'alk'
                : 'norm';
            interp.innerHTML =
              `<div class="sg1-diag-line ${toneClass}"><strong>${r.interp}</strong></div>` +
              `<div class="sg1-conduct-line"><strong>Conduta:</strong> ${r.conduct}</div>`;
          }
        }
      }
    }
  }

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.SeamatySG1 = SeamatySG1;
  global.ICUSim.analyzeAcidBase = analyzeAcidBase;
  global.ICUSim.ACID_BASE_DIAGNOSES = ACID_BASE_DIAGNOSES;
})(window);
