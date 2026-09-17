// SIRIUS AI Worker v2.17.0 - Professor Protocol + Multi-task Structured Output
// Cloudflare Workers AI binding required: AI
// Endpoint: POST /ai

const ALLOWED_ORIGINS = new Set([
  "https://siriusblacklui.github.io"
]);

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://siriusblacklui.github.io";
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
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}

function parseAIResponse(result) {
  let output = result?.response ?? result;
  if (typeof output === "string") {
    const raw = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    try { output = JSON.parse(raw); }
    catch {
      const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
      if (a >= 0 && b > a) {
        try { output = JSON.parse(raw.slice(a, b + 1)); } catch {}
      }
      if (typeof output === "string") return { reply: raw };
    }
  }
  return output && typeof output === "object" ? output : {};
}

async function runStructured(env, systemPrompt, userPrompt, schema, max_tokens = 1300, temperature = 0.25) {
  const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_schema", json_schema: schema },
    max_tokens,
    temperature
  });
  return parseAIResponse(result);
}

const professorSchema = {
  type: "object",
  properties: {
    phase: { type: "string", enum: ["lesson", "test", "complete"] },
    objective: { type: "string" },
    teacher: { type: "string" },
    feedback: { type: "string" },
    question: { type: "string" },
    score: { type: ["number", "null"] },
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    next: { type: "string" }
  },
  required: ["phase", "objective", "teacher", "feedback", "question", "score", "strengths", "gaps", "summary", "next"]
};

const evaluationSchema = {
  type: "object",
  properties: {
    score: { type: "number" },
    feedback: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } }
  },
  required: ["score", "feedback", "strengths", "gaps"]
};

const generalSchema = {
  type: "object",
  properties: {
    reply: { type: "string" },
    action_type: { type: "string", enum: ["NONE", "PROPOSE_MISSION"] },
    reason: { type: "string" },
    mission_name: { type: "string" },
    mission_desc: { type: "string" },
    mission_attr: { type: "string", enum: ["Disciplina", "Fisico", "Intelecto", "Comunicacao", "Foco", "Relacionamento", "Organizacao"] },
    mission_difficulty: { type: "string", enum: ["Microacao", "Simples", "Normal", "Dificil", "Especial"] },
    mission_validation: { type: "string", enum: ["action", "study"] },
    mission_evidence: { type: "string" }
  },
  required: ["reply", "action_type", "reason", "mission_name", "mission_desc", "mission_attr", "mission_difficulty", "mission_validation", "mission_evidence"]
};

const BASE_SYSTEM = `
Voce e SIRIUS, o nucleo inteligente de um sistema pessoal de evolucao gamificado.
Fale em portugues do Brasil. Seja preciso, estrategico, firme e levemente cinematografico.
O contexto enviado pelo app e a fonte de verdade para nivel, XP, atributos, missoes, biblioteca e progresso.
Nunca invente progresso, atividades realizadas ou recompensas. Voce nao concede XP/PD diretamente.
`.trim();

const PROFESSOR_SYSTEM = `
${BASE_SYSTEM}

MODO PROFESSOR:
- Voce e o Professor SIRIUS. O aluno informa apenas o tema; voce organiza a aula inteira.
- Ensine de verdade, nao apenas faça perguntas genericas.
- Explique em blocos curtos, com conceitos, exemplos concretos e conexoes praticas.
- Ao iniciar, defina um objetivo e ensine o primeiro bloco. Termine com UMA pergunta.
- Ao receber resposta do aluno, avalie especificamente o que ele escreveu, corrija erros e adapte a proxima explicacao.
- Se a resposta estiver fraca, simplifique e use novo exemplo. Se estiver boa, aprofunde.
- Nos turnos de teste, nao entregue a resposta antes do aluno responder.
- Na conclusao, atribua nota 0-100. Nota minima de aprovacao: 70.
- Nao finja ter pesquisado a web. Em temas atuais ou factuais, deixe claro quando houver limite de verificacao.
- Nunca devolva action de missao neste modo. Responda somente no schema de aula.
`.trim();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("SIRIUS AI ONLINE // v2.17.0 // PROFESSOR PROTOCOL ACTIVE", { status: 200, headers });
    }
    if (request.method !== "POST" || url.pathname !== "/ai") return new Response("Not found", { status: 404, headers });
    if (!env.AI) return json({ error: "Binding Workers AI 'AI' ausente." }, 500, headers);

    try {
      const body = await request.json();
      const task = String(body.task || "chat").trim();
      const message = String(body.message || "").trim().slice(0, 9000);
      const context = body.context || {};
      const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
      const professorSession = body.professorSession && typeof body.professorSession === "object" ? body.professorSession : null;

      if (!message) return json({ error: "Mensagem vazia." }, 400, headers);

      if (task === "professor_start" || task === "professor_turn" || task === "professor_teach") {
        const sessionText = professorSession ? JSON.stringify({
          topic: professorSession.topic,
          objective: professorSession.objective,
          phase: professorSession.phase,
          turn: professorSession.turn,
          messages: Array.isArray(professorSession.messages) ? professorSession.messages.slice(-12) : []
        }) : "(nova aula)";

        const userPrompt = `
TAREFA: ${task}
SESSAO DO PROFESSOR:
${sessionText}

CONTEXTO DO SIRIUS:
${JSON.stringify(context).slice(0, 12000)}

INSTRUCAO DA AULA:
${message}

Retorne uma etapa pedagogica real e especifica para o tema. Nao substitua a aula por conselhos genericos.
`.trim();

        const lesson = await runStructured(env, PROFESSOR_SYSTEM, userPrompt, professorSchema, 1600, 0.3);
        lesson.phase = ["lesson", "test", "complete"].includes(lesson.phase) ? lesson.phase : "lesson";
        lesson.objective = String(lesson.objective || "");
        lesson.teacher = String(lesson.teacher || "");
        lesson.feedback = String(lesson.feedback || "");
        lesson.question = String(lesson.question || "");
        lesson.score = lesson.score === null || lesson.score === undefined ? null : Math.max(0, Math.min(100, Number(lesson.score) || 0));
        lesson.strengths = Array.isArray(lesson.strengths) ? lesson.strengths.slice(0, 6).map(String) : [];
        lesson.gaps = Array.isArray(lesson.gaps) ? lesson.gaps.slice(0, 6).map(String) : [];
        lesson.summary = String(lesson.summary || "");
        lesson.next = String(lesson.next || "");
        return json({ lesson, action: null }, 200, headers);
      }

      if (task === "evaluate_learning" || task === "evaluate_evolution") {
        const evalSystem = `${BASE_SYSTEM}\nVoce esta em modo avaliador. Avalie somente a evidencia fornecida. Nao invente fatos nem recompensas. Use nota de 0 a 100 e feedback objetivo.`;
        const evalPrompt = `${message}\n\nCONTEXTO:\n${JSON.stringify(context).slice(0, 10000)}\n\nDADOS ESPECIFICOS:\n${JSON.stringify(task === "evaluate_learning" ? { submission: body.submission, mission: body.mission } : { attribute: body.attribute, proof: body.proof }).slice(0, 10000)}`;
        const evaluation = await runStructured(env, evalSystem, evalPrompt, evaluationSchema, 900, 0.15);
        evaluation.score = Math.max(0, Math.min(100, Number(evaluation.score) || 0));
        evaluation.feedback = String(evaluation.feedback || "Avaliacao concluida.");
        evaluation.strengths = Array.isArray(evaluation.strengths) ? evaluation.strengths.slice(0, 5).map(String) : [];
        evaluation.gaps = Array.isArray(evaluation.gaps) ? evaluation.gaps.slice(0, 5).map(String) : [];
        return json({ evaluation, reply: JSON.stringify(evaluation), action: null }, 200, headers);
      }

      if (task === "professor_lesson" || task === "research_lesson") {
        const freeSchema = { type: "object", properties: { reply: { type: "string" } }, required: ["reply"] };
        const prompt = `${message}\n\nCONTEXTO:\n${JSON.stringify(context).slice(0, 12000)}\n\nDADOS ADICIONAIS:\n${JSON.stringify({ lesson: body.lesson || null, profile: body.profile || null }).slice(0, 8000)}`;
        const out = await runStructured(env, `${BASE_SYSTEM}\nAtue como professor e produza conteudo didatico util, concreto e verificavel.`, prompt, freeSchema, 1500, 0.3);
        return json({ reply: String(out.reply || ""), action: null }, 200, headers);
      }

      const transcript = history.map((h) => `${h.role === "assistant" ? "SIRIUS" : "JOGADOR"}: ${String(h.text || "").slice(0, 2000)}`).join("\n");
      const systemPrompt = `${BASE_SYSTEM}

MISSOES:
- So proponha missao quando o jogador pedir explicitamente para criar, propor ou gerar uma missao/tarefa concreta.
- Atributos permitidos: Disciplina, Fisico, Intelecto, Comunicacao, Foco, Relacionamento, Organizacao.
- Dificuldades permitidas: Microacao, Simples, Normal, Dificil, Especial.
- validation deve ser study para estudo/aprendizagem; caso contrario action.
- Toda missao deve ter condicao observavel de conclusao.
- Evite repetir tema, livro, material ou estrutura das ultimas missoes quando houver alternativas pertinentes.
- Se nao houver proposta, use action_type = NONE.`;
      const userPrompt = `CONTEXTO ATUAL:\n${JSON.stringify(context).slice(0, 14000)}\n\nHISTORICO RECENTE:\n${transcript || "(sem historico)"}\n\nCOMANDO ATUAL:\n${message}`;
      const output = await runStructured(env, systemPrompt, userPrompt, generalSchema, 1300, 0.3);

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

      return json({ reply: String(output.reply || "").trim(), action }, 200, headers);
    } catch (err) {
      console.error("SIRIUS AI ERROR", err);
      return json({ error: "Falha interna do nucleo de inteligencia.", details: String(err?.message || err) }, 500, headers);
    }
  }
};
