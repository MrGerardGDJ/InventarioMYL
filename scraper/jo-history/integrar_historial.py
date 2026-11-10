import json,glob,re,unicodedata,collections,subprocess,os,sys
APPLY='--apply' in sys.argv
R='/home/user/InventarioMYL/'
H='/tmp/claude-0/-home-user-InventarioMYL/668f4bb3-eb45-5fb4-805b-a63ecc7fe153/scratchpad/jo_history/'
def sn(s): return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFD',str(s or '').lower()).encode('ascii','ignore').decode())
MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
def fm(m): y,mm=m.split('-'); return f'{MES[int(mm)-1]} {y}'
ROLORD={'Top Liga':0,'Ganador Liga':1,'Top Avanzado':2,'Juez':3,'Staff':3}
ALIAS={'hait':'Haiit','brummimgi':'Brunnmigi'}   # lecturas erróneas del nombre impreso (el catálogo usa estas grafías)
def dims(p):
    try:
        o=subprocess.run(['identify','-format','%w %h',p],capture_output=True,text=True).stdout.split(); return int(o[0])*int(o[1])
    except: return 0
uni=collections.OrderedDict()
for f in sorted(glob.glob(H+'20??-??.json')):
    d=json.load(open(f))
    for c in d['cartas']:
        nombre=ALIAS.get(sn(c['nombre']),c['nombre'])
        k=(c['formato'],sn(nombre))
        u=uni.setdefault(k,{'formato':c['formato'],'nombre':nombre,'apar':[],'cands':[]})
        u['apar'].append((d['mes'],c['rol'],c.get('copias'))); c['mes']=d['mes']; u['cands'].append(c)
for u in uni.values():
    u['best']=max(u['cands'],key=lambda c:dims(H+c['imagen']) if c.get('imagen') else 0)
    u['first']=min(a[0] for a in u['apar'])
    byrol=collections.OrderedDict()
    for m,r,c in sorted(u['apar']): byrol.setdefault('Juez/Staff' if r in('Juez','Staff') else r,[]).append(fm(m))
    u['historial']=' · '.join(f"{r}: {', '.join(ms)}" for r,ms in sorted(byrol.items(),key=lambda x:ROLORD.get(x[0].split('/')[0],9)))
    r0=sorted(u['apar'])[0][1]
    u['rol0']=r0
P=R+'data/custom-cards.json'; raw=open(P,encoding='utf-8').read(); d=json.loads(raw)
cards=d['cards']
byname={('PE'):{sn(c['name']):c for c in cards if c['edition']=='juego_organizado_pe'},'PB':{sn(c['name']):c for c in cards if c['edition']=='juego_organizado_pb'}}
ora=json.load(open(R+'data/oraculo.json'))['cartas']
oranames=collections.defaultdict(list)
for k,v in ora.items(): oranames[sn(v['n'])].append(v)
upd=[];new_pe=[];new_pb=[];flags=[]
for k,u in uni.items():
    ex=byname[u['formato']].get(k[1])
    if ex: upd.append((ex,u)); continue
    (new_pe if u['formato']=='PE' else new_pb).append(u)
print('existentes a actualizar:',len(upd),'| nuevas PE:',len(new_pe),'| nuevas PB:',len(new_pb))
# numeración
def idnum(c):
    m=re.search(r'custom__(\d+)_',c['id']); return int(m.group(1)) if m else 0
nextpb=max(idnum(c) for c in cards if c['edition']=='juego_organizado_pb')+1
nextpe_id=max(idnum(c) for c in cards if c['edition']=='juego_organizado_pe')+1
nextlj=max(int(c['specialId'][4:]) for c in cards if (c.get('specialId') or '').startswith('LJO-'))+1
nextord=max(c.get('orden',0) for c in cards if c['edition']=='juego_organizado_pe')+1
ref=[c for c in cards if c['id']=='juego_organizado_pe__custom__132_katari'][0]; KEYS=list(ref.keys())
ROLTXT={'Top Liga':'Top Liga','Ganador Liga':'Ganador Liga','Top Avanzado':'Top Avanzado','Juez':'Carta Juez','Staff':'Carta Juez'}
def slug(n): return re.sub(r'[^a-z0-9]+','_',unicodedata.normalize('NFD',n.lower()).encode('ascii','ignore').decode()).strip('_')
def build(u,edition,fmt,idn,sid,orden):
    b=u['best']; img=f"jo_{'pb' if fmt=='PB' else 'pe'}_{idn:03d}_{slug(u['nombre'])}.webp"
    staff=u['rol0'] in('Juez','Staff')
    ob=f"J.O. {ROLTXT[u['rol0']]} {fm(u['first'])}"
    rec={'id':f"{edition}__custom__{idn:02d}_{slug(u['nombre'])}",'name':u['nombre'],'edition':edition,'editionName':'Juego Organizado - '+('Primer Bloque' if fmt=='PB' else 'Primera Era'),'format':fmt,'edid':'','type':b['tipo'] if b['tipo'] in('Aliado','Talismán','Arma','Tótem','Oro') else 'Oro',
         'race':b['raza'] or '—','rarity':'Promocional','cost':b['coste'],'strength':b['fuerza'] if b['tipo']=='Aliado' else None,'ability':(b['habilidad'] or '').strip(),'flavour':'','image':'./data/custom-images/jo-pdf/'+img,'custom':True,
         'specialId':sid,'codigo':'EDICIÓN LIMITADA JO','serie':'Edición Limitada JO','orden':orden,'obtencion':ob,'origen':'Incentivo Staff' if staff else 'Juego Organizado','historial':u['historial']}
    return rec,img,H+b['imagen']
out_new=[];imgs=[]
# PB nuevas: orden cronológico global de PB (existentes + nuevas)
pb_all=[(u['first'],ROLORD.get(u['rol0'],9),u['nombre'],u) for u in uni.values() if u['formato']=='PB']
pb_all.sort(key=lambda x:(x[0],x[1],x[2]))
pb_num={u['nombre']:i+1 for i,(_,_,_,u) in enumerate(pb_all)}
for u in sorted(new_pb,key=lambda u:(u['first'],ROLORD.get(u['rol0'],9),u['nombre'])):
    rec,img,src=build(u,'juego_organizado_pb','PB',nextpb,f"LJOPB-{pb_num[u['nombre']]:02d}",pb_num[u['nombre']]); nextpb+=1
    out_new.append(rec); imgs.append((src,img))
for u in sorted(new_pe,key=lambda u:(u['first'],u['nombre'])):
    rec,img,src=build(u,'juego_organizado_pe','PE',nextpe_id,f"LJO-{nextlj}",nextord)
    rec['id']=f"juego_organizado_pe__custom__{nextpe_id}_{slug(u['nombre'])}"; nextpe_id+=1; nextlj+=1; nextord+=1
    # PE: datos de la carta base según el Oráculo, validados con la lectura del PDF
    o=(oranames.get(sn(u['nombre'])) or [None])[0]
    if o:
        b=u['best']; diffs=[]
        if o.get('c') is not None and b['coste'] is not None and o['c']!=b['coste']: diffs.append(f"coste {b['coste']} vs {o['c']}")
        if o.get('f') is not None and b['fuerza'] is not None and o['f']!=b['fuerza']: diffs.append(f"fuerza {b['fuerza']} vs {o['f']}")
        if diffs: flags.append((u['nombre'],'; '.join(diffs)))
    out_new.append(rec); imgs.append((src,img))
print('nuevas:',len(out_new),'| avisos PE:',flags)
# orden/specialId de las PB ya existentes, por fecha global
renum=[]
extra=len(pb_all)
for c in sorted([c for c in cards if c['edition']=='juego_organizado_pb'],key=lambda c:c.get('orden',0)):
    n=next((pb_num[u['nombre']] for u in uni.values() if u['formato']=='PB' and sn(u['nombre'])==sn(c['name'])),None)
    if n is None: extra+=1; n=extra   # cartas posteriores al último informativo del historial (noviembre 2026)
    if c['specialId']!=f'LJOPB-{n:02d}' or c.get('orden')!=n: renum.append((c,n))
print('PB existentes a renumerar:',len(renum))
for rec in out_new[:3]: print(json.dumps(rec,ensure_ascii=False)[:400])
if APPLY:
    def blk(x): return '  '+json.dumps(x,ensure_ascii=False,indent=1).replace('\n','\n  ')
    out=raw
    for ex,u in upd:
        old=blk(ex); assert out.count(old)==1,ex['id']
        ex['historial']=u['historial']; out=out.replace(old,blk(ex))
    for c,n in renum:
        old=blk(c); assert out.count(old)==1,c['id']
        c['specialId']=f'LJOPB-{n:02d}'; c['orden']=n; out=out.replace(old,blk(c))
    assert out.endswith('  }\n ]\n}\n')
    out=out[:-len('\n ]\n}\n')]+',\n'+',\n'.join(blk(r) for r in out_new)+'\n ]\n}\n'
    d2=json.loads(out); ids=[c['id'] for c in d2['cards']]; assert len(ids)==len(set(ids))
    sp=[c['specialId'] for c in d2['cards'] if (c.get('specialId') or '').startswith(('LJOPB','LJO-'))]; assert len(sp)==len(set(sp)),[s for s in sp if sp.count(s)>1]
    open(P,'w',encoding='utf-8').write(out)
    os.makedirs(R+'data/custom-images/jo-pdf',exist_ok=True)
    for src,img in imgs: subprocess.run(['convert',src,'-quality','88',R+'data/custom-images/jo-pdf/'+img],check=True)
    print('APLICADO')
