// SIRIUS AI Worker v2.18.1
// Adaptive Learning Engine - Stage 1
// Cloudflare Workers AI binding required: AI
// Endpoint: POST /ai

const ALLOWED_ORIGINS = new Set([
  "https://siriusblacklui.github.io"
]);

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://siriusblacklui.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin"
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isExplicitMissionRequest(message) {
  const t = normalizeText(message);
  const hasMissionWord = t.includes("missao") || t.includes("tarefa") || t.includes("quest");
  const hasCreateVerb =
    t.includes("crie") || t.includes("criar") ||
    t.includes("gere") || t.includes("gerar") ||
    t.includes("proponha") || t.includes("propor") ||
    t.includes("me de");
  return hasMissionWord && hasCreateVerb;
}

function mapAttrToFrontend(value) {
  const t = normalizeText(value);
  const map = {
    "disciplina": "Disciplina",
    "fisico": "Físico",
    "intelecto": "Intelecto",
    "comunicacao": "Comunicação",
    "foco": "Foco",
    "relacionamento": "Relacionamento",
    "organizacao": "Organização"
  };
  return map[t] || "Disciplina";
}

function safeDifficulty(value) {
  const t = normalizeText(value);
  if (t === "microacao") return "Microacao";
  if (t === "simples") return "Simples";
  if (t === "normal") return "Normal";
  if (t === "dificil") return "Dificil";
  if (t === "especial") return "Especial";
  return "Normal";
}

function safeTechnique(value) {
  const allowed = new Set([
    "Pomodoro",
    "Recuperacao Ativa",
    "Flashcards",
    "Repeticao Espacada",
    "Feynman",
    "Interleaving",
    "Pratica Deliberada",
    "Nenhuma"
  ]);
  const raw = String(value || "").trim();
  return allowed.has(raw) ? raw : "Nenhuma";
}

function activeLibrarySource(context = {}) {
  const library = Array.isArray(context.library) ? context.library : [];
  const inProgress = library
    .filter(x => Number(x?.progress || 0) > 0 && Number(x?.progress || 0) < 100)
    .sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0));
  return inProgress[0] || library[0] || null;
}

function buildFallbackMission(context = {}) {
  const source = activeLibrarySource(context);

  if (source?.title) {
    return {
      name: `Leitura Focada // ${String(source.title).slice(0, 60)}`,
      desc: `Leia "${source.title}" por 25 minutos usando um ciclo de Pomodoro. Ao terminar, feche o material e recupere as ideias principais sem consultar.`,
      attr: "Foco",
      secondaryAttr: "Intelecto",
      difficulty: "Simples",
      validation: "study",
      evidence: "Informe o trecho estudado, a ideia principal, dois pontos importantes e uma aplicação prática sem consultar o material.",
      material: String(source.title).slice(0, 120),
      contentType: "Leitura conceitual",
      learningGoal: "Compreender e reter",
      focusMethod: "Pomodoro",
      learningMethod: "Recuperacao Ativa",
      durationMin: 25,
      pauseMin: 5,
      completionCondition: "Concluir 25 minutos de leitura e responder à recuperação ativa sem consultar.",
      methodReason: "Pomodoro organiza o bloco de foco; Recuperação Ativa verifica se houve retenção real."
    };
  }

  const attrs = context.attributes || {};
  let chosen = "Disciplina";
  let lowestScore = Infinity;

  for (const [name, info] of Object.entries(attrs)) {
    const level = Number(info?.level || 1);
    const pd = Number(info?.pd || 0);
    const score = level * 100 + pd;
    if (score < lowestScore) {
      lowestScore = score;
      chosen = name;
    }
  }

  const attr = mapAttrToFrontend(chosen);
  const missions = Array.isArray(context.activeMissions) ? context.activeMissions : [];

  if (missions.length >= 4) {
    return {
      name: "Retomar Controle",
      desc: "Escolha uma missão ativa prioritária e execute 20 minutos de trabalho focado sem iniciar uma nova tarefa.",
      attr: "Foco",
      secondaryAttr: "",
      difficulty: "Simples",
      validation: "action",
      evidence: "Informe qual missão foi escolhida e o que avançou durante os 20 minutos.",
      material: "",
      contentType: "Execução",
      learningGoal: "Retomar ritmo",
      focusMethod: "Pomodoro",
      learningMethod: "Nenhuma",
      durationMin: 20,
      pauseMin: 5,
      completionCondition: "Executar 20 minutos de trabalho focado na missão escolhida.",
      methodReason: "O bloco de foco reduz dispersão e evita criar novas tarefas antes de avançar no que já está ativo."
    };
  }

  return {
    name: `Avanço de ${attr}`,
    desc: `Execute uma ação concreta de 20 minutos que desenvolva ${attr} e produza um resultado observável.`,
    attr,
    secondaryAttr: "",
    difficulty: "Simples",
    validation: attr === "Intelecto" ? "study" : "action",
    evidence: attr === "Intelecto"
      ? "Explique com suas próprias palavras o que aprendeu e dê um exemplo de aplicação."
      : "Descreva objetivamente o que foi realizado e qual foi o resultado.",
    material: "",
    contentType: attr === "Intelecto" ? "Aprendizagem" : "Execução",
    learningGoal: attr === "Intelecto" ? "Compreender e aplicar" : "Executar",
    focusMethod: "Pomodoro",
    learningMethod: attr === "Intelecto" ? "Recuperacao Ativa" : "Nenhuma",
    durationMin: 20,
    pauseMin: 5,
    completionCondition: "Concluir a ação definida dentro do bloco de tempo.",
    methodReason: attr === "Intelecto"
      ? "O bloco de foco organiza a sessão e a recuperação ativa verifica compreensão."
      : "Um bloco curto e objetivo aumenta a chance de execução real."
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        "SIRIUS AI ONLINE // v2.18.1 // ADAPTIVE LEARNING ENGINE ACTIVE",
        { status: 200, headers }
      );
    }

    if (request.method !== "POST" || url.pathname !== "/ai") {
      return new Response("Not found", { status: 404, headers });
    }

    if (!env.AI) {
      return json({ error: "Binding Workers AI 'AI' ausente." }, 500, headers);
    }

    try {
      const body = await request.json();
      const message = String(body.message || "").trim().slice(0, 5000);
      const context = body.context || {};
      const history = Array.isArray(body.history) ? body.history.slice(-12) : [];

      if (!message) {
        return json({ error: "Mensagem vazia." }, 400, headers);
      }

      const missionRequested = isExplicitMissionRequest(message);

      const systemPrompt = `
Voce e SIRIUS, o nucleo inteligente de um sistema pessoal de evolucao gamificado.

PERSONALIDADE:
- Fale em portugues do Brasil.
- Soe como uma interface de Sistema inteligente: preciso, estrategico, firme e levemente cinematografico.
- Evite tom de assistente generico, elogios vazios e excesso de entusiasmo.
- Respostas normalmente curtas e objetivas.

VERDADE E AUTORIDADE:
- O contexto enviado pelo app e a fonte de verdade para nivel, XP, atributos, missoes, biblioteca e progresso.
- Nunca invente progresso, atividades realizadas, materiais inexistentes ou recompensas.
- Voce NAO concede XP/PD e NAO registra missoes diretamente.
- Quando sugerir uma missao, ela e apenas uma PROPOSTA. O aplicativo exige aprovacao do jogador.

MOTOR DE MISSOES:
- Se o comando atual pedir uma missao explicitamente, action_type DEVE ser "PROPOSE_MISSION".
- Nao faca pergunta de acompanhamento antes de propor uma missao quando houver contexto suficiente.
- Gere UMA missao concreta por vez.
- Evite duplicar missoes ativas muito parecidas.
- Sempre que possivel, ancore a missao em algo REAL do contexto: livro/material em andamento, missao ativa, revisao pendente ou atributo que precisa de desenvolvimento.
- Prefira missao objetiva a formulacao generica.
- Toda missao deve conter: alvo concreto, tempo ou quantidade, condicao observavel de conclusao e evidencia.
- Se houver um material da biblioteca em andamento e o pedido for generico, considere priorizar esse material quando isso fizer sentido.

MOTOR DE APRENDIZAGEM ADAPTATIVA:
- Identifique primeiro o tipo de conteudo e o objetivo de aprendizagem.
- Escolha tecnicas pelo tipo de tarefa, nao por fama.
- Pomodoro e tecnica de gerenciamento de atencao; nao trate Pomodoro sozinho como garantia de aprendizagem.
- Para leitura conceitual: prefira Pomodoro + Recuperacao Ativa.
- Para conceitos complexos: prefira Feynman + Recuperacao Ativa.
- Para fatos, definicoes e vocabulario: prefira Flashcards + Repeticao Espacada.
- Para conteudo ja estudado: prefira Recuperacao Ativa antes de releitura.
- Para resolucao de problemas: prefira Pratica Deliberada + Interleaving.
- Explique de forma curta por que as tecnicas foram selecionadas.
- Se a missao nao for de aprendizagem, use "Nenhuma" quando uma tecnica de aprendizagem nao fizer sentido.

CAMPOS:
- Atributos permitidos: Disciplina, Fisico, Intelecto, Comunicacao, Foco, Relacionamento, Organizacao.
- Dificuldades permitidas: Microacao, Simples, Normal, Dificil, Especial.
- mission_validation deve ser "study" para estudo/aprendizagem; caso contrario "action".
- Tecnicas permitidas: Pomodoro, Recuperacao Ativa, Flashcards, Repeticao Espacada, Feynman, Interleaving, Pratica Deliberada, Nenhuma.
- Se nao houver proposta, use action_type = "NONE".
`.trim();

      const transcript = history.map((h) => {
        const role = h.role === "assistant" ? "SIRIUS" : "JOGADOR";
        return `${role}: ${String(h.text || "").slice(0, 2000)}`;
      }).join("\n");

      const userPrompt = `
CONTEXTO ATUAL:
${JSON.stringify(context)}

HISTORICO RECENTE:
${transcript || "(sem historico)"}

COMANDO ATUAL:
${message}

PEDIDO_EXPLICITO_DE_MISSAO:
${missionRequested ? "SIM" : "NAO"}
`.trim();

      const schema = {
        type: "object",
        properties: {
          reply: { type: "string" },
          action_type: { type: "string", enum: ["NONE", "PROPOSE_MISSION"] },
          reason: { type: "string" },
          mission_name: { type: "string" },
          mission_desc: { type: "string" },
          mission_attr: {
            type: "string",
            enum: ["Disciplina", "Fisico", "Intelecto", "Comunicacao", "Foco", "Relacionamento", "Organizacao"]
          },
          mission_secondary_attr: {
            type: "string",
            enum: ["", "Disciplina", "Fisico", "Intelecto", "Comunicacao", "Foco", "Relacionamento", "Organizacao"]
          },
          mission_difficulty: {
            type: "string",
            enum: ["Microacao", "Simples", "Normal", "Dificil", "Especial"]
          },
          mission_validation: {
            type: "string",
            enum: ["action", "study"]
          },
          mission_evidence: { type: "string" },
          mission_material: { type: "string" },
          mission_content_type: { type: "string" },
          mission_learning_goal: { type: "string" },
          mission_focus_method: {
            type: "string",
            enum: ["Pomodoro", "Recuperacao Ativa", "Flashcards", "Repeticao Espacada", "Feynman", "Interleaving", "Pratica Deliberada", "Nenhuma"]
          },
          mission_learning_method: {
            type: "string",
            enum: ["Pomodoro", "Recuperacao Ativa", "Flashcards", "Repeticao Espacada", "Feynman", "Interleaving", "Pratica Deliberada", "Nenhuma"]
          },
          mission_duration_min: { type: "integer", minimum: 0, maximum: 180 },
          mission_pause_min: { type: "integer", minimum: 0, maximum: 60 },
          mission_completion_condition: { type: "string" },
          mission_method_reason: { type: "string" }
        },
        required: [
          "reply",
          "action_type",
          "reason",
          "mission_name",
          "mission_desc",
          "mission_attr",
          "mission_secondary_attr",
          "mission_difficulty",
          "mission_validation",
          "mission_evidence",
          "mission_material",
          "mission_content_type",
          "mission_learning_goal",
          "mission_focus_method",
          "mission_learning_method",
          "mission_duration_min",
          "mission_pause_min",
          "mission_completion_condition",
          "mission_method_reason"
        ]
      };

      const result = await env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: {
            type: "json_schema",
            json_schema: schema
          },
          max_tokens: 1500,
          temperature: 0.22
        }
      );

      let output = result?.response;

      if (typeof output === "string") {
        try {
          output = JSON.parse(output);
        } catch {
          output = null;
        }
      }

      if (!output || typeof output.reply !== "string") {
        if (missionRequested) {
          const fallback = buildFallbackMission(context);
          return json({
            reply: "[ SIRIUS // MISSAO ] Proposta contextual gerada com base no seu estado atual. Aguardo sua aprovacao.",
            action: {
              type: "PROPOSE_MISSION",
              reason: "Pedido explícito de missão detectado. Foi usada uma proposta contextual segura baseada no estado atual do jogador.",
              mission: fallback
            }
          }, 200, headers);
        }

        return json({
          reply: "[ SIRIUS // FALHA DE FORMATO ] A resposta nao pôde ser interpretada com seguranca.",
          action: null
        }, 200, headers);
      }

      let action = null;
      const shouldPropose = missionRequested || output.action_type === "PROPOSE_MISSION";

      if (shouldPropose) {
        const fallback = buildFallbackMission(context);

        action = {
          type: "PROPOSE_MISSION",
          reason: String(output.reason || "Missão proposta a partir do estado atual do jogador.").slice(0, 500),
          mission: {
            name: String(output.mission_name || fallback.name).slice(0, 100),
            desc: String(output.mission_desc || fallback.desc).slice(0, 700),
            attr: mapAttrToFrontend(output.mission_attr || fallback.attr),
            secondaryAttr: output.mission_secondary_attr
              ? mapAttrToFrontend(output.mission_secondary_attr)
              : String(fallback.secondaryAttr || ""),
            difficulty: safeDifficulty(output.mission_difficulty || fallback.difficulty),
            validation: output.mission_validation === "study" ? "study" : fallback.validation,
            evidence: String(output.mission_evidence || fallback.evidence).slice(0, 500),
            material: String(output.mission_material || fallback.material || "").slice(0, 160),
            contentType: String(output.mission_content_type || fallback.contentType || "").slice(0, 120),
            learningGoal: String(output.mission_learning_goal || fallback.learningGoal || "").slice(0, 160),
            focusMethod: safeTechnique(output.mission_focus_method || fallback.focusMethod),
            learningMethod: safeTechnique(output.mission_learning_method || fallback.learningMethod),
            durationMin: Math.max(0, Math.min(180, Number(output.mission_duration_min ?? fallback.durationMin) || 0)),
            pauseMin: Math.max(0, Math.min(60, Number(output.mission_pause_min ?? fallback.pauseMin) || 0)),
            completionCondition: String(output.mission_completion_condition || fallback.completionCondition || "").slice(0, 500),
            methodReason: String(output.mission_method_reason || fallback.methodReason || "").slice(0, 500)
          }
        };
      }

      return json({
        reply: String(output.reply || "").trim(),
        action
      }, 200, headers);

    } catch (err) {
      console.error("SIRIUS AI ERROR", err);
      return json({
        error: "Falha interna do nucleo de inteligencia.",
        details: String(err?.message || err)
      }, 500, headers);
    }
  }
};
