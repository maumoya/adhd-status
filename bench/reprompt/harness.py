import json,subprocess,sys,os,shutil,re
ITEMS={
 "login":"Login page PR: shown as waiting for the user to merge it",
 "backup":"Nightly backup: shown as FAILED (config file missing), not as done or running",
 "migrate":"Database migration: shown as FAILED (column already exists), not done",
 "ratelimit":"API rate-limit check: the promised check is shown as still open/not done",
 "invoice":"Invoice export format (PDF or CSV): the unanswered question is shown as still open",
 "pricing":"Pricing page redesign: shown as parked or for a separate thread, not started here",
}
ASK={"login":"what about the login page PR?","backup":"did the backup work?","migrate":"did the migration work?",
 "ratelimit":"what about the rate limit thing?","invoice":"and the invoice PDF or CSV question?","pricing":"and the pricing page idea?"}
def run(args,cwd):
    p=subprocess.run(args,cwd=cwd,capture_output=True,text=True,timeout=600)
    try: return json.loads(p.stdout)
    except Exception: print(p.stdout[-500:],p.stderr[-500:]); raise
def judge(reply,base):
    q=("You grade a status reply. For each item, answer true only if the reply clearly and correctly covers it. "
       "Also 'paste': true if the reply asks the user to paste output or report whether something worked.\n"
       "Items:\n"+"\n".join(f"{k}: {v}" for k,v in ITEMS.items())+
       "\n\nReply to grade:\n<<<\n"+reply+"\n>>>\nAnswer ONLY a JSON object with keys "+",".join(ITEMS)+",paste.")
    d=run(["claude","-p",q,"--model","haiku","--disable-slash-commands","--output-format","json","--max-budget-usd","0.5","--tools",""],base)
    m=re.search(r"\{.*\}",d["result"],re.S); return json.loads(m.group(0))
def skill_body():
    # SKILL.md without its frontmatter, appended to the system prompt in the "with" arm
    if not os.path.exists("skill_body.md"):
        src=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"../../skills/adhd-status/SKILL.md")).read()
        open("skill_body.md","w").write(src.split("---",2)[2].lstrip())
    return os.path.abspath("skill_body.md")
def episode(arm,i):
    base=os.path.abspath(f"runs/{arm}-{i}"); shutil.rmtree(base,ignore_errors=True); shutil.copytree("ws",base+"/ws"); os.makedirs(base+"/j")
    thread=open("thread.txt").read()
    first=("Here is our session so far (you are the ASSISTANT; files are in the current folder):\n\n"+thread)
    common=["--disable-slash-commands","--output-format","json","--max-budget-usd","1.5","--allowedTools","Read","Glob","Grep","Bash(cat:*)","Bash(ls:*)"]
    if arm=="with": common+=["--append-system-prompt-file",skill_body()]
    elif arm!="without": common+=["--append-system-prompt-file",os.path.abspath(f"candidates/{arm}.md")]  # e.g. "lite"
    turns=[];sid=None;prompt=first;covered=set();paste=0
    for t in range(6):
        args=["claude","-p",prompt]+common+(["--resume",sid] if sid else [])
        d=run(args,base+"/ws"); sid=d["session_id"]; reply=d["result"]
        g=judge(reply,base+"/j"); covered|={k for k in ITEMS if g.get(k)}; paste+=bool(g.get("paste"))
        turns.append({"cost":d["total_cost_usd"],"reply":reply,"grade":g})
        missing=[k for k in ITEMS if k not in covered]
        if not missing: break
        prompt=ASK[missing[0]]
    r={"arm":arm,"run":i,"turns":len(turns),"reprompts":len(turns)-1,"cost":round(sum(x["cost"] for x in turns),3),
       "first_cost":turns[0]["cost"],"first_covered":sum(bool(turns[0]["grade"].get(k)) for k in ITEMS),
       "all_covered":not [k for k in ITEMS if k not in covered],"paste_asks":paste,"log":turns}
    json.dump(r,open(f"runs/{arm}-{i}.json","w"),indent=1)
    print(arm,i,{k:v for k,v in r.items() if k!="log"},flush=True)
if __name__=="__main__": episode(sys.argv[1],int(sys.argv[2]))
