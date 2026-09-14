// SIRIUS AI Worker v2.16.1 - Structured Output Fix
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
        "SIRIUS AI ONLINE // v2.16.1 // STRUCTURED OUTPUT ACTIVE",
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
- So proponha missao quando o jogador pedir explicitamente para criar, propor ou gerar uma missao/tarefa concreta.
- Atributos permitidos: Disciplina, Fisico, Intelecto, Comunicacao, Foco, Relacionamento, Organizacao.
- Dificuldades permitidas: Microacao, Simples, Normal, Dificil, Especial.
- validation deve ser "study" para estudo/aprendizagem; caso contrario "action".
- Toda missao deve ter condicao observavel de conclusao.
- Se nao houver proposta, use action_type = "NONE".

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
              "Fisico",
              "Intelecto",
              "Comunicacao",
              "Foco",
              "Relacionamento",
              "Organizacao"
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
          temperature: 0.25
        }
      );

      let output = result?.response;

      if (typeof output === "string") {
        try {
          output = JSON.parse(output);
        } catch {
          return json({
            reply: "[ SIRIUS // FALHA DE FORMATO ] A resposta nao pôde ser interpretada com seguranca.",
            action: null
          }, 200, headers);
        }
      }

      if (!output || typeof output.reply !== "string") {
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
            attr: String(output.mission_attr || "Disciplina"),
            difficulty: String(output.mission_difficulty || "Normal"),
            validation: output.mission_validation === "study" ? "study" : "action",
            evidence: String(output.mission_evidence || "").slice(0, 300)
          }
        };
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
