/**
 * UTICoMed • Bedside Clinical Superpowers (bedside.js)
 * 1. POCUS Dinâmico à Beira-Leito (Pulmão BLUE, Coração, VCI & RX Tórax ao vivo)
 * 2. Modo Plantão Cego (OSCE sem spoiler com vinhetas de admissão)
 * 3. Carrinho de Parada Visual (13 ampolas EV clicáveis)
 * 4. Debriefing Clínico Inteligente (Score 0-100 + Timeline Canvas + Impressão PDF)
 */
(function (global) {
  'use strict';

  global.ICUSim = global.ICUSim || {};

  // Vinhetas clínicas sem spoiler para Modo Plantão Cego (OSCE)
  const BLIND_VIGNETTES = {
    asthma_severe: 'Jovem, 26a, dispneia intensa súbita após exposição a poeira, sibilos audíveis e fala entrecortada.',
    copd: 'Homem, 68a, tabagista 50 maços-ano, piora da dispneia há 3 dias, sonolento e com esforço expiratório.',
    ards: 'Mulher, 52a, 4º dia de internação por pneumonia grave, piora progressiva da hipoxemia apesar de O₂ alto.',
    ards_prone_severe: 'Homem, 48a, sepse pulmonar grave com infiltrado difuso bilateral e refratariedade à oxigenação.',
    septic_shock: 'Mulher, 64a, febre alta há 48h com calafrios, confusão mental, extremidades quentes e hipotensão.',
    pulmonary_edema: 'Homem, 71a, cardiopata, acordou com dispneia súbita intensa, estertores difusos e sudorese fria.',
    tension_pneumo: 'Homem, 34a, após trauma torácico fechado apresenta agitação, turgência jugular e colapso rápido.',
    cardiac_tamponade: 'Homem, 41a, ferimento penetrante precordial, bulhas abafadas, turgência jugular e hipotensão.',
    pulmonary_embolism: 'Mulher, 56a, 10º PO de artroplastia de joelho, síncope súbita seguida de dispneia grave e cianose.',
    cardiogenic_shock: 'Homem, 63a, dor torácica opressiva há 3h, extremidades frias, congestão pulmonar e hipotensão.',
    stemi_anterior: 'Homem, 58a, dor precordial típica irradiada para MSE há 50 min, sudorese profusa e náuseas.',
    opioid_overdose: 'Jovem, 29a, encontrado arresponsivo em domicílio com pupilas puntiformes e pausas respiratórias.',
    anaphylaxis: 'Mulher, 33a, minutos após contraste iodado apresenta urticária difusa, estridor e queda súbita da PA.',
    dka_acidosis: 'Jovem, 22a, náuseas, dor abdominal há 2 dias, hálito cetônico e respiração profunda e rápida.',
    hyperkalemia: 'Homem, 67a, dialítico faltou 2 sessões, fraqueza muscular ascendente e mal-estar súbito.',
    hypothermia_severe: 'Homem, 54a, resgatado após exposição prolongada ao frio, rigidez, bradicardia e rebaixamento.',
    hemorrhagic_shock: 'Homem, 31a, politraumatismo abdominal, palidez cutânea intensa, taquicardia e extremidades frias.',
    hypertensive_crisis: 'Homem, 59a, cefaleia súbita intensa, visão turva e dor torácica em emergência hipertensiva.',
    status_epilepticus: 'Homem, 42a, crises tônico-clônicas generalizadas contínuas há 18 minutos sem recuperação.',
    svt_unstable: 'Mulher, 38a, palpitações súbitas de início abrupto acompanhadas de tontura e pré-síncope.',
    wpw_preexcited: 'Jovem, 24a, palpitações aceleradas súbitas com tontura intensa; histórico de síncopes prévias.',
    torsades_qt: 'Mulher, 61a, em uso de antiarrítmico e hipomagnesemia, perde subitamente a consciência no leito.',
    vtach_pulseless: 'Homem, 65a, cardiopata isquêmico evolui subitamente com irresponsividade na sala de emergência.',
    cardiac_arrest: 'Homem, 60a, colapso súbito presenciado no pronto-socorro — paciente arresponsivo.',
    pea_arrest: 'Mulher, 72a, internada por quadro grave evolui com perda súbita de consciência e ausência de pulso.',
    tce_cushing: 'Homem, 29a, vítima de queda de altura (TCE grave), Glasgow 6, anisocoria e alteração pressórica.',
    neurogenic_shock: 'Homem, 35a, mergulho em águas rasas com trauma cervical alto, tetraplegia e hipotensão.',
    betablocker_od: 'Mulher, 44a, ingestão intencional de grande quantidade de anti-hipertensivos há 2 horas, letárgica.',
    thyroid_storm: 'Mulher, 37a, agitação extrema, febre muito alta, sudorese profusa e palpitações após suspensão medicamentosa.',
    myasthenic_crisis: 'Mulher, 46a, doença neuromuscular prévia, ptose, voz anasalada e queda progressiva do esforço respiratório.',
    myxedema_coma: 'Idosa, 78a, sonolência progressiva no inverno, edema difuso, pele fria e bradipneia.',
    adrenal_crisis: 'Mulher, 49a, fadiga extrema, vômitos, dor abdominal e choque que responde pouco à reposição inicial.',
    hhs_hyperosmolar: 'Idoso, 74a, poliúria há 1 semana, desidratação profunda, confusão mental e hipotensão.',
    pheochromocytoma_crisis: 'Homem, 45a, crises paroxísticas de cefaleia, sudorese, palpitações e pico pressórico extremo.',
    eclampsia_hellp: 'Gestante, 32 sem, cefaleia frontal intensa, escotomas, epigastralgia e convulsão tônico-clônica.',
    postpartum_hemorrhage: 'Puérpera, 28a, 40 min pós-parto vaginal, sangramento volumoso, palidez intensa e rebaixamento.',
    amniotic_embolism: 'Gestante em trabalho de parto apresenta dispneia súbita catastrófica, cianose e colapso hemodinâmico.',
    peripartum_cardiomyopathy: 'Puérpera, 31a, 5 dias pós-parto, ortopneia progressiva, estertores bilaterais e hipotensão.'
  };

  // Código visual hospitalar das ampolas do Carrinho de Parada
  const AMP_STYLES = {
    adrenalina_bolus: { col: '#dc2626', tag: 'PCR / Choque', dose: '1 mg EV' },
    amiodarona_bolus: { col: '#e11d48', tag: 'Antiarrítmico', dose: '300 mg EV' },
    adenosina: { col: '#7c3aed', tag: 'TPSV (Não WPW!)', dose: '6 mg rápido' },
    atropina: { col: '#ea580c', tag: 'Bradicardia', dose: '1 mg EV' },
    sulfato_magnesio: { col: '#ca8a04', tag: 'Torsades/Eclâmpsia', dose: '2 g EV' },
    gluconato_calcio: { col: '#d97706', tag: 'HiperK⁺ / Intox BB', dose: '10 mL 10%' },
    bicarbonato: { col: '#0284c7', tag: 'Acidose / HiperK⁺', dose: '100 mEq' },
    naloxona: { col: '#0891b2', tag: 'Antídoto Opioide', dose: '0.4 mg EV' },
    furosemida: { col: '#2563eb', tag: 'Diurético EAP', dose: '40–80 mg' },
    nitroglicerina: { col: '#0d9488', tag: 'Vasodilatador', dose: 'Bolus EV' },
    salbutamol_mgso4: { col: '#16a34a', tag: 'Broncoespasmo', dose: 'Inal + Mg' },
    etomidato_sri: { col: '#475569', tag: 'SRI Cardioestável', dose: '0.3 mg/kg' },
    cetamina_sri: { col: '#64748b', tag: 'SRI Broncodilat.', dose: '1.5 mg/kg' }
  };

  function initBedsideTools(ctx) {
    const { engine, audio, SCENARIOS, BOLUS_DRUGS, addLog, refreshScenarioUI, syncAirwayO2AndPharmaUI, syncPhysiologyModalInputs, syncRhythmUI, resetEquipmentOnScenarioChange } = ctx;
    if (!engine) return;

    // ===================== 1. MONITORAMENTO DE DEBRIEFING (0-100) =====================
    const session = {
      scenarioId: engine.scenarioId,
      startTime: Date.now(),
      samples: [], // { t, map, spo2, ph, risk }
      actions: [], // { t, text, kind: 'good'|'bad'|'info' }
      mistakes: new Set(),
      wins: new Set(),
      hadArrestAfterStart: false,
      startedArrested: Boolean(engine.patient.arrested),
      pplatViolations: 0,
      sampleAcc: 0
    };

    const fmtElapsed = (sec) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const resetSession = () => {
      session.scenarioId = engine.scenarioId;
      session.startTime = Date.now();
      session.samples = [];
      session.actions = [];
      session.mistakes.clear();
      session.wins.clear();
      session.startedArrested = Boolean(engine.patient.arrested);
      session.hadArrestAfterStart = false;
      session.pplatViolations = 0;
      session.sampleAcc = 0;
    };

    // Intercepta logs do motor para alimentar automaticamente a timeline e detectar acertos/erros!
    const origOnLog = engine.onLog;
    engine.onLog = (msg) => {
      if (typeof origOnLog === 'function') origOnLog(msg);
      const t = (Date.now() - session.startTime) / 1000;
      const text = String(msg || '');
      let kind = 'info';
      if (/SUCESSO:|RCE ALCANÇADO|CARDIOVERSÃO|revertida para ritmo sinusal|descomprimido|estabilizada/i.test(text)) {
        kind = 'good';
        session.wins.add(text.slice(0, 88));
      } else if (/CONTRAINDICAÇÃO|PERIGO CLÁSSICO|FENÔMENO R-SOBRE-T|ALERTA MIASTENIA|hipovolêmico\/hipotenso|TACO|PARADA CARDÍACA INICIADA/i.test(text)) {
        kind = 'bad';
        session.mistakes.add(text.slice(0, 96));
        if (/PARADA CARDÍACA INICIADA/i.test(text)) session.hadArrestAfterStart = true;
      }
      if (session.actions.length < 60) {
        session.actions.push({ t, text, kind });
      }
    };

    // Detecta troca de cenário e amostra sinais vitais a cada 2 s
    let lastScId = engine.scenarioId;
    setInterval(() => {
      if (engine.scenarioId !== lastScId) {
        lastScId = engine.scenarioId;
        resetSession();
        if (blindActive) updateBlindBanner();
      }
      const t = (Date.now() - session.startTime) / 1000;
      const v = engine.vitals;
      const b = engine.breath;
      const risk = (engine.deterioration && engine.deterioration.risk) || 0;
      session.samples.push({ t, map: Math.round(v.map), spo2: Math.round(v.spo2), ph: Number(v.ph.toFixed(2)), risk: Math.round(risk) });
      if (session.samples.length > 180) session.samples.shift();
      if (engine.airway.connectedToVent && b.lastPlatPaw > 30) session.pplatViolations += 1;
      if (v.spo2 >= 92 && v.map >= 65 && risk < 25 && engine.scenarioId !== 'stable' && t >= 15) {
        session.wins.add('Estabilização hemodinâmica e oxigenação atingidas (SpO₂ ≥ 92% • PAM ≥ 65)');
      }
      if (engine.airway.connectedToVent && (b.lastPlatPaw - engine.vent.peepSet) <= 15 && b.lastPlatPaw <= 30 && t >= 12) {
        session.wins.add('Ventilação protetora mantida (Pplat ≤ 30 • Driving Pressure ≤ 15)');
      }
      if (!pocusBackdrop.classList.contains('hidden')) updatePocusReport();
    }, 2000);

    const computeScore = () => {
      let score = 68;
      const v = engine.vitals;
      const risk = (engine.deterioration && engine.deterioration.risk) || 0;
      score += Math.min(28, session.wins.size * 9);
      if (v.spo2 >= 92) score += 6;
      if (v.map >= 65) score += 6;
      if (risk < 20) score += 6;
      if (engine.interventions.roscAchieved) score += 12;
      score -= session.mistakes.size * 18;
      if (session.hadArrestAfterStart && !engine.interventions.roscAchieved) score -= 22;
      if (session.pplatViolations >= 4) {
        score -= 10;
        session.mistakes.add('Ventilação lesiva sustentada (Pplatô > 30 cmH₂O)');
      }
      if (engine.patient.arrested && !engine.interventions.roscAchieved && !session.startedArrested) score = Math.min(score, 35);
      return Math.max(0, Math.min(100, Math.round(score)));
    };

    // ===================== 2. MODO PLANTÃO CEGO (OSCE SEM SPOILER) =====================
    let blindActive = false;
    const btnBlindCase = document.getElementById('btnBlindCase');
    const blindBar = document.getElementById('blindCaseBanner');

    const updateBlindBanner = () => {
      if (!blindBar) return;
      const vig = BLIND_VIGNETTES[engine.scenarioId] || 'Paciente admitido em sala vermelha com descompensação clínica aguda. Avalie monitor, POCUS e gasometria.';
      const txtEl = document.getElementById('blindVignetteText');
      if (txtEl) txtEl.textContent = vig;
    };

    const setBlindMode = (on, pickRandom = false) => {
      blindActive = Boolean(on);
      document.body.classList.toggle('blind-case-mode', blindActive);
      if (btnBlindCase) {
        btnBlindCase.classList.toggle('active', blindActive);
        btnBlindCase.setAttribute('aria-pressed', String(blindActive));
      }
      if (blindBar) blindBar.classList.toggle('hidden', !blindActive);
      if (blindActive && pickRandom) {
        const pool = Object.keys(BLIND_VIGNETTES).filter((id) => SCENARIOS[id] && id !== engine.scenarioId);
        const picked = pool[Math.floor(Math.random() * pool.length)] || 'tension_pneumo';
        engine.loadScenario(picked);
        resetEquipmentOnScenarioChange();
        refreshScenarioUI();
        resetSession();
      }
      if (blindActive) {
        updateBlindBanner();
        addLog('🎭 MODO PLANTÃO CEGO ATIVADO — Diagnóstico oculto! Use Monitor, POCUS e Seamaty SG1.');
      }
    };

    if (btnBlindCase) {
      btnBlindCase.addEventListener('click', () => {
        audio.playUiClick('hw');
        setBlindMode(!blindActive, !blindActive);
      });
    }
    const btnBlindNext = document.getElementById('btnBlindNext');
    if (btnBlindNext) btnBlindNext.addEventListener('click', () => { audio.playUiClick('hw'); setBlindMode(true, true); });
    const btnBlindReveal = document.getElementById('btnBlindReveal');
    if (btnBlindReveal) {
      btnBlindReveal.addEventListener('click', () => {
        audio.playUiClick('hw');
        setBlindMode(false, false);
        openDebriefModal();
      });
    }

    // ===================== 3. POCUS DINÂMICO & RX TÓRAX AO VIVO =====================
    const pocusBackdrop = document.getElementById('modalPocus');
    const pocusCanvas = document.getElementById('pocusCanvas');
    const pocusCtx = pocusCanvas ? pocusCanvas.getContext('2d') : null;
    let pocusView = 'lung'; // 'lung' | 'heart' | 'ivc' | 'cxr'
    let pocusRaf = null;
    let pocusPhase = 0;

    const getPocusFindings = () => {
      const p = engine.patient;
      const c = engine.cardiac;
      const scId = engine.scenarioId;
      const tamponade = scId === 'cardiac_tamponade' && !engine.interventions.pericardiocentesisDone;
      const rvStrain = (scId === 'pulmonary_embolism' && !engine.interventions.thrombolysisGiven) || scId === 'amniotic_embolism';
      const hypovolemic = (c.preload + (engine.interventions.fluidBoost || 0)) < 0.72;
      const congested = p.shunt >= 0.22 && !p.pneumothoraxActive;
      const lowEf = c.contractility <= 0.60;
      const arrested = p.arrested && !engine.interventions.roscAchieved;

      if (pocusView === 'lung') {
        if (p.pneumothoraxActive) return { tag: 'CRÍTICO', cls: 'crit', text: 'Ausência de Lung Sliding + Sinal da Estratosfera + Ponto Pulmonar à direita — altamente sugestivo de Pneumotórax!' };
        if (congested) return { tag: 'CONGESTÃO', cls: 'warn', text: `Múltiplas Linhas B coalescentes (cauda de cometa, shunt ${Math.round(p.shunt * 100)}%) — síndrome interstício-alveolar (EAP / SDRA).` };
        return { tag: 'PERFIL A', cls: 'ok', text: 'Lung Sliding presente bilateralmente com Linhas A horizontais preservadas (pulmão aerado).' };
      }
      if (pocusView === 'heart') {
        if (arrested) return { tag: 'PCR', cls: 'crit', text: c.rhythm === 'vf' || c.rhythm === 'torsades' ? 'Fibrilação caótica sem contração coordenada (sem débito efetivo).' : 'Standstill cardíaco — ausência completa de contração mecânica efetiva!' };
        if (tamponade) return { tag: 'TAMPONAMENTO', cls: 'crit', text: 'Volumoso derrame pericárdico anecoico circunferencial com colapso diastólico de VD ("swinging heart")!' };
        if (rvStrain) return { tag: 'SOBRECARGA VD', cls: 'crit', text: 'VD acentuadamente dilatado (VD > VE) com retificação septal em "D" — hipertensão pulmonar aguda / sobrecarga de VD!' };
        if (lowEf) return { tag: 'HIPOCINESIA', cls: 'warn', text: `Disfunção sistólica acentuada do VE (contratilidade ${Math.round(c.contractility * 100)}%) com baixo débito cardíaco.` };
        if (hypovolemic) return { tag: 'HIPERDINÂMICO', cls: 'warn', text: 'Ventrículo esquerdo hiperdinâmico com quase colabamento sistólico ("kissing walls") — déficit de pré-carga!' };
        return { tag: 'NORMAL', cls: 'ok', text: 'Contratilidade biventricular preservada, câmaras simétricas e pericárdio livre de derrame.' };
      }
      if (pocusView === 'ivc') {
        if (tamponade || c.preload >= 1.12) return { tag: 'TÚRGIDA', cls: 'warn', text: 'VCI dilatada (2,4 cm) com colapsabilidade inspiratória < 10% — pressão de enchimento elevada (evitar sobrecarga volêmica).' };
        if (hypovolemic) return { tag: 'COLABANDO', cls: 'crit', text: 'VCI fina (0,9 cm) com colapso inspiratório > 65% — hipovolemia importante, provável fluido-responsividade!' };
        return { tag: 'NORMAL', cls: 'ok', text: 'VCI com calibre normal (1,7 cm) e variabilidade respiratória fisiológica (~30%).' };
      }
      // RX Tórax
      const totStr = engine.airway.connectedToVent ? ' TOT bem posicionado 3 cm acima da carina.' : ' Sem tubo endotraqueal.';
      if (p.pneumothoraxActive) return { tag: 'PNEUMOTÓRAX', cls: 'crit', text: 'Hipertransparência em hemitórax direito, linha pleural visceral retraída e desvio contralateral do mediastino!' + totStr };
      if (congested) return { tag: 'INFILTRADO', cls: 'warn', text: 'Opacidades alveolares bilaterais difusas (padrão asa de borboleta / vidro fosco) + linhas B de Kerley.' + totStr };
      if (lowEf) return { tag: 'CARDIOMEGALIA', cls: 'warn', text: 'Índice cardiotorácico aumentado (> 0,55) com cefalização de trama vascular pulmonar.' + totStr };
      return { tag: 'LIMPO', cls: 'ok', text: 'Campos pleuropulmonares transparentes, seios costofrênicos livres e área cardíaca normal.' + totStr };
    };

    const updatePocusReport = () => {
      const f = getPocusFindings();
      const badge = document.getElementById('pocusFindingBadge');
      const txt = document.getElementById('pocusFindingText');
      if (badge) { badge.textContent = f.tag; badge.className = `pocus-badge ${f.cls}`; }
      if (txt) txt.textContent = f.text;
    };

    const drawPocusFrame = (now) => {
      if (!pocusCtx || !pocusCanvas || pocusBackdrop.classList.contains('hidden')) {
        pocusRaf = null;
        return;
      }
      pocusPhase = now * 0.001;
      const w = pocusCanvas.width;
      const h = pocusCanvas.height;
      const p = engine.patient;
      const c = engine.cardiac;
      const vit = engine.vitals;
      const scId = engine.scenarioId;

      pocusCtx.fillStyle = '#05080c';
      pocusCtx.fillRect(0, 0, w, h);

      if (pocusView === 'cxr') {
        // RX de Tórax Dinâmico (Leito UTI)
        pocusCtx.fillStyle = '#0d131a';
        pocusCtx.fillRect(0, 0, w, h);
        const shift = p.pneumothoraxActive ? -18 : 0;
        const congested = p.shunt >= 0.22 && !p.pneumothoraxActive;
        const cardio = c.contractility <= 0.60 ? 1.24 : 1.0;

        // Costelas sutis
        pocusCtx.strokeStyle = 'rgba(203, 213, 225, 0.18)';
        pocusCtx.lineWidth = 6;
        for (let r = 0; r < 6; r++) {
          const y = 44 + r * 28;
          pocusCtx.beginPath();
          pocusCtx.ellipse(w / 2, y, 130 + r * 6, 16, 0, Math.PI, Math.PI * 2);
          pocusCtx.stroke();
        }
        // Campos pulmonares
        const breathExp = 1 + Math.min(0.06, (engine.breath.volumeL || 0) * 0.1);
        // Pulmão direito (lado esquerdo da imagem RX)
        pocusCtx.save();
        pocusCtx.fillStyle = p.pneumothoraxActive ? '#020406' : (congested ? 'rgba(186,210,230,0.45)' : 'rgba(22,34,48,0.85)');
        pocusCtx.beginPath();
        pocusCtx.ellipse(w / 2 - 68, h / 2 + 6, 56 * breathExp, 86 * breathExp, -0.06, 0, Math.PI * 2);
        pocusCtx.fill();
        if (p.pneumothoraxActive) {
          // Linha de colapso pleural visceral
          pocusCtx.strokeStyle = '#cbd5e1';
          pocusCtx.lineWidth = 2;
          pocusCtx.beginPath();
          pocusCtx.ellipse(w / 2 - 42, h / 2 + 12, 24, 44, 0, 0, Math.PI * 2);
          pocusCtx.stroke();
          pocusCtx.fillStyle = '#f87171';
          pocusCtx.font = 'bold 11px monospace';
          pocusCtx.fillText('AR PLEURAL', w / 2 - 118, h / 2 - 20);
        }
        // Pulmão esquerdo
        pocusCtx.fillStyle = congested ? 'rgba(186,210,230,0.48)' : 'rgba(22,34,48,0.85)';
        pocusCtx.beginPath();
        pocusCtx.ellipse(w / 2 + 68, h / 2 + 6, 56 * breathExp, 86 * breathExp, 0.06, 0, Math.PI * 2);
        pocusCtx.fill();
        // Infiltrado alveolar bilateral (EAP/SDRA)
        if (congested) {
          const alpha = Math.min(0.65, p.shunt * 1.4);
          pocusCtx.fillStyle = `rgba(226, 232, 240, ${alpha.toFixed(2)})`;
          for (let i = 0; i < 18; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const bx = w / 2 + side * (42 + (i * 19) % 58);
            const by = 82 + ((i * 37) % 115);
            pocusCtx.beginPath(); pocusCtx.arc(bx, by, 14 + (i % 4) * 5, 0, Math.PI * 2); pocusCtx.fill();
          }
        }
        // Coluna & Mediastino + Silhueta cardíaca
        pocusCtx.fillStyle = 'rgba(226, 232, 240, 0.62)';
        pocusCtx.fillRect(w / 2 - 14 + shift * 0.4, 24, 28, h - 42);
        pocusCtx.fillStyle = 'rgba(241, 245, 249, 0.78)';
        pocusCtx.beginPath();
        pocusCtx.ellipse(w / 2 + 18 + shift, h / 2 + 34, 42 * cardio, 48 * cardio, -0.25, 0, Math.PI * 2);
        pocusCtx.fill();
        // Tubo Endotraqueal (TOT) se intubado
        if (engine.airway.connectedToVent) {
          pocusCtx.strokeStyle = '#38bdf8';
          pocusCtx.lineWidth = 3;
          pocusCtx.setLineDash([5, 3]);
          pocusCtx.beginPath();
          pocusCtx.moveTo(w / 2 + shift * 0.3, 12);
          pocusCtx.lineTo(w / 2 + shift * 0.3, 98);
          pocusCtx.stroke();
          pocusCtx.setLineDash([]);
          pocusCtx.fillStyle = '#38bdf8';
          pocusCtx.font = 'bold 10px monospace';
          pocusCtx.fillText('TOT ✓', w / 2 + 12 + shift * 0.3, 74);
        }
        pocusCtx.fillStyle = '#94a3b8';
        pocusCtx.font = 'bold 11px monospace';
        pocusCtx.fillText('AP LEITO • UTI', 12, 20);
        pocusCtx.fillText('D', 14, h - 12);
        pocusCtx.fillText('E', w - 24, h - 12);
        pocusCtx.restore();
      } else {
        // Setor Ecográfico (POCUS B-Mode)
        pocusCtx.save();
        pocusCtx.beginPath();
        pocusCtx.moveTo(w / 2, 10);
        pocusCtx.arc(w / 2, 10, h - 16, Math.PI * 0.22, Math.PI * 0.78);
        pocusCtx.closePath();
        pocusCtx.clip();

        // Fundo ecográfico com textura sutil de speckle
        const grad = pocusCtx.createRadialGradient(w / 2, 18, 12, w / 2, 18, h);
        grad.addColorStop(0, '#1e293b');
        grad.addColorStop(0.5, '#0f172a');
        grad.addColorStop(1, '#020617');
        pocusCtx.fillStyle = grad;
        pocusCtx.fillRect(0, 0, w, h);

        if (pocusView === 'lung') {
          const sliding = !p.pneumothoraxActive;
          const bCount = (!p.pneumothoraxActive && p.shunt >= 0.22) ? Math.min(7, Math.round(p.shunt * 18)) : 0;
          // Sombras de costelas
          pocusCtx.fillStyle = '#020408';
          pocusCtx.fillRect(w * 0.23, 52, 26, h);
          pocusCtx.fillRect(w * 0.72, 52, 26, h);
          // Linha pleural hiperecóica
          const jitter = sliding ? Math.sin(pocusPhase * 12) * 3.5 : 0;
          pocusCtx.strokeStyle = '#f8fafc';
          pocusCtx.lineWidth = 4;
          pocusCtx.beginPath();
          pocusCtx.moveTo(w * 0.30, 68);
          pocusCtx.lineTo(w * 0.72, 68);
          pocusCtx.stroke();
          // Cintilância de lung sliding
          if (sliding) {
            pocusCtx.fillStyle = 'rgba(255,255,255,0.75)';
            for (let s = 0; s < 10; s++) {
              const sx = w * 0.32 + ((s * 23 + pocusPhase * 34) % (w * 0.38));
              pocusCtx.fillRect(sx, 66 + (jitter * 0.2), 5, 3);
            }
          }
          if (bCount > 0) {
            // Linhas B verticais em cauda de cometa
            for (let bi = 0; bi < bCount; bi++) {
              const bx = w * 0.33 + (bi / Math.max(1, bCount - 1)) * (w * 0.36) + Math.sin(pocusPhase * 2.2 + bi) * 5;
              const bg = pocusCtx.createLinearGradient(bx, 68, bx, h);
              bg.addColorStop(0, 'rgba(241,245,249,0.92)');
              bg.addColorStop(1, 'rgba(148,163,184,0.18)');
              pocusCtx.strokeStyle = bg;
              pocusCtx.lineWidth = 7;
              pocusCtx.beginPath(); pocusCtx.moveTo(bx, 68); pocusCtx.lineTo(bx + (bx - w / 2) * 0.35, h); pocusCtx.stroke();
            }
          } else {
            // Linhas A horizontais reverberantes
            pocusCtx.strokeStyle = 'rgba(226,232,240,0.42)';
            pocusCtx.lineWidth = 2.5;
            for (let a = 1; a <= 3; a++) {
              const ay = 68 + a * 44;
              pocusCtx.beginPath(); pocusCtx.moveTo(w * 0.30, ay); pocusCtx.lineTo(w * 0.72, ay); pocusCtx.stroke();
            }
            if (p.pneumothoraxActive) {
              // Ponto pulmonar oscilante na margem
              const lpX = w * 0.48 + Math.sin(pocusPhase * 2.5) * 18;
              pocusCtx.strokeStyle = '#ef4444';
              pocusCtx.lineWidth = 2;
              pocusCtx.setLineDash([4, 3]);
              pocusCtx.beginPath(); pocusCtx.moveTo(lpX, 66); pocusCtx.lineTo(lpX, h); pocusCtx.stroke();
              pocusCtx.setLineDash([]);
            }
          }
        } else if (pocusView === 'heart') {
          const tamponade = scId === 'cardiac_tamponade' && !engine.interventions.pericardiocentesisDone;
          const rvStrain = (scId === 'pulmonary_embolism' && !engine.interventions.thrombolysisGiven) || scId === 'amniotic_embolism';
          const arrested = p.arrested && !engine.interventions.roscAchieved;
          const hrFreq = arrested ? 0 : Math.max(0.6, vit.hr / 60);
          const contract = arrested
            ? (c.rhythm === 'vf' || c.rhythm === 'torsades' ? Math.sin(pocusPhase * 34) * 0.03 : 0)
            : Math.max(0.04, c.contractility * 0.24) * Math.pow(Math.max(0, Math.sin(pocusPhase * Math.PI * 2 * hrFreq)), 2);

          const cx = w / 2, cy = h * 0.56;
          // Derrame pericárdico anecoico (preto) no Tamponamento
          if (tamponade) {
            pocusCtx.fillStyle = '#000000';
            pocusCtx.beginPath(); pocusCtx.ellipse(cx, cy, 86, 68, 0, 0, Math.PI * 2); pocusCtx.fill();
            pocusCtx.strokeStyle = '#e2e8f0'; pocusCtx.lineWidth = 3;
            pocusCtx.stroke();
          }
          // Miocárdio (parede)
          const rOuterX = (tamponade ? 62 : 76) * (1 - contract * 0.55);
          const rOuterY = (tamponade ? 50 : 60) * (1 - contract * 0.55);
          pocusCtx.fillStyle = '#64748b';
          pocusCtx.beginPath(); pocusCtx.ellipse(cx, cy, rOuterX, rOuterY, -0.15, 0, Math.PI * 2); pocusCtx.fill();

          // Cavidade VE (esquerda) e VD (direita/anterior)
          const lvRx = (rvStrain ? 18 : 28) * (1 - contract);
          const rvRx = (rvStrain ? 34 : 20) * (tamponade ? (0.45 + contract) : (1 - contract * 0.7));
          pocusCtx.fillStyle = '#04070b';
          pocusCtx.beginPath(); pocusCtx.ellipse(cx - 18, cy + 4, Math.max(6, lvRx), Math.max(8, rOuterY * 0.55), 0, 0, Math.PI * 2); pocusCtx.fill();
          pocusCtx.beginPath(); pocusCtx.ellipse(cx + 22, cy - 4, Math.max(5, rvRx), Math.max(7, rOuterY * 0.48), 0, 0, Math.PI * 2); pocusCtx.fill();
        } else if (pocusView === 'ivc') {
          const tamponade = scId === 'cardiac_tamponade' && !engine.interventions.pericardiocentesisDone;
          const preload = c.preload + (engine.interventions.fluidBoost || 0);
          const baseDiam = tamponade || preload >= 1.12 ? 42 : preload < 0.72 ? 20 : 30;
          const collapse = tamponade || preload >= 1.12 ? 0.08 : preload < 0.72 ? 0.68 : 0.32;
          const resp = (Math.sin(pocusPhase * 2.1) + 1) * 0.5;
          const diam = baseDiam * (1 - collapse * resp);
          // Parênquima hepático ecogênico
          pocusCtx.fillStyle = '#334155';
          pocusCtx.fillRect(0, 48, w, h - 48);
          // Lúmen da VCI anecoico
          pocusCtx.fillStyle = '#020408';
          pocusCtx.fillRect(w * 0.16, h * 0.55 - diam / 2, w * 0.68, diam);
          pocusCtx.strokeStyle = '#cbd5e1';
          pocusCtx.lineWidth = 2.5;
          pocusCtx.beginPath();
          pocusCtx.moveTo(w * 0.16, h * 0.55 - diam / 2); pocusCtx.lineTo(w * 0.84, h * 0.55 - diam / 2);
          pocusCtx.moveTo(w * 0.16, h * 0.55 + diam / 2); pocusCtx.lineTo(w * 0.84, h * 0.55 + diam / 2);
          pocusCtx.stroke();
        }
        pocusCtx.restore();

        // Escala de profundidade lateral
        pocusCtx.fillStyle = '#94a3b8';
        pocusCtx.font = 'bold 10px monospace';
        pocusCtx.fillText(pocusView === 'lung' ? 'LINEAR 10 MHz' : 'SETORIAL 3.5 MHz', 12, 18);
        for (let cm = 1; cm <= 4; cm++) {
          pocusCtx.fillText(`${cm * 4}cm`, w - 34, 24 + cm * 48);
        }
      }

      pocusRaf = requestAnimationFrame(drawPocusFrame);
    };

    const openPocus = () => {
      if (!pocusBackdrop) return;
      pocusBackdrop.classList.remove('hidden');
      updatePocusReport();
      if (!pocusRaf) pocusRaf = requestAnimationFrame(drawPocusFrame);
    };

    const btnPocus = document.getElementById('btnPocus');
    if (btnPocus) btnPocus.addEventListener('click', () => { audio.playUiClick('soft'); openPocus(); });
    if (pocusBackdrop) {
      pocusBackdrop.querySelectorAll('[data-pocus-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
          audio.playUiClick('soft');
          pocusView = btn.dataset.pocusView;
          pocusBackdrop.querySelectorAll('[data-pocus-view]').forEach((b) => b.classList.toggle('active', b === btn));
          updatePocusReport();
        });
      });
    }

    // ===================== 4. CARRINHO DE PARADA VISUAL (CRASH CART) =====================
    const cartBackdrop = document.getElementById('modalCrashCart');
    const cartGrid = document.getElementById('crashCartGrid');
    const ampCounts = {};

    const renderCrashCart = () => {
      if (!cartGrid || !Array.isArray(BOLUS_DRUGS)) return;
      cartGrid.innerHTML = BOLUS_DRUGS.map((d) => {
        const st = AMP_STYLES[d.id] || { col: '#0284c7', tag: 'Emergência', dose: 'EV' };
        const cnt = ampCounts[d.id] || 0;
        return `
          <button type="button" class="amp-card" data-amp-id="${d.id}" style="--amp-col:${st.col}" title="${d.name} — ${d.role}">
            <span class="amp-badge ${cnt ? '' : 'hidden'}" data-amp-cnt="${d.id}">${cnt}</span>
            <span class="amp-vial" aria-hidden="true"><i></i></span>
            <strong>${d.name.split(' ')[0]}</strong>
            <small class="mono">${st.dose}</small>
            <em>${st.tag}</em>
          </button>`;
      }).join('');
    };

    if (cartGrid) {
      renderCrashCart();
      cartGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-amp-id]');
        if (!btn) return;
        const id = btn.dataset.ampId;
        audio.playUiClick('hw');
        engine.administerBolusDrug(id);
        ampCounts[id] = (ampCounts[id] || 0) + 1;
        const b = btn.querySelector(`[data-amp-cnt="${id}"]`);
        if (b) { b.textContent = ampCounts[id]; b.classList.remove('hidden'); }
        btn.classList.add('just-given');
        setTimeout(() => btn.classList.remove('just-given'), 420);
        syncPhysiologyModalInputs();
        syncRhythmUI();
        syncAirwayO2AndPharmaUI();
      });
    }
    const btnCrashCart = document.getElementById('btnCrashCart');
    if (btnCrashCart && cartBackdrop) {
      btnCrashCart.addEventListener('click', () => {
        audio.playUiClick('soft');
        cartBackdrop.classList.remove('hidden');
      });
    }

    // ===================== 5. DEBRIEFING CLÍNICO (SCORE 0-100 + TIMELINE) =====================
    const debriefBackdrop = document.getElementById('modalDebrief');

    const drawDebriefChart = () => {
      const cv = document.getElementById('debriefCanvas');
      if (!cv) return;
      const c2 = cv.getContext('2d');
      const w = cv.width, h = cv.height;
      c2.fillStyle = '#09111a';
      c2.fillRect(0, 0, w, h);
      c2.strokeStyle = 'rgba(148,163,184,0.15)';
      c2.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        c2.beginPath(); c2.moveTo(0, (h / 4) * i); c2.lineTo(w, (h / 4) * i); c2.stroke();
      }
      const pts = session.samples;
      if (pts.length < 2) {
        c2.fillStyle = '#94a3b8';
        c2.font = '12px monospace';
        c2.fillText('Aguardando dados fisiológicos (simule por alguns segundos)...', 16, h / 2);
        return;
      }
      const plot = (getter, maxV, color) => {
        c2.beginPath();
        pts.forEach((pt, idx) => {
          const x = (idx / (pts.length - 1)) * (w - 16) + 8;
          const y = h - 10 - (Math.max(0, Math.min(maxV, getter(pt))) / maxV) * (h - 22);
          if (idx === 0) c2.moveTo(x, y); else c2.lineTo(x, y);
        });
        c2.strokeStyle = color;
        c2.lineWidth = 2.2;
        c2.stroke();
      };
      plot((pt) => pt.spo2, 100, '#22d3ee');
      plot((pt) => pt.map, 140, '#f87171');
      plot((pt) => pt.risk, 100, '#facc15');
    };

    const openDebriefModal = () => {
      if (!debriefBackdrop) return;
      const sc = SCENARIOS[engine.scenarioId] || engine.scenario;
      const score = computeScore();
      const grade = score >= 85 ? 'EXCELÊNCIA UTI' : score >= 68 ? 'CONDUTA SEGURA' : score >= 48 ? 'ATENÇÃO CLÍNICA' : 'CRÍTICO — REVISAR';
      const gradeCls = score >= 85 ? 'ok' : score >= 68 ? 'good' : score >= 48 ? 'warn' : 'crit';

      const scoreEl = document.getElementById('debriefScoreVal');
      const gradeEl = document.getElementById('debriefGrade');
      const caseEl = document.getElementById('debriefCaseName');
      const guidEl = document.getElementById('debriefGuidance');
      const winsEl = document.getElementById('debriefWins');
      const missEl = document.getElementById('debriefMistakes');
      const tlEl = document.getElementById('debriefTimeline');

      if (scoreEl) { scoreEl.textContent = `${score}`; scoreEl.className = `debrief-score mono ${gradeCls}`; }
      if (gradeEl) { gradeEl.textContent = grade; gradeEl.className = `pocus-badge ${gradeCls}`; }
      if (caseEl) caseEl.textContent = sc ? `${sc.name} (${sc.severityLabel})` : engine.scenarioId;
      if (guidEl) guidEl.textContent = sc ? sc.guidance : '';

      if (winsEl) {
        winsEl.innerHTML = session.wins.size
          ? [...session.wins].map((w) => `<li>✓ ${w}</li>`).join('')
          : '<li>Nenhum marco de estabilização concluído ainda.</li>';
      }
      if (missEl) {
        missEl.innerHTML = session.mistakes.size
          ? [...session.mistakes].map((m) => `<li>✕ ${m}</li>`).join('')
          : '<li class="ok">✓ Nenhum erro crítico ou contraindicação detectada!</li>';
      }
      if (tlEl) {
        tlEl.innerHTML = session.actions.length
          ? session.actions.slice(-14).map((a) => `<li class="${a.kind}"><b>${fmtElapsed(a.t)}</b> ${a.text}</li>`).join('')
          : '<li>Nenhuma intervenção registrada neste caso ainda.</li>';
      }

      debriefBackdrop.classList.remove('hidden');
      drawDebriefChart();
    };

    const btnDebrief = document.getElementById('btnDebrief');
    if (btnDebrief) btnDebrief.addEventListener('click', () => { audio.playUiClick('soft'); openDebriefModal(); });
    const btnPrintDebrief = document.getElementById('btnPrintDebrief');
    if (btnPrintDebrief) btnPrintDebrief.addEventListener('click', () => window.print());
  }

  global.ICUSim.initBedsideTools = initBedsideTools;
})(window);
