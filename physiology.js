/**
 * Motor Fisiológico Cardiopulmonar Acoplado (Monitor + Ventilador Mecânico)
 * Modela mecânica respiratória (Equação do Movimento), troca gasosa, ácido-base,
 * interação coração-pulmão (PEEP / Auto-PEEP -> pré-carga / PA) e cenários de gravidade.
 */
(function (global) {
  'use strict';

  const _SC_BASE = {"patient":{"baseExcess":-8,"intrinsicDrive":22,"label":"Adulto • 70 kg (PBW)","resistance":8,"shunt":0.14,"vco2":245,"weightKg":70},"cardiac":{"contractility":0.95,"ectopyProb":0.04,"preload":1.0,"rhythm":"sinus_tach","stDeviation":0.0},"ventDefaults":{"etsPct":25,"fio2Set":60,"flowSet":45,"inspPausePct":10,"mode":"VCV","pcSet":14,"peepSet":5,"psSet":12,"rrSet":16,"tiSet":1.0,"triggerSens":2,"vtSet":450}};
  const _mDeep = (b, p) => {
    const o = {};
    for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? _mDeep(b[k], {}) : b[k];
    for (const k in p) o[k] = p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) && o[k] && typeof o[k] === 'object' ? _mDeep(o[k], p[k]) : p[k];
    return o;
  };
  const SCENARIOS = Object.fromEntries(Object.entries({
    stable: {"id":"stable","name":"Estável • Pós-Operatório","severity":"stable","severityLabel":"ESTÁVEL","subtitle":"Pós-operatório imediato sem disfunção cardiopulmonar","guidance":"Pulmão com complacência (60 mL/cmH₂O) e resistência (6 cmH₂O/L/s) normais. Experimente variar Vt, FR, PEEP ou alternar entre VCV, PCV e PSV para observar a resposta acoplada no monitor e nas curvas.","patient":{"compliance":60,"resistance":6,"shunt":0.04,"vco2":215,"baseExcess":0,"intrinsicDrive":14,"temp":36.7,"lactate":1.1},"cardiac":{"baseHr":78,"baseSbp":120,"baseDbp":78,"svr":1.0,"contractility":1.0,"rhythm":"sinus","ectopyProb":0.0},"ventDefaults":{"pcSet":12,"psSet":10,"rrSet":14,"fio2Set":30}},
    asthma: {"id":"asthma","name":"Asma / Broncoespasmo Grave","severity":"moderate","severityLabel":"MODERADO-GRAVE","subtitle":"Obstrução severa ao fluxo aéreo + Auto-PEEP + Capnografia em barbatana","guidance":"Resistência elevada (26 cmH₂O/L/s) eleva Ppico mantendo Pplatô mais baixa (gradiente Ppico-Pplatô > 15). Observe o fluxo expiratório sem zerar (Auto-PEEP) e capnografia inclinada. Conduta: administre Broncodilatador, reduza FR (10–12) e aumente fluxo inspiratório para prolongar o tempo expiratório.","patient":{"label":"Adulto • 68 kg (PBW)","weightKg":68,"compliance":54,"resistance":26,"baseExcess":1,"temp":37.1,"lactate":2.0},"cardiac":{"baseHr":116,"baseSbp":132,"baseDbp":82,"preload":0.92,"svr":1.08,"contractility":1.05},"ventDefaults":{"vtSet":440,"pcSet":18,"psSet":14,"rrSet":20,"fio2Set":45,"flowSet":35,"etsPct":35}},
    ards: {"id":"ards","name":"SDRA Grave • Pulmão Rígido","severity":"severe","severityLabel":"GRAVE","subtitle":"Complacência criticamente baixa + Shunt refratário + Risco de Barotrauma","guidance":"Complacência muito reduzida (22 mL/cmH₂O) e shunt pulmonar elevado (38%). Se mantiver Vt alto, a Driving Pressure ultrapassa 15 cmH₂O! Conduta: aplique ventilação protetora (Vt ~ 6 mL/kg = 420 mL ou menor), titule PEEP (10–16 cmH₂O) para recrutar alvéolos, ajuste FiO₂ e aceite hipercapnia permissiva monitorando o pH.","patient":{"compliance":22,"resistance":11,"shunt":0.38,"vco2":255,"baseExcess":-3,"intrinsicDrive":24,"temp":38.4,"lactate":2.8},"cardiac":{"baseHr":112,"baseSbp":106,"baseDbp":64,"preload":0.88,"svr":0.95,"stDeviation":-0.4,"ectopyProb":0.05},"ventDefaults":{"vtSet":520,"pcSet":20,"psSet":14,"rrSet":18,"flowSet":50,"tiSet":0.9}},
    septic_shock: {"id":"septic_shock","name":"Choque Séptico + Acidose Metabólica","severity":"severe","severityLabel":"GRAVE","subtitle":"Vasoplegia severa + Hipotensão (PAM < 55) + Acidose láctica","guidance":"Vasodilatação sistêmica grave (SVR reduzida) com PAM baixa, taquicardia compensatória e onda pletismográfica achatada por má perfusão periférica. PEEP alta agrava a queda da PA! Conduta: Bolus de SF 500 mL, titule Noradrenalina para PAM ≥ 65 mmHg e ajuste FR para compensar a acidose metabólica.","patient":{"label":"Adulto • 75 kg (PBW)","weightKg":75,"compliance":48,"shunt":0.16,"vco2":295,"baseExcess":-11,"intrinsicDrive":26,"temp":39.1,"lactate":5.4},"cardiac":{"baseHr":128,"baseSbp":76,"baseDbp":42,"preload":0.65,"svr":0.56,"contractility":0.92,"stDeviation":-0.6,"ectopyProb":0.06},"ventDefaults":{"rrSet":18,"peepSet":8,"fio2Set":50,"flowSet":50,"tiSet":0.9}},
    pulmonary_edema: {"id":"pulmonary_edema","name":"Edema Agudo de Pulmão (EAP)","severity":"severe","severityLabel":"GRAVE","subtitle":"Congestão pulmonar + Hipoxemia responsiva à PEEP + Sobrecarga","guidance":"Complacência reduzida (30 mL/cmH₂O) por líquido alveolar e pressão capilar elevada, frequentemente com FA ou isquemia subendocárdica. A elevação da PEEP (10–14 cmH₂O) reduz pré/pós-carga e melhora rapidamente a SpO₂. Evite bolus excessivo de volume.","patient":{"label":"Adulto • 72 kg (PBW)","weightKg":72,"compliance":30,"resistance":13,"shunt":0.32,"baseExcess":-4,"intrinsicDrive":28,"temp":36.5,"lactate":3.1},"cardiac":{"baseHr":122,"baseSbp":162,"baseDbp":98,"preload":1.22,"svr":1.32,"contractility":0.78,"rhythm":"afib","stDeviation":-1.2,"ectopyProb":0.08},"ventDefaults":{"mode":"PCV","vtSet":430,"pcSet":16,"psSet":14,"rrSet":22,"flowSet":50,"tiSet":0.9}},
    pneumothorax: {"id":"pneumothorax","name":"Pneumotórax Hipertensivo","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Choque obstrutivo + Pressão de pico extrema + Dessaturação rápida","guidance":"EMERGÊNCIA IMEDIATA! Colapso pulmonar e desvio mediastinal comprimem veia cava: Ppico dispara, complacência cai para 15 mL/cmH₂O e a PA desaba. Aumentar PEEP piora o choque! Conduta: clique em \"Descomprimir Tórax\" imediatamente para restaurar hemodinâmica e oxigenação.","patient":{"compliance":15,"resistance":22,"shunt":0.5,"vco2":230,"baseExcess":-5,"intrinsicDrive":28,"temp":36.8,"lactate":4.5,"pneumothoraxActive":true},"cardiac":{"baseHr":142,"baseSbp":64,"baseDbp":38,"preload":0.42,"svr":1.15,"stDeviation":-0.9,"ectopyProb":0.12},"ventDefaults":{"pcSet":18,"psSet":14,"rrSet":20,"peepSet":8,"fio2Set":80,"flowSet":50}},
    opioid_apnea: {"id":"opioid_apnea","name":"TCE / Depressão Respiratória (Apneia)","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Ausência de drive respiratório + Risco de hipercapnia em PSV","guidance":"Paciente com drive respiratório nulo (0 irpm) por sedação profunda/TCE. No modo espontâneo (PSV), o ventilador dispara ALARME DE APNEIA e o EtCO₂ sobe rapidamente! Conduta: altere o ventilador para modo controlado (VCV ou PCV) com FR e Vt adequados para controlar PaCO₂ (alvo 35–40 mmHg no TCE).","patient":{"label":"Adulto • 74 kg (PBW)","weightKg":74,"compliance":58,"resistance":7,"shunt":0.08,"vco2":185,"baseExcess":0,"intrinsicDrive":0,"temp":35.9,"lactate":1.5},"cardiac":{"baseHr":52,"baseSbp":158,"baseDbp":92,"svr":1.24,"contractility":1.0,"rhythm":"sinus_brady","stDeviation":0.2,"ectopyProb":0.02},"ventDefaults":{"mode":"PSV","rrSet":14,"fio2Set":40}},
    cardiac_arrest: {"id":"cardiac_arrest","name":"PCR • Fibrilação Ventricular","severity":"critical","severityLabel":"EMERGÊNCIA PCR","subtitle":"Sem pulso • PAI plana • EtCO₂ < 10 mmHg por ausência de débito cardíaco","guidance":"Parada Cardiorrespiratória em ritmo chocável (FV)! Sem débito cardíaco, PAI fica plana, SpO₂ perde onda pulsátil e EtCO₂ despenca apesar da ventilação. Conduta: inicie RCP (eleva EtCO₂ para ~18–22 mmHg e gera ondas na PAI), ajuste FiO₂ 100%, FR 10 irpm e clique em \"Desfibrilar 200J\" para tentar RCE.","patient":{"compliance":45,"resistance":9,"shunt":0.3,"vco2":200,"intrinsicDrive":0,"temp":36.4,"lactate":7.2,"arrested":true},"cardiac":{"baseHr":0,"baseSbp":14,"baseDbp":10,"preload":0.4,"svr":0.5,"contractility":0.0,"rhythm":"vf","ectopyProb":0.0},"ventDefaults":{"rrSet":10,"fio2Set":100,"flowSet":50,"inspPausePct":0}},
    copd_exacerbation: {"id":"copd_exacerbation","name":"DPOC Exacerbado","severity":"moderate","severityLabel":"MODERADO-GRAVE","subtitle":"Hipercapnia crônica agudizada + Auto-PEEP + Complacência aumentada","guidance":"Resistência aumentada (22 cmH₂O/L/s) e complacência alta (78 mL/cmH₂O) por enfisema predispõem a aprisionamento aéreo (Auto-PEEP). Conduta: titule FiO₂ para alvo SpO₂ 88–92%, reduza FR (10–12 irpm), use fluxo inspiratório alto e associe broncodilatador + VNI se possível.","patient":{"compliance":78,"resistance":22,"vco2":265,"baseExcess":6,"intrinsicDrive":18,"temp":37.3,"lactate":1.6},"cardiac":{"baseHr":108,"baseSbp":132,"baseDbp":82,"svr":1.05},"ventDefaults":{"vtSet":430,"rrSet":11,"peepSet":6,"fio2Set":35,"flowSet":60,"tiSet":0.8,"inspPausePct":0,"etsPct":35}},
    pulmonary_embolism: {"id":"pulmonary_embolism","name":"TEP Maciço","severity":"severe","severityLabel":"GRAVE","subtitle":"Espaço morto elevado • EtCO₂ baixo + Hipoxemia + Choque obstrutivo","guidance":"Tromboembolismo pulmonar maciço aumenta o espaço morto alveolar (gradiente PaCO₂–EtCO₂ alto), causando hipoxemia refratária e falência aguda de VD. Conduta: oxigenoterapia imediata, suporte vasopressor com Noradrenalina e avaliação de trombólise sistêmica.","patient":{"compliance":56,"resistance":7,"shunt":0.28,"vco2":190,"baseExcess":-5,"intrinsicDrive":24,"temp":37.1,"lactate":4.8},"cardiac":{"baseHr":132,"baseSbp":76,"baseDbp":50,"preload":0.72,"svr":1.32,"contractility":0.78,"stDeviation":-0.6,"ectopyProb":0.06},"ventDefaults":{"vtSet":420,"rrSet":20,"fio2Set":85,"flowSet":50,"tiSet":0.9}},
    dka_acidosis: {"id":"dka_acidosis","name":"Cetoacidose Diabética","severity":"severe","severityLabel":"GRAVE","subtitle":"Acidose metabólica grave (BE -16) + Respiração de Kussmaul","guidance":"Acidose metabólica severa gera drive ventilatório intenso (Kussmaul) para compensação respiratória (PaCO₂ baixa). Conduta: hidratação venosa vigorosa com cristaloide, insulinoterapia contínua e cuidado para não hipoventilar o paciente se intubado (manter VM em minuto-ventilação alta).","patient":{"compliance":62,"resistance":6,"shunt":0.05,"baseExcess":-16,"intrinsicDrive":28,"temp":37.6,"lactate":3.1},"cardiac":{"baseHr":124,"baseSbp":88,"baseDbp":54,"preload":0.68,"svr":1.05,"ectopyProb":0.02},"ventDefaults":{"vtSet":480,"pcSet":13,"rrSet":24,"fio2Set":35,"flowSet":55,"tiSet":0.85,"inspPausePct":5}},
    anaphylaxis: {"id":"anaphylaxis","name":"Choque Anafilático","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Vasoplegia aguda + Broncoespasmo severo + Hipotensão grave","guidance":"Anafilaxia grave combina choque distributivo com broncoespasmo crítico (Rva 28). Conduta: Adrenalina imediata (bolus/IM e infusão contínua se refratário), expansão volêmica rápida com cristaloide e broncodilatador adjunto.","patient":{"compliance":48,"resistance":28,"shunt":0.16,"vco2":240,"baseExcess":-7,"temp":36.8,"lactate":4.5},"cardiac":{"baseHr":138,"baseSbp":68,"baseDbp":38,"preload":0.65,"svr":0.45,"contractility":1.05,"stDeviation":-0.5,"ectopyProb":0.05},"ventDefaults":{"vtSet":420,"pcSet":18,"psSet":14,"rrSet":14,"fio2Set":80,"flowSet":60,"tiSet":0.8,"inspPausePct":0,"etsPct":30}},
    cardiogenic_shock: {"id":"cardiogenic_shock","name":"Choque Cardiogênico (IAM)","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Supra de ST + Baixa contratilidade (0.42) + Congestão pulmonar","guidance":"Falência ventricular esquerda aguda pós-IAM gera hipoperfusão sistêmica (lactato alto, hipotensão) associada a congestão pulmonar (complacência baixa). Conduta: Dobutamina para suporte inotrópico + Noradrenalina se PAM < 65 mmHg, evitar sobrecarga hídrica e reperfusão coronariana urgente.","patient":{"compliance":34,"resistance":10,"shunt":0.24,"vco2":210,"baseExcess":-9,"temp":36.2,"lactate":5.4},"cardiac":{"baseHr":118,"baseSbp":74,"baseDbp":48,"preload":1.25,"svr":1.38,"contractility":0.42,"stDeviation":2.8,"ectopyProb":0.18},"ventDefaults":{"mode":"PCV","vtSet":410,"pcSet":16,"psSet":14,"rrSet":18,"peepSet":8,"fio2Set":75}},
    cardiac_tamponade: {"id":"cardiac_tamponade","name":"Tamponamento Cardíaco","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Restrição grave de enchimento • Pressão de pulso estreita + Taquicardia","guidance":"Derrame pericárdico compressivo reduz drasticamente a pré-carga (0.50) com pressão de pulso estreitada e choque obstrutivo. Conduta: pericardiocentese imediata; até a punção, realize expansão volêmica cautelosa e evite PEEP elevada (piora retorno venoso).","patient":{"compliance":54,"resistance":7,"shunt":0.1,"vco2":205,"intrinsicDrive":20,"temp":36.4,"lactate":5.1},"cardiac":{"baseHr":134,"baseSbp":72,"baseDbp":56,"preload":0.5,"svr":1.42,"contractility":0.85,"stDeviation":-0.4},"ventDefaults":{"vtSet":430,"pcSet":13,"peepSet":3,"tiSet":0.95}},
    afib_rvr: {"id":"afib_rvr","name":"FA de Alta Resposta","severity":"moderate","severityLabel":"MODERADO-GRAVE","subtitle":"Ritmo irregular sem onda P (FC 155 bpm) + Queda discreta de débito","guidance":"Fibrilação atrial com alta resposta ventricular encurta o tempo de enchimento diastólico. Conduta: controle de frequência/ritmo se estável; se houver sinais de instabilidade hemodinâmica (dor torácica, hipotensão ou EAP), realize cardioversão elétrica sincronizada no Vivo Gold.","patient":{"compliance":52,"shunt":0.1,"vco2":230,"baseExcess":-2,"intrinsicDrive":20,"temp":36.9,"lactate":2.2},"cardiac":{"baseHr":155,"baseSbp":96,"baseDbp":62,"preload":0.92,"svr":1.08,"contractility":0.9,"rhythm":"afib_rvr","stDeviation":-0.3,"ectopyProb":0.05},"ventDefaults":{"vtSet":440,"pcSet":13,"psSet":10,"fio2Set":45}},
    vtach_unstable: {"id":"vtach_unstable","name":"Taquicardia Ventricular (TV)","severity":"critical","severityLabel":"CRÍTICO","subtitle":"QRS largo monomórfico (FC 176 bpm) + Hipotensão grave com pulso","guidance":"Taquicardia ventricular monomórfica instável reduz severamente o débito cardíaco. Conduta: se paciente com pulso e instável, ative o modo SINCRONIZADO no cardioversor Vivo Gold e choque com 100 J; se perder pulso, mude imediatamente para protocolo de PCR (não sincronizado 200 J).","patient":{"compliance":48,"shunt":0.18,"vco2":220,"temp":36.5,"lactate":4.9},"cardiac":{"baseHr":176,"baseSbp":70,"baseDbp":44,"preload":0.85,"svr":1.25,"contractility":0.55,"rhythm":"vtach","stDeviation":-1.5,"ectopyProb":0.1},"ventDefaults":{"vtSet":430,"fio2Set":80,"tiSet":0.95}},
    hyperkalemia_avb: {"id":"hyperkalemia_avb","name":"Hipercalemia + BAV Total","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Dissociação AV (FC 34 bpm) + Acidose metabólica + Baixo débito","guidance":"Bloqueio atrioventricular de 3º grau com bradicardia extrema e hipotensão. Conduta: ative o MARCAPASSO TRANSCUTÂNEO no Vivo Gold (ajuste frequência 70 bpm e corrente até captura), administre Gluconato de Cálcio 10% + solução polarizante se hipercalemia e considere Adrenalina em bomba como ponte.","patient":{"compliance":54,"resistance":7,"shunt":0.12,"vco2":195,"intrinsicDrive":18,"temp":36.4,"lactate":3.8},"cardiac":{"baseHr":34,"baseSbp":72,"baseDbp":40,"preload":1.05,"svr":1.15,"contractility":0.8,"rhythm":"av_block_3","stDeviation":0.4,"ectopyProb":0.08},"ventDefaults":{"vtSet":440,"pcSet":13,"psSet":10}},
    hypothermia_brady: {"id":"hypothermia_brady","name":"Hipotermia Grave (31.5 °C)","severity":"severe","severityLabel":"GRAVE","subtitle":"Bradicardia sinusal (FC 42 bpm) + Metabolismo reduzido (VCO₂ 145)","guidance":"Hipotermia severa reduz metabolismo basal (VCO₂ 145 mL/min), causa bradicardia refratária a atropina e aumenta risco de arritmias por irritabilidade miocárdica. Conduta: reaquecimento ativo externo/interno, cristaloide aquecido e ventilação cuidadosa sem hiperventilar.","patient":{"compliance":50,"shunt":0.12,"vco2":145,"baseExcess":-5,"intrinsicDrive":9,"temp":31.5,"lactate":2.9},"cardiac":{"baseHr":42,"baseSbp":84,"baseDbp":52,"preload":0.9,"svr":1.25,"contractility":0.78,"rhythm":"sinus_brady","stDeviation":0.3,"ectopyProb":0.12},"ventDefaults":{"vtSet":430,"pcSet":13,"psSet":10,"rrSet":10,"fio2Set":50}},
    hemorrhagic_shock: {"id":"hemorrhagic_shock","name":"Choque Hemorrágico","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Hipovolemia grave (Pré-carga 0.48) + Taquicardia + Acidose lática","guidance":"Perda aguda de volume intravascular derruba pré-carga e débito cardíaco, gerando taquicardia compensatória e vasoconstrição intensa. Conduta: controle imediato de sangramento, transfusão maciça / reposição volêmica aquecida e Noradrenalina apenas como ponte se PAM < 65 mmHg.","patient":{"compliance":58,"resistance":6,"shunt":0.08,"vco2":220,"baseExcess":-10,"temp":35.8,"lactate":5.8},"cardiac":{"baseHr":136,"baseSbp":68,"baseDbp":42,"preload":0.48,"svr":1.45,"stDeviation":-0.5},"ventDefaults":{"vtSet":440,"pcSet":13,"psSet":10,"rrSet":18,"peepSet":4,"tiSet":0.95}},
    hypertensive_crisis: {"id":"hypertensive_crisis","name":"Emergência Hipertensiva","severity":"severe","severityLabel":"GRAVE","subtitle":"PA 218/124 mmHg + RVS elevada (1.65) + Sobrecarga ventricular","guidance":"Aumento crítico da pós-carga (RVS 1.65) eleva pressão arterial com risco de dissecção aórtica, AVC ou edema pulmonar. Conduta: vasodilatador titulável em bomba (Nitroprussiato de Sódio) reduzindo PAM em 15–25% na primeira hora, evitando quedas abruptas.","patient":{"compliance":44,"vco2":230,"baseExcess":-2,"intrinsicDrive":18,"temp":36.8,"lactate":2.1},"cardiac":{"baseHr":104,"baseSbp":218,"baseDbp":124,"preload":1.15,"svr":1.65,"contractility":1.05,"stDeviation":-0.8,"ectopyProb":0.06},"ventDefaults":{"vtSet":430,"peepSet":6,"fio2Set":45}},
    status_epilepticus: {"id":"status_epilepticus","name":"Estado de Mal Epiléptico","severity":"severe","severityLabel":"GRAVE","subtitle":"Hipermetabolismo (VCO₂ 310) + Hipertermia (38.7 °C) + Acidose lática","guidance":"Atividade convulsiva contínua eleva drasticamente consumo de O₂, produção de CO₂ (VCO₂ 310) e lactato sérico. Conduta: abortar crise imediatamente (Benzodiazepínico + Anticonvulsivante / Propofol contínuo em bomba se refratário), proteger via aérea e ajustar volume-minuto para eliminar CO₂.","patient":{"compliance":52,"resistance":11,"vco2":310,"baseExcess":-7,"intrinsicDrive":10,"temp":38.7,"lactate":4.4},"cardiac":{"baseHr":128,"baseSbp":152,"baseDbp":94,"svr":1.18,"contractility":1.05,"ectopyProb":0.05},"ventDefaults":{"vtSet":460,"pcSet":15,"rrSet":20,"flowSet":55,"tiSet":0.9}},
    svt_unstable: {"id":"svt_unstable","name":"Taquicardia Supraventricular (TSV)","severity":"moderate","severityLabel":"MODERADO-GRAVE","subtitle":"QRS estreito regular (FC 188 bpm) + Enchimento diastólico reduzido","guidance":"TSV por reentrada nodal com frequência de 188 bpm encurta a diástole e reduz o débito cardíaco. Conduta: manobra vagal / Adenosina 6 mg EV rápido se estável; se houver hipotensão, dor torácica ou rebaixamento, realize cardioversão sincronizada (50–100 J) no Vivo Gold.","patient":{"compliance":56,"resistance":7,"shunt":0.08,"vco2":230,"baseExcess":-3,"intrinsicDrive":20,"temp":36.7,"lactate":2.6},"cardiac":{"baseHr":188,"baseSbp":88,"baseDbp":58,"preload":0.85,"svr":1.12,"contractility":0.88,"rhythm":"svt","stDeviation":-0.4,"ectopyProb":0.02},"ventDefaults":{"vtSet":440,"pcSet":13,"psSet":10,"fio2Set":45}},
    pea_arrest: {"id":"pea_arrest","name":"PCR • AESP","severity":"critical","severityLabel":"EMERGÊNCIA PCR","subtitle":"Atividade elétrica organizada sem pulso • Ritmo não chocável","guidance":"Atividade Elétrica Sem Pulso (AESP): há traçado elétrico organizado no monitor, porém sem contração mecânica efetiva (PAI plana, EtCO₂ < 10 mmHg). Conduta: RCP contínua imediata + Adrenalina 1 mg EV precoce e investigar/tratar causas reversíveis (5Hs e 5Ts). NÃO desfibrilar AESP.","patient":{"compliance":46,"resistance":9,"shunt":0.3,"vco2":200,"baseExcess":-10,"intrinsicDrive":0,"temp":36.2,"lactate":7.5,"arrested":true},"cardiac":{"baseHr":58,"baseSbp":14,"baseDbp":10,"preload":0.45,"svr":0.55,"contractility":0.0,"rhythm":"pea","ectopyProb":0.0},"ventDefaults":{"rrSet":10,"fio2Set":100,"flowSet":50,"inspPausePct":0}},
    ards_prone_severe: {"id":"ards_prone_severe","name":"SDRA Extrema (Hipoxemia Refrat.)","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Complacência crítica (20 mL/cmH₂O) + Shunt 42% + Necessidade de Prona","guidance":"SDRA gravíssima com pulmão de bebê (\"baby lung\"), complacência de 20 mL/cmH₂O e shunt intrapulmonar de 42%. Conduta: ventilação ultraprotetora (Vt 4–6 mL/kg, Pplatô ≤ 30, Driving Pressure < 15), PEEP titulada (12–16 cmH₂O), bloqueio neuromuscular e posição prona precoce.","patient":{"compliance":20,"resistance":12,"shunt":0.42,"baseExcess":-6,"intrinsicDrive":24,"temp":37.9,"lactate":3.4},"cardiac":{"baseHr":118,"baseSbp":102,"baseDbp":64,"preload":0.95,"svr":1.05,"contractility":0.88},"ventDefaults":{"mode":"PCV","vtSet":380,"pcSet":18,"psSet":14,"rrSet":24,"peepSet":14,"fio2Set":100,"flowSet":50,"tiSet":0.9}},
    stemi_anterior: {"id":"stemi_anterior","name":"IAMCSST Anterior Extenso","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Supradesnivelamento ST (+4.2 mm) + Disfunção aguda de VE + Risco de FV","guidance":"Infarto agudo com supra de ST extenso em parede anterior eleva risco de arritmias ventriculares malignas (FV) e choque cardiogênico. Conduta: Trombólise / reperfusão imediata, Nitroglicerina se PA permitir, O₂ apenas se SpO₂ < 90% e evitar excesso de catecolaminas.","patient":{"compliance":42,"resistance":8,"shunt":0.16,"vco2":220,"baseExcess":-4,"intrinsicDrive":20,"temp":36.6,"lactate":3.4},"cardiac":{"baseHr":108,"baseSbp":92,"baseDbp":58,"preload":1.08,"svr":1.24,"contractility":0.68,"rhythm":"stemi","stDeviation":4.2,"ectopyProb":0.12},"ventDefaults":{"vtSet":440,"pcSet":14,"peepSet":6,"fio2Set":40}},
    torsades_qt: {"id":"torsades_qt","name":"Torsades de Pointes (QT Longo)","severity":"critical","severityLabel":"EMERGÊNCIA PCR","subtitle":"TV polimórfica em pontas torcidas • Desfibrilar + Sulfato de Magnésio 2g","guidance":"Torsades de Pointes é uma taquicardia ventricular polimórfica associada a QT longo que evolui rapidamente sem perfusão. Conduta: Desfibrilação não sincronizada imediata + Sulfato de Magnésio 2g EV em bolus; evitar Amiodarona (prolonga ainda mais o QT).","patient":{"compliance":54,"resistance":7,"shunt":0.14,"vco2":210,"baseExcess":-6,"intrinsicDrive":0,"temp":36.6,"lactate":4.6,"arrested":true},"cardiac":{"baseHr":0,"baseSbp":16,"baseDbp":10,"preload":0.6,"svr":0.7,"contractility":0.0,"rhythm":"torsades","stDeviation":0.0,"ectopyProb":0.0},"ventDefaults":{"rrSet":12,"fio2Set":100,"inspPausePct":0}},
    wpw_preexcited: {"id":"wpw_preexcited","name":"Síndrome de WPW Pré-Excitada","severity":"severe","severityLabel":"GRAVE","subtitle":"PR curto + Onda Delta (FC 148 bpm) • Evitar bloqueadores nodais!","guidance":"Pré-excitação ventricular por via acessória (WPW) com taquicardia sintomática. Conduta: Cardioversão elétrica sincronizada se instável. ARMADILHA CLÁSSICA: NÃO administrar Adenosina em WPW/FA pré-excitada — bloqueio do nó AV desvia condução pela via acessória e pode precipitar FV!","patient":{"compliance":56,"resistance":7,"shunt":0.08,"vco2":225,"baseExcess":-2,"intrinsicDrive":20,"temp":36.8,"lactate":2.4},"cardiac":{"baseHr":148,"baseSbp":88,"baseDbp":56,"preload":0.88,"svr":1.10,"contractility":0.86,"rhythm":"wpw","stDeviation":-0.4,"ectopyProb":0.06},"ventDefaults":{"vtSet":440,"fio2Set":40}},
    tce_cushing: {"id":"tce_cushing","name":"TCE Grave • Tríade de Cushing","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Hipertensão (196/108) + Bradicardia (46 bpm) + Hipoventilação (PIC alta)","guidance":"Hipertensão intracraniana grave manifesta pela Tríade de Cushing clássica (hipertensão arterial, bradicardia e depressão respiratória). Conduta: SRI cardioestável (Etomidato), acoplar à VM mantendo normocapnia rigorosa (PaCO₂ 35–38 mmHg), evitar hipóxia e evitar hipotensão (PAM ≥ 80).","patient":{"compliance":56,"resistance":7,"shunt":0.10,"vco2":210,"baseExcess":-2,"intrinsicDrive":7,"temp":37.8,"lactate":2.5},"cardiac":{"baseHr":46,"baseSbp":196,"baseDbp":108,"preload":1.02,"svr":1.52,"contractility":0.95,"rhythm":"sinus_brady","stDeviation":0.0,"ectopyProb":0.03},"ventDefaults":{"vtSet":450,"rrSet":16,"peepSet":5,"fio2Set":60}},
    neurogenic_shock: {"id":"neurogenic_shock","name":"Choque Neurogênico (TRM Alto)","severity":"severe","severityLabel":"GRAVE","subtitle":"Vasoplegia aguda (74/42) + Bradicardia paradoxal (48 bpm)","guidance":"Trauma raquimedular acima de T6 interrompe o tônus simpático, produzindo hipotensão severa (RVS 0.48) acompanhada de bradicardia paradoxal por predomínio vagal. Conduta: expansão volêmica inicial + Noradrenalina contínua (alvo PAM ≥ 85 mmHg para perfusão medular) + Atropina se bradicardia sintomática.","patient":{"compliance":54,"resistance":7,"shunt":0.10,"vco2":195,"baseExcess":-5,"intrinsicDrive":12,"temp":35.6,"lactate":3.6},"cardiac":{"baseHr":48,"baseSbp":74,"baseDbp":42,"preload":0.76,"svr":0.48,"contractility":0.92,"rhythm":"sinus_brady","stDeviation":0.0,"ectopyProb":0.02},"ventDefaults":{"vtSet":440,"rrSet":14,"peepSet":5,"fio2Set":40}},
    betablocker_od: {"id":"betablocker_od","name":"Intoxicação por Betabloqueador","severity":"critical","severityLabel":"CRÍTICO","subtitle":"BAV 2º Grau Mobitz II (38 bpm) + Choque Cardiogênico (68/40) + Acidose","guidance":"Superdosagem de betabloqueador / bloqueador de canal de cálcio provoca bradicardia refratária, bloqueio AV e grave depressão inotrópica. Conduta: Adrenalina/Dobutamina em bomba, Gluconato de Cálcio 10% EV, volume cauteloso e Marcapasso Transcutâneo no Vivo Gold.","patient":{"compliance":48,"resistance":9,"shunt":0.14,"vco2":185,"baseExcess":-7,"intrinsicDrive":12,"temp":36.0,"lactate":4.6},"cardiac":{"baseHr":38,"baseSbp":68,"baseDbp":40,"preload":0.94,"svr":0.78,"contractility":0.56,"rhythm":"av_block_2_m2","stDeviation":-0.5,"ectopyProb":0.07},"ventDefaults":{"vtSet":440,"rrSet":14,"peepSet":5,"fio2Set":60}},
    thyroid_storm: {"id":"thyroid_storm","name":"Tempestade Tireotóxica","severity":"severe","severityLabel":"GRAVE","subtitle":"Hipertermia (40.4 °C) + FA Alta (162 bpm) + Hipermetabolismo (VCO₂ 340)","guidance":"Crise tireotóxica gera hipermetabolismo extremo (VCO₂ 340 mL/min, febre > 40 °C), FA de alta resposta e risco de insuficiência cardíaca de alto débito. Conduta: controle de frequência cardíaca (Amiodarona/Cardioversão se instável), suporte ventilatório com volume-minuto elevado e hidratação.","patient":{"compliance":54,"resistance":8,"shunt":0.12,"vco2":340,"baseExcess":-4,"intrinsicDrive":26,"temp":40.4,"lactate":3.6},"cardiac":{"baseHr":162,"baseSbp":158,"baseDbp":72,"preload":0.95,"svr":0.76,"contractility":1.25,"rhythm":"afib_rvr","stDeviation":-0.8,"ectopyProb":0.09},"ventDefaults":{"vtSet":460,"rrSet":22,"peepSet":5,"fio2Set":60,"flowSet":55}},
    myasthenic_crisis: {"id":"myasthenic_crisis","name":"Crise Miastênica (Hipoventilação)","severity":"moderate","severityLabel":"MODERADO-GRAVE","subtitle":"Pulmão normal (C 58 / R 7) + Fraqueza diafragmática (Drive 5 irpm)","guidance":"Insuficiência respiratória puramente neuromuscular: mecânica pulmonar normal, porém fraqueza muscular gera hipoventilação progressiva, hipercapnia e acidose respiratória (atenção ao pH caindo!). Conduta: VNI (BiPAP) precoce ou intubação eletiva + VM controlada antes da fadiga total / PCR.","patient":{"compliance":58,"resistance":7,"shunt":0.06,"vco2":220,"baseExcess":0,"intrinsicDrive":5,"temp":36.8,"lactate":1.8},"cardiac":{"baseHr":106,"baseSbp":128,"baseDbp":78,"preload":0.96,"svr":1.08,"contractility":0.96,"rhythm":"sinus_tach","stDeviation":0.0,"ectopyProb":0.02},"ventDefaults":{"vtSet":450,"rrSet":14,"peepSet":5,"fio2Set":35}},
    myxedema_coma: {"id":"myxedema_coma","name":"Coma Mixedematoso (Endócrino)","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Hipotermia grave (33.2 °C) + Bradicardia (44 bpm) + Hipoventilação central","guidance":"Descompensação extrema do hipotireoidismo com hipotermia severa, hipoventilação central (hipercapnia progressiva), bradicardia e choque cardiogênico-vasoplégico. Conduta: Reaquecimento ativo gradual, proteção de via aérea + VM, Noradrenalina se PAM < 65 e reposição hormonal (Levotiroxina + Hidrocortisona EV).","patient":{"compliance":52,"resistance":8,"shunt":0.12,"vco2":155,"baseExcess":-4,"intrinsicDrive":6,"temp":33.2,"lactate":3.4},"cardiac":{"baseHr":44,"baseSbp":82,"baseDbp":50,"preload":0.86,"svr":0.92,"contractility":0.72,"rhythm":"sinus_brady","stDeviation":-0.3,"ectopyProb":0.05},"ventDefaults":{"vtSet":440,"rrSet":14,"peepSet":5,"fio2Set":50}},
    adrenal_crisis: {"id":"adrenal_crisis","name":"Crise Adrenal Aguda (Endócrino)","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Choque refratário (68/40) + Vasoplegia + Acidose metabólica + Febre","guidance":"Insuficiência adrenal aguda gera choque distributivo-hipovolêmico resistente a catecolaminas por perda de sensibilidade vascular aos receptores adrenérgicos, além de hiponatremia, hipoglicemia e acidose. Conduta: expansão volêmica vigorosa com SF 0,9%, Hidrocortisona 100 mg EV imediata e Noradrenalina/Vasopressina.","patient":{"compliance":54,"resistance":7,"shunt":0.12,"vco2":230,"baseExcess":-9,"intrinsicDrive":22,"temp":38.4,"lactate":4.8},"cardiac":{"baseHr":126,"baseSbp":68,"baseDbp":40,"preload":0.62,"svr":0.56,"contractility":0.86,"rhythm":"sinus_tach","stDeviation":-0.5,"ectopyProb":0.05},"ventDefaults":{"vtSet":440,"rrSet":18,"peepSet":5,"fio2Set":50}},
    hhs_hyperosmolar: {"id":"hhs_hyperosmolar","name":"Estado Hiperosmolar • EHH (Endócrino)","severity":"severe","severityLabel":"GRAVE","subtitle":"Desidratação extrema (Pré-carga 0.52) + Taquicardia (132) + Hipoperfusão","guidance":"Estado Hiperglicêmico Hiperosmolar (glicemia > 600 mg/dL, osmolaridade > 320 mOsm/kg) causa diurese osmótica maciça, déficit hídrico severo (8–10 L), hipotensão e rebaixamento de consciência sem cetoacidose grave. Conduta: expansão volêmica vigorosa com SF 0,9%, proteção de via aérea se coma e insulina/K⁺ graduais.","patient":{"compliance":56,"resistance":7,"shunt":0.09,"vco2":220,"baseExcess":-5,"intrinsicDrive":18,"temp":37.6,"lactate":4.2},"cardiac":{"baseHr":132,"baseSbp":78,"baseDbp":48,"preload":0.52,"svr":1.34,"contractility":0.92,"rhythm":"sinus_tach","stDeviation":-0.4,"ectopyProb":0.04},"ventDefaults":{"vtSet":450,"rrSet":16,"peepSet":5,"fio2Set":40}},
    pheochromocytoma_crisis: {"id":"pheochromocytoma_crisis","name":"Crise de Feocromocitoma (Endócrino)","severity":"critical","severityLabel":"CRÍTICO","subtitle":"PA 226/132 mmHg + Descarga adrenérgica (FC 144 bpm) + Isquemia ST","guidance":"Liberação maciça de catecolaminas desencadeia emergência hipertensiva extrema (RVS 1.72), taquicardia severa, ectopias e risco de EAP/AVC/FV. Conduta: vasodilatador titulável imediato em bomba (Nitroprussiato / alfa-bloqueio) para reduzir PA com segurança. ARMADILHA: evitar betabloqueio isolado sem alfa-bloqueio prévio!","patient":{"compliance":42,"resistance":9,"shunt":0.14,"vco2":285,"baseExcess":-4,"intrinsicDrive":24,"temp":38.2,"lactate":3.9},"cardiac":{"baseHr":144,"baseSbp":226,"baseDbp":132,"preload":1.08,"svr":1.72,"contractility":1.18,"rhythm":"sinus_tach","stDeviation":-1.4,"ectopyProb":0.14},"ventDefaults":{"vtSet":440,"rrSet":18,"peepSet":6,"fio2Set":50}},
    eclampsia_hellp: {"id":"eclampsia_hellp","name":"Eclâmpsia / Sínd. HELLP (Obstetrícia)","severity":"critical","severityLabel":"CRÍTICO","subtitle":"PA 204/118 mmHg + Vasoespasmo + Hipermetabolismo convulsivo • MgSO₄","guidance":"Emergência hipertensiva gestacional com risco de convulsão eclâmptica, AVC hemorrágico, rotura hepática (HELLP) e edema pulmonar. Conduta: Sulfato de Magnésio EV imediato (droga de escolha contra convulsões), vasodilatador titulável para PA < 160/110 e restrição hídrica (evitar EAP). Contraindicação absoluta à trombólise!","patient":{"label":"Gestante • 68 kg (PBW)","weightKg":68,"compliance":42,"resistance":9,"shunt":0.14,"vco2":275,"baseExcess":-5,"intrinsicDrive":22,"temp":37.6,"lactate":3.8},"cardiac":{"baseHr":122,"baseSbp":204,"baseDbp":118,"preload":1.12,"svr":1.62,"contractility":1.04,"rhythm":"sinus_tach","stDeviation":-0.7,"ectopyProb":0.06},"ventDefaults":{"vtSet":410,"rrSet":18,"peepSet":6,"fio2Set":55}},
    postpartum_hemorrhage: {"id":"postpartum_hemorrhage","name":"Hemorragia Pós-Parto • HPP (Obstetrícia)","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Choque hemorrágico grau IV (Pré-carga 0.44) + PA 64/38 + Acidose lática","guidance":"Principal causa de morte materna aguda (atonia uterina / laceração). Perda sanguínea maciça derruba rapidamente pré-carga e débito cardíaco. Conduta: protocolo de transfusão maciça (Concentrado de Hemácias imediato), expansão volêmica aquecida, uterotônicos/ácido tranexâmico e Noradrenalina ponte se PAM < 65. NUNCA trombolisar!","patient":{"label":"Puérpera • 66 kg (PBW)","weightKg":66,"compliance":56,"resistance":6,"shunt":0.09,"vco2":215,"baseExcess":-11,"intrinsicDrive":24,"temp":35.6,"lactate":6.2},"cardiac":{"baseHr":142,"baseSbp":64,"baseDbp":38,"preload":0.44,"svr":1.48,"contractility":0.95,"rhythm":"sinus_tach","stDeviation":-0.6,"ectopyProb":0.05},"ventDefaults":{"vtSet":410,"rrSet":18,"peepSet":4,"fio2Set":80}},
    amniotic_embolism: {"id":"amniotic_embolism","name":"Embolia Líq. Amniótico • ELA (Obstetrícia)","severity":"critical","severityLabel":"CRÍTICO","subtitle":"Hipoxemia súbita (Shunt 36%) + Choque obstrutivo/anafilactoide (66/40)","guidance":"Catástrofe obstétrica periparto com hipertensão pulmonar aguda, hipoxemia severa (Shunt 36%, C 28), falência de VD/VE e coagulopatia (CIVD). Conduta: IOT imediata com FiO₂ 100%, suporte vasopressor/inotrópico (Noradrenalina + Dobutamina/Adrenalina), transfusão de hemocomponentes (CIVD) e PEEP titulada sem colapsar o VD.","patient":{"label":"Gestante • 68 kg (PBW)","weightKg":68,"compliance":28,"resistance":14,"shunt":0.36,"vco2":235,"baseExcess":-10,"intrinsicDrive":26,"temp":36.3,"lactate":6.5},"cardiac":{"baseHr":138,"baseSbp":66,"baseDbp":40,"preload":0.58,"svr":0.62,"contractility":0.55,"rhythm":"sinus_tach","stDeviation":-1.3,"ectopyProb":0.11},"ventDefaults":{"mode":"PCV","vtSet":390,"pcSet":17,"rrSet":22,"peepSet":8,"fio2Set":100}},
    peripartum_cardiomyopathy: {"id":"peripartum_cardiomyopathy","name":"Cardiomiopatia Periparto (Obstetrícia)","severity":"severe","severityLabel":"GRAVE","subtitle":"Falência sistólica aguda (Contratil. 0.46) + EAP grave (Shunt 30%, C 28)","guidance":"Insuficiência cardíaca sistólica aguda no final da gestação ou puerpério com congestão pulmonar intensa (C 28, Shunt 30%) e baixo débito (PA 82/54). Conduta: Dobutamina contínua para suporte inotrópico, VNI/PEEP (10–12 cmH₂O) para melhorar oxigenação e reduzir pós-carga, Furosemida cautelosa se congestão; evitar bolus excessivo de cristaloide.","patient":{"label":"Puérpera • 66 kg (PBW)","weightKg":66,"compliance":28,"resistance":12,"shunt":0.30,"vco2":215,"baseExcess":-6,"intrinsicDrive":26,"temp":36.5,"lactate":4.4},"cardiac":{"baseHr":126,"baseSbp":82,"baseDbp":54,"preload":1.26,"svr":1.36,"contractility":0.46,"rhythm":"sinus_tach","stDeviation":-1.1,"ectopyProb":0.10},"ventDefaults":{"mode":"PCV","vtSet":400,"pcSet":16,"psSet":14,"rrSet":20,"peepSet":10,"fio2Set":80}},
  }).map(([k, v]) => [k, _mDeep(_SC_BASE, v)]));
  const ECG_RHYTHMS = [
    {
      id: 'sinus',
      name: 'Ritmo Sinusal Normal',
      shortLabel: 'Sinusal',
      category: 'Sinusais',
      defaultHr: 78,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'FC 60–100 bpm • Onda P+ antes de cada QRS • PR 120–200 ms • QRS < 120 ms • RR regular'
    },
    {
      id: 'sinus_tach',
      name: 'Taquicardia Sinusal',
      shortLabel: 'Taqui Sinusal',
      category: 'Sinusais',
      defaultHr: 122,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'FC > 100 bpm • Onda P sinusal 1:1 antes do QRS • RR regular • Investigar dor, febre, hipovolemia ou hipóxia'
    },
    {
      id: 'sinus_brady',
      name: 'Bradicardia Sinusal',
      shortLabel: 'Bradi Sinusal',
      category: 'Sinusais',
      defaultHr: 48,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'FC < 60 bpm • Onda P sinusal 1:1 antes do QRS • PR constante • Avaliar perfusão e tônus vagal'
    },
    {
      id: 'afib',
      name: 'Fibrilação Atrial (FA)',
      shortLabel: 'FA',
      category: 'Supraventriculares',
      defaultHr: 88,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'Ausência de onda P • Ondas f fibrilatórias (350–600 bpm) • Intervalos RR irregularmente irregulares'
    },
    {
      id: 'afib_rvr',
      name: 'FA de Alta Resposta (RVR)',
      shortLabel: 'FA RVR',
      category: 'Supraventriculares',
      defaultHr: 136,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'FA com FC > 110–130 bpm • RR irregularmente irregular • Reduz enchimento diastólico e débito cardíaco'
    },
    {
      id: 'aflutter',
      name: 'Flutter Atrial (3:1)',
      shortLabel: 'Flutter Atrial',
      category: 'Supraventriculares',
      defaultHr: 100,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'Ondas F em "dente de serra" (~300 bpm, negativas em DII) • Bloqueio AV fixo (ex: 3:1 -> ~100 bpm)'
    },
    {
      id: 'svt',
      name: 'Taquicardia Supraventricular (TPSV)',
      shortLabel: 'TPSV',
      category: 'Supraventriculares',
      defaultHr: 174,
      pulseless: false,
      shockable: false,
      stDefault: -0.4,
      criteria: 'FC 150–220 bpm • QRS estreito extremamente regular • P ausente ou retrógrada (pseudo-S)'
    },
    {
      id: 'av_block_1',
      name: 'BAV de 1º Grau',
      shortLabel: 'BAV 1ºG',
      category: 'Bloqueios AV',
      defaultHr: 72,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'Intervalo PR fixo e prolongado > 200 ms (~280 ms) • Todas as ondas P conduzem QRS (relação 1:1)'
    },
    {
      id: 'av_block_2_m1',
      name: 'BAV 2º Grau Mobitz I (Wenckebach)',
      shortLabel: 'BAV 2ºG M-I',
      category: 'Bloqueios AV',
      defaultHr: 60,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'Alargamento progressivo do PR (150 → 240 → 340 ms) até 1 onda P bloqueada (sem QRS) • Padrão agrupado'
    },
    {
      id: 'av_block_2_m2',
      name: 'BAV 2º Grau Mobitz II',
      shortLabel: 'BAV 2ºG M-II',
      category: 'Bloqueios AV',
      defaultHr: 50,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'Intervalo PR constante nos batimentos conduzidos com bloqueio súbito de onda P (3:2) • Risco de BAVT!'
    },
    {
      id: 'av_block_3',
      name: 'BAV Total / 3º Grau (BAVT)',
      shortLabel: 'BAV Total',
      category: 'Bloqueios AV',
      defaultHr: 36,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'Dissociação AV completa • Ondas P (~75 bpm) marcham independentes do escape ventricular lento (~36 bpm)'
    },
    {
      id: 'rbbb',
      name: 'Bloqueio de Ramo Direito (BRD)',
      shortLabel: 'BRD',
      category: 'Bloqueios de Ramo',
      defaultHr: 78,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'PR normal • QRS ≥ 120 ms • Padrão rsR\' ("orelha de coelho") em DII e onda S larga empastada em DI/V5'
    },
    {
      id: 'lbbb',
      name: 'Bloqueio de Ramo Esquerdo (BRE)',
      shortLabel: 'BRE',
      category: 'Bloqueios de Ramo',
      defaultHr: 78,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'PR normal • QRS ≥ 120 ms • Onda R larga entalhada em DI/V5 com discordância ST-T (BRE novo = equivalente IAM)'
    },
    {
      id: 'vtach',
      name: 'Taquicardia Ventricular Monomórfica (TV)',
      shortLabel: 'TV Mono',
      category: 'Ventriculares & PCR',
      defaultHr: 168,
      pulseless: false,
      shockable: true,
      stDefault: 0.0,
      criteria: 'QRS largo bizarro (> 140 ms) regular e rápido • Dissociação AV • Checar pulso: TV com pulso vs sem pulso'
    },
    {
      id: 'torsades',
      name: 'Torsades de Pointes (TV Polimórfica)',
      shortLabel: 'Torsades',
      category: 'Ventriculares & PCR',
      defaultHr: 205,
      pulseless: true,
      shockable: true,
      stDefault: 0.0,
      criteria: 'TV polimórfica com torção helicoidal das pontas ao redor da linha de base • Associada a QT longo • Sulfato de Mg + Choque'
    },
    {
      id: 'vf',
      name: 'Fibrilação Ventricular (FV)',
      shortLabel: 'FV (PCR)',
      category: 'Ventriculares & PCR',
      defaultHr: 0,
      pulseless: true,
      shockable: true,
      stDefault: 0.0,
      criteria: 'Atividade elétrica caótica sem QRS identificável • Ausência total de débito/pulso • Ritmo CHOCÁVEL (Desfibrilar + RCP)'
    },
    {
      id: 'pea',
      name: 'Atividade Elétrica Sem Pulso (AESP)',
      shortLabel: 'AESP (PCR)',
      category: 'Ventriculares & PCR',
      defaultHr: 42,
      pulseless: true,
      shockable: false,
      stDefault: 0.0,
      criteria: 'Complexos QRS organizados no ECG sem pulso arterial nem curva de SpO₂ • Ritmo NÃO-chocável (RCP + Adrenalina + 5H/5T)'
    },
    {
      id: 'asystole',
      name: 'Assistolia',
      shortLabel: 'Assistolia (PCR)',
      category: 'Ventriculares & PCR',
      defaultHr: 0,
      pulseless: true,
      shockable: false,
      stDefault: 0.0,
      criteria: 'Linha isoelétrica plana sem atividade elétrica nem pulso • Checar cabos/ganho/derivação • Ritmo NÃO-chocável'
    },
    {
      id: 'stemi',
      name: 'Supra de ST (IAMCSST)',
      shortLabel: 'Supra ST',
      category: 'Isquemia / Eletrolítico / MP',
      defaultHr: 92,
      pulseless: false,
      shockable: false,
      stDefault: 3.8,
      criteria: 'Supradesnivelamento J-ST convexo > 2 mm + onda T hiperaguda • Lesão subepicárdica aguda (reperfusão imediata)'
    },
    {
      id: 'de_winter',
      name: 'Padrão de De Winter (Equiv. IAMCSST)',
      shortLabel: 'De Winter',
      category: 'Isquemia / Eletrolítico / MP',
      defaultHr: 88,
      pulseless: false,
      shockable: false,
      stDefault: -2.0,
      criteria: 'Infradesnivelamento ascendente do ponto J/ST (1–3 mm) seguido de onda T alta, simétrica e hiperaguda • Oclusão proximal da DA!'
    },
    {
      id: 'wpw',
      name: 'Síndrome de Wolff-Parkinson-White (WPW)',
      shortLabel: 'WPW',
      category: 'Supraventriculares',
      defaultHr: 84,
      pulseless: false,
      shockable: false,
      stDefault: -0.4,
      criteria: 'PR curto (< 120 ms) + Onda Delta (subida inicial empastada do QRS) + QRS ≥ 120 ms • Evitar bloqueadores nodais na FA!'
    },
    {
      id: 'hyperkalemia',
      name: 'Hipercalemia Grave (T Apiculada)',
      shortLabel: 'HiperK+',
      category: 'Isquemia / Eletrolítico / MP',
      defaultHr: 66,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'Onda T alta, estreita, simétrica e apiculada ("em tenda") + achatamento de P + alargamento de QRS • Gluconato de Ca!'
    },
    {
      id: 'paced',
      name: 'Marcapasso Ventricular (VVI)',
      shortLabel: 'Marcapasso',
      category: 'Isquemia / Eletrolítico / MP',
      defaultHr: 70,
      pulseless: false,
      shockable: false,
      stDefault: 0.0,
      criteria: 'Espícula vertical nítida precedendo QRS largo estimulado (padrão tipo BRE) com discordância ST-T'
    }
  ];

  const ECG_RHYTHM_MAP = ECG_RHYTHMS.reduce((acc, r) => {
    acc[r.id] = r;
    return acc;
  }, {});

  // Biblioteca DERS de Drogas Vasoativas & Sedoanalgesia (Bomba Samtronic Icatus 4.0)
  const IV_DRUGS = [
    {
      id: 'noradrenalina',
      name: 'NORADRENALINA',
      concLabel: '64 mcg/mL',
      concPerMl: 64, // mcg/mL (16 mg / 250 mL)
      unit: 'mcg/kg/min',
      doseMode: 'mcg_kg_min',
      defaultRate: 0.00,
      minRate: 0.00,
      maxRate: 2.00,
      step: 0.05,
      bolusAddMl: 0,
      role: 'Vasopressor α1 (eleva PAM / RVS)'
    },
    {
      id: 'fentanil',
      name: 'FENTANIL',
      concLabel: '50 mcg/mL',
      concPerMl: 50, // mcg/mL (puro)
      unit: 'mcg/kg/h',
      doseMode: 'mcg_kg_h',
      defaultRate: 1.50,
      minRate: 0.00,
      maxRate: 10.00,
      step: 0.50,
      bolusAddMl: 1.0,
      role: 'Analgesia opioide (reduz drive respiratório)'
    },
    {
      id: 'propofol',
      name: 'PROPOFOL 1%',
      concLabel: '10 mg/mL',
      concPerMl: 10, // mg/mL
      unit: 'mg/kg/h',
      doseMode: 'mg_kg_h',
      defaultRate: 1.50,
      minRate: 0.00,
      maxRate: 6.00,
      step: 0.25,
      bolusAddMl: 3.0,
      role: 'Sedativo hipnótico (reduz drive & RVS/PAM)'
    },
    {
      id: 'midazolam',
      name: 'MIDAZOLAM',
      concLabel: '1 mg/mL',
      concPerMl: 1, // mg/mL
      unit: 'mg/kg/h',
      doseMode: 'mg_kg_h',
      defaultRate: 0.08,
      minRate: 0.00,
      maxRate: 0.50,
      step: 0.02,
      bolusAddMl: 2.0,
      role: 'Sedação BZD (reduz drive & ansiedade)'
    },
    {
      id: 'vasopressina',
      name: 'VASOPRESSINA',
      concLabel: '0.4 U/mL',
      concPerMl: 0.4, // U/mL (20 UI / 50 mL)
      unit: 'U/min',
      doseMode: 'u_min',
      defaultRate: 0.03,
      minRate: 0.00,
      maxRate: 0.08,
      step: 0.01,
      bolusAddMl: 0,
      role: 'Vasopressor V1 (eleva PAM sem taquicardia)'
    },
    {
      id: 'dobutamina',
      name: 'DOBUTAMINA',
      concLabel: '1000 mcg/mL',
      concPerMl: 1000, // mcg/mL (250 mg / 250 mL)
      unit: 'mcg/kg/min',
      doseMode: 'mcg_kg_min',
      defaultRate: 5.00,
      minRate: 0.00,
      maxRate: 20.00,
      step: 1.00,
      bolusAddMl: 0,
      role: 'Inotrópico β1 (eleva contratilidade, DC e FC)'
    },
    {
      id: 'adrenalina',
      name: 'ADRENALINA',
      concLabel: '60 mcg/mL',
      concPerMl: 60, // mcg/mL (6 mg / 100 mL)
      unit: 'mcg/kg/min',
      doseMode: 'mcg_kg_min',
      defaultRate: 0.10,
      minRate: 0.00,
      maxRate: 1.00,
      step: 0.05,
      bolusAddMl: 0,
      role: 'Inotrópico + Vasopressor + Broncodilatador'
    },
    {
      id: 'nitroprussiato',
      name: 'NITROPRUSSIATO',
      concLabel: '200 mcg/mL',
      concPerMl: 200, // mcg/mL (50 mg / 250 mL)
      unit: 'mcg/kg/min',
      doseMode: 'mcg_kg_min',
      defaultRate: 1.00,
      minRate: 0.00,
      maxRate: 8.00,
      step: 0.25,
      bolusAddMl: 0,
      role: 'Vasodilatador potente (reduz RVS / PAM)'
    },
    {
      id: 'amiodarona',
      name: 'AMIODARONA',
      concLabel: '1.8 mg/mL',
      concPerMl: 1.8, // mg/mL (900 mg / 500 mL)
      unit: 'mg/min',
      doseMode: 'mg_min',
      defaultRate: 1.00,
      minRate: 0.00,
      maxRate: 2.00,
      step: 0.25,
      bolusAddMl: 5.0,
      role: 'Antiarrítmico Classe III (reduz FC/ectopias)'
    },
    {
      id: 'dexmedetomidina',
      name: 'DEXMEDETOMIDINA',
      concLabel: '4 mcg/mL',
      concPerMl: 4, // mcg/mL (200 mcg / 50 mL)
      unit: 'mcg/kg/h',
      doseMode: 'mcg_kg_h',
      defaultRate: 0.40,
      minRate: 0.10,
      maxRate: 1.40,
      step: 0.10,
      bolusAddMl: 2.0,
      role: 'Agonista α2 (sedação cooperativa sem depressão respiratória)'
    },
    {
      id: 'remifentanil',
      name: 'REMIFENTANIL',
      concLabel: '50 mcg/mL',
      concPerMl: 50, // mcg/mL (2 mg / 40 mL)
      unit: 'mcg/kg/min',
      doseMode: 'mcg_kg_min',
      defaultRate: 0.10,
      minRate: 0.02,
      maxRate: 0.50,
      step: 0.02,
      bolusAddMl: 0,
      role: 'Opioide ultracurto (analgesia titulável rápida + bradicardia)'
    },
    {
      id: 'sufentanil',
      name: 'SUFENTANIL',
      concLabel: '5 mcg/mL',
      concPerMl: 5, // mcg/mL (250 mcg / 50 mL)
      unit: 'mcg/kg/h',
      doseMode: 'mcg_kg_h',
      defaultRate: 0.25,
      minRate: 0.05,
      maxRate: 1.20,
      step: 0.05,
      bolusAddMl: 1.0,
      role: 'Opioide potente (estabilidade hemodinâmica + analgesia)'
    },
    {
      id: 'morfina',
      name: 'MORFINA',
      concLabel: '1 mg/mL',
      concPerMl: 1, // mg/mL (50 mg / 50 mL)
      unit: 'mg/h',
      doseMode: 'mg_h',
      defaultRate: 1.00,
      minRate: 0.00,
      maxRate: 8.00,
      step: 0.50,
      bolusAddMl: 1.0,
      role: 'Analgesia opioide sistêmica / PCA padrão'
    }
  ];

  const IV_DRUG_MAP = IV_DRUGS.reduce((acc, d) => {
    acc[d.id] = d;
    return acc;
  }, {});

  // Dispositivos de Oferta de Oxigênio (pré-VM / pós-extubação)
  const O2_DEVICES = [
    {
      id: 'room_air',
      name: 'Ar Ambiente (AA)',
      shortName: 'Ar Ambiente',
      flowDefault: 0,
      flowMin: 0,
      flowMax: 0,
      flowStep: 1,
      flowUnit: '',
      peepSupport: 0,
      psSupport: 0,
      calcFio2: () => 21,
      desc: 'Sem suplementação de O₂ (FiO₂ 21%)'
    },
    {
      id: 'nasal_cannula',
      name: 'Cateter Nasal (CN 1–6 L/min)',
      shortName: 'Cateter Nasal',
      flowDefault: 3,
      flowMin: 1,
      flowMax: 6,
      flowStep: 1,
      flowUnit: 'L/min',
      peepSupport: 0,
      psSupport: 0,
      calcFio2: (f) => Math.min(44, 20 + 4 * f),
      desc: 'Baixo fluxo • FiO₂ estimada ~24–44%'
    },
    {
      id: 'venturi',
      name: 'Máscara de Venturi (FiO₂ fixa)',
      shortName: 'Venturi',
      flowDefault: 35,
      flowMin: 24,
      flowMax: 50,
      flowStep: 5,
      flowUnit: '% FiO₂',
      peepSupport: 0.5,
      psSupport: 0,
      calcFio2: (f) => clamp(f, 24, 50),
      desc: 'FiO₂ precisa e controlada (ideal retentores/DPOC)'
    },
    {
      id: 'hudson_mask',
      name: 'Máscara Facial Simples (5–10 L/min)',
      shortName: 'Máscara Simples',
      flowDefault: 7,
      flowMin: 5,
      flowMax: 10,
      flowStep: 1,
      flowUnit: 'L/min',
      peepSupport: 0,
      psSupport: 0,
      calcFio2: (f) => Math.round(clamp(25 + f * 3.5, 40, 60)),
      desc: 'Médio fluxo • FiO₂ ~40–60%'
    },
    {
      id: 'non_rebreather',
      name: 'Máscara Não-Reinalante (MNR)',
      shortName: 'MNR c/ Reserv.',
      flowDefault: 15,
      flowMin: 10,
      flowMax: 15,
      flowStep: 1,
      flowUnit: 'L/min',
      peepSupport: 0.5,
      psSupport: 0,
      calcFio2: (f) => Math.round(clamp(65 + f * 2, 85, 95)),
      desc: 'Reservatório alto fluxo • FiO₂ ~85–95%'
    },
    {
      id: 'hfnc',
      name: 'Cateter Nasal Alto Fluxo (CNAF)',
      shortName: 'CNAF',
      flowDefault: 50,
      flowMin: 30,
      flowMax: 60,
      flowStep: 5,
      flowUnit: 'L/min',
      peepSupport: 3.0,
      psSupport: 2,
      calcFio2: (f) => Math.round(clamp(30 + f * 0.9, 50, 88)),
      desc: 'Alto fluxo aquecido • Gera PEEP leve (~3 cmH₂O) e reduz espaço morto'
    },
    {
      id: 'niv',
      name: 'VNI Não-Invasiva (BiPAP / CPAP)',
      shortName: 'VNI (BiPAP)',
      flowDefault: 60,
      flowMin: 30,
      flowMax: 100,
      flowStep: 5,
      flowUnit: '% FiO₂',
      peepSupport: 8.0,
      psSupport: 8,
      calcFio2: (f) => clamp(f, 30, 100),
      desc: 'EPAP 8 + IPAP • Recruta alvéolos no EAP/DPOC sem IOT'
    },
    {
      id: 'bvm',
      name: 'BVM / Ambu c/ Reservatório (100%)',
      shortName: 'BVM / Ambu',
      flowDefault: 15,
      flowMin: 10,
      flowMax: 15,
      flowStep: 1,
      flowUnit: 'L/min',
      peepSupport: 2.0,
      psSupport: 10,
      calcFio2: () => 100,
      desc: 'Pré-oxigenação / assistência manual em apneia até acoplar à VM'
    }
  ];

  const O2_DEVICE_MAP = O2_DEVICES.reduce((acc, d) => {
    acc[d.id] = d;
    return acc;
  }, {});

  // Fármacos EV Administráveis (Bolus / Emergência / SRI)
  const BOLUS_DRUGS = [
    { id: 'salbutamol_mgso4', name: 'Salbutamol + Sulfato de Mg 2g EV', role: 'Broncodilatação potente (Asma / Broncoespasmo)' },
    { id: 'furosemida', name: 'Furosemida 40–80 mg EV', role: 'Diurético de alça — reduz congestão e pré-carga (EAP)' },
    { id: 'nitroglicerina', name: 'Nitroglicerina / Dinitrato EV', role: 'Venodilatador/vasodilatador rápido (EAP hipertensivo / IAM)' },
    { id: 'naloxona', name: 'Naloxona 0.4 mg EV', role: 'Antagonista opioide — restaura drive respiratório' },
    { id: 'cetamina_sri', name: 'Cetamina 1.5 mg/kg EV (SRI)', role: 'Indutor broncodilatador que preserva PAM (Asma / Choque)' },
    { id: 'etomidato_sri', name: 'Etomidato 0.3 mg/kg EV (SRI)', role: 'Indutor cardioestável (TCE / Instabilidade)' },
    { id: 'adrenalina_bolus', name: 'Adrenalina 1 mg EV (Bolus)', role: 'PCR (FV/AESP/Assistolia) ou choque refratário extremo' },
    { id: 'amiodarona_bolus', name: 'Amiodarona 300 mg EV', role: 'Antiarrítmico p/ FV/TV refratária ou taquiarritmias' },
    { id: 'atropina', name: 'Atropina 1 mg EV', role: 'Anticolinérgico p/ bradicardia sinusal sintomática' },
    { id: 'adenosina', name: 'Adenosina 6 mg EV (Bolus rápido)', role: 'Reversão de TPSV estável (evitar em FA c/ WPW!)' },
    { id: 'gluconato_calcio', name: 'Gluconato de Cálcio 10% 10 mL EV', role: 'Estabilização de membrana imediata na Hipercalemia' },
    { id: 'bicarbonato', name: 'Bicarbonato de Sódio 8,4% 100 mEq EV', role: 'Tamponamento em acidose metabólica grave (pH < 7.15) / hipercalemia' },
    { id: 'sulfato_magnesio', name: 'Sulfato de Magnésio 2g EV', role: 'Estabilizador p/ Torsades de Pointes & broncoespasmo grave' }
  ];

  const BOLUS_DRUG_MAP = BOLUS_DRUGS.reduce((acc, d) => {
    acc[d.id] = d;
    return acc;
  }, {});

  // Recomendações terapêuticas por cenário clínico (Droga mais adequada + Bomba + O2)
  const SCENARIO_PHARMA = {
    stable: {
      bestDrug: 'Analgesia leve (Dipirona / Fentanil baixa dose se dor)',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'fentanil',
      recommendedPumpRate: 0.5,
      recommendedO2: 'nasal_cannula',
      avoid: 'Evitar sedação profunda desnecessária que cause depressão respiratória sem VM.',
      rationale: 'Pós-operatório estável: suporte basal com Cateter Nasal se SpO₂ < 94% e analgesia titulada.'
    },
    asthma: {
      bestDrug: 'Salbutamol + Sulfato de Mg 2g EV (SRI: Cetamina)',
      recommendedBolusId: 'salbutamol_mgso4',
      recommendedPumpDrug: 'adrenalina',
      recommendedPumpRate: 0.08,
      recommendedO2: 'non_rebreather',
      avoid: 'Evitar Morfina/Propofol isolado em broncoespasmo grave se risco de liberação histamínica/hipotensão.',
      rationale: 'Broncodilatação máxima + MgSO₄ relaxa músculo liso brônquico; se necessitar IOT, preferir Cetamina.'
    },
    ards: {
      bestDrug: 'Sedoanalgesia em bomba (Propofol + Fentanil) para VM protetora',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'propofol',
      recommendedPumpRate: 1.8,
      recommendedO2: 'hfnc',
      avoid: 'Evitar sobrecarga hídrica (bolus SF desnecessários pioram edema alveolar).',
      rationale: 'CNAF/VNI inicial ou IOT precoce + sedação contínua para acoplamento em Vt 6 mL/kg e PEEP titulada.'
    },
    septic_shock: {
      bestDrug: 'Noradrenalina (1ª escolha vasopressora) + Vasopressina se refratário',
      recommendedBolusId: 'adrenalina_bolus',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.15,
      recommendedO2: 'non_rebreather',
      avoid: 'Evitar Propofol ou Nitroprussiato (agravam vasoplegia e derrubam PAM).',
      rationale: 'Iniciar Noradrenalina precocemente na Samtronic para PAM ≥ 65 mmHg junto à reposição volêmica guiada.'
    },
    pulmonary_edema: {
      bestDrug: 'Nitroglicerina / Nitroprussiato EV + Furosemida 40–80 mg EV',
      recommendedBolusId: 'furosemida',
      recommendedPumpDrug: 'nitroprussiato',
      recommendedPumpRate: 1.25,
      recommendedO2: 'niv',
      avoid: 'Evitar bolus de Cristalóide SF 0,9% (agrava congestão pulmonar).',
      rationale: 'VNI (EPAP/PEEP) + vasodilatador/diurético reduzem pré/pós-carga e edema alveolar rapidamente.'
    },
    pneumothorax: {
      bestDrug: 'Prioridade absoluta: DESCOMPRESSÃO TORÁCICA (Noradrenalina apenas ponte)',
      recommendedBolusId: 'cetamina_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.10,
      recommendedO2: 'non_rebreather',
      avoid: 'Evitar sedativos hipotensores e PEEP alta antes da drenagem torácica.',
      rationale: 'Choque obstrutivo não responde apenas a drogas: descomprimir o hemitórax imediatamente!'
    },
    opioid_apnea: {
      bestDrug: 'Naloxona 0.4 mg EV (se opioide) ou Etomidato na SRI do TCE',
      recommendedBolusId: 'naloxona',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.08,
      recommendedO2: 'bvm',
      avoid: 'Evitar Propofol em bolus no TCE (hipotensão reduz Pressão de Perfusão Cerebral).',
      rationale: 'Em apneia, ventilar com BVM 100% imediato, considerar Naloxona ou intubar (Etomidato) e acoplar à VM.'
    },
    cardiac_arrest: {
      bestDrug: 'Adrenalina 1 mg EV (cada 3–5 min) + Amiodarona 300 mg EV (FV refratária)',
      recommendedBolusId: 'adrenalina_bolus',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.15,
      recommendedO2: 'bvm',
      avoid: 'Não interromper compressões torácicas por acesso/drogas.',
      rationale: 'Priorizar RCP contínua + Desfibrilação precoce na FV; usar BVM 100% ou acoplar VM (10 irpm) após IOT.'
    },
    copd_exacerbation: {
      bestDrug: 'Salbutamol + Brometo de Ipratrópio + Corticoide sistêmico + VNI',
      recommendedBolusId: 'salbutamol_mgso4',
      recommendedPumpDrug: 'fentanil',
      recommendedPumpRate: 0.3,
      recommendedO2: 'niv',
      avoid: 'Evitar FiO₂ 100% desnecessária (alvo SpO₂ 88–92%) e sedação pesada sem VM.',
      rationale: 'VNI precoce reduz trabalho respiratório e corrige hipercapnia; evitar aprisionamento aéreo.'
    },
    pulmonary_embolism: {
      bestDrug: 'Noradrenalina (suporte PAM) + Trombólise (Alteplase) se maciço',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.18,
      recommendedO2: 'non_rebreather',
      avoid: 'Evitar expansão volêmica excessiva (sobrecarrega VD dilatado) e PEEP alta.',
      rationale: 'Manter perfusão coronariana do VD com Noradrenalina enquanto prepara reperfusão pulmonar.'
    },
    dka_acidosis: {
      bestDrug: 'Hidratação SF 0,9% + Insulina Regular EV contínua (0,1 U/kg/h) + K⁺',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.05,
      recommendedO2: 'nasal_cannula',
      avoid: 'Evitar hipoventilação após IOT (piora acidemia grave) e bicarbonato se pH ≥ 6,9.',
      rationale: 'Corrigir volemia, cetogênese com insulina e preservar hiperventilação compensatória.'
    },
    anaphylaxis: {
      bestDrug: 'Adrenalina 0,3–0,5 mg IM / bolus EV + Cristaloide rápido + Salbutamol',
      recommendedBolusId: 'adrenalina_bolus',
      recommendedPumpDrug: 'adrenalina',
      recommendedPumpRate: 0.12,
      recommendedO2: 'non_rebreather',
      avoid: 'Não atrasar Adrenalina usando apenas anti-histamínico/corticoide.',
      rationale: 'Adrenalina reverte simultaneamente vasoplegia distributiva, edema de via aérea e broncoespasmo.'
    },
    cardiogenic_shock: {
      bestDrug: 'Dobutamina (2,5–10 mcg/kg/min) + Noradrenalina se PAM < 65 mmHg',
      recommendedBolusId: 'furosemida',
      recommendedPumpDrug: 'dobutamina',
      recommendedPumpRate: 5.0,
      recommendedO2: 'niv',
      avoid: 'Evitar bolus rápido de volume e vasodilatadores puros se PAS < 85 mmHg.',
      rationale: 'Suporte inotrópico com Dobutamina melhora débito cardíaco enquanto aguarda reperfusão.'
    },
    cardiac_tamponade: {
      bestDrug: 'Pericardiocentese imediata + Expansão volêmica cautelosa ponte',
      recommendedBolusId: 'cetamina_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.10,
      recommendedO2: 'non_rebreather',
      avoid: 'Evitar PEEP alta e sedativos que reduzam retorno venoso/pré-carga.',
      rationale: 'Tratamento definitivo é descompressão pericárdica; manter pré-carga e evitar pressão intratorácica alta.'
    },
    afib_rvr: {
      bestDrug: 'Amiodarona 150 mg EV ou Betabloqueador (se estável) / CVE se instável',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.05,
      recommendedO2: 'nasal_cannula',
      avoid: 'Evitar bloqueadores de canal de cálcio se disfunção sistólica importante.',
      rationale: 'Controlar resposta ventricular melhora enchimento diastólico e estabilidade hemodinâmica.'
    },
    vtach_unstable: {
      bestDrug: 'Cardioversão Elétrica Sincronizada 100 J imediata (+ Amiodarona 150 mg)',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.10,
      recommendedO2: 'non_rebreather',
      avoid: 'Não perder tempo com antiarrítmico isolado se paciente hipotenso/instável.',
      rationale: 'TV com pulso instável exige cardioversão elétrica sincronizada precoce no Vivo Gold.'
    },
    hyperkalemia_avb: {
      bestDrug: 'Gluconato de Cálcio 10% + Marcapasso Transcutâneo (Vivo Gold) + Adrenalina',
      recommendedBolusId: 'atropina',
      recommendedPumpDrug: 'adrenalina',
      recommendedPumpRate: 0.10,
      recommendedO2: 'non_rebreather',
      avoid: 'Não confiar apenas em Atropina no BAV de 3º grau infra-hissiano.',
      rationale: 'Estabilizar membrana miocárdica com cálcio e garantir débito com Marcapasso Transcutâneo.'
    },
    hypothermia_brady: {
      bestDrug: 'Reaquecimento ativo + SF 0,9% aquecido (40–42 °C)',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.06,
      recommendedO2: 'non_rebreather',
      avoid: 'Evitar múltiplas doses repetidas de drogas vasoativas/antiarrítmicas abaixo de 32 °C.',
      rationale: 'Bradicardia da hipotermia responde ao reaquecimento progressivo; evitar manipulação brusca que induza FV.'
    },
    hemorrhagic_shock: {
      bestDrug: 'Hemotransfusão + Ácido Tranexâmico + Controle de sangramento',
      recommendedBolusId: 'cetamina_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.12,
      recommendedO2: 'non_rebreather',
      avoid: 'Evitar excesso de cristaloide frio (agrava coagulopatia dilucional) e Propofol na IOT.',
      rationale: 'Repor volemia com hemoderivados e usar vasopressor apenas como ponte mantendo hipotensão permissiva se trauma.'
    },
    hypertensive_crisis: {
      bestDrug: 'Nitroprussiato de Sódio EV contínuo (titular PAM -15% a -25%)',
      recommendedBolusId: 'furosemida',
      recommendedPumpDrug: 'nitroprussiato',
      recommendedPumpRate: 1.5,
      recommendedO2: 'nasal_cannula',
      avoid: 'Evitar queda abrupta de PA > 25% na 1ª hora (risco de isquemia cerebral/renal).',
      rationale: 'Nitroprussiato em bomba permite titulação minuto a minuto da pós-carga.'
    },
    status_epilepticus: {
      bestDrug: 'Benzodiazepínico + Anticonvulsivante + Propofol contínuo se refratário',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'propofol',
      recommendedPumpRate: 2.5,
      recommendedO2: 'non_rebreather',
      avoid: 'Não atrasar controle da crise nem permitir hipoventilação após sedação.',
      rationale: 'Propofol em infusão contínua suprime atividade epiléptica refratária enquanto VM garante eliminação do CO₂.'
    },
    svt_unstable: {
      bestDrug: 'Adenosina 6 mg EV rápido (se estável) ou Cardioversão Sincronizada 50–100 J',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.05,
      recommendedO2: 'nasal_cannula',
      avoid: 'Não usar desfibrilação não sincronizada na TSV organizada com pulso.',
      rationale: 'Se houver instabilidade hemodinâmica, cardioversão sincronizada restaura ritmo sinusal imediatamente.'
    },
    pea_arrest: {
      bestDrug: 'Adrenalina 1 mg EV a cada 3–5 min + Tratar causas reversíveis (5Hs/5Ts)',
      recommendedBolusId: 'adrenalina_bolus',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.15,
      recommendedO2: 'bvm',
      avoid: 'NÃO desfibrilar AESP (ritmo não chocável) e não interromper compressões.',
      rationale: 'Priorizar RCP de alta qualidade, Adrenalina precoce e reversão da causa base (hipovolemia, hipóxia, H⁺, TEP, pneumotórax).'
    },
    ards_prone_severe: {
      bestDrug: 'Sedoanalgesia profunda (Propofol + Fentanil) + Bloqueio Neuromuscular + Prona',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'propofol',
      recommendedPumpRate: 2.0,
      recommendedO2: 'niv',
      avoid: 'Evitar Vt > 6 mL/kg, Pplatô > 30 cmH₂O e desconexões desnecessárias do circuito.',
      rationale: 'Manter recrutamento alveolar com PEEP adequada e posição prona reduz shunt intrapulmonar.'
    },
    stemi_anterior: {
      bestDrug: 'Trombólise / Reperfusão imediata + Nitroglicerina (se PAS > 90)',
      recommendedBolusId: 'nitroglicerina',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.08,
      recommendedO2: 'nasal_cannula',
      avoid: 'Evitar excesso de Adrenalina/Dobutamina (eleva consumo de O₂ e precipita FV).',
      rationale: 'Reperfusão precoce reduz área de necrose e previne degeneração para fibrilação ventricular.'
    },
    torsades_qt: {
      bestDrug: 'Sulfato de Magnésio 2g EV + Desfibrilação não sincronizada',
      recommendedBolusId: 'sulfato_magnesio',
      recommendedPumpDrug: 'adrenalina',
      recommendedPumpRate: 0.05,
      recommendedO2: 'bvm',
      avoid: 'NÃO administrar Amiodarona na Torsades (prolonga ainda mais o intervalo QT!).',
      rationale: 'O magnésio estabiliza a membrana miocárdica e suprime pós-despolarizações precoces.'
    },
    wpw_preexcited: {
      bestDrug: 'Cardioversão Elétrica Sincronizada (100 J) — evitar bloqueadores nodais',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.05,
      recommendedO2: 'nasal_cannula',
      avoid: 'CONTRAINDICADO: Adenosina em WPW pré-excitado pode degenerar em FV!',
      rationale: 'Cardioversão sincronizada restaura ritmo sinusal com segurança sem bloquear o nó AV.'
    },
    tce_cushing: {
      bestDrug: 'Etomidato (SRI cardioestável) + VM em Normocapnia (PaCO₂ 35–38)',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'fentanil',
      recommendedPumpRate: 1.5,
      recommendedO2: 'non_rebreather',
      avoid: 'Evitar hipercapnia (vasodilatação cerebral eleva PIC), hipóxia e hipotensão (PAM < 80).',
      rationale: 'Controle da via aérea e PaCO₂ previne herniação cerebral mantendo pressão de perfusão.'
    },
    neurogenic_shock: {
      bestDrug: 'Noradrenalina (alvo PAM ≥ 85 mmHg) + Atropina se bradicardia sintomática',
      recommendedBolusId: 'atropina',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.25,
      recommendedO2: 'nasal_cannula',
      avoid: 'Evitar Propofol em bolus alto ou vasodilatadores (colapso vasoplégico imediato).',
      rationale: 'Restaurar tônus simpático α1/β1 reverte vasoplegia e protege a perfusão medular.'
    },
    betablocker_od: {
      bestDrug: 'Adrenalina/Dobutamina em bomba + Gluconato de Cálcio + Marcapasso',
      recommendedBolusId: 'gluconato_calcio',
      recommendedPumpDrug: 'adrenalina',
      recommendedPumpRate: 0.20,
      recommendedO2: 'hudson_mask',
      avoid: 'Evitar Amiodarona, Dexmedetomidina ou outros agentes bradicardizantes.',
      rationale: 'Suporte adrenérgico contínuo + cálcio + marcapasso superam o bloqueio β/Ca²⁺.'
    },
    thyroid_storm: {
      bestDrug: 'Controle de FC (Amiodarona / Cardioversão) + Hidratação + Alto Volume-Minuto',
      recommendedBolusId: 'amiodarona_bolus',
      recommendedPumpDrug: 'amiodarona',
      recommendedPumpRate: 1.0,
      recommendedO2: 'hudson_mask',
      avoid: 'Evitar Adrenalina, Cetamina e Reaquecimento (pioram hipertermia e taquiarritmia).',
      rationale: 'Reduzir resposta ventricular e atender à alta produção de CO₂ previne colapso.'
    },
    myasthenic_crisis: {
      bestDrug: 'Suporte Ventilatório Precoce (VNI BiPAP ou IOT + VM controlada)',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'dexmedetomidina',
      recommendedPumpRate: 0.3,
      recommendedO2: 'niv',
      avoid: 'Evitar sedativos/opioides sem via aérea garantida e Sulfato de Magnésio (piora fraqueza).',
      rationale: 'A hipoventilação neuromuscular responde imediatamente à ventilação com pressão positiva.'
    },
    myxedema_coma: {
      bestDrug: 'Reaquecimento Ativo + VM + Noradrenalina (e Levotiroxina/Hidrocortisona EV)',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.2,
      recommendedO2: 'hudson_mask',
      avoid: 'Evitar sedativos depressores do drive respiratório sem intubação e reaquecimento abrupto com vasodilatação.',
      rationale: 'Reverter hipotermia e hipoventilação alveolar impede progressão para assistolia/FV.'
    },
    adrenal_crisis: {
      bestDrug: 'Expansão Volêmica + Noradrenalina/Vasopressina (+ Hidrocortisona 100 mg EV)',
      recommendedBolusId: 'adrenalina_bolus',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.35,
      recommendedO2: 'hudson_mask',
      avoid: 'Evitar Etomidato (inibe síntese de cortisol na adrenal!) e diuréticos.',
      rationale: 'Reposição volêmica e vasopressor sustentam PAM enquanto o corticoide restaura o tônus vascular.'
    },
    hhs_hyperosmolar: {
      bestDrug: 'Expansão Volêmica Vigorosa (SF 0,9%) + Proteção de Via Aérea',
      recommendedBolusId: 'etomidato_sri',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.15,
      recommendedO2: 'nasal_cannula',
      avoid: 'Evitar Furosemida (agrava hipovolemia/hiperosmolaridade) e vasodilatadores.',
      rationale: 'Restaurar o volume intravascular corrige a hipoperfusão e o déficit osmolar antes da insulina.'
    },
    pheochromocytoma_crisis: {
      bestDrug: 'Nitroprussiato de Sódio EV titulável em bomba (controle da RVS)',
      recommendedBolusId: 'nitroglicerina',
      recommendedPumpDrug: 'nitroprussiato',
      recommendedPumpRate: 1.5,
      recommendedO2: 'hudson_mask',
      avoid: 'Evitar catecolaminas (Noradrenalina/Adrenalina/Dobutamina) e betabloqueador isolado sem alfa-bloqueio.',
      rationale: 'Vasodilatação arterial direta alivia pós-carga extrema e previne EAP, AVC ou FV.'
    },
    eclampsia_hellp: {
      bestDrug: 'Sulfato de Magnésio 2–4g EV + Nitroprussiato em bomba para controle pressórico',
      recommendedBolusId: 'sulfato_magnesio',
      recommendedPumpDrug: 'nitroprussiato',
      recommendedPumpRate: 1.2,
      recommendedO2: 'hudson_mask',
      avoid: 'Contraindicação absoluta à Trombólise (risco de AVC/rotura hepática) e evitar sobrecarga hídrica.',
      rationale: 'MgSO₄ controla/previne eclâmpsia e reduz vasoespasmo cerebral enquanto vasodilatador protege órgãos-alvo.'
    },
    postpartum_hemorrhage: {
      bestDrug: 'Transfusão de Hemácias (Protocolo Maciço) + Expansão + Noradrenalina ponte',
      recommendedBolusId: 'adrenalina_bolus',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.25,
      recommendedO2: 'non_rebreather',
      avoid: 'Contraindicação absoluta à Trombólise e evitar Furosemida/vasodilatadores.',
      rationale: 'Restaurar volume eritrocitário e pré-carga reverte o choque hemorrágico grau IV e a acidose lática.'
    },
    amniotic_embolism: {
      bestDrug: 'IOT + FiO₂ 100% + Noradrenalina/Dobutamina + Transfusão de Hemácias (CIVD)',
      recommendedBolusId: 'adrenalina_bolus',
      recommendedPumpDrug: 'noradrenalina',
      recommendedPumpRate: 0.35,
      recommendedO2: 'non_rebreather',
      avoid: 'Evitar sobrecarga volêmica excessiva (piora falência aguda de VD) e PEEP excessiva.',
      rationale: 'Suporte ventilatório imediato e hemodinâmico biventricular mantém perfusão durante o colapso obstrutivo.'
    },
    peripartum_cardiomyopathy: {
      bestDrug: 'Dobutamina contínua + VNI/PEEP elevada + Furosemida cautelosa',
      recommendedBolusId: 'furosemida',
      recommendedPumpDrug: 'dobutamina',
      recommendedPumpRate: 8.0,
      recommendedO2: 'niv',
      avoid: 'Evitar bolus de SF 500 mL repetidos (pioram congestão alveolar e EAP).',
      rationale: 'Inotropismo positivo + pressão positiva reduz pré/pós-carga e melhora rapidamente a relação PaO₂/FiO₂.'
    }
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, alpha) {
    return a + (b - a) * alpha;
  }

  class PhysiologyEngine {
    constructor() {
      this.onLog = null;
      this.alarms = {
        hrLow: 50,
        hrHigh: 130,
        spo2Low: 90,
        mapLow: 65,
        etco2Low: 28,
        etco2High: 50,
        ppeakHigh: 35,
        dpHigh: 15
      };
      this.activePumpIndex = 0;
      this.pumps = this._createDefaultPumps();
      this.loadScenario('stable', true);
    }

    _createDefaultPumps() {
      const defaults = ['fentanil', 'noradrenalina'];
      return defaults.map((drugId, idx) => {
        const d = IV_DRUG_MAP[drugId] || IV_DRUGS[0];
        return {
          channel: idx + 1,
          drugId,
          rate: d.defaultRate,
          running: false,
          volInfMl: 0,
          elapsedSec: 0,
          occluded: false,
          alarmSilenced: false,
          bolusTimer: 0,
          pressureKpa: 0,
          mode: 'dose_peso', // 'dose_peso' | 'vazao_vol' | 'tci' | 'pca' | 'rampa' | 'bolus_int' | 'pausa' | 'sequencial'
          sector: 'UTI',
          vtbiMl: 0,
          kvoRateMlH: 1.0,
          kvoActive: false,
          bolusVolMl: d.bolusAddMl > 0 ? d.bolusAddMl : 2.0,
          bolusRateMlH: 200,
          occlusionLimitKpa: 55,
          antiBolus: true,
          airBubbleUl: 100,
          dropSensorOn: true,
          equipoType: 'Icaset Macro (20 gts/mL)',
          brightnessPct: 100,
          nightMode: false,
          language: 'PT-BR',
          audioLevel: 'Médio',
          keyLocked: false,
          patientAge: 48,
          patientHeightCm: 172,
          patientSex: 'M',
          directFlowMlH: 25.0,
          // TCI (15 protocolos / 5 fármacos)
          tciProtocolId: 'tci_dex_1',
          tciDrugId: 'dexmedetomidina',
          tciModel: 'Hannivoort (Ce)',
          tciTarget: 0.50,
          tciCurrent: 0.00,
          tciUnit: 'ng/mL',
          // PCA (7 protocolos)
          pcaProtocolId: 'pca_1',
          pcaDemandDose: 1.0,
          pcaUnit: 'mg',
          pcaLockoutMin: 8,
          pcaLockoutSec: 0,
          pcaAttempts: 0,
          pcaDelivered: 0,
          // Rampa
          rampUpMin: 10,
          rampPlateauMlH: 40,
          rampDownMin: 10,
          rampElapsedSec: 0,
          // Bolus Intermitente
          interBolusMl: 5.0,
          interIntervalMin: 30,
          interCountdownSec: 1800,
          // Pausa programada
          pauseDurationMin: 15,
          pauseRemainingSec: 900,
          pauseActive: false,
          // Modo Sequencial (até 20 etapas)
          seqSteps: [
            { flowMlH: 20, vtbiMl: 25 },
            { flowMlH: 40, vtbiMl: 50 },
            { flowMlH: 15, vtbiMl: 25 }
          ],
          seqCurrentIdx: 0,
          seqStepVolMl: 0,
          events: [{ time: '00:00:00', msg: `Icatu 4.0 (Bomba ${idx + 1}) pronta • DERS: ${d.name}` }]
        };
      });
    }

    loadScenario(scenarioId, silent = false) {
      const sc = SCENARIOS[scenarioId] || SCENARIOS.stable;
      this.scenarioId = sc.id;
      this.scenario = sc;

      // Estado do Paciente (mutável por intervenções ou sliders manuais)
      this.patient = Object.assign(
        { pneumothoraxActive: false, arrested: false },
        sc.patient
      );
      this.cardiac = Object.assign({}, sc.cardiac);

      // Intervenções ativas
      this.interventions = {
        fluidBoluses: 0,
        fluidBoost: 0,
        noraDose: 0, // ug/kg/min
        bronchodilatorTargetRes: null,
        cprActive: false,
        cprPhase: 0,
        roscAchieved: false,
        bolusSvrDelta: 0,
        bolusHrDelta: 0,
        bolusTimer: 0,
        naloxoneTimer: 0,
        calciumProtectionTimer: 0,
        magnesiumProtectionTimer: 0,
        adrenalineBolusTimer: 0,
        amiodaroneBolusTimer: 0,
        nitroBolusTimer: 0,
        ketamineBolusTimer: 0,
        etomidateBolusTimer: 0,
        atropineBolusTimer: 0,
        proneActive: false,
        warmingActive: false,
        coolingActive: false,
        insulinActive: false,
        bloodUnits: 0,
        pericardiocentesisDone: false,
        thrombolysisGiven: false,
        osmotherapyGiven: false,
        hydrocortisoneGiven: false,
        uterotonicGiven: false
      };

      // Concentrações no sítio efetor (farmacocinética suavizada das bombas)
      this.drugCe = {};
      this.drugInteractions = [];
      this._interactionLogCooldown = {};

      // Motor de Deterioração Clínica & Progressão para Parada Cardíaca (5Hs & 5Ts)
      this.deterioration = {
        risk: this.patient.arrested ? 100 : 0, // 0..100%
        stage: this.patient.arrested ? 'arrested' : 'stable', // 'stable' | 'warning' | 'imminent' | 'arrested'
        causes: [],
        primaryCause: null,
        targetRhythm: 'pea',
        lastArrestReason: null,
        cprRecoveryProgress: 0,
        _warnLogged: false,
        _imminentLogged: false
      };
      this._baseEctopyProb = sc.cardiac && typeof sc.cardiac.ectopyProb === 'number' ? sc.cardiac.ectopyProb : 0;
      this._baseLactate = sc.patient && typeof sc.patient.lactate === 'number' ? sc.patient.lactate : 1.1;
      this._baseBE = sc.patient && typeof sc.patient.baseExcess === 'number' ? sc.patient.baseExcess : 0;

      // O paciente NÃO inicia acoplado ao ventilador mecânico (começa em respiração espontânea / ar ambiente)
      this.airway = {
        connectedToVent: false,
        o2Device: 'room_air',
        o2Flow: 0
      };

      this.pumps = this._createDefaultPumps();
      this.activePumpIndex = 0;
      this._pumpHadNora = false;
      this.externalPacer = { active: false, rate: 70 };

      // Parâmetros do Ventilador
      this.vent = Object.assign(
        {
          holdInspTimer: 0,
          holdExpTimer: 0,
          o2FlushTimer: 0,
          backupActive: false,
          standby: false
        },
        sc.ventDefaults
      );

      // Estimativa física inicial do ciclo espontâneo (paciente fora da VM em Ar Ambiente 21%)
      const initRrSeed = Math.max(0, this.patient.intrinsicDrive);
      const initVte = initRrSeed > 0 ? clamp(Math.round(420 * clamp(this.patient.compliance / 50, 0.55, 1.1)), 240, 520) : 0;
      const initPlat = 0;
      const initPeak = 0;

      // Estado Dinâmico do Ciclo Respiratório
      this.breath = {
        phase: 'EXP', // 'TRIGGER' | 'INSP' | 'PAUSE' | 'EXP'
        tInBreath: 0,
        tInPhase: 0,
        volumeL: 0, // Volume acima da CRF em Litros
        flowLs: 0, // Fluxo em L/s (+ insp, - exp)
        paw: 0,
        shockPawTimer: 0,
        peakFlowInsp: 0,
        currentBreathPeakPaw: 0,
        currentBreathPlatPaw: 0,
        currentBreathVtMl: 0,
        lastPeakPaw: initPeak,
        lastPlatPaw: initPlat,
        lastMeanPaw: 0,
        lastAutoPeep: 0,
        lastVteMl: initVte,
        lastVeLmin: Number(((initVte / 1000) * initRrSeed).toFixed(1)),
        lastRrTotal: initRrSeed,
        lastIeString: initRrSeed > 0 ? '1:2.0' : '--',
        lastBreathWasSpont: true,
        pawIntegral: 0,
        pawSamples: 0,
        apneaTimer: 0,
        cycleCount: 0,
        // Pontos para Loops P-V e F-V
        currentLoop: [],
        lastLoop: []
      };

      // Estado Fisiológico Contínuo (Gases & Hemodinâmica iniciais em Ar Ambiente 21% fora da VM)
      const initRr = initRrSeed;
      const initVa = initRr > 0 ? Math.max(0.3, ((initVte - 150) / 1000) * Math.max(6, initRr)) : 0.15;
      const initPaco2 = this.patient.arrested ? 46 : clamp((0.863 * this.patient.vco2) / initVa, 22, 65);
      const initPao2 = this._computeTargetPaO2(initPaco2, 0, 21);
      const initSpo2 = this.patient.arrested ? 62 : this._dissociationSpO2(initPao2);

      this.vitals = {
        hr: this.cardiac.baseHr,
        sbp: this.cardiac.baseSbp,
        dbp: this.cardiac.baseDbp,
        map: Math.round((this.cardiac.baseSbp + 2 * this.cardiac.baseDbp) / 3),
        nibpSbp: this.cardiac.baseSbp,
        nibpDbp: this.cardiac.baseDbp,
        paco2: initPaco2,
        etco2: this.patient.arrested ? 8 : Math.max(8, initPaco2 - 3),
        pao2: initPao2,
        spo2: initSpo2,
        ph: 7.4,
        hco3: 24,
        perfusionIndex: this.patient.arrested ? 0.2 : 3.2,
        stDeviation: this.cardiac.stDeviation,
        rhythm: this.cardiac.rhythm,
        rrMonitor: initRr
      };
      this._updateAcidBase();
      this.activeAlarms = [];
      this._evaluateAlarms();
      this.simTime = 0;

      if (!silent && this.onLog) {
        this.onLog(`Cenário carregado: ${sc.name} (${sc.severityLabel})`);
      }
    }

    /** Equação Alveolar + Mistura de Shunt por Conteúdo de O2 + Recrutamento por PEEP */
    _computeTargetPaO2(paco2, peep, fio2Pct) {
      const fio2 = (this.vent.o2FlushTimer > 0 ? 100 : fio2Pct) / 100;
      const pAO2 = Math.max(40, fio2 * (760 - 47) - paco2 / 0.8);

      // PEEP recruta alvéolos em cenários com shunt (SDRA, EAP), mas piora pneumotórax
      const recruitGain = this.patient.pneumothoraxActive
        ? -0.008 * peep
        : Math.min(0.18, Math.max(0, (peep - 5) * 0.015));

      const effectiveShunt = clamp(this.patient.shunt - recruitGain * (this.patient.shunt > 0.15 ? 1.2 : 0.2), 0.02, 0.72);

      // Mistura de conteúdo arterial/venoso na curva sigmoide da hemoglobina
      const scO2 = this._dissociationSpO2(pAO2) / 100;
      const svO2 = clamp(0.74 - (1 - this.cardiac.preload) * 0.16, 0.45, 0.76);
      const saO2 = clamp((1 - effectiveShunt) * scO2 + effectiveShunt * svO2, 0.35, 0.996);

      // Inversão da curva de dissociação: PaO2 = (23400 * SaO2 / (1 - SaO2))^(1/3)
      const pao2Sat = Math.pow((23400 * saO2) / Math.max(0.004, 1 - saO2), 1 / 3);
      // Parcela dissolvida em PaO2 elevada quando shunt é baixo
      const dissolvedBonus = Math.max(0, (1 - effectiveShunt * 2.5) * (pAO2 - 120) * 0.45);
      return clamp(pao2Sat + dissolvedBonus, 26, 580);
    }

    /** Curva de Dissociação da Oxihemoglobina (Severinghaus + Efeito Bohr por pH e Temperatura) */
    _dissociationSpO2(pao2) {
      const ph = this.vitals ? (this.vitals.ph || 7.4) : 7.4;
      const temp = this.patient ? (this.patient.temp || 36.7) : 36.7;
      // Acidemia e febre deslocam a curva para a direita (aumentam P50 -> menor afinidade Hb-O2)
      const bohrShift = Math.pow(10, 0.48 * (7.4 - ph) + 0.024 * (temp - 37.0));
      const pEff = clamp(pao2 / clamp(bohrShift, 0.72, 1.48), 8, 600);
      const p3 = Math.pow(pEff, 3);
      const sat = (100 * p3) / (p3 + 23400);
      return clamp(sat, 30, 100);
    }

    _updateAcidBase() {
      const paco2 = clamp(this.vitals.paco2, 15, 130);
      const hco3 = clamp(24 + this.patient.baseExcess + 0.15 * (paco2 - 40), 5, 45);
      const ph = 6.1 + Math.log10(hco3 / (0.03 * paco2));
      this.vitals.hco3 = hco3;
      this.vitals.ph = clamp(ph, 6.70, 7.75);
    }

    /** Passo de simulação em segundos (chamado a 60Hz pelo loop principal; suporta timeScale 1x..10x) */
    step(dt) {
      const scale = Math.max(1, Math.min(10, Number(this.timeScale) || 1));
      const baseDt = Math.min(dt, 0.05);
      const subSteps = scale > 1 ? Math.ceil(scale) : 1;
      const subDt = (baseDt * scale) / subSteps;
      for (let s = 0; s < subSteps; s++) {
        this._stepOnce(subDt);
      }
    }

    _stepOnce(clampedDt) {
      this.simTime += clampedDt;

      // Temporizadores de manobras ventilatórias
      if (this.vent.holdInspTimer > 0) this.vent.holdInspTimer = Math.max(0, this.vent.holdInspTimer - clampedDt);
      if (this.vent.holdExpTimer > 0) this.vent.holdExpTimer = Math.max(0, this.vent.holdExpTimer - clampedDt);
      if (this.vent.o2FlushTimer > 0) this.vent.o2FlushTimer = Math.max(0, this.vent.o2FlushTimer - clampedDt);

      const iv = this.interventions;
      // Temporizadores farmacocinéticos de bolus ativos
      const bolusTimers = [
        'naloxoneTimer', 'calciumProtectionTimer', 'magnesiumProtectionTimer',
        'adrenalineBolusTimer', 'amiodaroneBolusTimer', 'nitroBolusTimer',
        'ketamineBolusTimer', 'etomidateBolusTimer', 'atropineBolusTimer'
      ];
      for (let i = 0; i < bolusTimers.length; i++) {
        const k = bolusTimers[i];
        if (iv[k] > 0) iv[k] = Math.max(0, iv[k] - clampedDt);
      }

      // Efeito progressivo de broncodilatador e volume
      if (iv.bronchodilatorTargetRes !== null) {
        this.patient.resistance = lerp(this.patient.resistance, iv.bronchodilatorTargetRes, clampedDt * 0.18);
        if (Math.abs(this.patient.resistance - iv.bronchodilatorTargetRes) < 0.25) {
          iv.bronchodilatorTargetRes = null;
        }
      }
      if (iv.fluidBoost > 0) {
        // Decaimento lento (distribuição no terceiro espaço em sepse)
        iv.fluidBoost = Math.max(0, iv.fluidBoost - clampedDt * 0.0012);
      }
      if (iv.warmingActive) {
        // Reaquecimento ativo (manta térmica + fluidos aquecidos): eleva temperatura até 36.6°C
        if (this.patient.temp < 36.6) {
          this.patient.temp = Math.min(36.6, this.patient.temp + clampedDt * 0.14);
          if (this.cardiac.rhythm === 'sinus_brady' && this.patient.temp >= 34.5) {
            this.cardiac.baseHr = Math.min(76, this.cardiac.baseHr + clampedDt * 1.4);
            this.cardiac.contractility = Math.min(0.96, this.cardiac.contractility + clampedDt * 0.012);
            if (this.patient.temp >= 35.4) {
              this.cardiac.rhythm = 'sinus';
              this.vitals.rhythm = 'sinus';
            }
          }
        }
      }
      if (iv.coolingActive) {
        // Resfriamento ativo (manta térmica fria / controle de hipertermia): reduz temperatura até 36.8°C
        if (this.patient.temp > 36.8) {
          this.patient.temp = Math.max(36.8, this.patient.temp - clampedDt * 0.14);
          if (this.patient.vco2 > 220) {
            this.patient.vco2 = Math.max(220, this.patient.vco2 - clampedDt * 3.2);
          }
          if (this.cardiac.baseHr > 110) {
            this.cardiac.baseHr = Math.max(110, this.cardiac.baseHr - clampedDt * 1.5);
          }
        }
      }
      if (iv.insulinActive) {
        // Insulina Regular EV contínua: corrige cetoacidose (CAD) e melhora lactato/osmolaridade (EHH)
        if (this.scenarioId === 'dka_acidosis' || this.patient.baseExcess < -6) {
          this.patient.baseExcess = Math.min(-1, this.patient.baseExcess + clampedDt * 0.24);
          this.patient.lactate = Math.max(1.2, this.patient.lactate - clampedDt * 0.05);
        } else if (this.scenarioId === 'hhs_hyperosmolar') {
          this.patient.lactate = Math.max(1.2, this.patient.lactate - clampedDt * 0.05);
          this.cardiac.baseHr = Math.max(96, this.cardiac.baseHr - clampedDt * 0.6);
        }
      }
      if (iv.bolusTimer > 0) {
        iv.bolusTimer = Math.max(0, iv.bolusTimer - clampedDt);
        if (iv.bolusTimer <= 0) {
          iv.bolusSvrDelta = 0;
          iv.bolusHrDelta = 0;
        }
      }

      this._stepPumps(clampedDt);
      this._stepPharmacology(clampedDt);
      this._stepVentilator(clampedDt);
      this._stepCardioAndGases(clampedDt);
      this._stepDeteriorationAndArrest(clampedDt);
      this._evaluateAlarms();
    }

    getEffectiveO2Info() {
      if (this.airway && this.airway.connectedToVent) {
        const fio2 = this.vent.o2FlushTimer > 0 ? 100 : this.vent.fio2Set;
        return {
          connectedToVent: true,
          deviceId: 'ventilator',
          deviceName: 'Ventilador Mecânico (TOT)',
          fio2,
          peep: this.vent.peepSet,
          support: 0
        };
      }
      const dev = O2_DEVICE_MAP[this.airway ? this.airway.o2Device : 'room_air'] || O2_DEVICE_MAP.room_air;
      const flow = this.airway ? this.airway.o2Flow : dev.flowDefault;
      return {
        connectedToVent: false,
        deviceId: dev.id,
        deviceName: dev.name,
        fio2: dev.calcFio2(flow),
        peep: dev.peepSupport || 0,
        support: dev.psSupport || 0
      };
    }

    setO2Device(deviceId, flowSetting) {
      const dev = O2_DEVICE_MAP[deviceId];
      if (!dev) return;
      this.airway.o2Device = dev.id;
      this.airway.o2Flow =
        flowSetting !== undefined && flowSetting !== null
          ? clamp(Number(flowSetting), dev.flowMin, dev.flowMax)
          : dev.flowDefault;
      const info = this.getEffectiveO2Info();
      if (this.onLog) {
        const flowTxt = dev.flowUnit ? ` (${this.airway.o2Flow} ${dev.flowUnit})` : '';
        this.onLog(`Oferta de O₂: ${dev.name}${flowTxt} → FiO₂ estimada ${info.fio2}%`);
      }
    }

    connectVentilator(connected) {
      this.airway.connectedToVent = Boolean(connected);
      this.breath.apneaTimer = 0;
      this.breath.tInBreath = 0;
      this.breath.tInPhase = 0;
      this.breath.phase = 'EXP';
      this.breath.currentLoop = [];
      if (!this.airway.connectedToVent) {
        this.breath.lastPeakPaw = 0;
        this.breath.lastPlatPaw = 0;
        this.breath.lastAutoPeep = 0;
        this.breath.lastMeanPaw = 0;
        this.breath.paw = 0;
      } else {
        this.breath.paw = this.vent.peepSet;
      }
      if (this.onLog) {
        this.onLog(
          this.airway.connectedToVent
            ? `VIA AÉREA: Paciente intubado e ACOPLADO à Ventilação Mecânica (${this.vent.mode})`
            : `VIA AÉREA: Paciente DESACOPLADO da VM → Oxigenoterapia (${this.getEffectiveO2Info().deviceName})`
        );
      }
    }

    administerBolusDrug(drugId) {
      const d = BOLUS_DRUG_MAP[drugId];
      if (!d) return;
      const p = this.patient;
      const c = this.cardiac;
      const iv = this.interventions;
      const ce = this.drugCe || {};
      let extraNote = '';

      switch (drugId) {
        case 'salbutamol_mgso4':
          this.giveBronchodilator();
          p.resistance = Math.max(6, Math.round(p.resistance * 0.72));
          iv.magnesiumProtectionTimer = Math.max(iv.magnesiumProtectionTimer || 0, 75);
          // Efeito beta2: leve taquicardia reflexa + risco de ectopia se já em catecolaminas
          iv.bolusHrDelta = (iv.bolusHrDelta || 0) + 10;
          iv.bolusTimer = Math.max(iv.bolusTimer || 0, 16);
          if (c.rhythm === 'torsades') {
            this.setRhythm('sinus_tach', true);
            extraNote = ' → Torsades estabilizada por MgSO₄!';
          }
          break;

        case 'sulfato_magnesio':
          this.giveBronchodilator();
          iv.magnesiumProtectionTimer = 120;
          iv.bolusSvrDelta = (iv.bolusSvrDelta || 0) - 0.08;
          iv.bolusTimer = Math.max(iv.bolusTimer || 0, 14);
          if (c.rhythm === 'torsades') {
            this.setRhythm('sinus', true);
            extraNote = ' → Torsades de Pointes revertida para ritmo sinusal!';
          } else if (this.scenarioId === 'eclampsia_hellp') {
            c.svr = Math.max(1.12, Number((c.svr * 0.84).toFixed(2)));
            c.baseSbp = Math.max(146, Math.round(c.baseSbp - 28));
            c.baseDbp = Math.max(90, Math.round(c.baseDbp - 16));
            c.baseHr = Math.max(92, Math.round(c.baseHr - 18));
            p.vco2 = Math.max(205, Math.round(p.vco2 - 55));
            this.deterioration.risk = Math.max(0, (this.deterioration.risk || 0) - 35);
            extraNote = ' → Controle neuroprotetor da Eclâmpsia: vasoespasmo e atividade convulsiva reduzidos!';
          } else if (this.scenarioId === 'myasthenic_crisis') {
            p.intrinsicDrive = Math.max(2, p.intrinsicDrive - 3);
            extraNote = ' → ⚠ ALERTA MIASTENIA: Magnésio agravou bloqueio neuromuscular e hipoventilação!';
          } else {
            extraNote = ' → Membrana estabilizada contra Torsades (120s)';
          }
          break;

        case 'furosemida': {
          const isHypovolemic = (c.preload + iv.fluidBoost) < 0.86 || this.vitals.map < 65;
          c.preload = Math.max(0.50, Number((c.preload - 0.18).toFixed(2)));
          if (isHypovolemic) {
            // Uso inadequado em choque/hipovolemia: piora hipoperfusão e lactato!
            p.lactate = clamp(p.lactate + 0.6, 0.5, 18);
            extraNote = ' → ⚠ ALERTA: paciente hipovolêmico/hipotenso — queda de pré-carga e PAM!';
          } else {
            p.shunt = Math.max(0.06, Number((p.shunt * 0.78).toFixed(2)));
            p.compliance = Math.min(62, Math.round(p.compliance * 1.15));
            extraNote = ' → Redução de congestão pulmonar e melhora da complacência.';
          }
          break;
        }

        case 'nitroglicerina': {
          const lowPreload = (c.preload + iv.fluidBoost) < 0.88 || p.pneumothoraxActive;
          const onPropofol = (ce.propofol || 0) > 1.0;
          const svrDrop = lowPreload || onPropofol ? 0.74 : 0.84;
          c.svr = Math.max(0.52, Number((c.svr * svrDrop).toFixed(2)));
          c.preload = Math.max(0.55, Number((c.preload * (lowPreload ? 0.80 : 0.88)).toFixed(2)));
          iv.bolusSvrDelta = -0.18 - (onPropofol ? 0.10 : 0);
          iv.bolusHrDelta = (iv.bolusHrDelta || 0) + 8;
          iv.bolusTimer = 22;
          iv.nitroBolusTimer = 25;
          if (c.rhythm === 'stemi' || c.rhythm === 'de_winter') {
            c.stDeviation = Math.max(0.5, Number((c.stDeviation - 0.5).toFixed(1)));
          }
          if (lowPreload) extraNote = ' → ⚠ ALERTA: vasodilatação em pré-carga baixa — hipotensão acentuada!';
          else if (onPropofol) extraNote = ' → ⚠ Interação Nitroglicerina + Propofol: queda somada de PAM!';
          break;
        }

        case 'naloxona': {
          const opioidLoad = (ce.fentanil || 0) + (ce.remifentanil || 0) * 10 + (ce.sufentanil || 0) * 4 + (ce.morfina || 0) * 0.5;
          iv.naloxoneTimer = 90;
          p.intrinsicDrive = Math.max(14, p.intrinsicDrive + 14);
          this.breath.apneaTimer = 0;
          if (opioidLoad > 0.8) {
            // Reversão brusca de opioide alto -> descarga simpática rebote!
            iv.bolusHrDelta = (iv.bolusHrDelta || 0) + 18;
            iv.bolusSvrDelta = (iv.bolusSvrDelta || 0) + 0.16;
            iv.bolusTimer = 18;
            extraNote = ' → Antagonismo opioide ativo (90s) + rebote simpático (+FC/+PAM)!';
          } else {
            extraNote = ' → Drive respiratório restaurado (bloqueio μ-opioide 90s).';
          }
          break;
        }

        case 'cetamina_sri':
          p.resistance = Math.max(6, Math.round(p.resistance * 0.78));
          iv.bolusSvrDelta = (iv.bolusSvrDelta || 0) + 0.16;
          iv.bolusHrDelta = (iv.bolusHrDelta || 0) + 14;
          iv.bolusTimer = 20;
          iv.ketamineBolusTimer = 30;
          if (c.rhythm === 'stemi' || c.rhythm === 'de_winter') {
            c.stDeviation = Number((c.stDeviation + 0.4).toFixed(1));
            extraNote = ' → ⚠ Aumento de consumo miocárdico de O₂ em paciente isquêmico!';
          }
          break;

        case 'etomidato_sri':
          p.intrinsicDrive = Math.max(0, p.intrinsicDrive - 8);
          iv.etomidateBolusTimer = 25;
          extraNote = ' → Indução cardioestável (atenção à apneia se fora da VM!).';
          break;

        case 'adrenalina_bolus': {
          // Acidemia grave reduz resposta alfa/beta da adrenalina
          const acidScale = this.vitals.ph < 7.20 ? clamp(1 - (7.20 - this.vitals.ph) * 1.4, 0.48, 1.0) : 1.0;
          iv.bolusSvrDelta = (iv.bolusSvrDelta || 0) + 0.48 * acidScale;
          iv.bolusHrDelta = (iv.bolusHrDelta || 0) + 30 * acidScale;
          iv.bolusTimer = 22;
          iv.adrenalineBolusTimer = 35;
          p.resistance = Math.max(6, Math.round(p.resistance * 0.76));
          p.lactate = clamp(p.lactate + 0.45, 0.5, 18); // glicogenólise beta2
          if (this.patient.arrested && !iv.roscAchieved && (c.rhythm === 'pea' || c.rhythm === 'asystole')) {
            this.deterioration.cprRecoveryProgress = Math.min(100, (this.deterioration.cprRecoveryProgress || 0) + 28);
            extraNote = ' → Perfusão coronariana aumentada durante RCP!';
          } else if (c.rhythm === 'stemi' || c.rhythm === 'de_winter' || c.rhythm === 'vtach') {
            this.deterioration.risk = Math.min(99, (this.deterioration.risk || 0) + 18);
            extraNote = ' → ⚠ Sobrecarga adrenérgica em miocárdio isquêmico/arritmogênico!';
          } else if (acidScale < 0.85) {
            extraNote = ` → Resposta atenuada (${Math.round(acidScale * 100)}%) pela acidose (pH ${this.vitals.ph.toFixed(2)}).`;
          }
          break;
        }

        case 'amiodarona_bolus':
          c.ectopyProb = 0.01;
          iv.bolusHrDelta = (iv.bolusHrDelta || 0) - 20;
          iv.bolusSvrDelta = (iv.bolusSvrDelta || 0) - 0.14; // vasodilatação pelo veículo/bloqueio alfa
          iv.bolusTimer = 25;
          iv.amiodaroneBolusTimer = 60;
          if (c.rhythm === 'vtach') {
            this.setRhythm('sinus_tach', true);
            extraNote = ' → TV monomórfica controlada!';
          } else if (c.rhythm === 'av_block_3' || c.rhythm === 'sinus_brady') {
            c.baseHr = Math.max(26, (c.baseHr || 40) - 10);
            extraNote = ' → ⚠ ALERTA: Amiodarona em bradiarritmia/BAV agrava bloqueio e hipotensão!';
          } else if (c.rhythm === 'torsades') {
            extraNote = ' → ⚠ ALERTA: Amiodarona prolonga QT — prefira Sulfato de Magnésio na Torsades!';
          }
          break;

        case 'atropina':
          iv.atropineBolusTimer = 45;
          if (c.rhythm === 'av_block_3' || c.rhythm === 'av_block_2_m2') {
            // Bloqueio infranodal responde mal à atropina!
            c.baseHr = clamp((c.baseHr || 36) + 4, 32, 46);
            extraNote = ' → Resposta mínima (bloqueio infranodal): considerar Marcapasso Transcutâneo ou Adrenalina!';
          } else {
            c.baseHr = clamp((c.baseHr || 55) + 26, 68, 122);
            if (c.rhythm === 'sinus_brady') this.setRhythm('sinus', true);
            extraNote = ' → Bloqueio vagal efetivo — elevação da FC.';
          }
          break;

        case 'adenosina':
          if (c.rhythm === 'svt') {
            this.setRhythm('sinus', true);
            extraNote = ' → Bloqueio nodal transitório → TPSV revertida para sinusal!';
          } else if (c.rhythm === 'wpw') {
            // Armadilha clássica de emergência: Adenosina em WPW/FA pré-excitada pode degenerar!
            if (this.vitals.hr > 130 || this.vitals.map < 75) {
              this.setRhythm('vf', true);
              this.deterioration.risk = 100;
              this.deterioration.stage = 'arrested';
              this.deterioration.lastArrestReason = 'Adenosina em síndrome de pré-excitação (WPW) instável → condução pela via acessória → FV!';
              extraNote = ' → 🚨 PERIGO CLÁSSICO: Adenosina bloqueou o nó AV no WPW → condução rápida pela via acessória → FV! DESFIBRILAR!';
            } else {
              this.setRhythm('afib_rvr', true);
              extraNote = ' → ⚠ ALERTA WPW: Adenosina precipitou FA de alta resposta pela via acessória!';
            }
          } else if (c.rhythm === 'vtach') {
            iv.bolusSvrDelta = (iv.bolusSvrDelta || 0) - 0.10;
            iv.bolusTimer = 10;
            extraNote = ' → Sem resposta na TV monomórfica (use Cardioversão SINC ou Amiodarona).';
          }
          break;

        case 'gluconato_calcio':
          iv.calciumProtectionTimer = 95;
          if (c.rhythm === 'hyperkalemia') {
            this.setRhythm('sinus', true);
            this.deterioration.risk = Math.max(0, (this.deterioration.risk || 0) - 45);
            extraNote = ' → Membrana miocárdica estabilizada na Hipercalemia (proteção 95s)!';
          } else if (this.scenarioId === 'betablocker_od') {
            c.contractility = Math.min(0.95, Number((c.contractility + 0.14).toFixed(2)));
            c.baseSbp = Math.min(108, Math.round(c.baseSbp + 12));
            c.baseDbp = Math.min(68, Math.round(c.baseDbp + 7));
            c.baseHr = Math.min(72, Math.round(c.baseHr + 10));
            this.deterioration.risk = Math.max(0, (this.deterioration.risk || 0) - 25);
            extraNote = ' → Melhora inotrópica e da condução AV na intoxicação por betabloqueador!';
          } else {
            extraNote = ' → Estabilização de membrana ativa (95s).';
          }
          break;

        case 'bicarbonato':
          p.baseExcess = clamp(p.baseExcess + 3.8, -22, 14);
          // Reação HCO3- + H+ -> H2O + CO2 gera discreto aumento transitório de PaCO2
          this.vitals.paco2 = clamp(this.vitals.paco2 + 3.0, 18, 120);
          this._updateAcidBase();
          this.deterioration.risk = Math.max(0, (this.deterioration.risk || 0) - 20);
          if (this.patient.arrested && (c.rhythm === 'pea' || c.rhythm === 'asystole') && this.vitals.ph < 7.25) {
            this.deterioration.cprRecoveryProgress = Math.min(100, (this.deterioration.cprRecoveryProgress || 0) + 22);
          }
          extraNote = ` → Tamponamento ácido-básico: pH agora ${this.vitals.ph.toFixed(2)} (atenção ao CO₂ gerado).`;
          break;

        default:
          break;
      }

      if (this.onLog) {
        this.onLog(`Fármaco administrado: ${d.name}${extraNote || ` (${d.role})`}`);
      }
    }

    getPumpFlowMlH(ch) {
      if (ch.kvoActive && ch.running) {
        return ch.kvoRateMlH || 1.0;
      }
      if (ch.mode === 'pausa' && ch.pauseActive) {
        return 0;
      }
      if (ch.mode === 'vazao_vol') {
        return Math.max(0, Number(ch.directFlowMlH) || 0);
      }
      if (ch.mode === 'sequencial') {
        const steps = Array.isArray(ch.seqSteps) ? ch.seqSteps : [];
        const stepObj = steps[ch.seqCurrentIdx || 0];
        return stepObj ? Math.max(0, Number(stepObj.flowMlH) || 0) : 0;
      }
      if (ch.mode === 'rampa') {
        const upSec = Math.max(60, (ch.rampUpMin || 10) * 60);
        const downSec = Math.max(60, (ch.rampDownMin || 10) * 60);
        const platSec = 20 * 60;
        const plateau = Math.max(1, ch.rampPlateauMlH || 40);
        const t = ch.rampElapsedSec || 0;
        if (t < upSec) {
          return Number((plateau * (0.2 + 0.8 * (t / upSec))).toFixed(1));
        }
        if (t > upSec + platSec) {
          const downFrac = Math.min(1, (t - upSec - platSec) / downSec);
          return Number(Math.max(1, plateau * (1 - 0.8 * downFrac)).toFixed(1));
        }
        return plateau;
      }
      if (ch.mode === 'tci') {
        const drug = IV_DRUG_MAP[ch.tciDrugId || ch.drugId] || IV_DRUGS[0];
        const target = Math.max(0, Number(ch.tciTarget) || 0);
        const diff = Math.max(0, target - (ch.tciCurrent || 0));
        const baseScale = ch.tciDrugId === 'midazolam' ? 0.08 : ch.tciDrugId === 'propofol' ? 8.5 : 4.2;
        return Number(clamp(target * baseScale + diff * 12, 0, 240).toFixed(1));
      }
      if (ch.mode === 'bolus_int') {
        return ch.bolusTimer > 0 ? (ch.bolusRateMlH || 200) : (ch.kvoRateMlH || 1.0);
      }
      const drug = IV_DRUG_MAP[ch.drugId];
      if (!drug || ch.rate <= 0) return 0;
      const w = Math.max(30, this.patient.weightKg || 70);
      if (drug.doseMode === 'mcg_kg_min' || drug.doseMode === 'mg_kg_min') {
        return (ch.rate * w * 60) / drug.concPerMl;
      }
      if (drug.doseMode === 'mcg_kg_h' || drug.doseMode === 'mg_kg_h') {
        return (ch.rate * w) / drug.concPerMl;
      }
      if (drug.doseMode === 'u_min' || drug.doseMode === 'mg_min') {
        return (ch.rate * 60) / drug.concPerMl;
      }
      if (drug.doseMode === 'mg_h') {
        return ch.rate / drug.concPerMl;
      }
      return ch.rate;
    }

    _logPumpEvent(ch, msg, forwardGlobal = true) {
      if (!ch) return;
      const now = new Date();
      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      if (!Array.isArray(ch.events)) ch.events = [];
      ch.events.unshift({ time: ts, msg });
      if (ch.events.length > 14) ch.events.length = 14;
      if (forwardGlobal && this.onLog) this.onLog(`Bomba ${ch.channel}: ${msg}`);
    }

    _getEffectivePumpRate(ch) {
      if (!ch || ch.occluded) return 0;
      if (ch.mode === 'pausa' && ch.pauseActive && ch.bolusTimer <= 0) return 0;
      const isRunning = ch.running && !ch.kvoActive;
      if (!isRunning && ch.bolusTimer <= 0) return 0;

      if (ch.mode === 'bolus_int') {
        if (ch.bolusTimer <= 0) return 0;
        return Math.max(ch.rate || 0, IV_DRUG_MAP[ch.drugId] ? IV_DRUG_MAP[ch.drugId].defaultRate : 1.0);
      }
      if (!ch.mode || ch.mode === 'dose_peso' || ch.mode === 'pca') {
        return isRunning ? Math.max(0, Number(ch.rate) || 0) : 0;
      }

      const drug = IV_DRUG_MAP[ch.drugId];
      if (!drug || drug.concPerMl <= 0) return 0;
      const flowMlH = isRunning ? this.getPumpFlowMlH(ch) : 0;
      if (flowMlH <= 0) return 0;
      const w = Math.max(30, this.patient.weightKg || 70);
      if (drug.doseMode === 'mcg_kg_min' || drug.doseMode === 'mg_kg_min') {
        return (flowMlH * drug.concPerMl) / (w * 60);
      }
      if (drug.doseMode === 'mcg_kg_h' || drug.doseMode === 'mg_kg_h') {
        return (flowMlH * drug.concPerMl) / w;
      }
      if (drug.doseMode === 'u_min' || drug.doseMode === 'mg_min') {
        return (flowMlH * drug.concPerMl) / 60;
      }
      return flowMlH * drug.concPerMl;
    }

    _syncNoraFromPumps() {
      if (!this.pumps) return;
      const noraChannels = this.pumps.filter((ch) => ch.drugId === 'noradrenalina');
      if (noraChannels.length > 0) {
        this._pumpHadNora = true;
        this.interventions.noraDose = noraChannels.reduce(
          (sum, ch) => sum + this._getEffectivePumpRate(ch),
          0
        );
      } else if (this._pumpHadNora) {
        this._pumpHadNora = false;
        this.interventions.noraDose = 0;
      }
    }

    _stepPumps(dt) {
      this.pumps.forEach((ch) => {
        if (ch.bolusTimer > 0) {
          ch.bolusTimer = Math.max(0, ch.bolusTimer - dt);
        }
        if (ch.pcaLockoutSec > 0) {
          ch.pcaLockoutSec = Math.max(0, ch.pcaLockoutSec - dt);
        }

        if (ch.running && !ch.occluded) {
          if (ch.mode === 'pausa' && ch.pauseActive) {
            ch.pauseRemainingSec = Math.max(0, (ch.pauseRemainingSec || 0) - dt);
            ch.pressureKpa = lerp(ch.pressureKpa || 0, 4, dt * 3.0);
            if (ch.pauseRemainingSec <= 0) {
              ch.pauseActive = false;
              this._logPumpEvent(ch, 'Pausa programada concluída — Retomando infusão');
            }
            return;
          }

          if (ch.mode === 'tci') {
            const target = Math.max(0, Number(ch.tciTarget) || 0);
            ch.tciCurrent = lerp(ch.tciCurrent || 0, target, dt * 0.35);
          }

          if (ch.mode === 'rampa') {
            ch.rampElapsedSec = (ch.rampElapsedSec || 0) + dt;
          }

          if (ch.mode === 'bolus_int') {
            ch.interCountdownSec = (ch.interCountdownSec || 0) - dt;
            if (ch.interCountdownSec <= 0) {
              ch.interCountdownSec = Math.max(60, (ch.interIntervalMin || 30) * 60);
              ch.bolusTimer = clamp((ch.interBolusMl || 5) / 0.8, 1.5, 8.0);
              this._logPumpEvent(ch, `Bolus Intermitente automático (+${(ch.interBolusMl || 5).toFixed(1)} mL)`);
            }
          }

          const flowMlH = this.getPumpFlowMlH(ch);
          const bolusFlow = ch.bolusTimer > 0 && ch.mode !== 'bolus_int' ? (ch.bolusRateMlH || 200) : 0;
          const effFlow = flowMlH + bolusFlow;
          const dVol = (effFlow / 3600) * dt;
          ch.volInfMl += dVol;
          ch.elapsedSec += dt;
          const occLim = ch.occlusionLimitKpa || 55;
          ch.pressureKpa = clamp(Math.round(8 + effFlow * 0.32), 4, Math.max(18, occLim - 6));

          if (ch.mode === 'sequencial' && Array.isArray(ch.seqSteps) && ch.seqSteps.length > 0) {
            ch.seqStepVolMl = (ch.seqStepVolMl || 0) + dVol;
            const curStep = ch.seqSteps[ch.seqCurrentIdx || 0];
            if (curStep && curStep.vtbiMl > 0 && ch.seqStepVolMl >= curStep.vtbiMl) {
              ch.seqStepVolMl = 0;
              if ((ch.seqCurrentIdx || 0) < ch.seqSteps.length - 1) {
                ch.seqCurrentIdx = (ch.seqCurrentIdx || 0) + 1;
                const nxt = ch.seqSteps[ch.seqCurrentIdx];
                this._logPumpEvent(ch, `Sequencial → Etapa ${ch.seqCurrentIdx + 1}/${ch.seqSteps.length} (${nxt.flowMlH} mL/h)`);
              } else {
                ch.kvoActive = true;
                this._logPumpEvent(ch, `Modo Sequencial (${ch.seqSteps.length} etapas) concluído → KVO`);
              }
            }
          }

          if (ch.vtbiMl > 0 && ch.volInfMl >= ch.vtbiMl && !ch.kvoActive) {
            ch.volInfMl = ch.vtbiMl;
            if ((ch.kvoRateMlH || 0) > 0) {
              ch.kvoActive = true;
              this._logPumpEvent(ch, `VTBI (${ch.vtbiMl} mL) atingido → Modo KVO (${ch.kvoRateMlH.toFixed(1)} mL/h)`);
            } else {
              ch.running = false;
              this._logPumpEvent(ch, `VTBI (${ch.vtbiMl} mL) concluído — Infusão finalizada`);
            }
          }
        } else if (ch.occluded && ch.running) {
          const targetKpa = Math.max(45, Math.min(99, (ch.occlusionLimitKpa || 55) + 25));
          ch.pressureKpa = lerp(ch.pressureKpa || 20, targetKpa, dt * 3.0);
        } else {
          ch.pressureKpa = lerp(ch.pressureKpa || 0, 0, dt * 4.0);
        }
      });

      this._syncNoraFromPumps();
    }

    /** Farmacocinética de sítio efetor (Ce) com constantes de equilíbrio (ke0) por fármaco */
    _stepPharmacology(dt) {
      if (!this.drugCe) this.drugCe = {};
      const ke0Map = {
        noradrenalina: 0.24,
        vasopressina: 0.14,
        adrenalina: 0.30,
        dobutamina: 0.18,
        nitroprussiato: 0.32,
        fentanil: 0.09,
        propofol: 0.20,
        midazolam: 0.08,
        dexmedetomidina: 0.08,
        remifentanil: 0.34,
        sufentanil: 0.12,
        morfina: 0.06,
        amiodarona: 0.06
      };

      const targets = {};
      if (Array.isArray(this.pumps)) {
        for (let i = 0; i < this.pumps.length; i++) {
          const ch = this.pumps[i];
          const effRate = this._getEffectivePumpRate(ch);
          const active = !ch.occluded && (effRate > 0 || ch.bolusTimer > 0);
          if (!active) continue;
          const bolusAdd = ch.bolusTimer > 0 ? (ch.drugId === 'propofol' ? 1.5 : ch.drugId === 'fentanil' ? 2.0 : ch.drugId === 'midazolam' ? 0.12 : ch.drugId === 'remifentanil' ? 0.15 : ch.drugId === 'amiodarona' ? 0.6 : 0.3) : 0;
          targets[ch.drugId] = (targets[ch.drugId] || 0) + effRate + bolusAdd;
        }
      }

      const allKeys = new Set([...Object.keys(this.drugCe), ...Object.keys(targets)]);
      allKeys.forEach((id) => {
        const cur = this.drugCe[id] || 0;
        const tgt = targets[id] || 0;
        const ke0 = ke0Map[id] || 0.15;
        // Eliminação um pouco mais lenta que o onset (histerese farmacológica real)
        const rate = tgt >= cur ? ke0 : ke0 * 0.65;
        const next = lerp(cur, tgt, clamp(dt * rate, 0, 1));
        this.drugCe[id] = next < 0.0005 ? 0 : next;
      });
    }

    _logInteractionOnce(key, msg) {
      if (!this.onLog) return;
      if (!this._interactionLogCooldown) this._interactionLogCooldown = {};
      const last = this._interactionLogCooldown[key] || -999;
      if (this.simTime - last >= 45) {
        this._interactionLogCooldown[key] = this.simTime;
        this.onLog(msg);
      }
    }

    _getPumpPharmacology() {
      const ce = this.drugCe || {};
      const iv = this.interventions || {};
      const ph = this.vitals ? (this.vitals.ph || 7.4) : 7.4;

      const fx = {
        svrFactor: 1.0,
        contractilityFactor: 1.0,
        preloadFactor: 1.0,
        hrDelta: 0,
        drivePenalty: 0,
        resScale: 1.0,
        ectopyDelta: 0,
        ectopyReduction: 0,
        stPenalty: 0,
        lactateRate: 0,
        catecholamineScale: 1.0,
        proArrhythmiaStress: 0
      };

      const interactions = [];

      // 1. Acidemia reduz sensibilidade dos receptores alfa1/beta1 a catecolaminas (Vasopressina V1 preservada!)
      const acidCatecholScale = ph < 7.25 ? clamp(1 - (7.25 - ph) * 1.8, 0.45, 1.0) : 1.0;
      fx.catecholamineScale = acidCatecholScale;

      const nora = Math.max(ce.noradrenalina || 0, iv.noraDose || 0);
      const vaso = ce.vasopressina || 0;
      const adr = ce.adrenalina || 0;
      const dobu = ce.dobutamina || 0;
      const nps = ce.nitroprussiato || 0;
      const fenta = ce.fentanil || 0;
      const prop = ce.propofol || 0;
      const mida = ce.midazolam || 0;
      const dex = ce.dexmedetomidina || 0;
      const remi = ce.remifentanil || 0;
      const sufe = ce.sufentanil || 0;
      const morf = ce.morfina || 0;
      const amio = ce.amiodarona || 0;

      // Efeitos individuais (modulados por acidemia nas catecolaminas)
      if (nora > 0) {
        fx.hrDelta += nora * 9 * acidCatecholScale;
        if (nora > 0.6) fx.ectopyDelta += (nora - 0.6) * 0.08;
      }
      if (vaso > 0) {
        // Receptor V1 mantém eficácia mesmo em acidose grave!
        fx.svrFactor += vaso * 14.5;
        fx.hrDelta -= Math.min(8, vaso * 90); // leve bradicardia barorreflexa
      }
      if (adr > 0) {
        fx.svrFactor += adr * 1.15 * acidCatecholScale;
        fx.contractilityFactor += adr * 0.9 * acidCatecholScale;
        fx.hrDelta += adr * 44 * acidCatecholScale;
        fx.resScale *= Math.max(0.56, 1 - adr * 0.72);
        fx.ectopyDelta += adr * 0.14;
        fx.stPenalty += adr * 1.2;
        fx.lactateRate += adr * 0.035; // glicogenólise beta2 -> hiperlactatemia
      }
      if (dobu > 0) {
        fx.contractilityFactor += dobu * 0.034 * acidCatecholScale;
        fx.hrDelta += dobu * 1.6 * acidCatecholScale;
        fx.svrFactor -= Math.min(0.16, dobu * 0.009);
        if (dobu > 8) fx.ectopyDelta += (dobu - 8) * 0.009;
        if (dobu > 10) fx.stPenalty += (dobu - 10) * 0.06;
      }
      if (nps > 0) {
        fx.svrFactor -= Math.min(0.58, nps * 0.09);
        fx.preloadFactor -= Math.min(0.18, nps * 0.025);
        fx.hrDelta += nps * 2.8;
        if (nps > 3.5) {
          fx.lactateRate += (nps - 3.5) * 0.018; // toxicidade por cianeto em dose alta
        }
      }

      // Opioides & Antagonismo competitivo por Naloxona
      const naloxoneBlock = iv.naloxoneTimer > 0 ? clamp(0.12 + 0.88 * (1 - Math.min(1, iv.naloxoneTimer / 20)), 0.08, 1.0) : 1.0;
      let opioidDrive = 0;
      let opioidHrDrop = 0;
      if (fenta > 0) {
        opioidDrive += Math.min(12, fenta * 2.4);
        opioidHrDrop += Math.min(14, fenta * 1.8);
        fx.svrFactor -= Math.min(0.12, fenta * 0.015) * naloxoneBlock;
      }
      if (remi > 0) {
        opioidDrive += Math.min(14, remi * 34);
        opioidHrDrop += Math.min(18, remi * 30);
        fx.svrFactor -= Math.min(0.15, remi * 0.28) * naloxoneBlock;
      }
      if (sufe > 0) {
        opioidDrive += Math.min(11, sufe * 10);
        opioidHrDrop += Math.min(10, sufe * 8);
      }
      if (morf > 0) {
        opioidDrive += Math.min(8, morf * 0.95);
        fx.svrFactor -= Math.min(0.11, morf * 0.016) * naloxoneBlock;
      }
      opioidDrive *= naloxoneBlock;
      opioidHrDrop *= naloxoneBlock;

      // Hipnóticos / Sedativos
      let sedativeDrive = 0;
      if (prop > 0) {
        sedativeDrive += Math.min(14, prop * 3.1);
        fx.svrFactor -= Math.min(0.30, prop * 0.068);
        fx.contractilityFactor -= Math.min(0.16, prop * 0.032);
        fx.hrDelta -= Math.min(10, prop * 1.6);
      }
      if (mida > 0) {
        sedativeDrive += Math.min(10, mida * 36);
        fx.svrFactor -= Math.min(0.13, mida * 0.30);
      }
      if (dex > 0) {
        fx.hrDelta -= Math.min(20, dex * 15);
        fx.svrFactor -= Math.min(0.16, dex * 0.12);
      }
      if (amio > 0) {
        fx.hrDelta -= Math.min(26, amio * 15);
        fx.svrFactor -= Math.min(0.12, amio * 0.06);
        fx.ectopyReduction += 0.8;
      }

      fx.drivePenalty += opioidDrive + sedativeDrive;
      fx.hrDelta -= opioidHrDrop;

      // ================= INTERAÇÕES MEDICAMENTOSAS CLÍNICAS =================

      // INTERAÇÃO 1: Sinergia supra-aditiva Sedativo + Opioide (depressão respiratória + hipotensão pós-indução)
      const hasSedative = prop > 0.6 || mida > 0.04 || (iv.etomidateBolusTimer || 0) > 0;
      const hasOpioid = opioidDrive > 1.8;
      if (hasSedative && hasOpioid) {
        const synScale = clamp((sedativeDrive + ((iv.etomidateBolusTimer || 0) > 0 ? 4 : 0)) * opioidDrive * 0.035, 0.2, 1.0);
        fx.drivePenalty += 4.5 * synScale;
        fx.svrFactor -= 0.14 * synScale;
        interactions.push({
          level: this.airway && !this.airway.connectedToVent ? 'critical' : 'warning',
          tag: 'Sinergia Sedativo + Opioide',
          msg: 'INTERAÇÃO: Sinergia Hipnótico + Opioide (risco de apneia e hipotensão)'
        });
        this._logInteractionOnce('sed_opioid', '💊 Interação detectada: Sinergia Sedativo + Opioide — depressão respiratória e queda de PAM potencializadas.');
      }

      // INTERAÇÃO 2: Catecolaminorresistência por Acidose Grave (pH < 7.20)
      const totalCatechol = nora + adr * 2.2 + dobu * 0.04;
      if (acidCatecholScale < 0.86 && totalCatechol > 0.15) {
        const pctEff = Math.round(acidCatecholScale * 100);
        interactions.push({
          level: ph < 7.12 ? 'critical' : 'warning',
          tag: `Acidose reduz catecolamina (${pctEff}%)`,
          msg: `INTERAÇÃO: Acidose (pH ${ph.toFixed(2)}) reduz eficácia de catecolaminas para ${pctEff}% — considere Vasopressina / corrigir pH`
        });
        this._logInteractionOnce('acid_catechol', `💊 Interação fisiológica: Acidemia (pH ${ph.toFixed(2)}) reduzindo resposta a catecolaminas (${pctEff}%). Vasopressina (V1) preserva efeito.`);
      }

      // INTERAÇÃO 3: Tempestade Adrenérgica / Sobrecarga Catecolaminérgica (Adrenalina + Dobutamina / Nora alta)
      const adrBurden = adr * 3.0 + dobu * 0.065 + Math.max(0, nora - 0.5) * 0.8 + ((iv.adrenalineBolusTimer || 0) > 0 ? 0.6 : 0);
      if (adrBurden > 0.85) {
        fx.ectopyDelta += clamp((adrBurden - 0.85) * 0.18, 0, 0.35);
        fx.proArrhythmiaStress += clamp((adrBurden - 0.85) * 1.4, 0, 2.5);
        interactions.push({
          level: adrBurden > 1.4 ? 'critical' : 'warning',
          tag: 'Sobrecarga Catecolaminérgica',
          msg: 'INTERAÇÃO: Sobrecarga Adrenérgica (risco de TV/FV, isquemia e hiperlactatemia)'
        });
        this._logInteractionOnce('adr_storm', '💊 Interação: Sobrecarga catecolaminérgica — aumento de ectopias ventriculares e risco de TV/FV.');
      }

      // INTERAÇÃO 4: Sinergia Bradicardizante / Bloqueio AV (Amiodarona + Dexmedetomidina / Remifentanil)
      const bradyAgents = (amio > 0.3 || (iv.amiodaroneBolusTimer || 0) > 0 ? 1 : 0) + (dex > 0.3 ? 1 : 0) + (remi > 0.12 || fenta > 3 ? 1 : 0);
      if (bradyAgents >= 2) {
        fx.hrDelta -= 14;
        interactions.push({
          level: 'warning',
          tag: 'Sinergia Bradicardizante',
          msg: 'INTERAÇÃO: Sinergia Bradicardizante / Bloqueio AV (monitorar FC e condução)'
        });
        this._logInteractionOnce('brady_syn', '💊 Interação: Associação bradicardizante (Amiodarona / Dexmedetomidina / Opioide) — risco de bradicardia grave ou BAV.');
      }

      // INTERAÇÃO 5: Colapso Vasodilatador (Nitroprussiato/Nitroglicerina + Propofol ou Hipovolemia)
      const vasoDil = nps > 0.5 || (iv.nitroBolusTimer || 0) > 0;
      const lowPreload = this.cardiac && (this.cardiac.preload + (iv.fluidBoost || 0)) < 0.86;
      if (vasoDil && (prop > 1.2 || lowPreload || (this.patient && this.patient.pneumothoraxActive))) {
        fx.svrFactor -= 0.14;
        fx.preloadFactor -= 0.10;
        interactions.push({
          level: 'critical',
          tag: 'Colapso Vasodilatador',
          msg: 'INTERAÇÃO: Vasodilatador + Propofol/Hipovolemia — risco de colapso hemodinâmico!'
        });
        this._logInteractionOnce('vaso_collapse', '💊 Interação crítica: Vasodilatador associado a Propofol ou pré-carga baixa — queda grave da PAM!');
      }

      // INTERAÇÃO 6: Nitroprussiato em dose alta prolongada (risco de toxicidade por cianeto)
      if (nps > 4.0) {
        interactions.push({
          level: 'warning',
          tag: 'Nitroprussiato Dose Alta (Cianeto)',
          msg: `INTERAÇÃO: Nitroprussiato ${nps.toFixed(1)} mcg/kg/min — risco de acidose lática (cianeto)`
        });
      }

      this.drugInteractions = interactions;
      fx.svrFactor = clamp(fx.svrFactor, 0.32, 2.35);
      fx.contractilityFactor = clamp(fx.contractilityFactor, 0.55, 1.95);
      fx.preloadFactor = clamp(fx.preloadFactor, 0.65, 1.15);
      return fx;
    }

    setPumpChannelDrug(idx, drugId) {
      const ch = this.pumps[idx];
      const drug = IV_DRUG_MAP[drugId];
      if (!ch || !drug) return;
      ch.drugId = drug.id;
      ch.rate = drug.defaultRate;
      ch.running = false;
      ch.kvoActive = false;
      ch.volInfMl = 0;
      ch.elapsedSec = 0;
      ch.occluded = false;
      ch.alarmSilenced = false;
      ch.bolusTimer = 0;
      ch.bolusVolMl = drug.bolusAddMl > 0 ? drug.bolusAddMl : 1.0;
      this._syncNoraFromPumps();
      this._logPumpEvent(ch, `Droga DERS → ${drug.name} (${drug.concLabel})`);
    }

    setPumpChannelRate(idx, newRate) {
      const ch = this.pumps[idx];
      if (!ch || ch.keyLocked) return;
      const drug = IV_DRUG_MAP[ch.drugId];
      if (!drug) return;
      const clamped = clamp(Number(newRate), drug.minRate, drug.maxRate);
      ch.rate = Number(clamped.toFixed(2));
      this._syncNoraFromPumps();
    }

    setPumpConfig(idx, patch) {
      const ch = this.pumps[idx];
      if (!ch || !patch) return;
      Object.assign(ch, patch);
      if (patch.vtbiMl !== undefined && (ch.vtbiMl === 0 || ch.volInfMl < ch.vtbiMl)) {
        ch.kvoActive = false;
      }
      if (patch.mode) this._logPumpEvent(ch, `Modo → ${patch.mode}`);
      if (patch.sector) this._logPumpEvent(ch, `Setor DERS → ${patch.sector}`);
      if (patch.vtbiMl !== undefined) this._logPumpEvent(ch, `VTBI → ${ch.vtbiMl > 0 ? `${ch.vtbiMl} mL` : 'Contínuo'}`);
      if (patch.kvoRateMlH !== undefined) this._logPumpEvent(ch, `KVO → ${ch.kvoRateMlH > 0 ? `${ch.kvoRateMlH.toFixed(1)} mL/h` : 'Desligado'}`);
      if (patch.occlusionLimitKpa !== undefined) this._logPumpEvent(ch, `Limite Oclusão → ${ch.occlusionLimitKpa} kPa`);
      if (patch.antiBolus !== undefined) this._logPumpEvent(ch, `Anti-Bolus → ${ch.antiBolus ? 'Ligado' : 'Desligado'}`);
      if (patch.airBubbleUl !== undefined) this._logPumpEvent(ch, `Sensor Ar → ${ch.airBubbleUl} µL`);
      if (patch.dropSensorOn !== undefined) this._logPumpEvent(ch, `Sensor Gotas 3ED 4.0 → ${ch.dropSensorOn ? 'Ativo' : 'Inativo'}`);
      if (patch.equipoType) this._logPumpEvent(ch, `Equipo → ${ch.equipoType}`);
      if (patch.nightMode !== undefined) this._logPumpEvent(ch, ch.nightMode ? 'Modo Noturno ativado' : 'Modo Noturno desativado');
      if (patch.audioLevel) this._logPumpEvent(ch, `Volume Alarme → ${ch.audioLevel}`);
      if (patch.language) this._logPumpEvent(ch, `Idioma → ${ch.language}`);
      if (patch.keyLocked !== undefined) this._logPumpEvent(ch, ch.keyLocked ? 'Teclado travado (🔒)' : 'Teclado destravado');
    }

    togglePumpChannelRun(idx) {
      const ch = this.pumps[idx];
      if (!ch) return false;
      const drug = IV_DRUG_MAP[ch.drugId];
      if (!ch.running && ch.kvoActive) {
        ch.kvoActive = false;
      }
      if (!ch.running && ch.rate <= 0 && drug) {
        ch.rate = Math.max(drug.step, drug.defaultRate || drug.step);
      }
      ch.running = !ch.running;
      if (ch.running && ch.vtbiMl > 0 && ch.volInfMl >= ch.vtbiMl) {
        ch.volInfMl = 0;
        ch.kvoActive = false;
      }
      this._syncNoraFromPumps();
      if (drug) {
        this._logPumpEvent(
          ch,
          ch.running
            ? `INICIADA: ${drug.name} a ${ch.rate.toFixed(2)} ${drug.unit} (${this.getPumpFlowMlH(ch).toFixed(1)} mL/h)`
            : `PAUSADA: ${drug.name}`
        );
      }
      return ch.running;
    }

    setSimultaneousActivePumps(count) {
      if (!this.pumps) return;
      const target = clamp(Math.round(Number(count) || 0), 0, this.pumps.length);
      this.pumps.forEach((ch, idx) => {
        const drug = IV_DRUG_MAP[ch.drugId];
        if (idx < target) {
          if (ch.rate <= 0 && drug) {
            ch.rate = Math.max(drug.step, drug.defaultRate || drug.step);
          }
          ch.kvoActive = false;
          ch.running = true;
        } else {
          ch.running = false;
        }
      });
      this._syncNoraFromPumps();
      if (this.onLog) {
        this.onLog(
          target === 0
            ? 'Todas as bombas de infusão foram pausadas'
            : `Bombas de Infusão: ${target} bomba(s) em operação simultânea (Bombas 1–${target})`
        );
      }
    }

    triggerPumpBolus(idx) {
      const ch = this.pumps[idx];
      if (!ch) return;
      const drug = IV_DRUG_MAP[ch.drugId];
      if (!drug) return;
      if (ch.occluded) {
        this._logPumpEvent(ch, 'Bolus bloqueado por OCLUSÃO na linha!');
        return;
      }
      const addMl = ch.bolusVolMl > 0 ? ch.bolusVolMl : (drug.bolusAddMl > 0 ? drug.bolusAddMl : 1.0);
      ch.volInfMl += addMl;
      ch.bolusTimer = 4.0;
      this._logPumpEvent(ch, `BOLUS rápido de ${drug.name} (+${addMl.toFixed(1)} mL @ ${ch.bolusRateMlH || 200} mL/h)`);
    }

    triggerPcaDemand(idx) {
      const ch = this.pumps[idx];
      if (!ch) return false;
      ch.pcaAttempts = (ch.pcaAttempts || 0) + 1;
      if (ch.occluded) {
        this._logPumpEvent(ch, 'Demanda PCA bloqueada — OCLUSÃO');
        return false;
      }
      if ((ch.pcaLockoutSec || 0) > 0) {
        this._logPumpEvent(ch, `Demanda PCA negada (Lockout ${Math.ceil(ch.pcaLockoutSec)}s restantes)`);
        return false;
      }
      const drug = IV_DRUG_MAP[ch.drugId];
      const w = Math.max(30, this.patient.weightKg || 70);
      let addMl = 1.0;
      if (drug && drug.concPerMl > 0) {
        const rawDose = Number(ch.pcaDemandDose) || 1.0;
        const pcaUnit = String(ch.pcaUnit || 'mg').toLowerCase();
        const drugPerMlUnit = String(drug.unit || '').toLowerCase();
        let demandInDrugConcUnit = rawDose;
        if (pcaUnit === 'mcg/kg') {
          demandInDrugConcUnit = rawDose * w;
          if (drugPerMlUnit.startsWith('mg')) demandInDrugConcUnit /= 1000;
        } else if (pcaUnit === 'mcg' && drugPerMlUnit.startsWith('mg')) {
          demandInDrugConcUnit = rawDose / 1000;
        } else if (pcaUnit === 'mg' && drugPerMlUnit.startsWith('mcg')) {
          demandInDrugConcUnit = rawDose * 1000;
        }
        addMl = clamp(demandInDrugConcUnit / drug.concPerMl, 0.25, 10.0);
      }
      ch.volInfMl += addMl;
      ch.bolusTimer = 2.8;
      ch.pcaDelivered = (ch.pcaDelivered || 0) + 1;
      ch.pcaLockoutSec = Math.max(30, (ch.pcaLockoutMin || 8) * 60);
      this._logPumpEvent(ch, `PCA Demanda #${ch.pcaDelivered} entregue (+${(ch.pcaDemandDose || 1.0).toFixed(1)} ${ch.pcaUnit || 'mg'}) • Lockout ${ch.pcaLockoutMin || 8}m`);
      return true;
    }

    triggerPumpPurge(idx) {
      const ch = this.pumps[idx];
      if (!ch) return;
      if (ch.occluded) {
        this._logPumpEvent(ch, 'Purga bloqueada por OCLUSÃO na linha!');
        return;
      }
      ch.volInfMl += 2.0;
      this._logPumpEvent(ch, 'Purga do equipo realizada (+2.0 mL)');
    }

    resetPumpChannelVolume(idx) {
      const ch = this.pumps[idx];
      if (!ch) return;
      ch.volInfMl = 0;
      ch.elapsedSec = 0;
      ch.kvoActive = false;
      this._logPumpEvent(ch, 'Volume infundido zerado');
    }

    togglePumpChannelOcclusion(idx) {
      const ch = this.pumps[idx];
      if (!ch) return;
      ch.occluded = !ch.occluded;
      if (!ch.occluded) ch.alarmSilenced = false;
      this._logPumpEvent(ch, ch.occluded ? `ALARME: OCLUSÃO DE LINHA (${ch.occlusionLimitKpa || 55} kPa)!` : 'Oclusão resolvida');
    }

    silencePumpChannelAlarm(idx) {
      const ch = this.pumps[idx];
      if (!ch) return;
      ch.alarmSilenced = true;
      if (ch.occluded) {
        ch.occluded = false;
        this._logPumpEvent(ch, 'Alarme silenciado e linha desobstruída (Anti-Bolus ativo)');
      }
    }

    _stepVentilator(dt) {
      const b = this.breath;
      const v = this.vent;
      const pumpFx = this._getPumpPharmacology();
      const C = Math.max(0.01, this.patient.compliance / 1000); // L/cmH2O
      const R = Math.max(2, this.patient.resistance * pumpFx.resScale); // cmH2O/(L/s)
      const tau = R * C;
      const drive = Math.max(0, this.patient.intrinsicDrive - pumpFx.drivePenalty);

      if (!this.airway || !this.airway.connectedToVent) {
        if (b.shockPawTimer > 0) b.shockPawTimer = Math.max(0, b.shockPawTimer - dt);
        this._stepSpontaneousAirway(dt, C, R, tau, drive);
        return;
      }

      if (v.standby) {
        if (b.shockPawTimer > 0) b.shockPawTimer = Math.max(0, b.shockPawTimer - dt);
        b.phase = 'EXP';
        b.flowLs = -b.volumeL / Math.max(0.25, tau);
        b.volumeL = Math.max(0, b.volumeL + b.flowLs * dt);
        b.paw = 0;
        b.lastPeakPaw = 0;
        b.lastPlatPaw = 0;
        b.lastMeanPaw = 0;
        b.lastAutoPeep = 0;
        b.lastRrTotal = 0;
        b.lastVteMl = 0;
        b.lastVeLmin = 0;
        return;
      }

      // Determinar modo efetivo (se PSV entra em backup por apneia > 12s)
      const isSpontMode = v.mode === 'PSV';

      let effectiveRr = v.rrSet;
      if (isSpontMode) {
        if (drive <= 0) {
          b.apneaTimer += dt;
          if (b.apneaTimer >= 12 && !v.backupActive) {
            v.backupActive = true;
            if (this.onLog) this.onLog('ALARME APNEIA (PSV): Ventilação de backup ativada!');
          }
          effectiveRr = v.backupActive ? 12 : 0;
        } else {
          b.apneaTimer = 0;
          v.backupActive = false;
          effectiveRr = drive;
        }
      } else {
        b.apneaTimer = 0;
        v.backupActive = false;
        // Se drive do paciente > FR ajustada, paciente dispara respirações extras (assistido)
        effectiveRr = drive > v.rrSet ? Math.round((v.rrSet + drive) * 0.52) : v.rrSet;
      }

      const cycleDuration = effectiveRr > 0 ? 60 / effectiveRr : 9999;

      // Cálculos de tempos por modo
      let tiFlow = 0.6;
      let tiPause = 0;
      let tiTotal = 1.0;

      if (v.mode === 'VCV' || v.backupActive) {
        const vtL = (v.backupActive ? 450 : v.vtSet) / 1000;
        const flowLs = Math.max(0.25, v.flowSet / 60);
        tiFlow = vtL / flowLs;
        const pauseFrac = v.backupActive ? 0.05 : v.inspPausePct / 100;
        tiPause = tiFlow * (pauseFrac / Math.max(0.4, 1 - pauseFrac));
        tiTotal = tiFlow + tiPause;
      } else if (v.mode === 'PCV') {
        tiTotal = v.tiSet;
        tiFlow = tiTotal;
        tiPause = 0;
      } else {
        // PSV: ciclagem a fluxo (estimamos limite máximo de 2.4s)
        tiTotal = 2.4;
      }

      b.tInBreath += dt;
      b.tInPhase += dt;

      // Pausa Inspiratória Manual (Hold)
      if (v.holdInspTimer > 0 && b.phase === 'INSP' && b.tInPhase >= tiFlow * 0.92) {
        b.phase = 'PAUSE';
        b.tInPhase = 0;
      }

      // Pausa Expiratória Manual (Hold) no fim da expiração
      if (v.holdExpTimer > 0 && b.phase === 'EXP' && b.tInBreath >= Math.max(0.4, cycleDuration - 0.12)) {
        b.flowLs = 0;
        const autoPeep = b.volumeL / C;
        b.paw = v.peepSet + autoPeep;
        b.lastAutoPeep = autoPeep;
        this._recordLoopPoint();
        return;
      }

      // Transições e Equação do Movimento
      if (effectiveRr === 0) {
        // Apneia total (PSV sem backup ainda)
        b.phase = 'EXP';
        b.flowLs = -b.volumeL / tau;
        b.volumeL = Math.max(0, b.volumeL + b.flowLs * dt);
        b.paw = v.peepSet + (b.volumeL / C) * 0.2;
        b.lastRrTotal = 0;
        b.lastVeLmin = 0;
        this._recordLoopPoint();
        return;
      }

      // Início de um novo ciclo
      if (b.phase === 'EXP' && b.tInBreath >= cycleDuration) {
        // Fechar métricas do ciclo anterior
        b.cycleCount += 1;
        b.lastAutoPeep = b.volumeL / C;
        b.lastPeakPaw = b.currentBreathPeakPaw;
        b.lastPlatPaw = b.currentBreathPlatPaw;
        b.lastMeanPaw = b.pawSamples > 0 ? b.pawIntegral / b.pawSamples : v.peepSet + 3;
        b.lastVteMl = Math.round(b.currentBreathVtMl);
        b.lastRrTotal = effectiveRr;
        b.lastVeLmin = Number(((b.lastVteMl / 1000) * effectiveRr).toFixed(1));

        const actualTi = Math.max(0.3, b.lastTiMeasured || tiTotal);
        const actualTe = Math.max(0.2, cycleDuration - actualTi);
        if (actualTe >= actualTi) {
          b.lastIeString = `1:${(actualTe / actualTi).toFixed(1)}`;
        } else {
          b.lastIeString = `${(actualTi / actualTe).toFixed(1)}:1`;
        }

        if (b.currentLoop.length > 8) {
          b.lastLoop = b.currentLoop.slice();
        }
        b.currentLoop = [];

        // Reset para novo ciclo
        b.tInBreath = 0;
        b.tInPhase = 0;
        b.currentBreathPeakPaw = v.peepSet;
        b.currentBreathPlatPaw = v.peepSet;
        b.currentBreathVtMl = 0;
        b.peakFlowInsp = 0;
        b.pawIntegral = 0;
        b.pawSamples = 0;
        b.lastBreathWasSpont = isSpontMode && !v.backupActive ? true : drive > v.rrSet;

        if (b.lastBreathWasSpont) {
          b.phase = 'TRIGGER';
        } else {
          b.phase = 'INSP';
        }
      }

      if (b.phase === 'TRIGGER') {
        // Pequena deflexão negativa de disparo do paciente (~80 ms)
        const triggerTime = 0.08;
        b.paw = Math.max(0, v.peepSet - Math.min(2.8, v.triggerSens * 0.9));
        b.flowLs = 0.05;
        if (b.tInPhase >= triggerTime) {
          b.phase = 'INSP';
          b.tInPhase = 0;
        }
      } else if (b.phase === 'INSP') {
        if (v.mode === 'VCV' || v.backupActive) {
          const flowLs = Math.max(0.25, v.flowSet / 60);
          b.flowLs = flowLs;
          b.volumeL += flowLs * dt;
          const elasticP = b.volumeL / C;
          const resistiveP = R * flowLs;
          b.paw = v.peepSet + elasticP + resistiveP;
          b.currentBreathPeakPaw = Math.max(b.currentBreathPeakPaw, b.paw);
          b.currentBreathPlatPaw = v.peepSet + elasticP;
          b.currentBreathVtMl = Math.max(b.currentBreathVtMl, (b.volumeL - b.lastAutoPeep * C) * 1000);

          if (b.tInPhase >= tiFlow) {
            if (tiPause > 0.02 || v.holdInspTimer > 0) {
              b.phase = 'PAUSE';
              b.tInPhase = 0;
            } else {
              b.lastTiMeasured = b.tInBreath;
              b.phase = 'EXP';
              b.tInPhase = 0;
            }
          }
        } else if (v.mode === 'PCV') {
          const targetP = v.peepSet + v.pcSet;
          const rise = clamp(b.tInPhase / 0.07, 0, 1);
          b.paw = lerp(v.peepSet, targetP, rise);
          const driving = Math.max(0, b.paw - v.peepSet - b.volumeL / C);
          b.flowLs = driving / R;
          b.volumeL += b.flowLs * dt;

          b.currentBreathPeakPaw = Math.max(b.currentBreathPeakPaw, b.paw);
          b.currentBreathPlatPaw = v.peepSet + b.volumeL / C;
          b.currentBreathVtMl = Math.max(b.currentBreathVtMl, (b.volumeL - b.lastAutoPeep * C) * 1000);

          if (b.tInPhase >= tiTotal) {
            if (v.holdInspTimer > 0) {
              b.phase = 'PAUSE';
              b.tInPhase = 0;
            } else {
              b.lastTiMeasured = b.tInBreath;
              b.phase = 'EXP';
              b.tInPhase = 0;
            }
          }
        } else {
          // PSV
          const targetP = v.peepSet + v.psSet;
          const rise = clamp(b.tInPhase / 0.08, 0, 1);
          b.paw = lerp(v.peepSet, targetP, rise);
          // Esforço inspiratório muscular ajuda levemente nos primeiros 0.4s
          const pmus = b.tInPhase < 0.45 ? 3.5 * Math.sin((b.tInPhase / 0.45) * Math.PI) : 0;
          const driving = Math.max(0, b.paw + pmus - v.peepSet - b.volumeL / C);
          b.flowLs = driving / R;
          b.volumeL += b.flowLs * dt;
          b.peakFlowInsp = Math.max(b.peakFlowInsp, b.flowLs);

          b.currentBreathPeakPaw = Math.max(b.currentBreathPeakPaw, b.paw);
          b.currentBreathPlatPaw = v.peepSet + b.volumeL / C;
          b.currentBreathVtMl = Math.max(b.currentBreathVtMl, (b.volumeL - b.lastAutoPeep * C) * 1000);

          const cycleThreshold = b.peakFlowInsp * (v.etsPct / 100);
          if ((b.tInPhase > 0.25 && b.flowLs <= cycleThreshold) || b.tInPhase >= 2.2) {
            b.lastTiMeasured = b.tInBreath;
            b.phase = 'EXP';
            b.tInPhase = 0;
          }
        }
      } else if (b.phase === 'PAUSE') {
        b.flowLs = 0;
        b.paw = v.peepSet + b.volumeL / C;
        b.currentBreathPlatPaw = b.paw;
        if (v.holdInspTimer <= 0 && b.tInPhase >= tiPause) {
          b.lastTiMeasured = b.tInBreath;
          b.phase = 'EXP';
          b.tInPhase = 0;
        }
      } else {
        // EXP: esvaziamento passivo governado pela constante de tempo tau = R * C
        const alveolarP = v.peepSet + b.volumeL / C;
        b.flowLs = -(alveolarP - v.peepSet) / R;
        b.volumeL = Math.max(0, b.volumeL + b.flowLs * dt);
        // Pequena resistência da válvula expiratória
        b.paw = v.peepSet + Math.max(0, -b.flowLs * 1.4);
      }

      // Contração muscular torácica breve durante descarga elétrica do cardioversor (pico transitório em Paw)
      if (b.shockPawTimer > 0) {
        b.shockPawTimer = Math.max(0, b.shockPawTimer - dt);
        const jolt = Math.sin((b.shockPawTimer / 0.32) * Math.PI) * 11.5;
        b.paw += jolt;
      }

      b.pawIntegral += b.paw;
      b.pawSamples += 1;
      this._recordLoopPoint();
    }

    _stepSpontaneousAirway(dt, C, R, tau, drive) {
      const b = this.breath;
      const o2Info = this.getEffectiveO2Info();
      const isBvm = o2Info.deviceId === 'bvm';
      const effRr = isBvm ? Math.max(12, drive) : drive;
      const effPeep = o2Info.peep || 0;

      if (effRr <= 0) {
        b.phase = 'EXP';
        b.flowLs = -b.volumeL / Math.max(0.25, tau);
        b.volumeL = Math.max(0, b.volumeL + b.flowLs * dt);
        b.paw = effPeep;
        b.lastPeakPaw = effPeep;
        b.lastPlatPaw = effPeep;
        b.lastMeanPaw = effPeep;
        b.lastAutoPeep = 0;
        b.lastRrTotal = 0;
        b.lastVteMl = 0;
        b.lastVeLmin = 0;
        b.lastIeString = '--';
        b.lastBreathWasSpont = true;
        return;
      }

      const cycleSec = 60 / effRr;
      const targetVtL = isBvm
        ? 0.46
        : clamp(0.42 * (C / 0.05) * 0.45 + 0.24 + (o2Info.support || 0) * 0.014, 0.20, 0.54);
      const inspSec = clamp(cycleSec * 0.34, 0.7, 1.35);

      b.tInBreath += dt;
      b.tInPhase += dt;

      if (b.tInBreath >= cycleSec) {
        b.tInBreath = 0;
        b.tInPhase = 0;
        b.phase = 'INSP';
        b.lastVteMl = Math.round(targetVtL * 1000);
        b.lastRrTotal = effRr;
        b.lastVeLmin = Number(((b.lastVteMl / 1000) * effRr).toFixed(1));
        b.lastPeakPaw = Math.round(effPeep + (o2Info.support || 0));
        b.lastPlatPaw = Math.round(effPeep);
        b.lastMeanPaw = effPeep;
        b.lastAutoPeep = 0;
        b.lastIeString = `1:${((cycleSec - inspSec) / Math.max(0.3, inspSec)).toFixed(1)}`;
        b.lastBreathWasSpont = !isBvm;
      }

      if (b.tInBreath < inspSec) {
        b.phase = 'INSP';
        const frac = b.tInBreath / inspSec;
        b.flowLs = (targetVtL / inspSec) * Math.PI * 0.5 * Math.sin(frac * Math.PI);
        b.volumeL = targetVtL * 0.5 * (1 - Math.cos(frac * Math.PI));
        b.paw = effPeep + (isBvm ? 6 * Math.sin(frac * Math.PI) : (o2Info.support || 0) * 0.5 * Math.sin(frac * Math.PI));
      } else {
        b.phase = 'EXP';
        b.flowLs = -b.volumeL / Math.max(0.28, tau);
        b.volumeL = Math.max(0, b.volumeL + b.flowLs * dt);
        b.paw = effPeep;
      }
    }

    _recordLoopPoint() {
      const b = this.breath;
      if (b.currentLoop.length < 360) {
        b.currentLoop.push({
          paw: b.paw,
          flowLmin: b.flowLs * 60,
          volMl: b.volumeL * 1000
        });
      }
    }

    _stepCardioAndGases(dt) {
      const p = this.patient;
      const c = this.cardiac;
      const b = this.breath;
      const vit = this.vitals;
      const iv = this.interventions;

      // 1. Troca Gasosa (PaCO2, EtCO2, PaO2, SpO2)
      const rr = Math.max(0, b.lastRrTotal);
      const vteMl = b.lastVteMl;
      const deadSpace = 150;
      const vaLmin = rr > 0 ? Math.max(0.15, ((vteMl - deadSpace) / 1000) * rr) : 0.05;

      if (p.arrested && !iv.roscAchieved) {
        // PCR: sem perfusão pulmonar -> EtCO2 muito baixo; com RCP sobe para ~19 mmHg
        const targetEtco2 = iv.cprActive ? 20 : 7;
        vit.etco2 = lerp(vit.etco2, targetEtco2, dt * 0.45);
        vit.paco2 = lerp(vit.paco2, 58, dt * 0.05);
        const targetSpo2 = iv.cprActive ? 74 : 52;
        vit.spo2 = lerp(vit.spo2, targetSpo2, dt * 0.25);
        vit.pao2 = lerp(vit.pao2, iv.cprActive ? 42 : 28, dt * 0.25);
      } else {
        const targetPaco2 = clamp((0.863 * p.vco2) / vaLmin, 16, 105);
        vit.paco2 = lerp(vit.paco2, targetPaco2, dt * 0.14);

        // Gradiente PaCO2 - EtCO2 aumenta com shunt / baixo débito
        const co2Grad = 3 + p.shunt * 12 + (1 - c.preload) * 4;
        const targetEtco2 = clamp(vit.paco2 - co2Grad, 10, 95);
        vit.etco2 = lerp(vit.etco2, targetEtco2, dt * 0.25);

        const o2Info = this.getEffectiveO2Info();
        const totalPeep = o2Info.peep + b.lastAutoPeep;
        const targetPao2 = this._computeTargetPaO2(vit.paco2, totalPeep, o2Info.fio2);
        vit.pao2 = lerp(vit.pao2, targetPao2, dt * 0.22);

        const targetSpo2 = this._dissociationSpO2(vit.pao2);
        vit.spo2 = lerp(vit.spo2, targetSpo2, dt * 0.3);
      }

      this._updateAcidBase();
      vit.rrMonitor = Math.round(rr);

      // 2. Hemodinâmica Acoplada (Interação Coração-Pulmão + Fármacos)
      if (p.arrested && !iv.roscAchieved) {
        vit.rhythm = c.rhythm;
        vit.hr = c.rhythm === 'pea' ? c.baseHr || 42 : 0;
        if (iv.cprActive) {
          iv.cprPhase += dt * (110 / 60); // 110 compressões/min
          vit.sbp = lerp(vit.sbp, 68, dt * 1.5);
          vit.dbp = lerp(vit.dbp, 22, dt * 1.5);
          vit.perfusionIndex = lerp(vit.perfusionIndex, 0.9, dt * 0.8);
        } else {
          vit.sbp = lerp(vit.sbp, 14, dt * 1.5);
          vit.dbp = lerp(vit.dbp, 10, dt * 1.5);
          vit.perfusionIndex = lerp(vit.perfusionIndex, 0.15, dt * 0.8);
        }
        vit.map = Math.round((vit.sbp + 2 * vit.dbp) / 3);
        return;
      }

      // Efeito da Pressão Média Intratorácica e Auto-PEEP no retorno venoso
      const excessPmean = Math.max(0, b.lastMeanPaw - 10) + b.lastAutoPeep * 0.9;
      const preloadPenalty = clamp(1 - excessPmean * (0.018 / Math.max(0.45, c.preload)), 0.45, 1.05);

      // Efeito de Volume + Noradrenalina + Drogas das Bombas de Infusão Contínua (com farmacocinética & interações)
      const pumpFx = this._getPumpPharmacology();
      const effectivePreload = (c.preload + iv.fluidBoost) * (pumpFx.preloadFactor || 1.0);
      const noraFactor = 1 + iv.noraDose * 0.95 * (pumpFx.catecholamineScale || 1.0);
      const acidContractility = vit.ph < 7.22 ? clamp(1 - (7.22 - vit.ph) * 1.15, 0.54, 1.0) : 1.0;

      // Acidose lática dinâmica por hipoperfusão, hipoxemia ou sobrecarga adrenérgica/cianeto
      const hypoperfusion = Math.max(0, 60 - vit.map);
      const hypoxemia = Math.max(0, 86 - vit.spo2);
      const lacProd = hypoperfusion * 0.0026 + hypoxemia * 0.0022 + (pumpFx.lactateRate || 0);
      if (lacProd > 0.004) {
        const dLac = lacProd * dt;
        p.lactate = clamp(p.lactate + dLac, 0.5, 18.0);
        p.baseExcess = clamp(p.baseExcess - dLac * 0.82, -22, 14);
      } else if (vit.map >= 68 && vit.spo2 >= 92 && p.lactate > Math.max(1.0, this._baseLactate || 1.1)) {
        const targetLac = Math.max(1.0, this._baseLactate || 1.1);
        const prevLac = p.lactate;
        p.lactate = lerp(p.lactate, targetLac, dt * 0.014);
        const cleared = Math.max(0, prevLac - p.lactate);
        if (p.baseExcess < (this._baseBE || 0)) {
          p.baseExcess = Math.min(this._baseBE || 0, p.baseExcess + cleared * 0.75);
        }
      }

      // Efeito da hipoxemia / acidemia na FC + bradicardia terminal pré-PCR
      const det = this.deterioration || { risk: 0, primaryCause: null };
      const hypoxiaDrive = Math.max(0, 92 - vit.spo2) * 1.1;
      const acidosisDrive = Math.max(0, 7.30 - vit.ph) * 95;
      const terminalBradyPenalty =
        det.risk > 60 && (det.primaryCause === 'Hipóxia grave' || det.primaryCause === 'Acidose grave')
          ? (det.risk - 60) * 1.15
          : 0;

      const pacerOn = Boolean(this.externalPacer && this.externalPacer.active);
      const paceableRhythm =
        c.rhythm === 'sinus_brady' ||
        c.rhythm === 'av_block_1' ||
        c.rhythm === 'av_block_2_m1' ||
        c.rhythm === 'av_block_2_m2' ||
        c.rhythm === 'av_block_3';

      let targetHr =
        c.baseHr +
        hypoxiaDrive +
        acidosisDrive * 0.5 +
        excessPmean * 1.1 -
        iv.fluidBoost * 18 +
        pumpFx.hrDelta +
        (iv.bolusHrDelta || 0) -
        terminalBradyPenalty;

      if (pacerOn && paceableRhythm) {
        targetHr = this.externalPacer.rate || 70;
      } else if (c.rhythm === 'sinus_brady') {
        targetHr = clamp(targetHr, 28, 59);
      } else if (c.rhythm === 'av_block_3') {
        targetHr = clamp(c.baseHr + hypoxiaDrive * 0.15 - terminalBradyPenalty * 0.25, 24, 44);
      } else if (c.rhythm === 'av_block_2_m2') {
        targetHr = clamp(c.baseHr + hypoxiaDrive * 0.25 - terminalBradyPenalty * 0.3, 30, 62);
      } else if (c.rhythm === 'av_block_2_m1') {
        targetHr = clamp(c.baseHr + hypoxiaDrive * 0.3, 40, 78);
      } else if (c.rhythm === 'paced') {
        targetHr = c.baseHr || 70;
      } else if (c.rhythm === 'svt') {
        targetHr = clamp(c.baseHr + hypoxiaDrive * 0.2, 155, 200);
      } else if (c.rhythm === 'vtach') {
        targetHr = clamp(c.baseHr + hypoxiaDrive * 0.2, 150, 195);
      } else if (c.rhythm === 'aflutter') {
        targetHr = clamp(c.baseHr + hypoxiaDrive * 0.2, 75, 150);
      } else if (c.rhythm === 'afib_rvr') {
        targetHr = clamp(targetHr, 110, 172);
      } else {
        targetHr = clamp(targetHr, 32, 172);
      }

      // Acoplamento dinâmico de ectopias ventriculares (catecolaminas + estresse pré-PCR - antiarrítmico)
      const stressEctopy = det.risk > 38 ? (det.risk - 38) * 0.0032 : 0;
      c.ectopyProb = clamp(
        (this._baseEctopyProb || 0) + (pumpFx.ectopyDelta || 0) + stressEctopy - (pumpFx.ectopyReduction || 0) * 0.15,
        0,
        0.45
      );

      // Queda pré-parada de contratilidade quando deterioração > 70%
      const preArrestDecomp = det.risk > 70 ? clamp(1 - (det.risk - 70) * 0.011, 0.65, 1.0) : 1.0;

      const pressureScale = clamp(
        effectivePreload *
          preloadPenalty *
          (c.svr * noraFactor * pumpFx.svrFactor + (iv.bolusSvrDelta || 0)) *
          (c.contractility * pumpFx.contractilityFactor * acidContractility * preArrestDecomp),
        0.24,
        1.90
      );
      // Como baseSbp já reflete baseline do cenário, aplicamos delta relativo ao baseline
      const baselineFactor = clamp(c.preload * c.svr * c.contractility, 0.25, 1.8);
      const relScale = pressureScale / baselineFactor;

      const pacerBoost = pacerOn && c.rhythm === 'av_block_3' ? 1.18 : 1.0;
      const targetSbp = clamp(c.baseSbp * relScale * pacerBoost, 34, 225);
      const targetDbp = clamp(c.baseDbp * relScale * (1 + iv.noraDose * 0.12 * (pumpFx.catecholamineScale || 1)) * (pacerOn && c.rhythm === 'av_block_3' ? 1.12 : 1.0), 18, 132);

      vit.hr = lerp(vit.hr, targetHr, dt * 0.45);
      vit.sbp = lerp(vit.sbp, targetSbp, dt * 0.45);
      vit.dbp = lerp(vit.dbp, targetDbp, dt * 0.45);
      vit.map = Math.round((vit.sbp + 2 * vit.dbp) / 3);
      vit.rhythm = c.rhythm;

      // Índice de Perfusão depende da PAM e vasoconstrição
      const piTarget = clamp((vit.map / 85) * 3.2 - iv.noraDose * 1.1 - ((this.drugCe && this.drugCe.vasopressina) || 0) * 14, 0.25, 6.5);
      vit.perfusionIndex = lerp(vit.perfusionIndex, piTarget, dt * 0.4);
      const stDrugShift = c.rhythm === 'stemi' || c.rhythm === 'de_winter' ? (pumpFx.stPenalty || 0) : -(pumpFx.stPenalty || 0) * 0.35;
      vit.stDeviation = c.stDeviation - Math.max(0, 90 - vit.spo2) * 0.04 + stDrugShift;
    }

    /**
     * Motor de Deterioração Clínica & Progressão para Parada Cardíaca (5Hs & 5Ts + Interações)
     * Pacientes NÃO inicialmente em PCR podem evoluir progressivamente para AESP, FV, Assistolia ou Torsades
     * se mantidos sob hipóxia grave, acidose, choque extremo, hipercalemia, isquemia ou toxicidade medicamentosa.
     */
    _stepDeteriorationAndArrest(dt) {
      const p = this.patient;
      const c = this.cardiac;
      const vit = this.vitals;
      const b = this.breath;
      const iv = this.interventions;
      const det = this.deterioration;
      if (!det) return;

      // Caso já esteja em PCR: acumula lactato + permite RCE em AESP/Assistolia se RCP + causa revertida!
      if (p.arrested && !iv.roscAchieved) {
        det.risk = 100;
        det.stage = 'arrested';
        p.lactate = clamp(p.lactate + dt * 0.032, 0.5, 18.0);
        p.baseExcess = clamp(p.baseExcess - dt * 0.025, -22, 14);

        if ((c.rhythm === 'pea' || c.rhythm === 'asystole') && iv.cprActive) {
          const o2Info = this.getEffectiveO2Info();
          const airwayOk = (this.airway && this.airway.connectedToVent && o2Info.fio2 >= 50) || o2Info.fio2 >= 80;
          const noTensionPneumo = !p.pneumothoraxActive;
          const drugSupport = (iv.adrenalineBolusTimer || 0) > 0 || iv.noraDose >= 0.1 || iv.fluidBoluses > 0 || (iv.calciumProtectionTimer || 0) > 0 || vit.ph >= 7.12;
          if (airwayOk && noTensionPneumo && drugSupport) {
            det.cprRecoveryProgress = Math.min(100, (det.cprRecoveryProgress || 0) + dt * 5.2);
            if (det.cprRecoveryProgress >= 100) {
              iv.roscAchieved = true;
              iv.cprActive = false;
              p.arrested = false;
              det.risk = 28;
              det.stage = 'stable';
              det._warnLogged = false;
              det._imminentLogged = false;
              c.rhythm = 'sinus_tach';
              c.baseHr = 112;
              c.baseSbp = Math.max(92, c.baseSbp);
              c.baseDbp = Math.max(58, c.baseDbp);
              c.preload = Math.max(0.86, c.preload);
              c.svr = Math.max(0.88, c.svr);
              c.contractility = Math.max(0.82, c.contractility);
              if (p.intrinsicDrive <= 0) p.intrinsicDrive = 8;
              vit.rhythm = 'sinus_tach';
              vit.hr = 112;
              vit.sbp = c.baseSbp;
              vit.dbp = c.baseDbp;
              vit.map = Math.round((vit.sbp + 2 * vit.dbp) / 3);
              if (this.onLog) {
                this.onLog('✅ RCE ALCANÇADO EM AESP/ASSISTOLIA! RCP eficaz + Adrenalina + reversão das causas 5H/5T restauraram pulso!');
              }
            }
          }
        }
        return;
      }

      // Avaliação das causas reversíveis (5Hs & 5Ts + Arritmias + Toxicidades)
      const pumpFx = this._getPumpPharmacology();
      const ce = this.drugCe || {};
      const causes = [];
      let totalRate = 0;
      let maxWeight = 0;
      let primaryCause = null;
      let targetRhythm = 'pea';

      const addCause = (label, rate, rhythmHint) => {
        if (rate <= 0) return;
        causes.push(label);
        totalRate += rate;
        if (rate > maxWeight) {
          maxWeight = rate;
          primaryCause = label;
          targetRhythm = rhythmHint;
        }
      };

      // 1. HIPÓXIA SUSTENTADA (H)
      const apneicNoVent = (!this.airway || !this.airway.connectedToVent) && b.lastRrTotal <= 0;
      if (vit.spo2 < 88 || apneicNoVent) {
        let r = 0;
        if (vit.spo2 < 68) r = 4.2;
        else if (vit.spo2 < 76) r = 2.6;
        else if (vit.spo2 < 85) r = 1.25;
        else r = 0.65; // hipoxemia sustentada 85-87%
        if (apneicNoVent) r += 1.4;
        const hypRhythm = (c.rhythm === 'stemi' || c.rhythm === 'de_winter') ? 'vf' : (vit.hr < 42 ? 'asystole' : 'pea');
        addCause(`Hipóxia sustentada (SpO₂ ${Math.round(vit.spo2)}%)`, r, hypRhythm);
      }

      // 2. ACIDOSE SUSTENTADA (H - Acidose respiratória ou metabólica/lática)
      if (vit.ph < 7.22) {
        let r = 0;
        if (vit.ph < 7.00) r = 3.8;
        else if (vit.ph < 7.10) r = 2.2;
        else if (vit.ph < 7.18) r = 1.15;
        else r = 0.65;
        const acidRhythm = (c.rhythm === 'stemi' || c.rhythm === 'de_winter' || pumpFx.proArrhythmiaStress > 0.6) ? 'vf' : 'pea';
        addCause(`Acidose sustentada (pH ${vit.ph.toFixed(2)})`, r, acidRhythm);
      }

      // 3. CHOQUE / HIPOPERFUSÃO / OBSTRUTIVO (Hipovolemia, Séptico, Cardiogênico, Tamponamento, TEP, Pneumotórax)
      const effPreloadNow = c.preload + (iv.fluidBoost || 0);
      if (vit.map < 52) {
        let r = vit.map < 38 ? 4.3 : vit.map < 45 ? 2.6 : 1.35;
        if (p.pneumothoraxActive) r += 1.5;
        addCause(p.pneumothoraxActive ? 'Pneumotórax hipertensivo + Choque' : `Choque refratário (PAM ${vit.map} mmHg)`, r, 'pea');
      } else if (vit.map < 64 && (effPreloadNow <= 0.62 || p.lactate >= 4.0 || p.shunt >= 0.24)) {
        // Choque obstrutivo/distributivo sustentado (Tamponamento cardíaco, TEP maciço, choque inicial não tratado)
        const label = effPreloadNow <= 0.62
          ? `Choque obstrutivo / restrição de enchimento (PAM ${vit.map} mmHg)`
          : p.shunt >= 0.24
          ? `Sobrecarga de VD / TEP maciço (PAM ${vit.map} mmHg)`
          : `Hipoperfusão sustentada (PAM ${vit.map} mmHg • Lac ${p.lactate.toFixed(1)})`;
        addCause(label, effPreloadNow <= 0.62 ? 2.4 : 1.9, 'pea');
      } else if (p.pneumothoraxActive && b.lastMeanPaw > 14) {
        addCause('Pneumotórax hipertensivo sob pressão positiva', 1.8, 'pea');
      }

      // 4. CONGESTÃO PULMONAR GRAVE / EAP DESCOMPENSADO
      if (p.shunt >= 0.26 && p.compliance <= 36 && vit.spo2 <= 91) {
        addCause(`Congestão alveolar grave / EAP (SpO₂ ${Math.round(vit.spo2)}%)`, 1.85, 'pea');
      }

      // 5. BRONCOESPASMO GRAVE / FADIGA RESPIRATÓRIA (Asma grave / DPOC exacerbado sem broncodilatação)
      if (p.resistance >= 18) {
        const resRate = clamp(1.15 + (p.resistance - 18) * 0.06, 1.15, 2.0);
        addCause(`Broncoespasmo grave / fadiga respiratória (Raw ${Math.round(p.resistance)})`, resRate, 'pea');
      }

      // 6. EMERGÊNCIA HIPERTENSIVA EXTREMA (Sobrecarga aguda de VE / lesão de órgão-alvo sem vasodilatador)
      const hasVasodilator = (ce.nitroprussiato || 0) >= 0.25 || (iv.nitroBolusTimer || 0) > 0;
      if (vit.sbp >= 195 || vit.map >= 140 || (!hasVasodilator && c.svr >= 1.45 && c.baseSbp >= 200 && det.risk >= 60)) {
        const htRate = vit.sbp >= 210 || vit.map >= 150 ? 1.95 : 1.75;
        addCause(`Emergência hipertensiva sustentada (PA ${Math.round(vit.sbp)}/${Math.round(vit.dbp)})`, htRate, 'vf');
      }

      // 7. HIPERCALEMIA NÃO ESTABILIZADA (H)
      if (c.rhythm === 'hyperkalemia' && (iv.calciumProtectionTimer || 0) <= 0) {
        addCause('Hipercalemia grave sem Gluconato de Cálcio', 2.4, 'pea');
      }

      // 8. ISQUEMIA AGUDA INSTÁVEL / TV NÃO TRATADA / TAQUIARRITMIA EXTREMA / WPW / TEMPESTADE ADRENÉRGICA (T)
      if (c.rhythm === 'vtach') {
        addCause('TV monomórfica sustentada não revertida', 3.4, 'vf');
      } else if ((c.rhythm === 'stemi' || c.rhythm === 'de_winter') && (vit.spo2 < 88 || vit.map < 60 || pumpFx.proArrhythmiaStress > 0.35 || (!iv.thrombolysisGiven && c.stDeviation >= 3.5 && c.contractility <= 0.72))) {
        const stemiRate = (vit.spo2 < 88 || vit.map < 60) ? (2.2 + pumpFx.proArrhythmiaStress) : 2.15;
        addCause('IAMCSST extenso com instabilidade elétrica/isquêmica', stemiRate, 'vf');
      } else if ((c.rhythm === 'svt' || c.rhythm === 'afib_rvr' || c.rhythm === 'wpw') && (vit.hr >= 140 && (vit.map < 78 || vit.hr >= 175))) {
        const tachRate = vit.hr >= 175 ? 2.0 : c.rhythm === 'wpw' ? 1.85 : 1.45;
        addCause(c.rhythm === 'wpw' ? `WPW pré-excitada instável (FC ${Math.round(vit.hr)} bpm)` : `Taquiarritmia instável sustentada (FC ${Math.round(vit.hr)} bpm)`, tachRate, 'vf');
      } else if (pumpFx.proArrhythmiaStress > 0.85) {
        addCause('Toxicidade / sobrecarga catecolaminérgica', pumpFx.proArrhythmiaStress * 1.4, 'vf');
      }

      // 9. HIPOTERMIA MODERADA / GRAVE (H) OU TEMPESTADE TIREOTÓXICA / HIPERTERMIA EXTREMA
      if (p.temp < 33.0) {
        const hypoTRate = p.temp < 30.0 ? clamp(2.4 + (30.0 - p.temp) * 0.55, 2.4, 4.0) : clamp(1.5 + (33.0 - p.temp) * 0.35, 1.5, 2.4);
        addCause(`Hipotermia sustentada (${p.temp.toFixed(1)}°C)`, hypoTRate, 'vf');
      } else if (p.temp >= 39.8 && vit.hr >= 145) {
        const stormRate = clamp(1.9 + (p.temp - 39.8) * 1.1, 1.9, 3.2);
        addCause(`Tempestade tireotóxica / hipertermia (${p.temp.toFixed(1)}°C • FC ${Math.round(vit.hr)})`, stormRate, 'vf');
      }

      // 10. BRADICARDIA EXTREMA / BAV TOTAL (3º GRAU) DESCOMPENSADO
      const pacerOn = Boolean(this.externalPacer && this.externalPacer.active);
      if (!pacerOn && ((c.rhythm === 'av_block_3') || (vit.hr > 0 && vit.hr < 42 && vit.map < 62))) {
        const bRate = c.rhythm === 'av_block_3' ? 2.6 : 1.9;
        addCause(c.rhythm === 'av_block_3' ? `BAV Total sem marcapasso (${Math.round(vit.hr)} bpm)` : `Bradiarritmia instável (${Math.round(vit.hr)} bpm)`, bRate, 'asystole');
      }

      // 11. RISCO DE TORSADES DE POINTES (QT longo: Amiodarona + bradicardia + acidose/hipóxia sem MgSO4)
      if (
        (iv.magnesiumProtectionTimer || 0) <= 0 &&
        vit.hr > 0 && vit.hr < 52 &&
        ((ce.amiodarona || 0) > 0.4 || (iv.amiodaroneBolusTimer || 0) > 0) &&
        (vit.ph < 7.25 || vit.spo2 < 88)
      ) {
        addCause('Prolongamento de QT (Amiodarona + bradicardia/acidose)', 2.4, 'torsades');
      }

      // Prioridade eletrofisiológica do ritmo final de PCR quando há arritmia maligna, hipotermia ou bloqueio total
      if (c.rhythm === 'vtach' || c.rhythm === 'wpw' || p.temp < 33.0 || (p.temp >= 39.8 && vit.hr >= 145)) targetRhythm = 'vf';
      else if ((c.rhythm === 'av_block_3' || (c.rhythm === 'av_block_2_m2' && vit.hr < 42)) && !pacerOn) targetRhythm = 'asystole';

      det.causes = causes;
      det.primaryCause = primaryCause ? primaryCause.split(' (')[0] : null;
      det.targetRhythm = targetRhythm;

      if (totalRate > 0) {
        // Calibrado para raciocínio clínico confortável (~65-75s em apneia/catástrofe; ~2-4 min em causa isolada)
        det.risk = clamp(det.risk + Math.min(1.65, totalRate * 0.34) * dt, 0, 100);
      } else {
        // Recuperação fisiológica gradual quando o clínico corrige as causas
        det.risk = clamp(det.risk - 4.8 * dt, 0, 100);
      }

      if (det.risk >= 100) {
        const rhythmNames = { vf: 'FIBRILAÇÃO VENTRICULAR (FV)', pea: 'AESP', asystole: 'ASSISTOLIA', torsades: 'TORSADES DE POINTES' };
        det.stage = 'arrested';
        det.cprRecoveryProgress = 0;
        det.lastArrestReason = causes.join(' + ') || 'Deterioração hemodinâmica/metabólica refratária';
        this.setRhythm(targetRhythm, true);
        if (this.onLog) {
          this.onLog(`🚨 PARADA CARDÍACA (${rhythmNames[targetRhythm] || 'PCR'}) PRECIPITADA POR: ${det.lastArrestReason}! Iniciar RCP e tratar causa reversível!`);
        }
        return;
      }

      if (det.risk >= 70) {
        det.stage = 'imminent';
        if (!det._imminentLogged) {
          det._imminentLogged = true;
          if (this.onLog) {
            this.onLog(`🚨 PCR IMINENTE (${Math.round(det.risk)}%): ${causes.join(' + ')} — intervenha imediatamente!`);
          }
        }
      } else if (det.risk >= 40) {
        det.stage = 'warning';
        if (!det._warnLogged) {
          det._warnLogged = true;
          if (this.onLog) {
            this.onLog(`⚠ Deterioração clínica progressiva (${Math.round(det.risk)}%): ${causes.join(' + ')} — risco de evolução para PCR.`);
          }
        }
      } else {
        det.stage = 'stable';
        if (det.risk < 22) {
          det._warnLogged = false;
          det._imminentLogged = false;
        }
      }
    }

    _evaluateAlarms() {
      const a = this.alarms;
      const v = this.vitals;
      const b = this.breath;
      const list = [];

      if (this.patient.arrested && !this.interventions.roscAchieved) {
        const arrestMsgs = {
          vf: 'PCR • FIBRILAÇÃO VENTRICULAR — SEM PULSO!',
          torsades: 'PCR • TORSADES DE POINTES — CHOQUE + MAGNÉSIO!',
          pea: 'PCR • ATIVIDADE ELÉTRICA SEM PULSO (AESP) — INICIAR RCP + TRATAR 5H/5T!',
          asystole: 'PCR • ASSISTOLIA — CHECAR CABOS + INICIAR RCP + ADRENALINA!'
        };
        const causeSuffix = this.deterioration && this.deterioration.lastArrestReason ? ` [${this.deterioration.lastArrestReason}]` : '';
        list.push({ level: 'critical', msg: (arrestMsgs[v.rhythm] || arrestMsgs.vf) + causeSuffix });
      } else if (this.deterioration && this.deterioration.risk >= 40) {
        const pct = Math.round(this.deterioration.risk);
        const causesTxt = (this.deterioration.causes || []).slice(0, 2).join(' + ');
        list.push({
          level: this.deterioration.risk >= 70 ? 'critical' : 'warning',
          msg: this.deterioration.risk >= 70
            ? `🚨 PCR IMINENTE (${pct}%): ${causesTxt} — INTERVIR JÁ!`
            : `⚠ DETERIORAÇÃO (${pct}%): ${causesTxt} — RISCO DE PCR`
        });
      }

      if (Array.isArray(this.drugInteractions) && this.drugInteractions.length > 0) {
        this.drugInteractions.forEach((ix) => {
          list.push({ level: ix.level || 'warning', msg: ix.msg });
        });
      }
      if (v.rhythm === 'av_block_3') {
        list.push({ level: 'critical', msg: 'BAV TOTAL (3º GRAU) — DISSOCIAÇÃO AV / MARCAPASSO!' });
      } else if (v.rhythm === 'av_block_2_m2') {
        list.push({ level: 'warning', msg: 'BAV 2º GRAU MOBITZ II — RISCO DE BAVT' });
      } else if (v.rhythm === 'vtach') {
        list.push({ level: 'critical', msg: 'TAQUICARDIA VENTRICULAR MONOMÓRFICA — CHECAR PULSO!' });
      } else if (v.rhythm === 'stemi') {
        list.push({ level: 'critical', msg: `SUPRADESNIVELAMENTO ST (+${v.stDeviation.toFixed(1)} mm) — IAMCSST` });
      } else if (v.rhythm === 'de_winter') {
        list.push({ level: 'critical', msg: 'PADRÃO DE DE WINTER — EQUIVALENTE IAMCSST (DA PROXIMAL)!' });
      } else if (v.rhythm === 'wpw') {
        list.push({ level: 'warning', msg: 'SÍNDROME DE WPW — PR CURTO + ONDA DELTA' });
      } else if (v.rhythm === 'hyperkalemia') {
        list.push({ level: 'warning', msg: 'ONDA T APICULADA / QRS LARGO — SUSPEITA HIPERCALEMIA' });
      }
      if (!this.airway || !this.airway.connectedToVent) {
        if (b.lastRrTotal <= 0 && !(this.patient.arrested && !this.interventions.roscAchieved)) {
          list.push({
            level: 'critical',
            msg: 'APNEIA SEM VENTILADOR MECÂNICO — VENTILAR C/ BVM OU INTUBAR/ACOPLAR À VM!'
          });
        }
      } else if (this.vent.standby) {
        list.push({
          level: 'critical',
          msg: 'VENTILADOR EM STANDBY COM PACIENTE INTUBADO — INICIAR VENTILAÇÃO!'
        });
      } else if (this.vent.mode === 'PSV' && this.patient.intrinsicDrive <= 0) {
        list.push({
          level: 'critical',
          msg: this.vent.backupActive
            ? 'APNEIA DETECTADA (PSV) — VENTILAÇÃO DE BACKUP ATIVA'
            : `ALARME DE APNEIA (${Math.ceil(12 - b.apneaTimer)}s para backup)`
        });
      }
      if (v.spo2 < a.spo2Low) {
        list.push({
          level: v.spo2 < 82 ? 'critical' : 'warning',
          msg: `SpO₂ BAIXA (${Math.round(v.spo2)}%)`
        });
      }
      if (v.map < a.mapLow && !(this.patient.arrested && !this.interventions.roscAchieved)) {
        list.push({
          level: v.map < 55 ? 'critical' : 'warning',
          msg: `HIPOTENSÃO PAM ${v.map} mmHg`
        });
      }
      if (v.hr > 0 && (v.hr < a.hrLow || v.hr > a.hrHigh)) {
        list.push({
          level: v.hr < 40 || v.hr > 150 ? 'critical' : 'warning',
          msg: v.hr < a.hrLow ? `BRADICARDIA (${Math.round(v.hr)} bpm)` : `TAQUICARDIA (${Math.round(v.hr)} bpm)`
        });
      }
      if (this.airway && this.airway.connectedToVent) {
        if (b.lastPeakPaw > a.ppeakHigh) {
          list.push({
            level: b.lastPeakPaw > 42 ? 'critical' : 'warning',
            msg: `Ppico ALTA (${Math.round(b.lastPeakPaw)} cmH₂O)`
          });
        }
        const dp = b.lastPlatPaw - (this.vent.peepSet + b.lastAutoPeep);
        if (dp > a.dpHigh) {
          list.push({
            level: dp > 20 ? 'critical' : 'warning',
            msg: `DRIVING PRESSURE ALTA (${Math.round(dp)} cmH₂O)`
          });
        }
      }
      if (b.lastAutoPeep > 2.5) {
        list.push({
          level: 'warning',
          msg: `AUTO-PEEP DETECTADA (+${b.lastAutoPeep.toFixed(1)} cmH₂O)`
        });
      }
      if (v.etco2 > a.etco2High) {
        list.push({ level: 'warning', msg: `HIPERCAPNIA EtCO₂ ${Math.round(v.etco2)} mmHg` });
      } else if (v.etco2 < a.etco2Low && !(this.patient.arrested && !this.interventions.roscAchieved)) {
        list.push({ level: 'warning', msg: `EtCO₂ BAIXO (${Math.round(v.etco2)} mmHg)` });
      }

      if (this.pumps && this.pumps.some((ch) => ch.occluded && !ch.alarmSilenced)) {
        const occCh = this.pumps.find((ch) => ch.occluded && !ch.alarmSilenced);
        const occDrug = IV_DRUG_MAP[occCh.drugId];
        list.push({ level: 'critical', msg: `BOMBA EV CANAL ${occCh.channel} (${occDrug ? occDrug.name : ''}): OCLUSÃO NA LINHA!` });
      }

      this.activeAlarms = list;
    }

    setRhythm(rhythmId, silent = false) {
      const meta = ECG_RHYTHM_MAP[rhythmId];
      if (!meta) return;

      const wasArrested = this.patient.arrested && !this.interventions.roscAchieved;
      this.cardiac.rhythm = rhythmId;

      if (meta.pulseless) {
        this.patient.arrested = true;
        this.interventions.roscAchieved = false;
        this.cardiac.baseHr = meta.defaultHr;
        this.cardiac.stDeviation = meta.stDefault || 0.0;
        this.vitals.rhythm = rhythmId;
        this.vitals.hr = meta.defaultHr;
      } else {
        if (wasArrested || this.patient.arrested) {
          this.patient.arrested = false;
          this.interventions.cprActive = false;
          this.interventions.roscAchieved = false;
          if (this.deterioration) {
            this.deterioration.risk = 0;
            this.deterioration.stage = 'stable';
            this.deterioration.lastArrestReason = null;
            this.deterioration._warnLogged = false;
            this.deterioration._imminentLogged = false;
          }
          if (this.patient.intrinsicDrive <= 0) this.patient.intrinsicDrive = 14;
          if (this.cardiac.baseSbp < 75) {
            this.cardiac.baseSbp = 118;
            this.cardiac.baseDbp = 74;
            this.cardiac.preload = 0.96;
            this.cardiac.svr = 1.0;
            this.cardiac.contractility = 0.95;
          }
        } else if (this.cardiac.baseSbp < 75) {
          this.cardiac.baseSbp = 114;
          this.cardiac.baseDbp = 70;
        }

        this.cardiac.baseHr = meta.defaultHr;
        this.cardiac.stDeviation = meta.stDefault || 0.0;

        if (rhythmId === 'vtach') {
          this.cardiac.baseSbp = 84;
          this.cardiac.baseDbp = 52;
        } else if (rhythmId === 'av_block_3') {
          this.cardiac.baseSbp = 88;
          this.cardiac.baseDbp = 48;
        } else if (rhythmId === 'afib_rvr' || rhythmId === 'svt') {
          this.cardiac.baseSbp = 96;
          this.cardiac.baseDbp = 64;
        } else if (this.scenario && this.scenario.cardiac && this.scenario.cardiac.baseSbp >= 75) {
          this.cardiac.baseSbp = this.scenario.cardiac.baseSbp;
          this.cardiac.baseDbp = this.scenario.cardiac.baseDbp;
        }

        this.vitals.rhythm = rhythmId;
        this.vitals.hr = meta.defaultHr;
        this.vitals.stDeviation = this.cardiac.stDeviation;
      }

      this._evaluateAlarms();
      if (!silent && this.onLog) {
        this.onLog(`Ritmo ECG alterado para: ${meta.name}`);
      }
    }

    // ================= INTERVENÇÕES CLÍNICAS =================
    giveFluidBolus() {
      this.interventions.fluidBoluses += 1;
      this.interventions.fluidBoost = Math.min(0.42, this.interventions.fluidBoost + 0.14);
      if (this.onLog) this.onLog(`Infusão: Bolus SF 0,9% 500 mL (#${this.interventions.fluidBoluses})`);
    }

    setExternalPacer(active, rateBpm = 70) {
      const next = Boolean(active);
      const rate = clamp(Math.round(Number(rateBpm) || 70), 40, 140);
      const prev = this.externalPacer || { active: false, rate: 70 };
      const changed = prev.active !== next || prev.rate !== rate;
      this.externalPacer = { active: next, rate };
      if (changed && this.onLog) {
        this.onLog(next ? `Marcapasso Transcutâneo (PULSAR) ativado a ${rate} bpm` : 'Marcapasso Transcutâneo (PULSAR) desativado');
      }
    }

    adjustNora(delta) {
      this.interventions.noraDose = clamp(Number((this.interventions.noraDose + delta).toFixed(2)), 0, 2.0);
      if (this.pumps) {
        const noraCh = this.pumps.find((ch) => ch.drugId === 'noradrenalina');
        if (noraCh) {
          noraCh.rate = this.interventions.noraDose;
          if (!noraCh.occluded) noraCh.running = this.interventions.noraDose > 0;
        }
      }
      if (this.onLog) this.onLog(`Noradrenalina ajustada para ${this.interventions.noraDose.toFixed(2)} µg/kg/min`);
    }

    giveBronchodilator() {
      const target = Math.max(7, Math.round(this.patient.resistance * 0.45));
      this.interventions.bronchodilatorTargetRes = target;
      if (this.onLog) this.onLog(`Broncodilatador administrado: Rva reduzindo progressivamente → ~${target} cmH₂O/L/s`);
    }

    suctionAndRecruit() {
      this.patient.shunt = Math.max(0.04, Number((this.patient.shunt * 0.84).toFixed(2)));
      this.patient.resistance = Math.max(5, Math.round(this.patient.resistance * 0.85));
      this.patient.compliance = Math.min(70, Math.round(this.patient.compliance * 1.12));
      if (this.onLog) this.onLog('Aspiração de TOT + Manobra de Recrutamento Alveolar realizada');
    }

    decompressChest() {
      if (!this.patient.pneumothoraxActive) {
        if (this.onLog) this.onLog('Toracocentese: sem sinais de pneumotórax hipertensivo ativo neste momento.');
        return;
      }
      this.patient.pneumothoraxActive = false;
      this.patient.compliance = 52;
      this.patient.resistance = 8;
      this.patient.shunt = 0.10;
      this.cardiac.preload = 0.96;
      this.cardiac.baseHr = 96;
      this.cardiac.baseSbp = 114;
      this.cardiac.baseDbp = 70;
      this.cardiac.stDeviation = 0.0;
      if (this.onLog) this.onLog('SUCESSO: Descompressão torácica + Drenagem aliviou choque obstrutivo!');
    }

    performPericardiocentesis() {
      const isTamponade = this.scenarioId === 'cardiac_tamponade' || (this.cardiac.preload <= 0.58 && !this.patient.pneumothoraxActive && !this.interventions.pericardiocentesisDone);
      if (!isTamponade) {
        if (this.onLog) this.onLog('Pericardiocentese: sem evidência de tamponamento cardíaco ativo no momento.');
        return false;
      }
      this.interventions.pericardiocentesisDone = true;
      this.cardiac.preload = Math.max(0.96, this.cardiac.preload);
      this.cardiac.baseSbp = Math.max(114, this.cardiac.baseSbp);
      this.cardiac.baseDbp = Math.max(72, this.cardiac.baseDbp);
      this.cardiac.baseHr = Math.min(94, this.cardiac.baseHr);
      this.cardiac.contractility = Math.max(0.94, this.cardiac.contractility);
      if (this.deterioration) this.deterioration.risk = Math.max(0, this.deterioration.risk - 40);
      if (this.onLog) this.onLog('SUCESSO: Pericardiocentese guiada por USG drenou derrame pericárdico — enchimento ventricular e PAM restaurados!');
      return true;
    }

    giveThrombolysis() {
      if (this.scenarioId === 'hemorrhagic_shock' || this.scenarioId === 'postpartum_hemorrhage' || this.scenarioId === 'eclampsia_hellp') {
        // Armadilha clínica real: trombolítico em hemorragia ativa ou eclâmpsia/HELLP agrava sangramento!
        this.cardiac.preload = Math.max(0.38, Number((this.cardiac.preload - 0.16).toFixed(2)));
        this.patient.lactate = clamp(this.patient.lactate + 1.4, 0.5, 18);
        if (this.onLog) this.onLog('🚨 CONTRAINDICAÇÃO ABSOLUTA: Trombolítico em hemorragia ativa / HELLP provocou sangramento catastrófico!');
        return false;
      }
      const isPe = this.scenarioId === 'pulmonary_embolism';
      const isStemi = this.cardiac.rhythm === 'stemi' || this.cardiac.rhythm === 'de_winter';
      if (!isPe && !isStemi) {
        if (this.onLog) this.onLog('Trombólise/Anticoagulação plena: sem indicação primária de TEP maciço ou IAMCSST neste cenário.');
        return false;
      }
      this.interventions.thrombolysisGiven = true;
      if (isPe) {
        this.patient.shunt = Math.max(0.08, Number((this.patient.shunt * 0.42).toFixed(2)));
        this.cardiac.preload = Math.max(0.96, this.cardiac.preload);
        this.cardiac.contractility = Math.max(0.94, this.cardiac.contractility);
        this.cardiac.baseSbp = Math.max(112, this.cardiac.baseSbp);
        this.cardiac.baseDbp = Math.max(70, this.cardiac.baseDbp);
        this.cardiac.baseHr = Math.min(98, this.cardiac.baseHr);
        if (this.onLog) this.onLog('SUCESSO: Trombólise sistêmica (Alteplase) no TEP Maciço — recanalização pulmonar, queda da pós-carga de VD e melhora da PAM!');
      } else {
        this.cardiac.stDeviation = Math.max(0.4, Number((this.cardiac.stDeviation * 0.35).toFixed(1)));
        this.cardiac.contractility = Math.min(1.0, Number((this.cardiac.contractility + 0.16).toFixed(2)));
        if (this.cardiac.rhythm === 'stemi' || this.cardiac.rhythm === 'de_winter') {
          this.cardiac.rhythm = 'sinus';
          this.vitals.rhythm = 'sinus';
        }
        if (this.onLog) this.onLog('SUCESSO: Reperfusão coronariana (Trombólise/Heparina) — regressão do supra ST e estabilização miocárdica!');
      }
      if (this.deterioration) this.deterioration.risk = Math.max(0, this.deterioration.risk - 35);
      return true;
    }

    togglePronePosition() {
      const iv = this.interventions;
      iv.proneActive = !iv.proneActive;
      if (iv.proneActive) {
        this._pronePrevShunt = this.patient.shunt;
        this._pronePrevComp = this.patient.compliance;
        if (this.patient.shunt >= 0.18) {
          this.patient.shunt = Math.max(0.08, Number((this.patient.shunt * 0.66).toFixed(2)));
          this.patient.compliance = Math.min(62, Math.round(this.patient.compliance * 1.18));
          if (this.onLog) this.onLog('Posição Prona ATIVADA: recrutamento dorsal reduziu shunt pulmonar e elevou PaO₂/FiO₂!');
        } else {
          if (this.onLog) this.onLog('Posição Prona ativada (ganho limitado pois shunt basal já é baixo).');
        }
      } else {
        if (typeof this._pronePrevShunt === 'number') {
          this.patient.shunt = Number(((this.patient.shunt + this._pronePrevShunt) * 0.5).toFixed(2));
        }
        if (this.onLog) this.onLog('Paciente retornado à posição supina.');
      }
      return iv.proneActive;
    }

    toggleActiveWarming() {
      const iv = this.interventions;
      iv.warmingActive = !iv.warmingActive;
      if (iv.warmingActive) {
        iv.coolingActive = false;
        if (this.patient.temp >= 38.0) {
          if (this.onLog) this.onLog('⚠ Atenção: paciente já está febril/hipertérmico — reaquecimento ativo não indicado!');
        } else {
          if (this.onLog) this.onLog(`Reaquecimento Ativo LIGADO (Temp atual ${this.patient.temp.toFixed(1)}°C → aquecendo para 36.6°C).`);
        }
      } else {
        if (this.onLog) this.onLog('Reaquecimento Ativo desligado.');
      }
      return iv.warmingActive;
    }

    toggleActiveCooling() {
      const iv = this.interventions;
      iv.coolingActive = !iv.coolingActive;
      if (iv.coolingActive) {
        iv.warmingActive = false;
        if (this.patient.temp < 36.2) {
          if (this.onLog) this.onLog('⚠ Atenção: paciente normo/hipotérmico — resfriamento ativo pode induzir hipotermia e arritmia!');
        } else {
          if (this.onLog) this.onLog(`Resfriamento Ativo LIGADO (Temp ${this.patient.temp.toFixed(1)}°C → resfriando para 36.8°C e reduzindo hipermetabolismo).`);
        }
      } else {
        if (this.onLog) this.onLog('Resfriamento Ativo desligado.');
      }
      return iv.coolingActive;
    }

    toggleQuickPacer(rateBpm = 70) {
      const currentlyOn = Boolean(this.externalPacer && this.externalPacer.active);
      const next = !currentlyOn;
      this.setExternalPacer(next, rateBpm);
      if (next && !this.patient.arrested) {
        this.cardiac.baseSbp = Math.max(this.cardiac.baseSbp, 96);
        this.cardiac.baseDbp = Math.max(this.cardiac.baseDbp, 60);
        if (this.deterioration) this.deterioration.risk = Math.max(0, this.deterioration.risk - 30);
      }
      return next;
    }

    giveOsmotherapy() {
      const iv = this.interventions;
      if (this.scenarioId === 'tce_cushing') {
        iv.osmotherapyGiven = true;
        this.cardiac.svr = Math.max(1.08, Number((this.cardiac.svr * 0.78).toFixed(2)));
        this.cardiac.baseSbp = Math.max(138, Math.round(this.cardiac.baseSbp - 44));
        this.cardiac.baseDbp = Math.max(82, Math.round(this.cardiac.baseDbp - 22));
        this.cardiac.baseHr = Math.max(68, Math.round(this.cardiac.baseHr + 22));
        this.patient.intrinsicDrive = Math.max(13, Math.round(this.patient.intrinsicDrive + 6));
        if (this.cardiac.rhythm === 'sinus_brady') {
          this.cardiac.rhythm = 'sinus';
          this.vitals.rhythm = 'sinus';
        }
        if (this.deterioration) this.deterioration.risk = Math.max(0, this.deterioration.risk - 38);
        if (this.onLog) this.onLog('SUCESSO: Osmoterapia (Salina Hipertônica 3% / Manitol) reduziu a PIC — reversão da Tríade de Cushing e melhora do drive respiratório!');
        return true;
      }
      if ((this.cardiac.preload + (iv.fluidBoost || 0)) < 0.75) {
        this.cardiac.preload = Math.max(0.45, Number((this.cardiac.preload - 0.08).toFixed(2)));
        if (this.onLog) this.onLog('⚠ Osmoterapia em paciente hipovolêmico sem HIC: diurese osmótica piorou pré-carga!');
        return false;
      }
      iv.osmotherapyGiven = true;
      if (this.onLog) this.onLog('Osmoterapia (NaCl 3% / Manitol) infundida — efeito discreto fora de hipertensão intracraniana.');
      return true;
    }

    giveHydrocortisone() {
      const iv = this.interventions;
      iv.hydrocortisoneGiven = true;
      if (this.scenarioId === 'adrenal_crisis') {
        this.cardiac.svr = Math.min(1.05, Number((this.cardiac.svr + 0.30).toFixed(2)));
        this.cardiac.preload = Math.min(0.95, Number((this.cardiac.preload + 0.12).toFixed(2)));
        this.cardiac.baseSbp = Math.min(116, Math.round(this.cardiac.baseSbp + 24));
        this.cardiac.baseDbp = Math.min(72, Math.round(this.cardiac.baseDbp + 14));
        this.patient.baseExcess = Math.min(-2, Number((this.patient.baseExcess + 3.0).toFixed(1)));
        if (this.deterioration) this.deterioration.risk = Math.max(0, this.deterioration.risk - 42);
        if (this.onLog) this.onLog('SUCESSO: Hidrocortisona 100 mg EV na Crise Adrenal — sensibilidade vascular restaurada e reversão do choque refratário!');
        return true;
      }
      if (this.scenarioId === 'septic_shock' || this.scenarioId === 'myxedema_coma' || this.scenarioId === 'anaphylaxis' || this.scenarioId === 'asthma_severe' || this.scenarioId === 'copd') {
        this.cardiac.svr = Math.min(1.12, Number((this.cardiac.svr + 0.14).toFixed(2)));
        this.cardiac.baseSbp = Math.min(118, Math.round(this.cardiac.baseSbp + 10));
        this.patient.resistance = Math.max(6, Math.round(this.patient.resistance * 0.88));
        if (this.deterioration) this.deterioration.risk = Math.max(0, this.deterioration.risk - 22);
        if (this.onLog) this.onLog('Hidrocortisona 100 mg EV administrada — melhora da resposta vasopressora e efeito anti-inflamatório/broncodilatador!');
        return true;
      }
      if (this.onLog) this.onLog('Hidrocortisona 100 mg EV administrada (corticoide de estresse — sem déficit adrenal agudo neste cenário).');
      return true;
    }

    toggleInsulinTherapy() {
      const iv = this.interventions;
      iv.insulinActive = !iv.insulinActive;
      if (iv.insulinActive) {
        if (this.cardiac.rhythm === 'hyperkalemia') {
          this.setRhythm('sinus', true);
          if (this.deterioration) this.deterioration.risk = Math.max(0, this.deterioration.risk - 32);
          if (this.onLog) this.onLog('SUCESSO: Solução Polarizante (Insulina + Glicose) promoveu shift intracelular de K⁺ — ritmo sinusal restaurado!');
        } else if (this.scenarioId === 'dka_acidosis' || this.scenarioId === 'hhs_hyperosmolar') {
          if (this.deterioration) this.deterioration.risk = Math.max(0, this.deterioration.risk - 20);
          if (this.onLog) this.onLog('Insulina Regular EV contínua LIGADA — bloqueando cetogênese e corrigindo acidose/hiperosmolaridade progressivamente!');
        } else {
          if (this.onLog) this.onLog('⚠ Atenção: Insulina EV ligada fora de CAD/EHH/Hipercalemia — monitore glicemia capilar (risco de hipoglicemia)!');
        }
      } else {
        if (this.onLog) this.onLog('Infusão de Insulina EV pausada.');
      }
      return iv.insulinActive;
    }

    giveUterotonicTxa() {
      const iv = this.interventions;
      if (this.scenarioId === 'postpartum_hemorrhage') {
        iv.uterotonicGiven = true;
        this.cardiac.preload = Math.min(1.0, Number((this.cardiac.preload + 0.18).toFixed(2)));
        this.cardiac.baseSbp = Math.min(118, Math.round(this.cardiac.baseSbp + 16));
        this.cardiac.baseDbp = Math.min(72, Math.round(this.cardiac.baseDbp + 10));
        this.patient.lactate = Math.max(1.4, Number((this.patient.lactate - 1.2).toFixed(1)));
        if (this.deterioration) this.deterioration.risk = Math.max(0, this.deterioration.risk - 36);
        if (this.onLog) this.onLog('SUCESSO: Ocitocina + Ácido Tranexâmico 1 g EV — involução uterina efetiva e controle da Hemorragia Pós-Parto!');
        return true;
      }
      if (this.scenarioId === 'hemorrhagic_shock' || this.scenarioId === 'amniotic_embolism') {
        iv.uterotonicGiven = true;
        this.cardiac.preload = Math.min(0.95, Number((this.cardiac.preload + 0.08).toFixed(2)));
        if (this.deterioration) this.deterioration.risk = Math.max(0, this.deterioration.risk - 14);
        if (this.onLog) this.onLog('Ácido Tranexâmico (TXA 1 g EV) infundido — suporte antifibrinolítico na hemorragia/CIVD!');
        return true;
      }
      if (this.scenarioId === 'eclampsia_hellp' || this.scenarioId === 'hypertensive_crisis') {
        this.cardiac.baseSbp = Math.min(240, Math.round(this.cardiac.baseSbp + 8));
        if (this.onLog) this.onLog('⚠ Atenção: uterotônico sem HPP ativa em paciente hipertensa pode agravar pico pressórico!');
        return false;
      }
      if (this.onLog) this.onLog('Uterotônico + TXA: sem indicação de hemorragia obstétrica neste cenário.');
      return false;
    }

    giveBloodTransfusion() {
      const iv = this.interventions;
      iv.bloodUnits = (iv.bloodUnits || 0) + 1;
      // Hemácias restauram pré-carga sustentada (sem decaimento rápido de cristaloide) e melhoram oferta de O2!
      const overloaded = this.cardiac.preload >= 1.12;
      this.cardiac.preload = clamp(Number((this.cardiac.preload + 0.15).toFixed(2)), 0.4, 1.32);
      if (overloaded) {
        // Risco de sobrecarga volêmica (TACO) se paciente já congesto (EAP)
        this.patient.shunt = clamp(Number((this.patient.shunt + 0.05).toFixed(2)), 0.04, 0.7);
        if (this.onLog) this.onLog(`⚠ Transfusão CH #${iv.bloodUnits}: paciente já hipervolêmico — risco de sobrecarga (TACO)!`);
      } else {
        this.cardiac.baseSbp = Math.min(126, Math.round(this.cardiac.baseSbp + 10));
        this.cardiac.baseDbp = Math.min(78, Math.round(this.cardiac.baseDbp + 6));
        this.patient.lactate = Math.max(1.0, Number((this.patient.lactate - 0.7).toFixed(1)));
        this.patient.baseExcess = Math.min(0, Number((this.patient.baseExcess + 1.2).toFixed(1)));
        if (this.onLog) this.onLog(`Transfusão: Concentrado de Hemácias (#${iv.bloodUnits}) infundido — melhora da pré-carga, PAM e oferta de O₂!`);
      }
      return iv.bloodUnits;
    }

    toggleCpr() {
      this.interventions.cprActive = !this.interventions.cprActive;
      if (this.onLog) {
        this.onLog(this.interventions.cprActive ? 'RCP iniciada (compressões 110/min)' : 'RCP pausada para checagem de ritmo');
      }
      return this.interventions.cprActive;
    }

    defibrillate(options = {}) {
      const energyJ = Number(options.energyJ) || 200;
      const sync = Boolean(options.sync);
      const r = this.cardiac.rhythm;

      if (r === 'asystole' || r === 'pea') {
        if (this.breath) this.breath.shockPawTimer = 0.32;
        if (this.onLog) {
          this.onLog('ATENÇÃO: Ritmo NÃO chocável (Assistolia/AESP) — manter RCP contínua + Adrenalina!');
        }
        return { delivered: true, converted: false, reason: 'non_shockable' };
      }

      if (sync && (r === 'vf' || r === 'torsades')) {
        if (this.onLog) {
          this.onLog('Modo SINC ativo — sem onda R organizada (FV/Torsades). Desative SINC para desfibrilar!');
        }
        return { delivered: false, converted: false, reason: 'no_r_wave' };
      }

      // Choque efetivamente entregue ao tórax -> contração torácica breve na Paw do ventilador
      if (this.breath) this.breath.shockPawTimer = 0.32;

      if (sync && (r === 'afib_rvr' || r === 'aflutter' || r === 'svt' || r === 'vtach' || r === 'wpw')) {
        if (energyJ < 50) {
          if (this.onLog) {
            this.onLog(`Cardioversão sincronizada (${energyJ}J) insuficiente — tente ≥ 50–100J.`);
          }
          return { delivered: true, converted: false, reason: 'low_energy' };
        }
        this.interventions.roscAchieved = true;
        this.interventions.cprActive = false;
        this.patient.arrested = false;
        if (this.patient.intrinsicDrive <= 0) this.patient.intrinsicDrive = 8;
        this.cardiac.rhythm = 'sinus';
        this.cardiac.baseHr = 84;
        this.cardiac.baseSbp = Math.max(this.cardiac.baseSbp, 108);
        this.cardiac.baseDbp = Math.max(this.cardiac.baseDbp, 66);
        this.vitals.rhythm = 'sinus';
        this.vitals.hr = 84;
        this.vitals.sbp = Math.max(this.vitals.sbp, 108);
        this.vitals.dbp = Math.max(this.vitals.dbp, 66);
        this.vitals.map = Math.round((this.vitals.sbp + 2 * this.vitals.dbp) / 3);
        if (this.onLog) {
          this.onLog(`CARDIOVERSÃO SINCRONIZADA ${energyJ}J (Vivo Gold) → Ritmo Sinusal restaurado!`);
        }
        return { delivered: true, converted: true, mode: 'cardioversion' };
      }

      const isShockableArrest = (this.patient.arrested && !this.interventions.roscAchieved) || r === 'vtach' || r === 'torsades' || r === 'vf';
      if (!isShockableArrest) {
        // Fenômeno R-sobre-T: choque NÃO sincronizado de alta energia sobre ritmo organizado pode induzir FV!
        if (!sync && energyJ >= 100 && (r === 'afib_rvr' || r === 'svt' || r === 'aflutter' || r === 'wpw' || r === 'stemi' || r === 'de_winter' || (this.deterioration && this.deterioration.risk > 20))) {
          this.setRhythm('vf', true);
          if (this.deterioration) {
            this.deterioration.risk = 100;
            this.deterioration.stage = 'arrested';
            this.deterioration.lastArrestReason = `Fenômeno R-sobre-T (choque NÃO sincronizado de ${energyJ}J sobre ritmo organizado)`;
          }
          if (this.onLog) {
            this.onLog(`🚨 FENÔMENO R-SOBRE-T! Choque NÃO sincronizado (${energyJ}J) sobre ${r} induziu FIBRILAÇÃO VENTRICULAR (FV)! Desfibrilar imediatamente!`);
          }
          return { delivered: true, converted: false, reason: 'r_on_t_vf' };
        }
        if (this.onLog) {
          this.onLog(`Choque ${energyJ}J aplicado — ritmo já organizado (${r}). Para taquiarritmias use modo SINC.`);
        }
        return { delivered: true, converted: false, reason: 'not_indicated' };
      }

      this.interventions.roscAchieved = true;
      this.interventions.cprActive = false;
      this.patient.arrested = false;
      if (this.deterioration) {
        this.deterioration.risk = 22;
        this.deterioration.stage = 'stable';
        this.deterioration._warnLogged = false;
        this.deterioration._imminentLogged = false;
      }
      if (this.patient.intrinsicDrive <= 0) this.patient.intrinsicDrive = 8;
      this.cardiac.rhythm = 'sinus_tach';
      this.cardiac.baseHr = 108;
      if (this.scenarioId === 'cardiac_arrest' || this.cardiac.baseSbp < 65) {
        this.cardiac.baseSbp = 98;
        this.cardiac.baseDbp = 60;
        this.cardiac.preload = 0.88;
        this.cardiac.svr = 0.9;
        this.cardiac.contractility = 0.85;
      }
      this.vitals.rhythm = 'sinus_tach';
      this.vitals.hr = 108;
      this.vitals.sbp = Math.round(this.cardiac.baseSbp);
      this.vitals.dbp = Math.round(this.cardiac.baseDbp);
      this.vitals.map = Math.round((this.vitals.sbp + 2 * this.vitals.dbp) / 3);
      if (this.onLog) this.onLog(`CHOQUE ${energyJ}J APLICADO → RCE! Retorno da Circulação Espontânea (Sinusal).`);
      return { delivered: true, converted: true, mode: 'defib' };
    }

    triggerNibp() {
      const meta = ECG_RHYTHM_MAP[this.cardiac.rhythm];
      if (meta && meta.pulseless && !this.interventions.cprActive) {
        this.vitals.nibpSbp = 0;
        this.vitals.nibpDbp = 0;
        if (this.onLog) this.onLog('PNI indisponível — paciente sem pulso! Iniciar RCP.');
        return;
      }
      this.vitals.nibpSbp = Math.round(this.vitals.sbp + (Math.random() * 4 - 2));
      this.vitals.nibpDbp = Math.round(this.vitals.dbp + (Math.random() * 3 - 1.5));
      if (this.onLog) this.onLog(`PNI aferida: ${this.vitals.nibpSbp}/${this.vitals.nibpDbp} mmHg`);
    }

    getABG() {
      const v = this.vitals;
      const o2Info = this.getEffectiveO2Info();
      const fio2 = o2Info.fio2 / 100;
      const pf = Math.round(v.pao2 / fio2);
      return {
        ph: v.ph.toFixed(2),
        paco2: Math.round(v.paco2),
        pao2: Math.round(v.pao2),
        hco3: v.hco3.toFixed(1),
        be: (v.hco3 - 24).toFixed(1),
        sao2: Math.round(v.spo2),
        lactate: this.patient.lactate.toFixed(1),
        pf: pf,
        fio2Pct: Math.round(fio2 * 100)
      };
    }

    /** Exporta estado completo compacto (para Replay/Time-Travel, URL/QR Code e BroadcastChannel) */
    exportSnapshot() {
      const p = this.patient || {};
      const c = this.cardiac || {};
      const v = this.vitals || {};
      const vt = this.vent || {};
      const aw = this.airway || {};
      const iv = this.interventions || {};
      return {
        sc: this.scenarioId,
        t: Number((this.simTime || 0).toFixed(2)),
        p: {
          w: p.weightKg, c: Number((p.compliance || 60).toFixed(1)), r: Number((p.resistance || 6).toFixed(1)),
          sh: Number((p.shunt || 0.04).toFixed(3)), vc: Math.round(p.vco2 || 215),
          be: Number((p.baseExcess || 0).toFixed(1)), dr: Number((p.intrinsicDrive || 14).toFixed(1)),
          tp: Number((p.temp || 36.7).toFixed(1)), lac: Number((p.lactate || 1.1).toFixed(2)),
          arr: Boolean(p.arrested)
        },
        c: {
          hr: Math.round(c.baseHr || 78), sbp: Math.round(c.baseSbp || 120), dbp: Math.round(c.baseDbp || 78),
          pl: Number((c.preload || 1).toFixed(2)), svr: Number((c.svr || 1).toFixed(2)),
          ct: Number((c.contractility || 1).toFixed(2)), rh: c.rhythm || 'sinus',
          st: Number((c.stDeviation || 0).toFixed(1)), ec: Number((c.ectopyProb || 0).toFixed(2))
        },
        v: {
          hr: Math.round(v.hr || 78), sbp: Math.round(v.sbp || 120), dbp: Math.round(v.dbp || 78),
          map: Math.round(v.map || 92), spo2: Number((v.spo2 || 98).toFixed(1)),
          pao2: Number((v.pao2 || 95).toFixed(1)), paco2: Number((v.paco2 || 40).toFixed(1)),
          etco2: Number((v.etco2 || 36).toFixed(1)), ph: Number((v.ph || 7.4).toFixed(3)),
          hco3: Number((v.hco3 || 24).toFixed(1)), rh: v.rhythm || c.rhythm || 'sinus'
        },
        vt: {
          m: vt.mode, vt: vt.vtSet, pc: vt.pcSet, ps: vt.psSet, rr: vt.rrSet,
          pe: vt.peepSet, fi: vt.fio2Set, ti: vt.tiSet, fl: vt.flowSet
        },
        aw: { conn: Boolean(aw.connectedToVent), dev: aw.o2DeviceId, flow: aw.o2FlowLmin },
        iv: { nora: Number((iv.noraDose || 0).toFixed(3)), fl: Number((iv.fluidBoost || 0).toFixed(3)), cpr: Boolean(iv.cprActive) },
        pm: (this.pumps || []).slice(0, 2).map((ch) => ({
          d: ch.drugId, m: ch.mode, r: Number((ch.rate || 0).toFixed(3)),
          run: Boolean(ch.running), occ: Boolean(ch.occluded), vol: Number((ch.volumeInfusedMl || 0).toFixed(1))
        }))
      };
    }

    /** Restaura estado completo a partir de snapshot compacto */
    importSnapshot(snap, silent = true) {
      if (!snap || typeof snap !== 'object') return false;
      if (snap.sc && SCENARIOS[snap.sc] && snap.sc !== this.scenarioId) {
        this.loadScenario(snap.sc, true);
      }
      if (typeof snap.t === 'number') this.simTime = snap.t;
      if (snap.p) {
        const p = this.patient;
        if (snap.p.w != null) p.weightKg = snap.p.w;
        if (snap.p.c != null) p.compliance = snap.p.c;
        if (snap.p.r != null) p.resistance = snap.p.r;
        if (snap.p.sh != null) p.shunt = snap.p.sh;
        if (snap.p.vc != null) p.vco2 = snap.p.vc;
        if (snap.p.be != null) p.baseExcess = snap.p.be;
        if (snap.p.dr != null) p.intrinsicDrive = snap.p.dr;
        if (snap.p.tp != null) p.temp = snap.p.tp;
        if (snap.p.lac != null) p.lactate = snap.p.lac;
        if (snap.p.arr != null) p.arrested = Boolean(snap.p.arr);
      }
      if (snap.c) {
        const c = this.cardiac;
        if (snap.c.hr != null) c.baseHr = snap.c.hr;
        if (snap.c.sbp != null) c.baseSbp = snap.c.sbp;
        if (snap.c.dbp != null) c.baseDbp = snap.c.dbp;
        if (snap.c.pl != null) c.preload = snap.c.pl;
        if (snap.c.svr != null) c.svr = snap.c.svr;
        if (snap.c.ct != null) c.contractility = snap.c.ct;
        if (snap.c.rh) c.rhythm = snap.c.rh;
        if (snap.c.st != null) c.stDeviation = snap.c.st;
        if (snap.c.ec != null) c.ectopyProb = snap.c.ec;
      }
      if (snap.v) {
        const v = this.vitals;
        if (snap.v.hr != null) v.hr = snap.v.hr;
        if (snap.v.sbp != null) v.sbp = snap.v.sbp;
        if (snap.v.dbp != null) v.dbp = snap.v.dbp;
        if (snap.v.map != null) v.map = snap.v.map;
        if (snap.v.spo2 != null) v.spo2 = snap.v.spo2;
        if (snap.v.pao2 != null) v.pao2 = snap.v.pao2;
        if (snap.v.paco2 != null) v.paco2 = snap.v.paco2;
        if (snap.v.etco2 != null) v.etco2 = snap.v.etco2;
        if (snap.v.ph != null) v.ph = snap.v.ph;
        if (snap.v.hco3 != null) v.hco3 = snap.v.hco3;
        if (snap.v.rh) v.rhythm = snap.v.rh;
      }
      if (snap.vt) {
        const vt = this.vent;
        if (snap.vt.m) vt.mode = snap.vt.m;
        if (snap.vt.vt != null) vt.vtSet = snap.vt.vt;
        if (snap.vt.pc != null) vt.pcSet = snap.vt.pc;
        if (snap.vt.ps != null) vt.psSet = snap.vt.ps;
        if (snap.vt.rr != null) vt.rrSet = snap.vt.rr;
        if (snap.vt.pe != null) vt.peepSet = snap.vt.pe;
        if (snap.vt.fi != null) vt.fio2Set = snap.vt.fi;
        if (snap.vt.ti != null) vt.tiSet = snap.vt.ti;
        if (snap.vt.fl != null) vt.flowSet = snap.vt.fl;
      }
      if (snap.aw && this.airway) {
        if (snap.aw.dev) this.airway.o2DeviceId = snap.aw.dev;
        if (snap.aw.flow != null) this.airway.o2FlowLmin = snap.aw.flow;
        this.airway.connectedToVent = Boolean(snap.aw.conn);
      }
      if (snap.iv && this.interventions) {
        if (snap.iv.nora != null) this.interventions.noraDose = snap.iv.nora;
        if (snap.iv.fl != null) this.interventions.fluidBoost = snap.iv.fl;
        if (snap.iv.cpr != null) this.interventions.cprActive = Boolean(snap.iv.cpr);
      }
      if (Array.isArray(snap.pm) && Array.isArray(this.pumps)) {
        snap.pm.forEach((ps, idx) => {
          const ch = this.pumps[idx];
          if (!ch || !ps) return;
          if (ps.d) ch.drugId = ps.d;
          if (ps.m) ch.mode = ps.m;
          if (ps.r != null) ch.rate = ps.r;
          ch.running = Boolean(ps.run);
          ch.occluded = Boolean(ps.occ);
          if (ps.vol != null) ch.volumeInfusedMl = ps.vol;
        });
      }
      this._evaluateAlarms();
      if (!silent && this.onLog) this.onLog('Estado clínico restaurado via snapshot.');
      return true;
    }
  }

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

  global.ICUSim = global.ICUSim || {};
  global.ICUSim.SCENARIOS = SCENARIOS;
  global.ICUSim.ECG_RHYTHMS = ECG_RHYTHMS;
  global.ICUSim.ECG_RHYTHM_MAP = ECG_RHYTHM_MAP;
  global.ICUSim.IV_DRUGS = IV_DRUGS;
  global.ICUSim.IV_DRUG_MAP = IV_DRUG_MAP;
  global.ICUSim.O2_DEVICES = O2_DEVICES;
  global.ICUSim.O2_DEVICE_MAP = O2_DEVICE_MAP;
  global.ICUSim.BOLUS_DRUGS = BOLUS_DRUGS;
  global.ICUSim.BOLUS_DRUG_MAP = BOLUS_DRUG_MAP;
  global.ICUSim.SCENARIO_PHARMA = SCENARIO_PHARMA;
  global.ICUSim.PROTECTIVE_PILLARS = PROTECTIVE_PILLARS;
  global.ICUSim.PROTECTIVE_PROTOCOLS = PROTECTIVE_PROTOCOLS;
  global.ICUSim.PhysiologyEngine = PhysiologyEngine;
})(window);
