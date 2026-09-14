// SIRIUS AI Worker v2.17.0 - Mission Intent Guard
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

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function wantsMission(message) {
  const t = normalizeText(message);
  const hasMissionWord = /\b(missao|missoes|tarefa|tarefas|desafio|atividade)\b/.test(t);
  const hasCreationVerb = /\b(crie|criar|cria|gere|gerar|gera|proponha|propor|propoe|monte|montar|sugira|sugerir)\b/.test(t);
  return hasMissionWord && hasCreationVerb;
}

function normalizeAttribute(value) {
  const map = {
    disciplina: "Disciplina",
    fisico: "Físico",
    intelecto: "Intelecto",
    comunicacao: "Comunicação",
    foco: "Foco",
    relacionamento: "Relacionamento",
    organizacao: "Organização"
  };
  return map[normalizeText(value)] || "Disciplina";
}

function normalizeDifficulty(value) {
  const map = {
    microacao: "Microacao",
    simples: "Simples",
    normal: "Normal",
    dificil: "Dificil",
    especial: "Especial"
  };
  return map[normalizeText(value)] || "Normal";
}

function buildFallbackMission(context) {
  const attrs = context && typeof context.attributes === "object" && context.attributes
    ? context.attributes
    : {};

  let best = { name: "Disciplina", score: Infinity };

  for (const [name, raw] of Object.entries(attrs)) {
    const level = Number(raw?.level ?? 1) || 1;
    const pd = Number(raw?.pd ?? 0) || 0;
    const score = level * 100 + pd;
    if (score < best.score) best = { name: normalizeAttribute(name), score };
  }

  const attr = best.name;
  const templates = {
    "Disciplina": {
      name: "Bloco de Execução",
      desc: "Escolha uma tarefa importante que você vem adiando e execute 25 minutos sem trocar de atividade.",
      evidence: "Concluir um bloco contínuo de 25 minutos e registrar qual tarefa foi executada."
    },
    "Físico": {
      name: "Movimento Deliberado",
      desc: "Realize 20 minutos de atividade física compatível com sua condição atual, mantendo técnica e intensidade controladas.",
      evidence: "Registrar a atividade realizada e a duração aproximada."
    },
    "Intelecto": {
      name: "Recuperação Ativa",
      desc: "Estude um tópico relevante por 20 minutos e depois explique, sem consultar o material, três ideias principais com suas próprias palavras.",
      evidence: "Produzir uma explicação própria com pelo menos três ideias recuperadas sem consulta."
    },
    "Comunicação": {
      name: "Mensagem Clara",
      desc: "Escolha uma conversa ou mensagem importante e formule seu ponto principal em até três frases objetivas antes de enviar ou falar.",
      evidence: "Registrar o objetivo da comunicação e a versão final em até três frases."
    },
    "Foco": {
      name: "Sessão Sem Distrações",
      desc: "Faça 25 minutos de trabalho concentrado com notificações e distrações removidas.",
      evidence: "Concluir os 25 minutos e registrar qual atividade recebeu foco total."
    },
    "Relacionamento": {
      name: "Contato Intencional",
      desc: "Faça um contato genuíno com alguém importante: pergunte como a pessoa está e escute ou responda com atenção real.",
      evidence: "Registrar que o contato foi realizado e qual foi a intenção principal."
    },
    "Organização": {
      name: "Zona Sob Controle",
      desc: "Organize uma área pequena e específica — física ou digital — por 15 minutos e deixe um padrão simples para mantê-la organizada.",
      evidence: "Registrar qual área foi organizada e qual regra simples ficou definida."
    }
  };

  const chosen = templates[attr] || templates.Disciplina;
  return {
    type: "PROPOSE_MISSION",
    reason: `Fallback de segurança: proposta baseada no atributo com menor progresso detectado no contexto (${attr}).`,
    mission: {
      name: chosen.name,
      desc: chosen.desc,
      attr,
      difficulty: "Normal",
      validation: attr === "Intelecto" ? "study" : "action",
      evidence: chosen.evidence
    }
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
        "SIRIUS AI ONLINE // v2.17.0 // MISSION INTENT GUARD ACTIVE",
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
      const missionIntent = wantsMission(message);

      if (!message) {
        return json({ error: "Mensagem vazia." }, 400, headers);
      }

      const systemPrompt = `
Voce e SIRIUS, o nucleo inteligente de um sistema pessoal de evolucao gamificado.

PERSONALIDADE:
- Fale em portugues do Brasil.
- Soe como uma interface de Sistema inteligente: preciso, estrategico, firme e levemente cinematografico.
- Evite tom de assistente generico, elogios vazios e excesso de entusiasmo.
- Respostas normalmente curtas e objetivas.
- Pode usar cabecalhos como [ SIRIUS // ANALISE ], [ SIRIUS // MISSAO ], [ SIRIUS // ALERTA ].

VERDADE E AUTORIDADE:
- O contexto enviado pelo app e a fonte de verdade para nivel, XP, atributos, missoes, biblioteca e progresso.
- Nunca invente progresso, atividades realizadas ou recompensas.
- Voce NAO concede XP/PD e NAO registra missoes diretamente.
- Quando sugerir uma missao, ela e apenas uma PROPOSTA. O aplicativo exige aprovacao do jogador.

MISSOES:
- Se MISSION_INTENT_DETECTED = SIM, voce DEVE retornar action_type = "PROPOSE_MISSION".
- Quando MISSION_INTENT_DETECTED = SIM, NAO faca pergunta de acompanhamento antes de propor. Use o contexto atual para escolher UMA missao concreta e razoavel para hoje.
- Evite duplicar uma missao ativa muito semelhante.
- Dê preferencia a um atributo com menor progresso ou a uma necessidade evidente no contexto.
- Atributos permitidos: Disciplina, Físico, Intelecto, Comunicação, Foco, Relacionamento, Organização.
- Dificuldades permitidas: Microacao, Simples, Normal, Dificil, Especial.
- validation deve ser "study" para estudo/aprendizagem; caso contrario "action".
- Toda missao deve ter condicao observavel de conclusao.
- Se MISSION_INTENT_DETECTED = NAO e nao houver pedido de proposta, use action_type = "NONE".

APRENDIZAGEM:
- Questione respostas superficiais.
- Com texto-fonte, avalie com base nele.
- Sem texto-fonte, deixe claro que nao pode verificar fidelidade ao material original.
`.trim();

      const transcript = history.map((h) => {
        const role = h.role === "assistant" ? "SIRIUS" : "JOGADOR";
        return `${role}: ${String(h.text || "").slice(0, 2000)}`;
      }).join("\n");

      const userPrompt = `
MISSION_INTENT_DETECTED: ${missionIntent ? "SIM" : "NAO"}

CONTEXTO ATUAL:
${JSON.stringify(context)}

HISTORICO RECENTE:
${transcript || "(sem historico)"}

COMANDO ATUAL:
${message}
`.trim();

      const schema = {
        type: "object",
        properties: {
          reply: { type: "string" },
          action_type: {
            type: "string",
            enum: ["NONE", "PROPOSE_MISSION"]
          },
          reason: { type: "string" },
          mission_name: { type: "string" },
          mission_desc: { type: "string" },
          mission_attr: {
            type: "string",
            enum: [
              "Disciplina",
              "Físico",
              "Intelecto",
              "Comunicação",
              "Foco",
              "Relacionamento",
              "Organização"
            ]
          },
          mission_difficulty: {
            type: "string",
            enum: ["Microacao", "Simples", "Normal", "Dificil", "Especial"]
          },
          mission_validation: {
            type: "string",
            enum: ["action", "study"]
          },
          mission_evidence: { type: "string" }
        },
        required: [
          "reply",
          "action_type",
          "reason",
          "mission_name",
          "mission_desc",
          "mission_attr",
          "mission_difficulty",
          "mission_validation",
          "mission_evidence"
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
          max_tokens: 1100,
          temperature: 0.2
        }
      );

      let output = result?.response;

      if (typeof output === "string") {
        try {
          output = JSON.parse(output);
        } catch {
          if (missionIntent) {
            const fallback = buildFallbackMission(context);
            return json({
              reply: "[ SIRIUS // MISSAO ] O nucleo retornou um formato instavel; uma proposta segura foi gerada usando seu estado atual.",
              action: fallback
            }, 200, headers);
          }
          return json({
            reply: "[ SIRIUS // FALHA DE FORMATO ] A resposta nao pôde ser interpretada com seguranca.",
            action: null
          }, 200, headers);
        }
      }

      if (!output || typeof output.reply !== "string") {
        if (missionIntent) {
          const fallback = buildFallbackMission(context);
          return json({
            reply: "[ SIRIUS // MISSAO ] Estrutura invalida recebida; proposta segura gerada a partir do contexto atual.",
            action: fallback
          }, 200, headers);
        }
        return json({
          reply: "[ SIRIUS // FALHA DE FORMATO ] Estrutura invalida recebida do nucleo.",
          action: null
        }, 200, headers);
      }

      let action = null;

      if (output.action_type === "PROPOSE_MISSION") {
        action = {
          type: "PROPOSE_MISSION",
          reason: String(output.reason || "").slice(0, 500),
          mission: {
            name: String(output.mission_name || "Missao SIRIUS").slice(0, 80),
            desc: String(output.mission_desc || "").slice(0, 500),
            attr: normalizeAttribute(output.mission_attr),
            difficulty: normalizeDifficulty(output.mission_difficulty),
            validation: output.mission_validation === "study" ? "study" : "action",
            evidence: String(output.mission_evidence || "").slice(0, 300)
          }
        };
      }

      // Guardrail deterministico: um pedido explicito de missao nunca termina apenas em pergunta generica.
      if (missionIntent && !action) {
        action = buildFallbackMission(context);
      }

      return json({
        reply: output.reply.trim(),
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
