/**
 * Apresentação de Slides Interativa: Sequência Rápida de Intubação (SRI) & Modos Ventilatórios
 * Tela inicial do UTI Sim, com widgets interativos e integração direta com o simulador ao vivo.
 */
(function (global) {
  'use strict';

  const SEVEN_PS = [
    {
      step: '1. Preparação',
      time: '-10 min',
      title: 'SOAPME + Acesso + Plano B',
      checklist: [
        'Suction (aspirador testado), Oxigênio (bolsa-válvula-máscara + PEEP), Airway (laringoscópio/videolaringoscópio + lâminas + tubo + bougie).',
        'Monitorização completa (ECG, SpO₂, PNI/PAI, Capnografia) e 2 acessos venosos pérvios.',
        'Avaliar via aérea difícil (LEMON) e deixar dispositivo supraglótico / cricotireoidostomia à mão.'
      ],
      pearl: 'Dica: Sempre tenha droga vasoativa (Noradrenalina ou Fenilefrina push-dose) preparada antes de induzir paciente instável.'
    },
    {
      step: '2. Pré-oxigenação',
      time: '-5 min',
      title: 'Desnitrogenação da CRF',
      checklist: [
        'Substituir o nitrogênio alveolar por O₂ a 100% por 3–5 minutos (ou 8 respirações vitais profundas).',
        'Em hipoxêmicos/shunt (SDRA/EAP), usar VNI ou BVM com válvula de PEEP (5–10 cmH₂O) com cabeceira elevada 30°.',
        'Associar cateter nasal a 15 L/min durante a laringoscopia (oxigenação apneica).'
      ],
      pearl: 'Meta: Elevar a reserva alveolar de O₂ para prolongar o tempo de apneia segura (SpO₂ > 90%).'
    },
    {
      step: '3. Pré-tratamento',
      time: '-3 min',
      title: 'Otimização Fisiológica Pré-IOT',
      checklist: [
        'Ressuscitação antes da intubação: corrigir hipotensão (SF/Noradrenalina) e hipoxemia antes de paralisar ("Resuscitate before you intubate").',
        'Fentanil (1–3 µg/kg lento) apenas em casos selecionados (TCE/dissecção aórtica/isquemia) — evitar em choque!',
        'Lidocaína/Atropina não são mais recomendadas de rotina.'
      ],
      pearl: 'Atenção: Hipotensão peri-intubação é uma das maiores causas de PCR na emergência.'
    },
    {
      step: '4. Paralisia c/ Indução',
      time: '0 min',
      title: 'Indutor + BNM em Sequência Rápida',
      checklist: [
        'Administrar indutor EV em bolus rápido seguido IMEDIATAMENTE pelo bloqueador neuromuscular (BNM).',
        'Não ventilar com pressão positiva entre indução e laringoscopia (risco de insuflação gástrica), exceto se dessaturação crítica.',
        'Aguardar tempo de ação do BNM (Succinilcolina 45s • Rocurônio 45–60s).'
      ],
      pearl: 'Regra de ouro: Nunca administre BNM sem antes garantir sedação/hipnose adequada!'
    },
    {
      step: '5. Posicionamento',
      time: '+30 s',
      title: 'Alinhamento dos 3 Eixos',
      checklist: [
        'Posição olfativa ("sniffing position"): flexão cervical inferior + extensão atlanto-occipital.',
        'Alinhar meato acústico externo com a fúrcula esternal (em obesos, usar rampa de coxins!).',
        'Manobra BURP (pressão laríngea externa bimanual) se visualização Cormack-Lehane III.'
      ],
      pearl: 'A posição em rampa em obesos melhora tanto a laringoscopia quanto a complacência torácica.'
    },
    {
      step: '6. Passagem do Tubo',
      time: '+45 s',
      title: 'Laringoscopia & Confirmação',
      checklist: [
        'Visualizar pregas vocais e passar o tubo sob visão direta; insuflar o cuff (20–30 cmH₂O).',
        'Confirmação PADRÃO-OURO: Capnografia em onda contínua (EtCO₂ presente por ≥ 6 incursões).',
        'Ausculta em 5 pontos (epigástrio primeiro, depois bases e ápices) para descartar intubação seletiva.'
      ],
      pearl: 'Se não houver curva de EtCO₂ após 5–6 ventilações (fora de PCR), assuma intubação esofágica até prova em contrário!'
    },
    {
      step: '7. Pós-Intubação',
      time: '+1 min',
      title: 'Sedoanalgesia & Ajuste Protetor',
      checklist: [
        'Fixar o TOT (geralmente 21–23 cm na comissura labial) e solicitar Rx de tórax.',
        'Iniciar sedação e analgesia contínuas imediatamente (especialmente após Rocurônio, cujo efeito dura 40–60 min!).',
        'Conectar ao ventilador mecânico com parâmetros protetores (Vt 6 mL/kg PBW, PEEP adequada, Driving Pressure < 15).'
      ],
      pearl: 'Após a IOT, monitorize PAI/PNI imediatamente: a queda da pressão intratorácica positiva + drogas pode causar hipotensão.'
    }
  ];

  const QUIZ_QUESTIONS = [
    {
      q: '1. Paciente de 70 kg chega em choque séptico (PA 72/40 mmHg, FC 128 bpm) necessitando de SRI. Qual a melhor escolha de indutor?',
      options: [
        'Propofol 2 mg/kg EV em bolus',
        'Cetamina 1,5 mg/kg ou Etomidato 0,3 mg/kg (após otimizar volume/vasopressor)',
        'Midazolam 0,3 mg/kg associado a Fentanil 3 µg/kg'
      ],
      correct: 1,
      feedback:
        'Correto! Cetamina e Etomidato são hemodinamicamente neutros. Propofol e doses altas de Midazolam/Fentanil causam vasodilatação grave e podem precipitar PCR no choque.'
    },
    {
      q: '2. Logo após intubar um paciente asmático em VCV, o ventilador alarma: Ppico = 44 cmH₂O. Ao realizar Pausa Inspiratória, você mede Pplatô = 17 cmH₂O (PEEP = 5). Qual a interpretação?',
      options: [
        'Complacência pulmonar gravemente reduzida (SDRA/EAP)',
        'Aumento importante da resistência de vias aéreas (broncoespasmo/secreção/TOT dobrado)',
        'Pneumotórax hipertensivo com perda de elasticidade alveolar'
      ],
      correct: 1,
      feedback:
        'Exato! O gradiente Ppico − Pplatô é de 27 cmH₂O (normal < 5). Ppico alta com Pplatô baixa aponta para problema resistivo (vias aéreas), não alveolar.'
    },
    {
      q: '3. Na SDRA grave, você ajusta VCV com Vt 420 mL (6 mL/kg PBW), PEEP 12 cmH₂O e mede Pplatô = 29 cmH₂O. Qual a Driving Pressure (ΔP) e ela está protetora?',
      options: [
        'ΔP = 17 cmH₂O — ainda elevada (risco de lesão pulmonar; alvo < 15)',
        'ΔP = 29 cmH₂O — normal pois Pplatô < 30',
        'ΔP = 12 cmH₂O — totalmente protetora'
      ],
      correct: 0,
      feedback:
        'Perfeito! ΔP = Pplatô − PEEP = 29 − 12 = 17 cmH₂O. Embora Pplatô esteja < 30, uma Driving Pressure ≥ 15 cmH₂O aumenta mortalidade na SDRA — deve-se reduzir ainda mais o Vt ou otimizar a PEEP.'
    }
  ];

  const PROTECTIVE_PILLARS = [
    {
      title: '1. Volume Corrente (Vt) Baixo',
      target: '4–8 mL/kg PBW (alvo 6 mL/kg)',
      why: 'Calculado pelo Peso Predito (altura e sexo), nunca pelo peso real. Previne volutrauma e hiperdistensão alveolar.'
    },
    {
      title: '2. Pressão de Platô (Pplatô)',
      target: '≤ 30 cmH₂O',
      why: 'Medida em pausa inspiratória (sem fluxo). Reflete a pressão alveolar máxima no fim da inspiração.'
    },
    {
      title: '3. Driving Pressure (ΔP)',
      target: '< 15 cmH₂O (Pplatô − PEEP)',
      why: 'Principal preditor de sobrevida na SDRA: relaciona o Vt à complacência real do pulmão aerado ("baby lung").'
    },
    {
      title: '4. PEEP & Oxigenação Segura',
      target: 'SpO₂ 92–96% (DPOC: 88–92%)',
      why: 'PEEP evita abertura/colapso cíclico (atelectrauma). Evitar hiperóxia (SpO₂ 100% com FiO₂ alta) e queda de PA.'
    },
    {
      title: '5. Mecânica Expiratória',
      target: 'Auto-PEEP = 0 • pH ≥ 7,20',
      why: 'Garantir que o fluxo expiratório zere antes do próximo ciclo; tolerar hipercapnia permissiva na SDRA, exceto no TCE.'
    }
  ];

  const PROTECTIVE_PROTOCOLS = [
    {
      id: 'stable',
      name: 'Pulmão Normal / Pós-Operatório',
      severity: 'LEVE',
      sevClass: 'stable',
      mode: 'VCV ou PCV (desmame em PSV)',
      vt: '6–8 mL/kg PBW',
      peep: '5 cmH₂O',
      frIe: '12–16 irpm • I:E 1:2',
      pressures: 'Pplatô ≤ 25 • ΔP < 12 cmH₂O',
      gasTargets: 'SpO₂ 94–98% • PaCO₂ 35–45 mmHg',
      indications:
        'Pós-operatório imediato, intoxicação leve ou proteção de via aérea sem lesão parenquimatosa. Usar Vt pelo PBW já previne lesão pulmonar induzida por ventilação (VILI).'
    },
    {
      id: 'ards',
      name: 'SDRA Moderada a Grave',
      severity: 'GRAVE',
      sevClass: 'severe',
      mode: 'VCV (ou PCV com vigilância de Vt)',
      vt: '4–6 mL/kg PBW (iniciar 6; reduzir se ΔP ≥ 15)',
      peep: '10–16 cmH₂O (titular pela PEEP/FiO₂ e ΔP)',
      frIe: '18–28 irpm (máx ~35) • I:E 1:1.5 a 1:2',
      pressures: 'Pplatô ≤ 30 • ΔP < 15 cmH₂O (OBRIGATÓRIO)',
      gasTargets: 'SpO₂ 90–94% • Hipercapnia permissiva (pH ≥ 7,20)',
      indications:
        'Pulmão rígido (Crs baixa) e shunt elevado. Reduzir Vt até atingir ΔP < 15 cmH₂O; se P/F < 150 persistir, considerar bloqueio neuromuscular precoce e posição prona (16h/dia).'
    },
    {
      id: 'asthma',
      name: 'Asma / DPOC Exacerbado (Obstrutivo)',
      severity: 'MODERADO-GRAVE',
      sevClass: 'moderate',
      mode: 'VCV (fluxo alto 60–80 L/min) ou PCV',
      vt: '6 mL/kg PBW',
      peep: 'Asma: 3–5 cmH₂O • DPOC: ~80% da Auto-PEEP',
      frIe: 'FR BAIXA 8–12 irpm • I:E 1:3 a 1:4 (Te longo!)',
      pressures: 'Pplatô ≤ 30 cmH₂O (tolerar Ppico alta se Pplatô segura)',
      gasTargets: 'SpO₂ 88–92% (DPOC) / 92–95% (Asma) • pH ≥ 7,20',
      indications:
        'O objetivo é esvaziar o pulmão e evitar aprisionamento aéreo (Auto-PEEP) + barotrauma/choque. Nunca aumente FR para corrigir PaCO₂ se o fluxo expiratório não estiver zerando!'
    },
    {
      id: 'septic_shock',
      name: 'Choque Séptico / Instabilidade Hemodinâmica',
      severity: 'GRAVE',
      sevClass: 'severe',
      mode: 'VCV ou PCV protetor',
      vt: '6 mL/kg PBW',
      peep: '5–8 cmH₂O (evitar PEEP excessiva sem volemia!)',
      frIe: '16–24 irpm (compensar acidose metabólica)',
      pressures: 'Pplatô ≤ 28–30 • ΔP < 14 cmH₂O',
      gasTargets: 'SpO₂ 92–96% • PAM ≥ 65 mmHg (Nora + Volume)',
      indications:
        'Pressão intratorácica alta reduz o retorno venoso e agrava a hipotensão. Equilibrar FR para lavar CO₂ da acidose láctica sem gerar Auto-PEEP, associando Noradrenalina e cristaloides.'
    },
    {
      id: 'pulmonary_edema',
      name: 'Edema Agudo de Pulmão (EAP Cardiogênico)',
      severity: 'GRAVE',
      sevClass: 'severe',
      mode: 'PCV ou PSV/CPAP (se cooperativo)',
      vt: '6 mL/kg PBW',
      peep: '8–14 cmH₂O (efeito hemodinâmico benéfico!)',
      frIe: '16–22 irpm • I:E 1:2',
      pressures: 'Pplatô ≤ 30 • ΔP < 15 cmH₂O',
      gasTargets: 'SpO₂ 92–96% • Reduzir pré/pós-carga VE',
      indications:
        'No EAP, a PEEP elevada recruta alvéolos alagados, reduz retorno venoso excessivo e diminui a pós-carga do VE (melhorando a congestão rapidamente). Evitar bolus desnecessário de volume.'
    },
    {
      id: 'opioid_apnea',
      name: 'TCE Grave / Hipertensão Intracraniana',
      severity: 'CRÍTICO',
      sevClass: 'critical',
      mode: 'VCV ou PCV controlado (NÃO deixar em PSV se apneia)',
      vt: '6–7 mL/kg PBW',
      peep: '5–8 cmH₂O (evitar PEEP muito alta que dificulte drenagem venosa)',
      frIe: '14–18 irpm • Normocapnia estrita',
      pressures: 'Pplatô ≤ 28 • ΔP < 14 cmH₂O',
      gasTargets: 'SpO₂ ≥ 95% • PaCO₂ ESTRITA 35–40 mmHg',
      indications:
        'Hipercapnia causa vasodilatação cerebral e eleva a PIC; hipocapnia excessiva (< 30) causa vasoconstrição e isquemia. Jamais aplicar hipercapnia permissiva sem monitorização de PIC.'
    },
    {
      id: 'pneumothorax',
      name: 'Pneumotórax Hipertensivo',
      severity: 'EMERGÊNCIA CRÍTICA',
      sevClass: 'critical',
      mode: 'Descompressão IMEDIATA antes de escalonar pressão',
      vt: '4–6 mL/kg PBW após drenagem',
      peep: '0–5 cmH₂O (NÃO subir PEEP antes de drenar!)',
      frIe: '12–16 irpm • Baixa pressão média de via aérea',
      pressures: 'Reduzir Ppico / Pplatô imediatamente via toracocentese',
      gasTargets: 'Restaurar PAM e SpO₂ após descompressão torácica',
      indications:
        'Aumentar PEEP ou Vt em pneumotórax hipertensivo piora o colapso pulmonar e o choque obstrutivo. Descomprima o tórax imediatamente e depois reajuste para ventilação protetora.'
    }
  ];

  class SlidePresentation {
    constructor(onLaunchSimulator) {
      this.onLaunchSimulator = onLaunchSimulator;
      this.currentSlide = 0;
      this.totalSlides = 10;

      // Estados internos dos widgets interativos dos slides
      this.activePIndex = 0;
      this.preoxMethod = 'vni';
      this.preoxProfile = 'critical';
      this.drugWeight = 70;
      this.drugContext = 'shock';
      this.mechComp = 60;
      this.mechRes = 6;
      this.compareMode = 'VCV';
      this.activeProtIndex = 1; // SDRA destaque inicial
      this.quizAnswers = {};

      this.stageEl = document.getElementById('slideStage');
      this.navPillsEl = document.getElementById('presNavPills');
      this.counterEl = document.getElementById('presCounter');
      this.progressEl = document.getElementById('presProgressFill');
      this.moduleBadgeEl = document.getElementById('presModuleBadge');
      this.btnPrev = document.getElementById('btnPrevSlide');
      this.btnNext = document.getElementById('btnNextSlide');
      if (!this.stageEl || !this.navPillsEl) return;

      this._buildSlideTitles();
      this._bindGlobalNav();
      this.goTo(0);
    }

    _buildSlideTitles() {
      this.slideMeta = [
        { short: '1. Início', module: 'VISÃO GERAL' },
        { short: '2. Os 7 Ps da SRI', module: 'BLOCO I • SRI' },
        { short: '3. Pré-Oxigenação', module: 'BLOCO I • SRI' },
        { short: '4. Drogas & Doses', module: 'BLOCO I • SRI' },
        { short: '5. Pós-Intubação', module: 'BLOCO I • SRI' },
        { short: '6. Mecânica (Ppico×Pplatô)', module: 'BLOCO II • VENTILAÇÃO' },
        { short: '7. VCV vs PCV', module: 'BLOCO II • VENTILAÇÃO' },
        { short: '8. PSV & Proteção', module: 'BLOCO II • VENTILAÇÃO' },
        { short: '9. Protetora × Patologias', module: 'BLOCO II • INDICAÇÕES' },
        { short: '10. Quiz & Simulador', module: 'PRÁTICA AO VIVO' }
      ];

      this.navPillsEl.innerHTML = this.slideMeta
        .map(
          (m, idx) =>
            `<button class="pres-pill" data-slide="${idx}">${m.short}</button>`
        )
        .join('');

      this.navPillsEl.querySelectorAll('.pres-pill').forEach((btn) => {
        btn.addEventListener('click', () => this.goTo(Number(btn.dataset.slide)));
      });
    }

    _bindGlobalNav() {
      this.btnPrev.addEventListener('click', () => {
        if (this.currentSlide > 0) this.goTo(this.currentSlide - 1);
      });

      this.btnNext.addEventListener('click', () => {
        if (this.currentSlide < this.totalSlides - 1) {
          this.goTo(this.currentSlide + 1);
        } else {
          this.onLaunchSimulator('stable');
        }
      });

      document.getElementById('btnLaunchSimulatorTop').addEventListener('click', () => {
        this.onLaunchSimulator('stable');
      });

      document.addEventListener('keydown', (e) => {
        const presVisible = !document.getElementById('presentationApp').classList.contains('hidden');
        if (!presVisible) return;
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        if (e.key === 'ArrowRight') {
          if (this.currentSlide < this.totalSlides - 1) this.goTo(this.currentSlide + 1);
        } else if (e.key === 'ArrowLeft') {
          if (this.currentSlide > 0) this.goTo(this.currentSlide - 1);
        }
      });
    }

    goTo(index) {
      this.currentSlide = Math.max(0, Math.min(this.totalSlides - 1, index));
      const meta = this.slideMeta[this.currentSlide];

      this.counterEl.textContent = `Slide ${this.currentSlide + 1} / ${this.totalSlides}`;
      this.progressEl.style.width = `${((this.currentSlide + 1) / this.totalSlides) * 100}%`;
      this.moduleBadgeEl.textContent = meta.module;

      this.navPillsEl.querySelectorAll('.pres-pill').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === this.currentSlide);
      });

      this.btnPrev.disabled = this.currentSlide === 0;
      if (this.currentSlide === this.totalSlides - 1) {
        this.btnNext.textContent = '🚀 Abrir Simulador Ao Vivo';
        this.btnNext.classList.add('launch');
      } else {
        this.btnNext.textContent = 'Próximo →';
        this.btnNext.classList.remove('launch');
      }

      this._renderCurrentSlide();
    }

    _renderCurrentSlide() {
      const renderers = [
        () => this._renderSlide1(),
        () => this._renderSlide2(),
        () => this._renderSlide3(),
        () => this._renderSlide4(),
        () => this._renderSlide5(),
        () => this._renderSlide6(),
        () => this._renderSlide7(),
        () => this._renderSlide8(),
        () => this._renderSlide9(),
        () => this._renderSlide10()
      ];
      this.stageEl.innerHTML = renderers[this.currentSlide]();
      this._bindSlideInteractions();
    }

    // ================= SLIDE 1: CAPA =================
    _renderSlide1() {
      return `
        <div class="slide-card hero-slide">
          <div class="hero-tag">TREINAMENTO INTERATIVO DE VIA AÉREA &amp; TERAPIA INTENSIVA</div>
          <h2 class="hero-title">Sequência Rápida de Intubação (SRI)<br/>&amp; Modos Ventilatórios na UTI</h2>
          <p class="hero-lead">
            Explore os fundamentos da intubação segura, calcule doses em tempo real, compreenda a mecânica pulmonar e depois assuma o controle do <strong>Monitor Multiparamétrico</strong> e do <strong>Ventilador Mecânico</strong> acoplados em múltiplos cenários de gravidade.
          </p>

          <div class="hero-blocks">
            <div class="block-card" data-jump="1" role="button" tabindex="0">
              <span class="block-num">BLOCO I • SLIDES 2–5</span>
              <h3>Sequência Rápida de Intubação</h3>
              <ul>
                <li>Os 7 Ps interativos com tempos e checklists</li>
                <li>Fisiologia da Pré-Oxigenação &amp; Curva de Apneia</li>
                <li>Calculadora de Indutores e BNM por peso e gravidade</li>
                <li>Confirmação por Capnografia e pós-IOT</li>
              </ul>
              <span class="block-cta">Explorar Bloco I →</span>
            </div>

            <div class="block-card cyan" data-jump="5" role="button" tabindex="0">
              <span class="block-num">BLOCO II • SLIDES 6–8</span>
              <h3>Mecânica &amp; Modos Ventilatórios</h3>
              <ul>
                <li>Equação do Movimento: Ppico vs Pplatô ao vivo</li>
                <li>VCV vs PCV: o que é controlado e o que varia</li>
                <li>PSV (Espontâneo), Trigger, ETS e Alarme de Apneia</li>
                <li>Estratégia Protetora e Driving Pressure (&lt; 15)</li>
              </ul>
              <span class="block-cta">Explorar Bloco II →</span>
            </div>
          </div>

          <div class="hero-actions">
            <button class="pres-cta-btn primary" data-jump="1">▶ Iniciar Apresentação Guiada</button>
            <button class="pres-cta-btn secondary" data-launch="stable">⚡ Ir Direto ao Simulador de UTI</button>
          </div>
        </div>
      `;
    }

    // ================= SLIDE 2: OS 7 Ps DA SRI =================
    _renderSlide2() {
      const p = SEVEN_PS[this.activePIndex];
      return `
        <div class="slide-card">
          <div class="slide-head">
            <div>
              <span class="slide-kicker">BLOCO I • SEQUÊNCIA RÁPIDA DE INTUBAÇÃO</span>
              <h2>Os 7 Ps da SRI — Linha do Tempo Interativa</h2>
            </div>
            <span class="slide-hint">Clique em cada etapa abaixo para inspecionar</span>
          </div>

          <div class="seven-p-timeline">
            ${SEVEN_PS.map(
              (item, idx) => `
              <button class="p-step-btn ${idx === this.activePIndex ? 'active' : ''}" data-p="${idx}">
                <span class="p-time mono">${item.time}</span>
                <span class="p-name">${item.step}</span>
              </button>
            `
            ).join('')}
          </div>

          <div class="p-detail-panel">
            <div class="p-detail-head">
              <span class="p-badge mono">${p.time}</span>
              <h3>${p.step} — ${p.title}</h3>
            </div>
            <ul class="p-checklist">
              ${p.checklist.map((c) => `<li>${c}</li>`).join('')}
            </ul>
            <div class="clinical-pearl">💡 ${p.pearl}</div>
          </div>
        </div>
      `;
    }

    // ================= SLIDE 3: PRÉ-OXIGENAÇÃO =================
    _renderSlide3() {
      return `
        <div class="slide-card">
          <div class="slide-head">
            <div>
              <span class="slide-kicker">BLOCO I • DESNITROGENAÇÃO</span>
              <h2>Pré-Oxigenação &amp; Tempo de Apneia Segura</h2>
            </div>
            <span class="slide-hint">Simule a queda da SpO₂ após indução + bloqueio</span>
          </div>

          <div class="two-col-widget">
            <div class="widget-controls-box">
              <h3>Configure o Cenário de Pré-Oxigenação:</h3>
              <div class="seg-group">
                <span class="seg-label">Perfil do Paciente:</span>
                <div class="seg-btns">
                  <button class="seg-btn ${this.preoxProfile === 'healthy' ? 'active' : ''}" data-preox-prof="healthy">Adulto Saudável (70 kg)</button>
                  <button class="seg-btn ${this.preoxProfile === 'obese' ? 'active' : ''}" data-preox-prof="obese">Obeso / Gestante</button>
                  <button class="seg-btn ${this.preoxProfile === 'critical' ? 'active' : ''}" data-preox-prof="critical">Crítico / SDRA / Sepse</button>
                </div>
              </div>

              <div class="seg-group">
                <span class="seg-label">Dispositivo Utilizado (3–5 min):</span>
                <div class="seg-btns">
                  <button class="seg-btn ${this.preoxMethod === 'room' ? 'active' : ''}" data-preox-meth="room">Sem Pré-O₂ (Ar Ambiente)</button>
                  <button class="seg-btn ${this.preoxMethod === 'nrb' ? 'active' : ''}" data-preox-meth="nrb">Máscara Não Reinalante</button>
                  <button class="seg-btn ${this.preoxMethod === 'vni' ? 'active' : ''}" data-preox-meth="vni">VNI / PEEP + O₂ Apneico</button>
                </div>
              </div>

              <div class="preox-summary" id="preoxSummary"></div>
            </div>

            <div class="widget-canvas-box">
              <div class="canvas-title">Curva Simulada de Dessaturação na Apneia (SpO₂ × Tempo)</div>
              <canvas id="canvasSlidePreox" class="slide-canvas"></canvas>
            </div>
          </div>
        </div>
      `;
    }

    // ================= SLIDE 4: DROGAS & CALCULADORA =================
    _renderSlide4() {
      return `
        <div class="slide-card">
          <div class="slide-head">
            <div>
              <span class="slide-kicker">BLOCO I • FARMACOLOGIA NA SRI</span>
              <h2>Indutores &amp; BNM — Calculadora Clínica Interativa</h2>
            </div>
            <span class="slide-hint">Ajuste peso e perfil para calcular doses e escolher o agente</span>
          </div>

          <div class="dose-toolbar">
            <label class="weight-control">
              <span>Peso Estimado: <strong id="lblSlideWeight" class="mono">${this.drugWeight} kg</strong></span>
              <input type="range" id="rangeSlideWeight" min="40" max="130" step="1" value="${this.drugWeight}" />
            </label>

            <div class="context-pills">
              <button class="seg-btn ${this.drugContext === 'stable' ? 'active' : ''}" data-drug-ctx="stable">Estável</button>
              <button class="seg-btn ${this.drugContext === 'shock' ? 'active' : ''}" data-drug-ctx="shock">Hipotenso / Choque</button>
              <button class="seg-btn ${this.drugContext === 'asthma' ? 'active' : ''}" data-drug-ctx="asthma">Broncoespasmo / Asma</button>
              <button class="seg-btn ${this.drugContext === 'tce' ? 'active' : ''}" data-drug-ctx="tce">TCE / Hipertensão Intracraniana</button>
            </div>
          </div>

          <div class="drugs-grid" id="drugsGrid"></div>
        </div>
      `;
    }

    // ================= SLIDE 5: PÓS-INTUBAÇÃO =================
    _renderSlide5() {
      return `
        <div class="slide-card">
          <div class="slide-head">
            <div>
              <span class="slide-kicker">BLOCO I • PÓS-PASSAGEM DO TUBO</span>
              <h2>Confirmação, Sedoanalgesia &amp; Acoplamento ao Ventilador</h2>
            </div>
          </div>

          <div class="three-col-cards">
            <div class="info-tile green">
              <div class="tile-badge">1. CONFIRMAÇÃO</div>
              <h3>Capnografia em Onda (EtCO₂)</h3>
              <p>É o método mais confiável de posicionamento traqueal. A presença de platô expiratório regular por ≥ 6 respirações confirma o tubo na traqueia.</p>
              <div class="tile-alert">Atenção: Na PCR, o EtCO₂ fica muito baixo (&lt; 10 mmHg), mas ainda apresenta onda durante RCP!</div>
            </div>

            <div class="info-tile amber">
              <div class="tile-badge">2. PÓS-BLOQUEIO</div>
              <h3>Sedoanalgesia Imediata</h3>
              <p>O Rocurônio paralisa por 40–60 min, enquanto o Etomidato dura apenas 5–10 min. Nunca deixe um paciente curarizado acordado!</p>
              <div class="tile-alert">Inicie Fentanil + Propofol / Midazolam / Cetamina em bomba contínua e monitore a PA.</div>
            </div>

            <div class="info-tile cyan">
              <div class="tile-badge">3. VENTILAÇÃO INICIAL</div>
              <h3>Ajustes Seguros Iniciais</h3>
              <ul class="compact-list">
                <li><strong>Vt:</strong> 6 mL/kg de Peso Predito (PBW)</li>
                <li><strong>PEEP:</strong> 5 cmH₂O (titular se hipoxemia)</li>
                <li><strong>FR:</strong> 12–16 irpm (ou maior se acidose)</li>
                <li><strong>FiO₂:</strong> 100% inicial → titular para SpO₂ 92–96%</li>
              </ul>
            </div>
          </div>

          <div class="slide-action-banner">
            <div>
              <strong>Prática Sugerida:</strong> Veja o que acontece quando um paciente com depressão respiratória/TCE (sem drive) é deixado em modo espontâneo (PSV) vs controlado!
            </div>
            <button class="pres-cta-btn primary" data-launch="opioid_apnea">🧪 Testar Caso TCE / Apneia no Simulador →</button>
          </div>
        </div>
      `;
    }

    // ================= SLIDE 6: MECÂNICA PULMONAR =================
    _renderSlide6() {
      return `
        <div class="slide-card">
          <div class="slide-head">
            <div>
              <span class="slide-kicker">BLOCO II • EQUAÇÃO DO MOVIMENTO</span>
              <h2>Mecânica Pulmonar: Ppico vs Pplatô ao Vivo</h2>
            </div>
            <span class="slide-hint">Mova os sliders para ver o efeito na curva de Pressão (VCV c/ Pausa)</span>
          </div>

          <div class="two-col-widget">
            <div class="widget-controls-box">
              <div class="equation-box mono">
                Paw = <span class="eq-el">V / Crs</span> + <span class="eq-res">Raw × Fluxo</span> + PEEP
              </div>

              <label class="mech-slider">
                <span>Complacência (Crs): <strong id="lblMechComp" class="mono">${this.mechComp} mL/cmH₂O</strong></span>
                <input type="range" id="rangeMechComp" min="15" max="80" step="1" value="${this.mechComp}" />
                <small>Baixa na SDRA, EAP, Pneumotórax → eleva <strong>Ppico E Pplatô</strong></small>
              </label>

              <label class="mech-slider">
                <span>Resistência (Raw): <strong id="lblMechRes" class="mono">${this.mechRes} cmH₂O/L/s</strong></span>
                <input type="range" id="rangeMechRes" min="4" max="32" step="1" value="${this.mechRes}" />
                <small>Alta na Asma, DPOC, Secreção → eleva <strong>APENAS Ppico</strong> (Ppico − Pplatô &gt; 5)</small>
              </label>

              <div class="mech-presets">
                <button class="seg-btn" data-mech-preset="normal">Normal (60 / 6)</button>
                <button class="seg-btn" data-mech-preset="asthma">Asma (54 / 26)</button>
                <button class="seg-btn" data-mech-preset="ards">SDRA (22 / 11)</button>
              </div>

              <div class="mech-diagnosis" id="mechDiagnosis"></div>
            </div>

            <div class="widget-canvas-box">
              <div class="canvas-title">Curva de Pressão (Paw) com Pausa Inspiratória (Vt 450 mL • PEEP 5)</div>
              <canvas id="canvasSlideMech" class="slide-canvas"></canvas>
            </div>
          </div>
        </div>
      `;
    }

    // ================= SLIDE 7: VCV vs PCV =================
    _renderSlide7() {
      const isVcv = this.compareMode === 'VCV';
      return `
        <div class="slide-card">
          <div class="slide-head">
            <div>
              <span class="slide-kicker">BLOCO II • MODOS CONTROLADOS</span>
              <h2>VCV vs PCV — Comparação Interativa</h2>
            </div>
            <div class="seg-btns">
              <button class="seg-btn ${isVcv ? 'active' : ''}" data-cmp="VCV">Destacar VCV</button>
              <button class="seg-btn ${!isVcv ? 'active' : ''}" data-cmp="PCV">Destacar PCV</button>
            </div>
          </div>

          <div class="compare-grid">
            <div class="compare-col ${isVcv ? 'highlighted' : ''}">
              <div class="cmp-header">
                <span class="mode-pill vcv">VCV</span>
                <h3>Ventilação Controlada a Volume</h3>
              </div>
              <ul class="cmp-list">
                <li><strong>Você ajusta (Fixo):</strong> Volume Corrente (Vt), Fluxo, FR, PEEP, FiO₂.</li>
                <li><strong>O que varia:</strong> <span class="warn-txt">Pressão de Pico e Platô</span> (se o pulmão enrijecer ou broncoespamar, a pressão dispara!).</li>
                <li><strong>Onda de Fluxo:</strong> Quadrada (constante).</li>
                <li><strong>Onda de Pressão:</strong> Ascendente até Ppico (e cai para Pplatô na pausa).</li>
                <li><strong>Melhor uso:</strong> Controle rigoroso de Vt protetor (SDRA) e PaCO₂ (TCE), medição direta de Pplatô.</li>
              </ul>
              <button class="pres-cta-btn small" data-launch="ards">Simular VCV na SDRA Grave →</button>
            </div>

            <div class="compare-col ${!isVcv ? 'highlighted' : ''}">
              <div class="cmp-header">
                <span class="mode-pill pcv">PCV</span>
                <h3>Ventilação Controlada a Pressão</h3>
              </div>
              <ul class="cmp-list">
                <li><strong>Você ajusta (Fixo):</strong> Pressão Controlada (ΔP), Tempo Insp (Ti), FR, PEEP, FiO₂.</li>
                <li><strong>O que varia:</strong> <span class="warn-txt">Volume Corrente (Vt)</span> (se a resistência subir ou complacência cair, o Vt cai e há risco de hipoventilação!).</li>
                <li><strong>Onda de Fluxo:</strong> Desacelerada (pico inicial e queda exponencial).</li>
                <li><strong>Onda de Pressão:</strong> Quadrada (limitada a PEEP + ΔP).</li>
                <li><strong>Melhor uso:</strong> Maior conforto, limite seguro de pressão de pico, recrutamento contínuo durante Ti.</li>
              </ul>
              <button class="pres-cta-btn small" data-launch="pulmonary_edema">Simular PCV no Edema Agudo →</button>
            </div>
          </div>
        </div>
      `;
    }

    // ================= SLIDE 8: PSV & VENTILAÇÃO PROTETORA =================
    _renderSlide8() {
      return `
        <div class="slide-card">
          <div class="slide-head">
            <div>
              <span class="slide-kicker">BLOCO II • MODO ESPONTÂNEO &amp; METAS NA UTI</span>
              <h2>PSV (Pressão de Suporte) &amp; Metas de Proteção Pulmonar</h2>
            </div>
          </div>

          <div class="two-col-equal">
            <div class="psv-box">
              <h3>Como funciona o modo PSV (Desmame)?</h3>
              <div class="psv-steps">
                <div class="psv-step">
                  <span class="psv-num">1</span>
                  <div>
                    <strong>Disparo (Trigger):</strong> O <em>paciente</em> inicia o ciclo (queda leve de pressão ou fluxo). Se não houver drive respiratório, o ventilador aciona <strong>Alarme de Apneia + Backup</strong>!
                  </div>
                </div>
                <div class="psv-step">
                  <span class="psv-num">2</span>
                  <div>
                    <strong>Limite:</strong> O ventilador entrega Pressão de Suporte (PS) constante acima da PEEP, reduzindo o trabalho respiratório.
                  </div>
                </div>
                <div class="psv-step">
                  <span class="psv-num">3</span>
                  <div>
                    <strong>Ciclagem a Fluxo (ETS):</strong> A inspiração termina quando o fluxo cai para <strong>25%</strong> (ou 35–40% em DPOC) do pico de fluxo inspiratório.
                  </div>
                </div>
              </div>
            </div>

            <div class="targets-box">
              <h3>Checklist de Ventilação Protetora</h3>
              <div class="target-grid">
                <div class="target-item">
                  <span class="t-val mono">4–8 mL/kg</span>
                  <span class="t-lbl">Vt pelo Peso Predito (PBW)</span>
                </div>
                <div class="target-item">
                  <span class="t-val mono">≤ 30 cmH₂O</span>
                  <span class="t-lbl">Pressão de Platô (Pplatô)</span>
                </div>
                <div class="target-item highlight">
                  <span class="t-val mono">&lt; 15 cmH₂O</span>
                  <span class="t-lbl">Driving Pressure (Pplatô − PEEP)</span>
                </div>
                <div class="target-item">
                  <span class="t-val mono">92 – 96%</span>
                  <span class="t-lbl">SpO₂ Alvo (evitar hiperóxia)</span>
                </div>
              </div>
              <div class="clinical-pearl">
                ⚠️ Lembre-se da <strong>Interação Coração-Pulmão</strong>: PEEP ou Auto-PEEP excessiva aumenta a pressão intratorácica, reduz o retorno venoso e derruba a Pressão Arterial (PAI)!
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // ================= SLIDE 9: VENTILAÇÃO PROTETORA POR PATOLOGIA =================
    _renderSlide9() {
      const prot = PROTECTIVE_PROTOCOLS[this.activeProtIndex] || PROTECTIVE_PROTOCOLS[0];
      return `
        <div class="slide-card">
          <div class="slide-head">
            <div>
              <span class="slide-kicker">BLOCO II • INDICAÇÕES POR PATOLOGIA E GRAVIDADE</span>
              <h2>Ventilação Mecânica Protetora na Prática Clínica</h2>
            </div>
            <span class="slide-hint">Selecione a patologia/gravidade para ver parâmetros e metas</span>
          </div>

          <div class="prot-pillars-strip">
            ${PROTECTIVE_PILLARS.map(
              (pil) => `
              <div class="prot-pillar-mini">
                <strong>${pil.title}</strong>
                <span class="mono">${pil.target}</span>
              </div>`
            ).join('')}
          </div>

          <div class="prot-interactive-grid">
            <div class="prot-list">
              ${PROTECTIVE_PROTOCOLS.map(
                (item, idx) => `
                <button class="prot-item-btn ${idx === this.activeProtIndex ? 'active' : ''}" data-prot="${idx}">
                  <span class="m-sev ${item.sevClass}">${item.severity}</span>
                  <strong>${item.name}</strong>
                </button>`
              ).join('')}
            </div>

            <div class="prot-detail-card">
              <div class="prot-detail-head">
                <div>
                  <span class="m-sev ${prot.sevClass}">${prot.severity}</span>
                  <h3>${prot.name}</h3>
                </div>
                <button class="pres-cta-btn small" data-launch="${prot.id}">🧪 Simular Caso →</button>
              </div>

              <div class="prot-params-grid">
                <div class="prot-param"><span>Modo Preferencial</span><strong>${prot.mode}</strong></div>
                <div class="prot-param"><span>Vt (Peso Predito)</span><strong class="mono">${prot.vt}</strong></div>
                <div class="prot-param"><span>PEEP Indicada</span><strong class="mono">${prot.peep}</strong></div>
                <div class="prot-param"><span>FR &amp; Relação I:E</span><strong class="mono">${prot.frIe}</strong></div>
                <div class="prot-param"><span>Limites de Pressão</span><strong class="mono">${prot.pressures}</strong></div>
                <div class="prot-param"><span>Alvos Gasométricos</span><strong class="mono">${prot.gasTargets}</strong></div>
              </div>

              <div class="clinical-pearl">
                📋 <strong>Indicações &amp; Conduta:</strong> ${prot.indications}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // ================= SLIDE 10: QUIZ & MISSÕES NO SIMULADOR =================
    _renderSlide10() {
      return `
        <div class="slide-card">
          <div class="slide-head">
            <div>
              <span class="slide-kicker">VERIFICAÇÃO RÁPIDA &amp; PRÁTICA CLÍNICA</span>
              <h2>Mini-Quiz + Missões no Simulador de UTI</h2>
            </div>
          </div>

          <div class="quiz-and-missions">
            <div class="quiz-col">
              <h3>Teste seus conhecimentos:</h3>
              ${QUIZ_QUESTIONS.map((qObj, qIdx) => {
                const chosen = this.quizAnswers[qIdx];
                return `
                  <div class="quiz-item">
                    <div class="quiz-q">${qObj.q}</div>
                    <div class="quiz-opts">
                      ${qObj.options
                        .map((opt, oIdx) => {
                          let cls = '';
                          if (chosen !== undefined) {
                            if (oIdx === qObj.correct) cls = 'correct';
                            else if (oIdx === chosen) cls = 'wrong';
                          }
                          return `<button class="quiz-opt ${cls}" data-q="${qIdx}" data-o="${oIdx}">${opt}</button>`;
                        })
                        .join('')}
                    </div>
                    ${
                      chosen !== undefined
                        ? `<div class="quiz-fb ${chosen === qObj.correct ? 'ok' : 'err'}">${qObj.feedback}</div>`
                        : ''
                    }
                  </div>
                `;
              }).join('')}
            </div>

            <div class="missions-col">
              <h3>Escolha um Caso para Simular Ao Vivo:</h3>
              <div class="mission-cards">
                <button class="mission-btn" data-launch="asthma">
                  <span class="m-sev moderate">MODERADO-GRAVE</span>
                  <strong>Asma / Broncoespasmo</strong>
                  <small>Trate Auto-PEEP, capnografia em barbatana e Ppico elevada</small>
                </button>
                <button class="mission-btn" data-launch="ards">
                  <span class="m-sev severe">GRAVE</span>
                  <strong>SDRA Grave (Pulmão Rígido)</strong>
                  <small>Reduza Driving Pressure (&lt;15) e titule PEEP para SpO₂</small>
                </button>
                <button class="mission-btn" data-launch="septic_shock">
                  <span class="m-sev severe">GRAVE</span>
                  <strong>Choque Séptico + Acidose</strong>
                  <small>Titule Noradrenalina, infunda volume e compense acidemia</small>
                </button>
                <button class="mission-btn" data-launch="pneumothorax">
                  <span class="m-sev critical">CRÍTICO</span>
                  <strong>Pneumotórax Hipertensivo</strong>
                  <small>Reconheça choque obstrutivo e execute descompressão</small>
                </button>
                <button class="mission-btn" data-launch="cardiac_arrest">
                  <span class="m-sev critical">EMERGÊNCIA</span>
                  <strong>PCR • Fibrilação Ventricular</strong>
                  <small>Aplique RCP, monitore EtCO₂ e desfibrile em 200J</small>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // ================= BINDING DE WIDGETS INTERNOS =================
    _bindSlideInteractions() {
      // Botões de pular de slide ou lançar simulador em cenário específico
      this.stageEl.querySelectorAll('[data-jump]').forEach((el) => {
        el.addEventListener('click', () => this.goTo(Number(el.dataset.jump)));
        if (el.tagName !== 'BUTTON') {
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              this.goTo(Number(el.dataset.jump));
            }
          });
        }
      });

      this.stageEl.querySelectorAll('[data-launch]').forEach((el) => {
        el.addEventListener('click', () => this.onLaunchSimulator(el.dataset.launch));
      });

      // Slide 2: 7 Ps
      this.stageEl.querySelectorAll('[data-p]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.activePIndex = Number(btn.dataset.p);
          this._renderCurrentSlide();
        });
      });

      // Slide 3: Pré-oxigenação
      this.stageEl.querySelectorAll('[data-preox-prof]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.preoxProfile = btn.dataset.preoxProf;
          this._renderCurrentSlide();
        });
      });
      this.stageEl.querySelectorAll('[data-preox-meth]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.preoxMethod = btn.dataset.preoxMeth;
          this._renderCurrentSlide();
        });
      });
      if (this.currentSlide === 2) {
        this._drawPreoxChart();
      }

      // Slide 4: Calculadora de Drogas
      const weightSlider = document.getElementById('rangeSlideWeight');
      if (weightSlider) {
        weightSlider.addEventListener('input', (e) => {
          this.drugWeight = Number(e.target.value);
          document.getElementById('lblSlideWeight').textContent = `${this.drugWeight} kg`;
          this._renderDrugsGrid();
        });
      }
      this.stageEl.querySelectorAll('[data-drug-ctx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.drugContext = btn.dataset.drugCtx;
          this._renderCurrentSlide();
        });
      });
      if (this.currentSlide === 3) {
        this._renderDrugsGrid();
      }

      // Slide 6: Mecânica Pulmonar
      const compRange = document.getElementById('rangeMechComp');
      const resRange = document.getElementById('rangeMechRes');
      if (compRange && resRange) {
        compRange.addEventListener('input', (e) => {
          this.mechComp = Number(e.target.value);
          document.getElementById('lblMechComp').textContent = `${this.mechComp} mL/cmH₂O`;
          this._drawMechanicsChart();
        });
        resRange.addEventListener('input', (e) => {
          this.mechRes = Number(e.target.value);
          document.getElementById('lblMechRes').textContent = `${this.mechRes} cmH₂O/L/s`;
          this._drawMechanicsChart();
        });
        this.stageEl.querySelectorAll('[data-mech-preset]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const p = btn.dataset.mechPreset;
            if (p === 'normal') { this.mechComp = 60; this.mechRes = 6; }
            else if (p === 'asthma') { this.mechComp = 54; this.mechRes = 26; }
            else { this.mechComp = 22; this.mechRes = 11; }
            this._renderCurrentSlide();
          });
        });
        this._drawMechanicsChart();
      }

      // Slide 7: Comparador VCV / PCV
      this.stageEl.querySelectorAll('[data-cmp]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.compareMode = btn.dataset.cmp;
          this._renderCurrentSlide();
        });
      });

      // Slide 9: Ventilação Protetora por Patologia
      this.stageEl.querySelectorAll('[data-prot]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.activeProtIndex = Number(btn.dataset.prot);
          this._renderCurrentSlide();
        });
      });

      // Slide 10: Quiz
      this.stageEl.querySelectorAll('[data-q]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.quizAnswers[Number(btn.dataset.q)] = Number(btn.dataset.o);
          this._renderCurrentSlide();
        });
      });
    }

    // ================= WIDGET: CURVA DE PRÉ-OXIGENAÇÃO =================
    _drawPreoxChart() {
      const canvas = document.getElementById('canvasSlidePreox');
      const summaryEl = document.getElementById('preoxSummary');
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(320, Math.round(rect.width * dpr));
      canvas.height = Math.max(220, Math.round(rect.height * dpr));
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      // Tempo até SpO2 = 90% em minutos dependendo do perfil e método
      const baseMinutes = { healthy: 7.2, obese: 2.9, critical: 2.1 }[this.preoxProfile];
      const methMult = { room: 0.16, nrb: 0.85, vni: 1.25 }[this.preoxMethod];
      const t90 = Number((baseMinutes * methMult).toFixed(1));

      if (summaryEl) {
        const risk = t90 < 1.5 ? 'crit' : t90 < 3.0 ? 'warn' : 'ok';
        summaryEl.className = `preox-summary ${risk}`;
        summaryEl.innerHTML = `Tempo estimado de apneia segura (SpO₂ &gt; 90%): <strong class="mono">${t90} min</strong>. ${
          t90 < 1.5
            ? 'Risco extremo de dessaturação precoce durante a laringoscopia!'
            : t90 < 3.0
              ? 'Janela estreita — considere VNI/PEEP + cateter nasal apneico.'
              : 'Reserva alveolar otimizada para laringoscopia segura.'
        }`;
      }

      const maxMin = 10;
      const pad = 34 * dpr;
      const toX = (m) => pad + (m / maxMin) * (w - pad * 1.4);
      const toY = (sat) => h - pad - ((sat - 50) / 50) * (h - pad * 1.5);

      ctx.clearRect(0, 0, w, h);

      // Zona crítica < 90%
      const y90 = toY(90);
      ctx.fillStyle = 'rgba(255, 46, 85, 0.12)';
      ctx.fillRect(pad, y90, w - pad * 1.4, h - pad - y90);

      // Linha 90%
      ctx.strokeStyle = 'rgba(255, 46, 85, 0.65)';
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      ctx.moveTo(pad, y90);
      ctx.lineTo(w - pad * 0.4, y90);
      ctx.stroke();
      ctx.setLineDash([]);

      // Eixos
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.beginPath();
      ctx.moveTo(pad, pad * 0.5);
      ctx.lineTo(pad, h - pad);
      ctx.lineTo(w - pad * 0.4, h - pad);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = `${10 * dpr}px monospace`;
      ctx.fillText('100%', 4 * dpr, toY(99));
      ctx.fillText('90%', 6 * dpr, y90 + 3 * dpr);
      ctx.fillText('50%', 6 * dpr, toY(52));
      for (let m = 0; m <= 10; m += 2) {
        ctx.fillText(`${m}m`, toX(m) - 6 * dpr, h - 10 * dpr);
      }

      // Curva sigmoide reversa de queda
      const startSat = this.preoxMethod === 'room' ? 96 : 99.5;
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 2.6 * dpr;
      ctx.beginPath();
      for (let i = 0; i <= 160; i++) {
        const t = (i / 160) * maxMin;
        const drop = 48 / (1 + Math.exp(-(t - (t90 + 0.9)) * 2.1));
        const sat = Math.max(50, startSat - drop);
        const x = toX(t);
        const y = toY(sat);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Marcador de t90
      const tx = toX(Math.min(maxMin, t90));
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(tx, y90, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(`t90 = ${t90}m`, Math.min(w - 85 * dpr, tx + 6 * dpr), y90 - 8 * dpr);
    }

    // ================= WIDGET: CALCULADORA DE DROGAS SRI =================
    _renderDrugsGrid() {
      const grid = document.getElementById('drugsGrid');
      if (!grid) return;
      const w = this.drugWeight;
      const ctx = this.drugContext;

      const drugs = [
        {
          role: 'INDUTOR',
          name: 'Etomidato',
          dosePerKg: 0.3,
          concMgMl: 2,
          onset: '15–45s',
          badge: ctx === 'shock' || ctx === 'tce' || ctx === 'stable' ? 'RECOMENDADO' : 'OPÇÃO',
          status: ctx === 'shock' || ctx === 'tce' || ctx === 'stable' ? 'best' : 'ok',
          note: 'Neutro hemodinamicamente; preserva pressão de perfusão cerebral.'
        },
        {
          role: 'INDUTOR',
          name: 'Cetamina',
          dosePerKg: 1.5,
          concMgMl: 50,
          onset: '45–60s',
          badge: ctx === 'shock' || ctx === 'asthma' ? 'RECOMENDADO' : 'ATENÇÃO',
          status: ctx === 'shock' || ctx === 'asthma' ? 'best' : ctx === 'tce' ? 'ok' : 'ok',
          note: 'Broncodilatadora e simpatomimética; excelente na asma e no choque.'
        },
        {
          role: 'INDUTOR',
          name: 'Propofol',
          dosePerKg: 1.5,
          concMgMl: 10,
          onset: '15–45s',
          badge: ctx === 'shock' ? 'EVITAR NO CHOQUE' : ctx === 'stable' || ctx === 'tce' ? 'OPÇÃO' : 'CAUTELA',
          status: ctx === 'shock' ? 'avoid' : 'ok',
          note: 'Reduz resistência vascular e PA intensamente; contraindicado se hipotenso.'
        },
        {
          role: 'BNM (DESPOLARIZANTE)',
          name: 'Succinilcolina',
          dosePerKg: 1.5,
          concMgMl: 10,
          onset: '45s (dura 6–10m)',
          badge: 'PADRÃO RÁPIDO',
          status: 'ok',
          note: 'Evitar em hipercalemia, queimados &gt;24h, esmagamento ou miopatias.'
        },
        {
          role: 'BNM (NÃO DESPOLARIZANTE)',
          name: 'Rocurônio',
          dosePerKg: 1.2,
          concMgMl: 10,
          onset: '45–60s (dura 40–60m)',
          badge: 'SEGURO / REVERSÍVEL',
          status: 'best',
          note: 'Sem contraindicação por K⁺; exige sedação contínua após IOT.'
        }
      ];

      grid.innerHTML = drugs
        .map((d) => {
          const mg = Math.round(w * d.dosePerKg);
          const ml = (mg / d.concMgMl).toFixed(1);
          return `
          <div class="drug-card ${d.status}">
            <div class="drug-top">
              <span class="drug-role">${d.role}</span>
              <span class="drug-badge ${d.status}">${d.badge}</span>
            </div>
            <h4>${d.name} <small class="mono">(${d.dosePerKg} mg/kg)</small></h4>
            <div class="drug-calc mono">
              <strong>${mg} mg</strong> <span>≈ ${ml} mL</span>
              <small>(${d.concMgMl} mg/mL)</small>
            </div>
            <div class="drug-onset">Início: <strong>${d.onset}</strong></div>
            <p class="drug-note">${d.note}</p>
          </div>
        `;
        })
        .join('');
    }

    // ================= WIDGET: MECÂNICA PPICO vs PPLATÔ =================
    _drawMechanicsChart() {
      const canvas = document.getElementById('canvasSlideMech');
      const diagEl = document.getElementById('mechDiagnosis');
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(320, Math.round(rect.width * dpr));
      canvas.height = Math.max(220, Math.round(rect.height * dpr));
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      const vtL = 0.45; // 450 mL
      const flowLs = 0.75; // 45 L/min
      const peep = 5;
      const C = this.mechComp / 1000;
      const R = this.mechRes;

      const pPlat = peep + vtL / C;
      const pPeak = pPlat + R * flowLs;
      const grad = pPeak - pPlat;
      const dp = pPlat - peep;

      if (diagEl) {
        let txt = '';
        if (grad > 8 && dp <= 15) {
          txt = `<strong>Padrão Obstrutivo / Resistivo:</strong> Ppico (${Math.round(pPeak)}) muito acima de Pplatô (${Math.round(pPlat)}). Gradiente = ${Math.round(grad)} cmH₂O.`;
        } else if (dp > 15 && grad <= 8) {
          txt = `<strong>Padrão Restritivo / Baixa Complacência:</strong> Ppico (${Math.round(pPeak)}) e Pplatô (${Math.round(pPlat)}) ambas elevadas! Driving Pressure = ${Math.round(dp)} cmH₂O (&gt;15!).`;
        } else if (grad > 8 && dp > 15) {
          txt = `<strong>Padrão Misto:</strong> Resistência E complacência comprometidas (Ppico ${Math.round(pPeak)} • Pplatô ${Math.round(pPlat)} • ΔP ${Math.round(dp)}).`;
        } else {
          txt = `<strong>Mecânica Normal / Protetora:</strong> Ppico ${Math.round(pPeak)} cmH₂O • Pplatô ${Math.round(pPlat)} cmH₂O • Driving Pressure ${Math.round(dp)} cmH₂O.`;
        }
        diagEl.innerHTML = txt;
      }

      const maxP = Math.max(40, Math.ceil((pPeak + 8) / 10) * 10);
      const pad = 32 * dpr;
      const toX = (t) => pad + (t / 2.2) * (w - pad * 1.4);
      const toY = (p) => h - pad - (p / maxP) * (h - pad * 1.5);

      ctx.clearRect(0, 0, w, h);

      // Eixos
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      ctx.moveTo(pad, pad * 0.4);
      ctx.lineTo(pad, h - pad);
      ctx.lineTo(w - pad * 0.4, h - pad);
      ctx.stroke();

      // Pontos do ciclo VCV (0->0.2 PEEP, 0.2->0.8 insp, 0.8->1.2 pausa, 1.2->2.1 exp)
      const pts = [
        [0, peep],
        [0.2, peep],
        [0.22, peep + R * flowLs],
        [0.8, pPeak],
        [0.82, pPlat],
        [1.2, pPlat],
        [1.23, peep + 2],
        [1.65, peep + 0.5],
        [2.1, peep]
      ];

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.6 * dpr;
      ctx.beginPath();
      pts.forEach(([t, p], i) => {
        if (i === 0) ctx.moveTo(toX(t), toY(p));
        else ctx.lineTo(toX(t), toY(p));
      });
      ctx.stroke();

      // Anotações Ppico, Pplatô e PEEP
      ctx.font = `bold ${10.5 * dpr}px monospace`;
      ctx.fillStyle = '#fb7185';
      ctx.fillText(`Ppico: ${Math.round(pPeak)}`, toX(0.55), toY(pPeak) - 8 * dpr);

      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`Pplatô: ${Math.round(pPlat)}`, toX(0.84), toY(pPlat) - 8 * dpr);

      ctx.fillStyle = '#fdba74';
      ctx.fillText(`PEEP: ${peep}`, toX(1.65), toY(peep) - 6 * dpr);
    }
  }

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.SlidePresentation = SlidePresentation;
  global.ICUSim.PROTECTIVE_PILLARS = PROTECTIVE_PILLARS;
  global.ICUSim.PROTECTIVE_PROTOCOLS = PROTECTIVE_PROTOCOLS;
})(window);
