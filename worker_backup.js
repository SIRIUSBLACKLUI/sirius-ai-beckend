// SIRIUS AI Worker v2.20.0 - ECONOMY ADAPTIVE
// Cloudflare Workers AI binding required: AI
// Endpoint: POST /ai

const ALLOWED_ORIGINS = new Set(["https://siriusblacklui.github.io"]);
const ECON_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

function cors(origin){
  const allowed=ALLOWED_ORIGINS.has(origin)?origin:"https://siriusblacklui.github.io";
  return {
    "Access-Control-Allow-Origin":allowed,
    "Access-Control-Allow-Headers":"Content-Type",
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Vary":"Origin"
  };
}
function json(data,status,headers){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...headers,"Content-Type":"application/json; charset=utf-8"}
  });
}
function norm(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}
function isQuotaError(err){
  const t=norm(err?.message||err);
  return t.includes("4006")||t.includes("daily free allocation")||t.includes("used up your daily")||t.includes("quota")||t.includes("neurons");
}
function wantsMission(message){
  const t=norm(message);
  return /\b(missao|missoes|tarefa|tarefas|desafio|atividade)\b/.test(t) &&
         /\b(crie|criar|cria|gere|gerar|gera|proponha|propor|monte|montar|sugira|sugerir)\b/.test(t);
}
function compactContext(ctx){
  if(!ctx||typeof ctx!=="object")return {};
  const pick={};
  const keys=["level","rank","xp","attributes","attrs","goals","activeGoals","missions","activeMissions","library","currentBook","streak","weekly","priority","barrier","missionRules","recentMissionHistory"];
  for(const k of keys){
    if(ctx[k]!==undefined)pick[k]=ctx[k];
  }
  // Tamanho protegido para reduzir tokens/neurons.
  const raw=JSON.stringify(pick);
  if(raw.length<=7000)return pick;
  return {summary:raw.slice(0,7000)};
}
function professorSchema(){
  return {
    type:"object",
    properties:{
      phase:{type:"string",enum:["diagnostic","lesson","practice","test","complete"]},
      objective:{type:"string"},
      teacher:{type:"string"},
      feedback:{type:"string"},
      question:{type:"string"},
      score:{type:["number","null"]},
      strengths:{type:"array",items:{type:"string"}},
      gaps:{type:"array",items:{type:"string"}},
      summary:{type:"string"},
      next:{type:"string"},
      difficulty:{type:"string",enum:["iniciante","basico","intermediario","avancado"]},
      method:{type:"string"}
    },
    required:["phase","objective","teacher","feedback","question","score","strengths","gaps","summary","next","difficulty","method"]
  };
}
function evaluationSchema(){
  return {
    type:"object",
    properties:{
      score:{type:"number"},
      feedback:{type:"string"},
      strengths:{type:"array",items:{type:"string"}},
      gaps:{type:"array",items:{type:"string"}}
    },
    required:["score","feedback","strengths","gaps"]
  };
}
function coreSchema(){
  return {
    type:"object",
    properties:{
      reply:{type:"string"},
      action_type:{type:"string",enum:["NONE","PROPOSE_MISSION"]},
      reason:{type:"string"},
      mission_name:{type:"string"},
      mission_desc:{type:"string"},
      mission_attr:{type:"string",enum:["Disciplina","Físico","Intelecto","Comunicação","Foco","Relacionamento","Organização"]},
      mission_difficulty:{type:"string",enum:["Microacao","Simples","Normal","Dificil","Especial"]},
      mission_validation:{type:"string",enum:["action","study"]},
      mission_evidence:{type:"string"}
    },
    required:["reply","action_type","reason","mission_name","mission_desc","mission_attr","mission_difficulty","mission_validation","mission_evidence"]
  };
}
function normalizeAttr(v){
  const t=norm(v);
  const map={disciplina:"Disciplina",fisico:"Físico",intelecto:"Intelecto",comunicacao:"Comunicação",foco:"Foco",relacionamento:"Relacionamento",organizacao:"Organização"};
  return map[t]||"Disciplina";
}
function normalizeDiff(v){
  const t=norm(v);
  const map={microacao:"Microacao",simples:"Simples",normal:"Normal",dificil:"Dificil",especial:"Especial"};
  return map[t]||"Normal";
}
function fallbackMission(context){
  const attrs=context?.attributes||context?.attrs||{};
  let bestName="Disciplina",bestScore=Infinity;
  for(const [name,a] of Object.entries(attrs)){
    const score=(Number(a?.level)||1)*100+(Number(a?.pd)||0);
    if(score<bestScore){bestScore=score;bestName=normalizeAttr(name)}
  }
  const templates={
    "Disciplina":["Bloco de Execução","Escolha uma pendência real já identificada no seu contexto e execute um bloco único de 20 minutos sem trocar de atividade.","Registrar o que foi executado e o resultado obtido."],
    "Físico":["Movimento Deliberado","Realize 20 minutos de atividade física compatível com sua condição e rotina atual.","Registrar atividade e duração."],
    "Intelecto":["Recuperação Ativa","Escolha um conteúdo específico já presente na sua Biblioteca, estude por 20 minutos e depois explique sem consultar três ideias principais.","Registrar as três ideias recuperadas sem consulta."],
    "Comunicação":["Mensagem Clara","Escolha uma comunicação real de hoje e formule o ponto principal em até três frases antes de enviar ou falar.","Registrar objetivo e versão final."],
    "Foco":["Sessão Sem Distrações","Faça 20 minutos de uma atividade concreta já planejada, com notificações removidas.","Registrar atividade e duração."],
    "Relacionamento":["Contato Intencional","Faça um contato genuíno com alguém importante e pratique escuta ou resposta atenta.","Registrar que o contato ocorreu e a intenção."],
    "Organização":["Zona Sob Controle","Organize uma área pequena e específica por 15 minutos e defina uma regra simples para mantê-la.","Registrar a área e a regra definida."]
  };
  const t=templates[bestName]||templates.Disciplina;
  return {type:"PROPOSE_MISSION",reason:`Fallback local baseado no atributo com menor progresso (${bestName}).`,mission:{name:t[0],desc:t[1],attr:bestName,difficulty:"Normal",validation:bestName==="Intelecto"?"study":"action",evidence:t[2]}};
}

export default {
  async fetch(request,env){
    const origin=request.headers.get("Origin")||"";
    const headers=cors(origin);
    const url=new URL(request.url);

    if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
    if(request.method==="GET"&&url.pathname==="/"){
      return new Response("SIRIUS AI ONLINE // v2.20.0 // ECONOMY ADAPTIVE // 1 PASS DEFAULT",{status:200,headers});
    }
    if(request.method!=="POST"||url.pathname!=="/ai")return new Response("Not found",{status:404,headers});
    if(!env.AI)return json({error:"Binding Workers AI 'AI' ausente."},500,headers);

    let body;
    try{body=await request.json()}catch{return json({error:"JSON inválido."},400,headers)}

    const task=String(body.task||"core");
    const message=String(body.message||"").trim().slice(0,6500);
    const context=compactContext(body.context||{});
    const pSession=body.professorSession&&typeof body.professorSession==="object"?body.professorSession:null;
    const history=Array.isArray(body.history)?body.history.slice(-6):[];

    if(!message)return json({error:"Mensagem vazia."},400,headers);

    let system="";
    let user="";
    let schema;
    let max_tokens=650;
    let temperature=0.2;

    if(task.startsWith("professor_")){
      system=`Você é o Professor SIRIUS em modo econômico.
Fale em português do Brasil.
Ensine antes de testar.
No máximo UMA pergunta/prática por turno.
Não repita perguntas.
Se o aluno informou nível, aceite esse nível e comece ensinando.
Resposta curta pode estar correta quando a pergunta permitir.
Use microblocos: explicação -> exemplo -> uma prática.
Não use [ANÁLISE]/[ESTADO]/[DIRETRIZ].
Retorne somente o JSON do schema.`;
      user=`TAREFA: ${task}
SESSÃO: ${JSON.stringify(pSession||{})}
CONTEXTO RESUMIDO: ${JSON.stringify(context)}
INSTRUÇÃO DO APP:
${message}`;
      schema=professorSchema();
      max_tokens=700;
      temperature=0.18;
    }else if(task==="evaluate_learning"||task==="evaluate_evolution"){
      system=`Você é o avaliador SIRIUS. Avalie com rigor e somente com base nas evidências fornecidas. Não invente fatos. Retorne somente JSON do schema.`;
      user=`TAREFA: ${task}
CONTEXTO RESUMIDO: ${JSON.stringify(context)}
SOLICITAÇÃO:
${message}`;
      schema=evaluationSchema();
      max_tokens=350;
      temperature=0.1;
    }else{
      const missionIntent=wantsMission(message);
      system=`Você é SIRIUS, núcleo estratégico de um sistema pessoal de evolução.
Fale em português do Brasil, de forma direta e específica.
Use o contexto como fonte de verdade.
Não invente progresso.
Se houver pedido explícito de criação de missão, proponha UMA missão concreta e observável e use action_type PROPOSE_MISSION.
Evite missões genéricas e duplicadas.
Se não houver pedido de missão, use action_type NONE.
Retorne somente JSON do schema.`;
      const transcript=history.map(h=>`${h.role==="assistant"?"SIRIUS":"JOGADOR"}: ${String(h.text||"").slice(0,700)}`).join("\n");
      user=`MISSION_INTENT: ${missionIntent?"SIM":"NAO"}
CONTEXTO RESUMIDO: ${JSON.stringify(context)}
HISTÓRICO:
${transcript||"(vazio)"}
COMANDO:
${message}`;
      schema=coreSchema();
      max_tokens=600;
      temperature=0.18;
    }

    try{
      // ECONOMIA: uma única inferência por request. O app decide se uma segunda chamada é realmente necessária.
      const result=await env.AI.run(ECON_MODEL,{
        messages:[
          {role:"system",content:system},
          {role:"user",content:user}
        ],
        response_format:{type:"json_schema",json_schema:schema},
        max_tokens,
        temperature
      });

      let output=result?.response;
      if(typeof output==="string"){
        try{output=JSON.parse(output)}catch{
          return json({error:"Resposta estruturada inválida.",engine:"cloudflare-economy"},502,headers);
        }
      }

      if(task.startsWith("professor_")){
        return json({lesson:output,engine:"cloudflare-economy",mode:"1-pass"},200,headers);
      }

      if(task==="evaluate_learning"||task==="evaluate_evolution"){
        return json({evaluation:output,engine:"cloudflare-economy",mode:"1-pass"},200,headers);
      }

      let action=null;
      if(output?.action_type==="PROPOSE_MISSION"){
        action={
          type:"PROPOSE_MISSION",
          reason:String(output.reason||"").slice(0,500),
          mission:{
            name:String(output.mission_name||"Missão SIRIUS").slice(0,90),
            desc:String(output.mission_desc||"").slice(0,650),
            attr:normalizeAttr(output.mission_attr),
            difficulty:normalizeDiff(output.mission_difficulty),
            validation:output.mission_validation==="study"?"study":"action",
            evidence:String(output.mission_evidence||"").slice(0,400)
          }
        };
      }
      if(wantsMission(message)&&!action)action=fallbackMission(context);

      return json({
        reply:String(output?.reply||"").trim()||"[ SIRIUS ] Resposta concluída.",
        action,
        engine:"cloudflare-economy",
        mode:"1-pass"
      },200,headers);

    }catch(err){
      console.error("SIRIUS AI ERROR",err);
      if(isQuotaError(err)){
        return json({
          error:"COTA DE IA ESGOTADA HOJE",
          details:"A cota diária gratuita do Cloudflare Workers AI foi atingida.",
          quota_exhausted:true,
          retry_later:true
        },429,headers);
      }
      return json({
        error:"Falha interna do núcleo de inteligência.",
        details:String(err?.message||err)
      },500,headers);
    }
  }
};
