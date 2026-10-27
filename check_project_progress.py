"""Validate the public, AI-maintained project feed before generating pages."""
import json
import re
from datetime import date, datetime
from pathlib import Path

def check(path):
    d=json.loads(Path(path).read_text(encoding='utf-8'))
    assert set(d)=={'schemaVersion','updatedAt','checkedAt','staleAfterDays','openingDate','note','projects','milestones','agents','automation'}, 'unexpected root fields'
    assert d['schemaVersion']==1 and d['staleAfterDays']==7
    checked=date.fromisoformat(d['checkedAt'])
    assert datetime.fromisoformat(d['updatedAt']).utcoffset().total_seconds()==32400
    date.fromisoformat(d['openingDate'])
    ids=set()
    allowed={'id','name','stage','stages','state','status','next','owners','blocked','lastActivity','automation','evidence','href','tone'}
    for p in d['projects']:
        assert set(p)==allowed, 'unexpected project fields'
        assert re.fullmatch('[a-z0-9-]+',p['id']) and p['id'] not in ids
        ids.add(p['id'])
        assert type(p['stage']) is int and 0<=p['stage']<=5
        assert len(p['stages'])==5 and all(isinstance(x,str) and x for x in p['stages'])
        assert p['state'] in {'active','waiting','paused','unknown','done'}
        assert p['tone'] in {'green','amber','red'}
        assert p['owners'] and set(p['owners'])<={'현수','다희','AI'}
        assert all(isinstance(p[k],str) for k in ['name','status','next','blocked','automation','evidence','href'])
        assert p['lastActivity'] is None or date.fromisoformat(p['lastActivity'])<=checked
        assert re.match(r'^(https://|[a-z][a-z0-9-]*\.html(?:[?#].*)?$)',p['href'])
    assert d['projects'] and d['milestones'] and d['agents']
    for m in d['milestones']:
        assert set(m)=={'date','label','kind'} and m['kind'] in {'confirmed','proposed'}
        date.fromisoformat(m['date'])
    for a in d['agents']:
        assert set(a)=={'name','doing','tone'} and a['tone'] in {'green','amber','red'}
    assert set(d['automation'])=={'schedule','status','lastVerifiedRun'}
    # No private source links, finance fields, credentials or customer/contact data.
    text=json.dumps(d,ensure_ascii=False)
    assert not re.search(r'drive\.google|docs\.google|script\.google|@|AIza|sk-proj|private_key|token|계좌번호|승인번호|원가|마진|\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b',text,re.I)
    return len(ids)

if __name__=='__main__':
    print(f'PASS {check(Path(__file__).parent / "src/project-progress.json")} public projects')
